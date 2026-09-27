-- BOX COFE production migrations 013-015
-- Run once in Supabase SQL Editor as postgres.

-- Publish catalog and service-point changes to Supabase Realtime.
-- Customer and roadside screens still refetch through the validated menu RPC;
-- Realtime is the low-latency trigger and visibility polling is the recovery path.

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'menu_categories',
      'menu_products',
      'product_option_groups',
      'product_option_items',
      'car_service_points'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;

-- Migration 014

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

-- Migration 015

-- Prevent staff status management from disabling or changing an owner profile.
-- This is a corrective migration for the function introduced in 012.

create or replace function public.admin_toggle_staff_status(
  p_target_user_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_restaurant_id uuid;
  v_target_role text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select restaurant_id
    into v_restaurant_id
  from public.staff_profiles
  where user_id = v_uid
    and is_active
    and role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if p_target_user_id = v_uid and not p_is_active then
    return jsonb_build_object('success', false, 'error', 'CANNOT_DEACTIVATE_SELF');
  end if;

  select role
    into v_target_role
  from public.staff_profiles
  where user_id = p_target_user_id
    and restaurant_id = v_restaurant_id;

  if v_target_role is null then
    return jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  end if;

  if v_target_role = 'owner' then
    return jsonb_build_object('success', false, 'error', 'CANNOT_MODIFY_OWNER');
  end if;

  update public.staff_profiles
  set is_active = p_is_active
  where user_id = p_target_user_id
    and restaurant_id = v_restaurant_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.admin_toggle_staff_status(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_staff_status(uuid, boolean) to authenticated;
