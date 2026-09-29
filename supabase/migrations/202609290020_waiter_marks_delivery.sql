-- The kitchen prepares orders only through the ready-for-delivery state.
-- A roadside waiter (or an owner/admin acting as an override) completes delivery.

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

revoke all on function public.update_kitchen_order_status(text, text) from public, anon;
grant execute on function public.update_kitchen_order_status(text, text) to authenticated;

create or replace function public.mark_order_delivered(p_order_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_order
  from public.orders as order_row
  where order_row.order_code = p_order_code
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if not public.staff_has_branch_role(
    v_order.branch_id,
    array['owner', 'admin', 'roadside']::text[]
  ) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if v_order.status <> 'ready' then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION');
  end if;

  update public.orders
  set status = 'handed_off',
      updated_at = now()
  where id = v_order.id;

  insert into public.order_status_events (
    order_id, branch_id, old_status, new_status, changed_by
  ) values (
    v_order.id, v_order.branch_id, v_order.status, 'handed_off', auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'order_code', v_order.order_code,
    'old_status', v_order.status,
    'new_status', 'handed_off',
    'updated_at', now()
  );
end;
$$;

revoke all on function public.mark_order_delivered(text) from public, anon;
grant execute on function public.mark_order_delivered(text) to authenticated;

-- No existing RPC exposes the branch's ready queue to roadside staff.
create or replace function public.get_waiter_ready_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_role text;
  v_orders jsonb;
begin
  select profile.restaurant_id, profile.branch_id, profile.role
    into v_restaurant_id, v_branch_id, v_role
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin', 'roadside');

  if v_restaurant_id is null or (v_role = 'roadside' and v_branch_id is null) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', order_row.id,
        'order_code', order_row.order_code,
        'status', order_row.status,
        'created_at', order_row.created_at
      ) order by order_row.created_at
    ),
    '[]'::jsonb
  )
    into v_orders
  from public.orders as order_row
  join public.branches as branch on branch.id = order_row.branch_id
  where branch.restaurant_id = v_restaurant_id
    and (v_branch_id is null or branch.id = v_branch_id)
    and order_row.status = 'ready'
    and public.staff_has_branch_role(
      order_row.branch_id,
      array['owner', 'admin', 'roadside']::text[]
    );

  return jsonb_build_object('success', true, 'orders', v_orders);
end;
$$;

revoke all on function public.get_waiter_ready_orders() from public, anon;
grant execute on function public.get_waiter_ready_orders() to authenticated;

-- Publish the existing minimal status-event table so waiter devices can
-- synchronize the ready queue across a branch without broadening order-row RLS.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as pub
    where pub.pubname = 'supabase_realtime'
      and not pub.puballtables
  )
  and not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'order_status_events'
  ) then
    alter publication supabase_realtime add table public.order_status_events;
  end if;
end;
$$;
