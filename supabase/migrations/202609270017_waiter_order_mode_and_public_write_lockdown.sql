-- BOX COFE migration 017
-- Makes waiter order type explicit and removes anonymous customer order writes.

-- The customer catalog is read-only. Existing customer order RPCs remain available
-- to trusted server-side calls, but cannot be invoked by browser roles.
revoke all on function public.place_customer_order(text, uuid, jsonb, text, text, text, text)
  from public, anon, authenticated;

-- Keep the existing source value for compatibility with kitchen/admin feeds while
-- storing the operational distinction as first-class data.
alter table public.orders
  add column if not exists order_mode text not null default 'car';

alter table public.orders
  drop constraint if exists orders_order_mode_check;

alter table public.orders
  add constraint orders_order_mode_check
  check (order_mode in ('car', 'walkin'));

create index if not exists orders_branch_mode_created_idx
  on public.orders(branch_id, order_mode, created_at desc);

-- A dedicated waiter entry point. It reuses the single transactional validator
-- and server-side price calculation, then stamps the order as a staff order.
create or replace function public.place_waiter_order(
  p_items jsonb,
  p_order_mode text default 'car',
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
  v_branch record;
  v_service_point record;
  v_result jsonb;
  v_order_code text;
  v_mode text;
begin
  v_mode := lower(nullif(trim(p_order_mode), ''));
  if v_mode is null then
    v_mode := 'car';
  end if;

  if v_mode not in ('car', 'walkin') then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_ORDER_MODE',
      'message', 'نوع الطلب غير صالح.'
    );
  end if;

  select branch.id, branch.slug
    into v_branch
  from public.staff_profiles as profile
  join public.branches as branch on branch.id = profile.branch_id
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role = 'roadside'
    and branch.is_active
    and profile.branch_id is not null
  limit 1;

  if v_branch.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_AUTHORIZED',
      'message', 'حساب الويتر غير مفعل أو غير مربوط بفرع.'
    );
  end if;

  select point.id, point.qr_token
    into v_service_point
  from public.car_service_points as point
  where point.branch_id = v_branch.id
    and point.is_active
  order by point.created_at, point.id
  limit 1;

  if v_service_point.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_SERVICE_POINT',
      'message', 'لا توجد نقطة خدمة فعالة لهذا الفرع.'
    );
  end if;

  v_result := public.place_customer_order(
    v_branch.slug,
    v_service_point.qr_token,
    p_items,
    null,
    p_vehicle_note,
    p_order_note,
    p_idempotency_key
  );

  if coalesce((v_result ->> 'success')::boolean, false) is not true then
    return v_result;
  end if;

  v_order_code := v_result ->> 'order_code';

  update public.orders as order_row
  set source = 'roadside',
      order_mode = v_mode,
      created_by = (select auth.uid())
  where order_row.branch_id = v_branch.id
    and order_row.order_code = v_order_code;

  if not found then
    raise exception 'Waiter order was created but could not be scoped to its branch';
  end if;

  return v_result || jsonb_build_object(
    'source', 'roadside',
    'order_mode', v_mode
  );
end;
$$;

revoke all on function public.place_waiter_order(jsonb, text, text, text, text)
  from public, anon;
grant execute on function public.place_waiter_order(jsonb, text, text, text, text)
  to authenticated;

comment on column public.orders.order_mode is
  'Operational waiter order type: car for drive-through vehicles or walkin for pedestrians.';

-- Include the explicit order type in the live admin and kitchen feeds.
create or replace function public.admin_get_recent_orders(
  p_hours integer default 24,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_orders jsonb;
begin
  select profile.restaurant_id, profile.branch_id
    into v_restaurant_id, v_branch_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(jsonb_agg(feed.order_json order by feed.created_at desc), '[]'::jsonb)
    into v_orders
  from (
    select order_row.created_at,
      jsonb_build_object(
        'id', order_row.id, 'order_code', order_row.order_code,
        'source', order_row.source, 'order_mode', order_row.order_mode,
        'status', order_row.status, 'total', order_row.total,
        'currency_code', restaurant.currency_code,
        'vehicle_note', coalesce(order_row.vehicle_note, ''),
        'order_note', coalesce(order_row.note, ''),
        'service_point_label', coalesce(service_point.label, 'مسار خدمة السيارات'),
        'branch_name', branch.name, 'created_at', order_row.created_at,
        'updated_at', order_row.updated_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', item.id, 'name', item.product_name, 'quantity', item.quantity,
            'unit_price', item.unit_price, 'note', coalesce(item.note, ''),
            'options', coalesce(item.selected_options, '[]'::jsonb)
          ) order by item.created_at, item.id)
          from public.order_items as item where item.order_id = order_row.id
        ), '[]'::jsonb)
      ) as order_json
    from public.orders as order_row
    join public.branches as branch on branch.id = order_row.branch_id
    join public.restaurants as restaurant on restaurant.id = branch.restaurant_id
    left join public.car_service_points as service_point on service_point.id = order_row.service_point_id
    where branch.restaurant_id = v_restaurant_id
      and (v_branch_id is null or branch.id = v_branch_id)
      and order_row.created_at >= pg_catalog.now()
        - (greatest(1, least(coalesce(p_hours, 24), 168)) * interval '1 hour')
    order by order_row.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  ) as feed;

  return jsonb_build_object('success', true, 'orders', v_orders);
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
  select branch.id into v_branch_id
  from public.branches as branch
  where branch.slug = p_branch_slug and branch.is_active
  order by branch.created_at limit 1;

  if v_branch_id is null
     or not public.staff_has_branch_role(v_branch_id, array['owner', 'admin', 'kitchen']::text[]) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', order_row.id, 'order_code', order_row.order_code,
    'source', order_row.source, 'order_mode', order_row.order_mode,
    'status', order_row.status, 'total', order_row.total,
    'currency_code', restaurant.currency_code,
    'vehicle_note', coalesce(order_row.vehicle_note, ''),
    'order_note', coalesce(order_row.note, ''),
    'service_point_label', coalesce(service_point.label, 'مسار خدمة السيارات'),
    'created_at', order_row.created_at, 'updated_at', order_row.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'name', item.product_name, 'quantity', item.quantity,
        'unit_price', item.unit_price, 'note', coalesce(item.note, ''),
        'options', coalesce(item.selected_options, '[]'::jsonb)
      ) order by item.created_at, item.id)
      from public.order_items as item where item.order_id = order_row.id
    ), '[]'::jsonb)
  ) order by order_row.created_at), '[]'::jsonb)
    into v_orders
  from public.orders as order_row
  join public.branches as branch on branch.id = order_row.branch_id
  join public.restaurants as restaurant on restaurant.id = branch.restaurant_id
  left join public.car_service_points as service_point on service_point.id = order_row.service_point_id
  where order_row.branch_id = v_branch_id
    and order_row.created_at >= now() - interval '16 hours';

  return jsonb_build_object('success', true, 'orders', v_orders);
end;
$$;
