-- Public read-only customer menu for the official root/customer routes.
-- This function never exposes a QR token and never writes orders.

create or replace function public.get_public_customer_menu(
  p_branch_slug text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_slug text;
  v_qr_token uuid;
begin
  select branch.slug, point.qr_token
    into v_branch_slug, v_qr_token
  from public.car_service_points as point
  join public.branches as branch on branch.id = point.branch_id
  join public.restaurants as restaurant on restaurant.id = branch.restaurant_id
  where point.is_active
    and branch.is_active
    and restaurant.is_active
    and (nullif(trim(p_branch_slug), '') is null or branch.slug = trim(p_branch_slug))
  order by branch.created_at, point.created_at, branch.slug, point.id
  limit 1;

  if v_branch_slug is null or v_qr_token is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_SERVICE_POINT',
      'message', 'لا توجد نقطة خدمة فعالة لعرض المنيو حالياً.'
    );
  end if;

  return public.get_customer_menu(v_branch_slug, v_qr_token);
end;
$$;

revoke all on function public.get_public_customer_menu(text) from public;
grant execute on function public.get_public_customer_menu(text) to anon, authenticated;
