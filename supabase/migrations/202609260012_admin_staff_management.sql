-- ============================================================================
-- Migration: 202609260012_admin_staff_management.sql
-- Description: Super Admin profile seeding, staff management RPCs, and RLS policies
-- ============================================================================

-- 1. Ensure the primary owner profile exists for cofebox8@gmail.com
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
  r.id,
  null,
  'المدير الرئيسي (Super Admin)',
  'owner',
  true
from auth.users u
cross join (
  select id from public.restaurants where is_active order by created_at asc limit 1
) r
where lower(u.email) = 'cofebox8@gmail.com'
   or u.id = '255f5365-931f-4505-8390-33d73d2b9653'
on conflict (user_id) do update set
  role = 'owner',
  is_active = true,
  full_name = 'المدير الرئيسي (Super Admin)';

-- 2. Allow Owners and Admins to read all staff profiles in their restaurant
create policy "admins can read all staff profiles"
  on public.staff_profiles for select to authenticated
  using (
    public.staff_is_restaurant_admin(restaurant_id)
    or user_id = (select auth.uid())
  );

-- 3. Allow Owners and Admins to insert staff profiles in their restaurant
create policy "admins can insert staff profiles"
  on public.staff_profiles for insert to authenticated
  with check (
    public.staff_is_restaurant_admin(restaurant_id)
  );

-- 4. Allow Owners and Admins to update staff profiles in their restaurant
create policy "admins can update staff profiles"
  on public.staff_profiles for update to authenticated
  using (
    public.staff_is_restaurant_admin(restaurant_id)
  )
  with check (
    public.staff_is_restaurant_admin(restaurant_id)
  );

-- 5. RPC to get staff list with email, role, and branch details
create or replace function public.admin_get_staff()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_restaurant_id uuid;
  v_staff jsonb;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select restaurant_id into v_restaurant_id
  from public.staff_profiles
  where user_id = v_uid and is_active and role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', p.user_id,
      'full_name', p.full_name,
      'role', p.role,
      'is_active', p.is_active,
      'branch_id', p.branch_id,
      'branch_name', coalesce(b.name, 'جميع الفروع'),
      'branch_slug', coalesce(b.slug, 'airport'),
      'email', coalesce(u.email, ''),
      'created_at', p.created_at
    ) order by p.created_at asc
  ), '[]'::jsonb)
  into v_staff
  from public.staff_profiles p
  left join auth.users u on u.id = p.user_id
  left join public.branches b on b.id = p.branch_id
  where p.restaurant_id = v_restaurant_id;

  return jsonb_build_object(
    'success', true,
    'staff', v_staff
  );
end;
$$;

revoke all on function public.admin_get_staff() from public, anon;
grant execute on function public.admin_get_staff() to authenticated;

-- 6. RPC to toggle staff active state
create or replace function public.admin_toggle_staff_status(p_target_user_id uuid, p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_restaurant_id uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select restaurant_id into v_restaurant_id
  from public.staff_profiles
  where user_id = v_uid and is_active and role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  -- Protect Super Admin from self-deactivation
  if p_target_user_id = v_uid and not p_is_active then
    return jsonb_build_object('success', false, 'error', 'CANNOT_DEACTIVATE_SELF');
  end if;

  update public.staff_profiles
  set is_active = p_is_active
  where user_id = p_target_user_id and restaurant_id = v_restaurant_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.admin_toggle_staff_status(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_staff_status(uuid, boolean) to authenticated;
