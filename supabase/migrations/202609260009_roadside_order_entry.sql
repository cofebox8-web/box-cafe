-- Secure order entry for an authenticated roadside employee.
-- Reuses the customer's transactional validation and server-side price calculation,
-- then stamps the created order with its staff source and actor in the same transaction.

create or replace function public.place_roadside_order(
  p_items jsonb,
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
begin
  select branch.id, branch.slug
    into v_branch
  from public.staff_profiles as profile
  join public.branches as branch on branch.id = profile.branch_id
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role = 'roadside'
    and profile.branch_id is not null
  limit 1;

  if v_branch.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_AUTHORIZED',
      'message', 'حساب موظف الشارع غير مفعل أو غير مربوط بفرع.'
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
      created_by = (select auth.uid())
  where order_row.branch_id = v_branch.id
    and order_row.order_code = v_order_code;

  if not found then
    raise exception 'Roadside order was created but could not be scoped to its branch';
  end if;

  return v_result || jsonb_build_object('source', 'roadside');
end;
$$;

revoke all on function public.place_roadside_order(jsonb, text, text, text) from public, anon;
grant execute on function public.place_roadside_order(jsonb, text, text, text) to authenticated;
