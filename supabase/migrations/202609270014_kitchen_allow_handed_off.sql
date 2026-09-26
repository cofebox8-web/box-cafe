-- Allow kitchen staff to transition orders to 'handed_off' (and undo to 'ready')

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

  if p_new_status not in ('preparing', 'ready', 'handed_off') then
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
    or (v_old_status = 'ready' and p_new_status = 'handed_off')
    or (v_old_status = 'handed_off' and p_new_status = 'ready')
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
    'old_status', v_old_status,
    'new_status', p_new_status
  );
end;
$$;

revoke all on function public.update_kitchen_order_status(text, text) from public, anon;
grant execute on function public.update_kitchen_order_status(text, text) to authenticated;
