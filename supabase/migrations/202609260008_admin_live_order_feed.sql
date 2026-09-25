-- A restaurant-scoped order feed for the admin dashboard.
-- The function returns only recent orders visible to the active owner/admin.

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
    select
      order_row.created_at,
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
        'branch_name', branch.name,
        'created_at', order_row.created_at,
        'updated_at', order_row.updated_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', item.id,
            'name', item.product_name,
            'quantity', item.quantity,
            'unit_price', item.unit_price,
            'note', coalesce(item.note, ''),
            'options', coalesce(item.selected_options, '[]'::jsonb)
          ) order by item.created_at, item.id)
          from public.order_items as item
          where item.order_id = order_row.id
        ), '[]'::jsonb)
      ) as order_json
    from public.orders as order_row
    join public.branches as branch on branch.id = order_row.branch_id
    join public.restaurants as restaurant on restaurant.id = branch.restaurant_id
    left join public.car_service_points as service_point
      on service_point.id = order_row.service_point_id
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

revoke all on function public.admin_get_recent_orders(integer, integer) from public, anon;
grant execute on function public.admin_get_recent_orders(integer, integer) to authenticated;
