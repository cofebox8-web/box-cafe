-- Migration: 202609230002_customer_menu_and_ordering.sql
-- Description: Product options schema, idempotency, order tracking token, customer menu RPC, and validated transactional order RPCs.

-- 1. Extend orders table with idempotency_key and tracking_token
alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists tracking_token uuid default gen_random_uuid() not null;

create unique index if not exists orders_idempotency_key_idx
  on public.orders(idempotency_key) where idempotency_key is not null;

create unique index if not exists orders_tracking_token_idx
  on public.orders(tracking_token);

-- 2. Product Option Groups (e.g. Size, Milk Type, Syrup)
create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.menu_products(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single', 'multiple')),
  is_required boolean not null default false,
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer check (max_selections is null or max_selections >= min_selections),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Product Option Items (e.g. Regular, Large, Oat Milk, Vanilla)
create table if not exists public.product_option_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_modifier numeric(12, 2) not null default 0 check (price_modifier >= 0),
  is_available boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_option_groups_product_idx on public.product_option_groups(product_id, sort_order);
create index if not exists product_option_items_group_idx on public.product_option_items(group_id, sort_order);

alter table public.product_option_groups enable row level security;
alter table public.product_option_items enable row level security;

-- Public read policies for active products
create policy "product option groups are readable with available products"
  on public.product_option_groups for select to anon, authenticated
  using (exists (
    select 1 from public.menu_products p
    join public.menu_categories c on c.id = p.category_id
    join public.restaurants r on r.id = p.restaurant_id
    where p.id = product_id and p.is_available and c.is_active and r.is_active
  ));

create policy "product option items are readable with available products"
  on public.product_option_items for select to anon, authenticated
  using (exists (
    select 1 from public.product_option_groups g
    join public.menu_products p on p.id = g.product_id
    join public.menu_categories c on c.id = p.category_id
    join public.restaurants r on r.id = p.restaurant_id
    where g.id = group_id and p.is_available and c.is_active and r.is_active
  ));

grant select on public.product_option_groups, public.product_option_items to anon, authenticated;

-- 4. Customer Menu Retrieval RPC (Validated via QR token without exposing all service points)
create or replace function public.get_customer_menu(
  p_branch_slug text,
  p_qr_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service_point record;
  v_categories jsonb;
  v_products jsonb;
begin
  -- 1. Validate branch and service point via QR token
  select csp.id as service_point_id, csp.label as service_point_label, csp.kind as service_point_kind,
         b.id as branch_id, b.name as branch_name, b.slug as branch_slug, b.is_active as branch_active,
         r.id as restaurant_id, r.name as restaurant_name, r.currency_code
  into v_service_point
  from public.car_service_points csp
  join public.branches b on b.id = csp.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where csp.qr_token = p_qr_token
    and b.slug = p_branch_slug
    and csp.is_active = true
    and b.is_active = true
    and r.is_active = true;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_SERVICE_POINT',
      'message', 'رمز نقطة الخدمة أو الفرع غير متاح أو تم إيقافه.'
    );
  end if;

  -- 2. Fetch categories for this restaurant
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'sort_order', c.sort_order
    ) order by c.sort_order, c.name
  ), '[]'::jsonb)
  into v_categories
  from public.menu_categories c
  where c.restaurant_id = v_service_point.restaurant_id
    and c.is_active = true;

  -- 3. Fetch products with nested option groups and available choices
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'category_id', p.category_id,
      'name', p.name,
      'description', p.description,
      'image_url', p.image_url,
      'price', p.price,
      'sort_order', p.sort_order,
      'is_available', p.is_available,
      'option_groups', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', og.id,
            'name', og.name,
            'selection_type', og.selection_type,
            'is_required', og.is_required,
            'min_selections', og.min_selections,
            'max_selections', og.max_selections,
            'options', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', oi.id,
                  'name', oi.name,
                  'price_modifier', oi.price_modifier,
                  'is_default', oi.is_default,
                  'is_available', oi.is_available
                ) order by oi.sort_order, oi.name
              )
              from public.product_option_items oi
              where oi.group_id = og.id
                and oi.is_available = true
            ), '[]'::jsonb)
          ) order by og.sort_order, og.name
        )
        from public.product_option_groups og
        where og.product_id = p.id
      ), '[]'::jsonb)
    ) order by p.sort_order, p.name
  ), '[]'::jsonb)
  into v_products
  from public.menu_products p
  join public.menu_categories c on c.id = p.category_id
  where p.restaurant_id = v_service_point.restaurant_id
    and p.is_available = true
    and c.is_active = true;

  return jsonb_build_object(
    'success', true,
    'branch', jsonb_build_object(
      'name', v_service_point.branch_name,
      'slug', v_service_point.branch_slug,
      'is_active', true
    ),
    'service_point', jsonb_build_object(
      'label', v_service_point.service_point_label,
      'kind', v_service_point.service_point_kind
    ),
    'restaurant', jsonb_build_object(
      'name', v_service_point.restaurant_name,
      'currency_code', v_service_point.currency_code
    ),
    'categories', v_categories,
    'products', v_products
  );
end;
$$;

revoke all on function public.get_customer_menu(text, uuid) from public;
grant execute on function public.get_customer_menu(text, uuid) to anon, authenticated;

-- 5. Customer Order Placement RPC (Transactional, Server-Calculated, Idempotent)
create or replace function public.place_customer_order(
  p_branch_slug text,
  p_qr_token uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_vehicle_note text default null,
  p_order_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service_point record;
  v_existing_order record;
  v_item record;
  v_product record;
  v_option record;
  v_item_quantity integer;
  v_item_unit_price numeric(12, 2);
  v_item_line_total numeric(12, 2);
  v_selected_options jsonb;
  v_selected_option_ids uuid[];
  v_group record;
  v_selected_in_group_count integer;
  v_order_subtotal numeric(12, 2) := 0;
  v_order_total numeric(12, 2) := 0;
  v_order_id uuid;
  v_order_code text;
  v_tracking_token uuid;
  v_daily_seq integer;
  v_items_count integer := 0;
  v_customer_name text;
  v_vehicle_note text;
  v_order_note text;
  v_clean_idempotency_key text;
  v_order_items jsonb := '[]'::jsonb;
  v_selected_option_count integer := 0;
  v_valid_option_count integer := 0;
  v_start_of_day timestamptz;
begin
  -- 1. Input sanitization & boundary checks
  v_customer_name := nullif(trim(p_customer_name), '');
  if v_customer_name is not null and char_length(v_customer_name) > 60 then
    v_customer_name := substr(v_customer_name, 1, 60);
  end if;

  v_vehicle_note := nullif(trim(p_vehicle_note), '');
  if v_vehicle_note is not null and char_length(v_vehicle_note) > 80 then
    v_vehicle_note := substr(v_vehicle_note, 1, 80);
  end if;

  v_order_note := nullif(trim(p_order_note), '');
  if v_order_note is not null and char_length(v_order_note) > 200 then
    v_order_note := substr(v_order_note, 1, 200);
  end if;

  v_clean_idempotency_key := nullif(trim(p_idempotency_key), '');
  if v_clean_idempotency_key is not null and char_length(v_clean_idempotency_key) > 120 then
    return jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY', 'message', 'تعذر التحقق من الطلب. أعد المحاولة.');
  end if;
  if v_clean_idempotency_key is not null
     and v_clean_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY', 'message', 'تعذر التحقق من الطلب. أعد المحاولة.');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'INVALID_CART', 'message', 'تعذر قراءة السلة. أعد تحميل المنيو وحاول مجدداً.');
  end if;

  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('success', false, 'error', 'EMPTY_CART', 'message', 'السلة فارغة. يرجى اختيار صنف واحد على الأقل.');
  end if;

  if jsonb_array_length(p_items) > 25 then
    return jsonb_build_object('success', false, 'error', 'CART_TOO_LARGE', 'message', 'تم تجاوز الحد الأقصى للأصناف في الطلب الواحد.');
  end if;

  -- 2. Validate branch and service point via QR token
  select csp.id as service_point_id, csp.label as service_point_label,
         b.id as branch_id, b.name as branch_name, r.id as restaurant_id, r.currency_code
  into v_service_point
  from public.car_service_points csp
  join public.branches b on b.id = csp.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where csp.qr_token = p_qr_token
    and b.slug = p_branch_slug
    and csp.is_active = true
    and b.is_active = true
    and r.is_active = true;

  if not found then
    return jsonb_build_object('success', false, 'error', 'INVALID_SERVICE_POINT', 'message', 'نقطة الخدمة أو الفرع غير صالحة أو مغلقة.');
  end if;

  -- Serialize retries with the same key before checking for an existing order.
  if v_clean_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_clean_idempotency_key, 0));
  end if;

  -- 3. Idempotency Check: Return existing order if already submitted
  if v_clean_idempotency_key is not null then
    select o.id, o.order_code, o.total, o.tracking_token, o.created_at, o.status,
           b.name as branch_name, r.currency_code, csp.label as service_point_label,
           coalesce(sum(oi.quantity), 0) as items_count
    into v_existing_order
    from public.orders o
    join public.branches b on b.id = o.branch_id
    join public.restaurants r on r.id = b.restaurant_id
    left join public.car_service_points csp on csp.id = o.service_point_id
    left join public.order_items oi on oi.order_id = o.id
    where o.idempotency_key = v_clean_idempotency_key
      and o.branch_id = v_service_point.branch_id
    group by o.id, o.order_code, o.total, o.tracking_token, o.created_at, o.status, b.name, r.currency_code, csp.label;

    if found then
      return jsonb_build_object(
        'success', true,
        'is_duplicate', true,
        'order_code', v_existing_order.order_code,
        'total', v_existing_order.total,
        'currency_code', v_existing_order.currency_code,
        'tracking_token', v_existing_order.tracking_token,
        'status', v_existing_order.status,
        'created_at', v_existing_order.created_at,
        'items_count', v_existing_order.items_count,
        'service_point_label', v_existing_order.service_point_label,
        'branch_name', v_existing_order.branch_name
      );
    end if;
  end if;

  -- 4. Generate daily sequential order code for drive-thru (e.g. B-101, B-102, B-104...)
  v_start_of_day := pg_catalog.date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_service_point.branch_id::text || ':' || v_start_of_day::date::text, 1
  ));

  select coalesce(max(
    case
      when order_code ~ '^B-[0-9]+$' then substring(order_code from 3)::integer
      else null
    end
  ), 100) + 1
  into v_daily_seq
  from public.orders
  where branch_id = v_service_point.branch_id
    and created_at >= v_start_of_day
    and created_at < v_start_of_day + interval '1 day';

  v_order_code := 'B-' || v_daily_seq::text;
  v_order_id := gen_random_uuid();
  v_tracking_token := gen_random_uuid();

  -- 5. Process and strictly validate each item against database pricing
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    product_id uuid,
    quantity integer,
    selected_option_ids jsonb,
    note text
  )
  loop
    v_item_quantity := coalesce(v_item.quantity, 1);
    if v_item_quantity < 1 or v_item_quantity > 20 then
      return jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'الكمية المطلوبة لكل صنف يجب أن تكون بين 1 و 20.');
    end if;

    -- Lookup product in the active restaurant
    select id, name, price, is_available
    into v_product
    from public.menu_products
    where id = v_item.product_id
      and restaurant_id = v_service_point.restaurant_id;

    if not found or not v_product.is_available then
      return jsonb_build_object('success', false, 'error', 'PRODUCT_UNAVAILABLE', 'message', 'أحد الأصناف المطلوبة لم يعد متوفراً حالياً.');
    end if;

    v_item_unit_price := v_product.price;
    v_selected_options := '[]'::jsonb;

    -- Extract option UUIDs if provided
    if v_item.selected_option_ids is not null and jsonb_typeof(v_item.selected_option_ids) <> 'array' then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTIONS', 'message', 'تعذر التحقق من خيارات أحد الأصناف. حدّث المنيو وحاول مجدداً.');
    elsif v_item.selected_option_ids is not null then
      select coalesce(array_agg(value::text::uuid), '{}'::uuid[])
      into v_selected_option_ids
      from jsonb_array_elements_text(v_item.selected_option_ids);
    else
      v_selected_option_ids := '{}'::uuid[];
    end if;

    v_selected_option_count := coalesce(array_length(v_selected_option_ids, 1), 0);
    if v_selected_option_count <> (select count(distinct selected_id) from unnest(v_selected_option_ids) as selected(selected_id)) then
      return jsonb_build_object('success', false, 'error', 'DUPLICATE_OPTIONS', 'message', 'يوجد خيار مكرر في أحد الأصناف.');
    end if;

    select count(*)
      into v_valid_option_count
    from public.product_option_items oi
    join public.product_option_groups og on og.id = oi.group_id
    where oi.id = any(v_selected_option_ids)
      and og.product_id = v_product.id
      and oi.is_available;

    if v_valid_option_count <> v_selected_option_count then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION', 'message', 'أحد الخيارات لم يعد متاحاً لهذا الصنف. حدّث المنيو وحاول مجدداً.');
    end if;

    -- Validate option groups (e.g. required groups and single/multiple limits).
    for v_group in
      select og.id, og.name, og.selection_type, og.is_required, og.min_selections, og.max_selections
      from public.product_option_groups og
      where og.product_id = v_product.id
    loop
      select count(*)
      into v_selected_in_group_count
      from public.product_option_items oi
      where oi.group_id = v_group.id
        and oi.id = any(v_selected_option_ids);

      if v_selected_in_group_count < greatest(v_group.min_selections, case when v_group.is_required then 1 else 0 end) then
        return jsonb_build_object('success', false, 'error', 'MISSING_REQUIRED_OPTION',
          'message', 'يرجى تحديد خيار إلزامي للصنف: ' || v_product.name || ' (' || v_group.name || ').');
      end if;

      if v_group.max_selections is not null and v_selected_in_group_count > v_group.max_selections then
        return jsonb_build_object('success', false, 'error', 'EXCEEDED_OPTION_LIMIT',
          'message', 'تم تجاوز الحد المسموح به من الخيارات في: ' || v_group.name);
      end if;

      if v_group.selection_type = 'single' and v_selected_in_group_count > 1 then
        return jsonb_build_object('success', false, 'error', 'EXCEEDED_OPTION_LIMIT',
          'message', 'اختر خياراً واحداً فقط في: ' || v_group.name);
      end if;
    end loop;

    -- Calculate options price additions and record snapshot
    if array_length(v_selected_option_ids, 1) > 0 then
      for v_option in
        select oi.id, oi.name as option_name, oi.price_modifier, og.name as group_name
        from public.product_option_items oi
        join public.product_option_groups og on og.id = oi.group_id
        where oi.id = any(v_selected_option_ids)
          and og.product_id = v_product.id
          and oi.is_available = true
      loop
        v_item_unit_price := v_item_unit_price + v_option.price_modifier;
        v_selected_options := v_selected_options || jsonb_build_object(
          'id', v_option.id,
          'group_name', v_option.group_name,
          'name', v_option.option_name,
          'price_modifier', v_option.price_modifier
        );
      end loop;
    end if;

    v_item_line_total := v_item_unit_price * v_item_quantity;
    v_order_subtotal := v_order_subtotal + v_item_line_total;
    v_items_count := v_items_count + v_item_quantity;

    -- Hold validated item snapshots until every row passes validation.
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'quantity', v_item_quantity,
      'unit_price', v_item_unit_price,
      'selected_options', v_selected_options,
      'note', nullif(trim(v_item.note), '')
    ));
  end loop;

  v_order_total := v_order_subtotal;

  -- 6. Insert the order parent first, then its validated item snapshots.
  insert into public.orders (
    id,
    branch_id,
    service_point_id,
    order_code,
    source,
    status,
    customer_name,
    vehicle_note,
    note,
    subtotal,
    total,
    idempotency_key,
    tracking_token
  ) values (
    v_order_id,
    v_service_point.branch_id,
    v_service_point.service_point_id,
    v_order_code,
    'qr',
    'new',
    v_customer_name,
    v_vehicle_note,
    v_order_note,
    v_order_subtotal,
    v_order_total,
    v_clean_idempotency_key,
    v_tracking_token
  );

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, selected_options, note
  )
  select
    v_order_id,
    item.product_id,
    item.product_name,
    item.quantity,
    item.unit_price,
    item.selected_options,
    item.note
  from jsonb_to_recordset(v_order_items) as item(
    product_id uuid,
    product_name text,
    quantity integer,
    unit_price numeric(12, 2),
    selected_options jsonb,
    note text
  );

  return jsonb_build_object(
    'success', true,
    'order_code', v_order_code,
    'total', v_order_total,
    'currency_code', v_service_point.currency_code,
    'tracking_token', v_tracking_token,
    'status', 'new',
    'created_at', now(),
    'items_count', v_items_count,
    'service_point_label', v_service_point.service_point_label,
    'branch_name', v_service_point.branch_name
  );
end;
$$;

revoke all on function public.place_customer_order(text, uuid, jsonb, text, text, text, text) from public;
grant execute on function public.place_customer_order(text, uuid, jsonb, text, text, text, text) to anon, authenticated;

-- 6. Safe Customer Order Status Tracking RPC (Lookup via tracking_token only)
create or replace function public.get_customer_order_status(
  p_tracking_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select o.order_code, o.status, o.total, o.created_at, o.updated_at,
         b.name as branch_name, r.currency_code, csp.label as service_point_label
  into v_order
  from public.orders o
  join public.branches b on b.id = o.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  left join public.car_service_points csp on csp.id = o.service_point_id
  where o.tracking_token = p_tracking_token;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'ORDER_NOT_FOUND',
      'message', 'لم يتم العثور على الطلب.'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'order_code', v_order.order_code,
    'status', v_order.status,
    'total', v_order.total,
    'currency_code', v_order.currency_code,
    'branch_name', v_order.branch_name,
    'service_point_label', v_order.service_point_label,
    'updated_at', v_order.updated_at
  );
end;
$$;

revoke all on function public.get_customer_order_status(uuid) from public;
grant execute on function public.get_customer_order_status(uuid) to anon, authenticated;

-- 7. Seed Initial Data for Testing & Preview
do $$
declare
  v_rest_id uuid;
  v_branch_id uuid;
  v_cat_hot uuid;
  v_cat_cold uuid;
  v_cat_bakery uuid;
  v_cat_refresh uuid;
  v_prod_spanish uuid;
  v_prod_latte uuid;
  v_prod_americano uuid;
  v_prod_v60 uuid;
  v_prod_coldbrew uuid;
  v_prod_iced_latte uuid;
  v_prod_croissant uuid;
  v_prod_cookie uuid;
  v_group_size uuid;
  v_group_milk uuid;
  v_group_extras uuid;
begin
  -- Insert Restaurant
  insert into public.restaurants (name, slug, currency_code, is_active)
  values ('بوكس كافي', 'box-coffee', 'IQD', true)
  on conflict (slug) do update set name = excluded.name
  returning id into v_rest_id;

  -- Insert Branch
  insert into public.branches (restaurant_id, name, slug, is_active)
  values (v_rest_id, 'فرع طريق المطار', 'airport', true)
  on conflict (restaurant_id, slug) do update set name = excluded.name
  returning id into v_branch_id;

  -- Create live QR service points with random opaque tokens, never fixed preview tokens.
  insert into public.car_service_points (branch_id, label, kind, is_active)
  values
    (v_branch_id, 'المسار 1 — خدمة السيارات', 'order_lane', true),
    (v_branch_id, 'المسار 2 — خدمة السيارات', 'order_lane', true)
  on conflict (branch_id, label) do update set is_active = true;

  -- Insert Categories
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'قهوة ساخنة', 'إسبريسو غني ومشروبات ساخنة محضرة بإتقان', 1, true)
  returning id into v_cat_hot;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'قهوة مثلجة وباردة', 'انتعاش الإسبريسو مع الحليب البارد ومشروبات التقطير المثلج', 2, true)
  returning id into v_cat_cold;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'مخبوزات وحلويات', 'مخبوزات طازجة يومياً تناسب قهوتك المفضلة', 3, true)
  returning id into v_cat_bakery;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'شاي ومشروبات منعشة', 'ماتشا وشاي مختص وعصائر طبيعية منعشة', 4, true)
  returning id into v_cat_refresh;

  -- Insert Products
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_hot, 'سبانش لاتيه ساخن', 'إسبريسو متوازن مع الحليب المبخر والحليب المكثف المحلى بطابع دافئ', 5000, 1, true)
  returning id into v_prod_spanish;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_hot, 'كافيه لاتيه', 'جرعة إسبريسو غنية مع طبقة مخملية من رغوة الحليب الطازج', 4500, 2, true)
  returning id into v_prod_latte;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_hot, 'أمريكانو كلاسيك', 'إسبريسو دبل مخفف بالماء الساخن بنكهة واضحة ونقية', 3500, 3, true)
  returning id into v_prod_americano;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_hot, 'قهوة مقطرة V60', 'تقطير يدوي بحبوب مختصة بنكهات فاكهية وعطرية مميزة', 6000, 4, true)
  returning id into v_prod_v60;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_cold, 'آيس سبانش لاتيه', 'المشروب الأكثر طلباً: قهوة باردة مع الحليب المكثف ومكعبات الثلج', 5500, 1, true)
  returning id into v_prod_iced_latte;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_cold, 'كولد برو منقوع 18 ساعة', 'قهوة مركزة مستخلصة ببطء على البارد لنكهة ناعمة وحموضة منخفضة', 6000, 2, true)
  returning id into v_prod_coldbrew;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_bakery, 'كرواسون زبدة فرنسي', 'كرواسون مقرمش وهش ومخبوز بالزبدة الطبيعية', 3000, 1, true)
  returning id into v_prod_croissant;

  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, is_available)
  values (v_rest_id, v_cat_bakery, 'كوكيز الشوكولاتة البلجيكية', 'كوكيز طري ومحشو بقطع الشوكولاتة الداكنة الفاخرة', 2500, 2, true)
  returning id into v_prod_cookie;

  -- Add Option Groups for Spanish Latte & Latte
  insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_prod_spanish, 'الحجم', 'single', true, 1, 1, 1)
  returning id into v_group_size;

  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values
    (v_group_size, 'وسط (Regular)', 0, true, 1),
    (v_group_size, 'كبير (Large)', 750, false, 2);

  insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_prod_spanish, 'نوع الحليب', 'single', false, 0, 1, 2)
  returning id into v_group_milk;

  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values
    (v_group_milk, 'حليب كامل الدسم', 0, true, 1),
    (v_group_milk, 'حليب قليل الدسم', 0, false, 2),
    (v_group_milk, 'حليب شوفان عضوي', 750, false, 3),
    (v_group_milk, 'حليب لوز', 750, false, 4);

  insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_prod_spanish, 'إضافات مفضلة', 'multiple', false, 0, 3, 3)
  returning id into v_group_extras;

  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values
    (v_group_extras, 'شوت إسبريسو إضافي', 1000, false, 1),
    (v_group_extras, 'سيرب كراميل', 500, false, 2),
    (v_group_extras, 'كريمة مخفوقة', 500, false, 3);

  -- Option groups for Iced Spanish Latte as well
  insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_prod_iced_latte, 'الحجم', 'single', true, 1, 1, 1)
  returning id into v_group_size;

  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values
    (v_group_size, 'وسط (Regular)', 0, true, 1),
    (v_group_size, 'كبير (Large)', 750, false, 2);

  insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_prod_iced_latte, 'نوع الحليب', 'single', false, 0, 1, 2)
  returning id into v_group_milk;

  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values
    (v_group_milk, 'حليب كامل الدسم', 0, true, 1),
    (v_group_milk, 'حليب شوفان عضوي', 750, false, 2);

end $$;
