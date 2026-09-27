-- BOX COFE migration 018
-- One-time repair for Auth users that were created before staff management
-- was enabled and therefore have no public.staff_profiles row.
--
-- The project currently uses Auth as the account registry and staff_profiles
-- as the authorization registry. A user that exists only in auth.users can
-- authenticate, but must be rejected by staff screens. This repair links
-- only currently-unlinked users to the first active branch as roadside staff.
-- Existing staff profiles and the primary owner are never changed.

do $$
declare
  v_restaurant_id uuid;
  v_branch_id uuid;
begin
  select id
    into v_restaurant_id
  from public.restaurants
  where is_active
  order by created_at asc
  limit 1;

  select id
    into v_branch_id
  from public.branches
  where restaurant_id = v_restaurant_id
    and is_active
  order by created_at asc
  limit 1;

  if v_restaurant_id is null or v_branch_id is null then
    raise exception 'Cannot repair staff profiles: no active restaurant or branch exists';
  end if;

  insert into public.staff_profiles (
    user_id,
    restaurant_id,
    branch_id,
    full_name,
    role,
    is_active
  )
  select
    u.id,
    v_restaurant_id,
    v_branch_id,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), u.email, 'موظف الويتر'),
    'roadside',
    true
  from auth.users as u
  where lower(coalesce(u.email, '')) <> 'cofebox8@gmail.com'
    and not exists (
      select 1
      from public.staff_profiles as existing_profile
      where existing_profile.user_id = u.id
    )
  on conflict (user_id) do nothing;
end;
$$;

