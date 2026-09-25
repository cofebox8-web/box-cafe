-- Box Cafe initial schema. Apply in the Supabase SQL editor or through migrations.
-- Public menu reads are allowed; customer order writes must be added as a validated RPC.

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency_code text not null default 'IQD' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, slug),
  unique (id, restaurant_id)
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid,
  full_name text not null,
  role text not null check (role in ('owner', 'admin', 'roadside', 'kitchen')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id) on delete no action
);

create table public.car_service_points (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  label text not null,
  kind text not null default 'order_lane' check (kind in ('order_lane', 'pickup_point')),
  qr_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, label),
  unique (id, branch_id)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, restaurant_id)
);

create table public.menu_products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  description text,
  image_url text,
  price numeric(12, 2) not null check (price >= 0),
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, restaurant_id) references public.menu_categories(id, restaurant_id) on delete restrict,
  unique (id, restaurant_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  service_point_id uuid,
  order_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  source text not null check (source in ('qr', 'roadside')),
  status text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'ready', 'handed_off', 'cancelled')),
  customer_name text,
  vehicle_note text check (vehicle_note is null or char_length(vehicle_note) <= 80),
  note text,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (service_point_id, branch_id) references public.car_service_points(id, branch_id) on delete no action,
  unique (id, branch_id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.menu_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 50),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  selected_options jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_options) = 'array'),
  note text,
  created_at timestamptz not null default now()
);

create index branches_restaurant_idx on public.branches(restaurant_id, is_active);
create index menu_categories_restaurant_sort_idx on public.menu_categories(restaurant_id, sort_order);
create index menu_products_category_sort_idx on public.menu_products(category_id, sort_order) where is_available;
create index car_service_points_branch_idx on public.car_service_points(branch_id, is_active);
create index orders_branch_status_created_idx on public.orders(branch_id, status, created_at desc);
create index order_items_order_idx on public.order_items(order_id);

create or replace function public.current_staff_can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles as profile
    join public.branches as branch on branch.id = target_branch_id
    where profile.user_id = (select auth.uid())
      and profile.is_active
      and profile.restaurant_id = branch.restaurant_id
      and (profile.branch_id is null or profile.branch_id = target_branch_id)
  );
$$;

revoke all on function public.current_staff_can_access_branch(uuid) from public;
grant execute on function public.current_staff_can_access_branch(uuid) to authenticated;

alter table public.restaurants enable row level security;
alter table public.branches enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.car_service_points enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "active restaurants are public"
  on public.restaurants for select to anon, authenticated
  using (is_active);

create policy "active branches are public"
  on public.branches for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.restaurants r where r.id = restaurant_id and r.is_active
  ));

create policy "active menu categories are public"
  on public.menu_categories for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.restaurants r where r.id = restaurant_id and r.is_active
  ));

create policy "available menu products are public"
  on public.menu_products for select to anon, authenticated
  using (is_available and exists (
    select 1 from public.menu_categories c
    join public.restaurants r on r.id = c.restaurant_id
    where c.id = category_id and c.restaurant_id = menu_products.restaurant_id
      and c.is_active and r.is_active
  ));

create policy "staff can read own profile"
  on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "staff can read service points in assigned branches"
  on public.car_service_points for select to authenticated
  using (public.current_staff_can_access_branch(branch_id));

create policy "staff can read branch orders"
  on public.orders for select to authenticated
  using (public.current_staff_can_access_branch(branch_id));

create policy "staff can update branch order status"
  on public.orders for update to authenticated
  using (public.current_staff_can_access_branch(branch_id))
  with check (public.current_staff_can_access_branch(branch_id));

create policy "staff can read items for branch orders"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and public.current_staff_can_access_branch(o.branch_id)
  ));

grant select on public.restaurants, public.branches, public.menu_categories, public.menu_products to anon, authenticated;
grant select on public.staff_profiles, public.car_service_points, public.orders, public.order_items to authenticated;
grant update (status, updated_at) on public.orders to authenticated;

comment on table public.orders is 'Customer and staff orders. Inserts are intentionally denied; add a validating transactional RPC before accepting orders.';
comment on table public.staff_profiles is 'Created/managed only by a trusted Supabase admin workflow; browser users cannot grant themselves roles.';
comment on column public.car_service_points.qr_token is 'Opaque QR reference for a roadside order or pickup point; expose it only through authorized management or a validated menu/order RPC.';
