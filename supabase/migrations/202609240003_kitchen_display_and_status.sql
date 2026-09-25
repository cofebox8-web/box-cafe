-- Kitchen display RPCs and order status audit.
-- This migration assumes the preceding ordered migrations are applied to a fresh project.

-- Check a signed-in staff member's active role within a branch.
create or replace function public.staff_has_branch_role(
  target_branch_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles as profile
    join public.branches as branch
      on branch.id = target_branch_id
     and branch.restaurant_id = profile.restaurant_id
    where profile.user_id = (select auth.uid())
      and profile.is_active
      and profile.role = any(allowed_roles)
      and (profile.branch_id is null or profile.branch_id = target_branch_id)
  );
$$;

revoke all on function public.staff_has_branch_role(uuid, text[]) from public, anon;
grant execute on function public.staff_has_branch_role(uuid, text[]) to authenticated;

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index order_status_events_order_changed_idx
  on public.order_status_events(order_id, changed_at desc);

alter table public.order_status_events enable row level security;

create policy "staff can read order status events in assigned branches"
  on public.order_status_events for select to authenticated
  using (public.current_staff_can_access_branch(branch_id));

grant select on public.order_status_events to authenticated;
revoke insert, update, delete on public.orders from authenticated;
revoke update (status, updated_at) on public.orders from authenticated;
revoke insert, update, delete on public.order_status_events from anon, authenticated;

-- Add orders to Realtime when the publication is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

create or replace function public.get_kitchen_orders(p_branch_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_orders jsonb;
begin
  select branch.id
    into v_branch_id
  from public.branches as branch
  where branch.slug = p_branch_slug
    and branch.is_active
  order by branch.created_at
  limit 1;

  if v_branch_id is null
     or not public.staff_has_branch_role(v_branch_id, array['owner', 'admin', 'kitchen']::text[]) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', order_row.id,
        'order_code', order_row.order_code,
        'source', order_row.source,
        'status', order_row.status,
        'total', order_row.total,
        'currency_code', restaurant.currency_code,
        'vehicle_note', coalesce(order_row.vehicle_note, ''),
        'order_note', coalesce(order_row.note, ''),
        'service_point_label', coalesce(service_point.label, 'مسار خدمة السيارات'),
        'created_at', order_row.created_at,
        'updated_at', order_row.updated_at,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', item.id,
              'name', item.product_name,
              'quantity', item.quantity,
              'unit_price', item.unit_price,
              'note', coalesce(item.note, ''),
              'options', coalesce(item.selected_options, '[]'::jsonb)
            ) order by item.created_at, item.id
          )
          from public.order_items as item
          where item.order_id = order_row.id
        ), '[]'::jsonb)
      ) order by order_row.created_at
    ),
    '[]'::jsonb
  )
  into v_orders
  from public.orders as order_row
  join public.branches as branch on branch.id = order_row.branch_id
  join public.restaurants as restaurant on restaurant.id = branch.restaurant_id
  left join public.car_service_points as service_point
    on service_point.id = order_row.service_point_id
  where order_row.branch_id = v_branch_id
    and order_row.created_at >= now() - interval '16 hours';

  return jsonb_build_object('success', true, 'orders', v_orders);
end;
$$;

create or replace function public.update_kitchen_order_status(
  p_order_code text,
  p_new_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_old_status text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if p_new_status not in ('preparing', 'ready') then
    return jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  end if;

  select *
    into v_order
  from public.orders as order_row
  where order_row.order_code = p_order_code
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if not public.staff_has_branch_role(v_order.branch_id, array['owner', 'admin', 'kitchen']::text[]) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  v_old_status := v_order.status;

  if not (
    (v_old_status in ('new', 'confirmed') and p_new_status = 'preparing')
    or (v_old_status = 'preparing' and p_new_status = 'ready')
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION');
  end if;

  update public.orders
  set status = p_new_status,
      updated_at = now()
  where id = v_order.id;

  insert into public.order_status_events (
    order_id, branch_id, old_status, new_status, changed_by
  ) values (
    v_order.id, v_order.branch_id, v_old_status, p_new_status, auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'order_code', v_order.order_code,
    'status', p_new_status,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.get_kitchen_orders(text) from public, anon;
revoke all on function public.update_kitchen_order_status(text, text) from public, anon;
grant execute on function public.get_kitchen_orders(text) to authenticated;
grant execute on function public.update_kitchen_order_status(text, text) to authenticated;
