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
