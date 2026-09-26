-- Bootstrap procedure to establish the initial restaurant owner (Super Admin).
-- Runs securely as SECURITY DEFINER; only succeeds if zero active owners/admins exist in staff_profiles.

create or replace function public.bootstrap_initial_owner()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_restaurant_id uuid;
  v_owner_count integer;
  v_profile public.staff_profiles%rowtype;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('success', false, 'message', 'يجب تسجيل الدخول أولاً لتفعيل الحساب.');
  end if;

  -- التحقق من عدم وجود مالك أو مدير رئيسي مسبقاً
  select count(*)
  into v_owner_count
  from public.staff_profiles
  where role in ('owner', 'admin') and is_active;

  if v_owner_count > 0 then
    return jsonb_build_object('success', false, 'message', 'تم تأسيس حساب المالك الرئيسي مسبقاً لهذا النظام.');
  end if;

  select id into v_restaurant_id
  from public.restaurants
  where is_active
  order by created_at asc
  limit 1;

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'message', 'لا يوجد مطعم مفعّل في النظام.');
  end if;

  insert into public.staff_profiles (
    user_id,
    restaurant_id,
    full_name,
    role,
    is_active
  )
  values (
    v_uid,
    v_restaurant_id,
    coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), 'المدير الرئيسي (Super Admin)'),
    'owner',
    true
  )
  on conflict (user_id) do update
  set role = 'owner', is_active = true
  returning * into v_profile;

  return jsonb_build_object(
    'success', true,
    'message', 'تم تعيين حسابك كمالك رئيسي (سوبر أدمن) بنجاح.',
    'user_id', v_profile.user_id,
    'role', v_profile.role
  );
end;
$$;

revoke all on function public.bootstrap_initial_owner() from public;
grant execute on function public.bootstrap_initial_owner() to authenticated;

comment on function public.bootstrap_initial_owner() is 'One-time bootstrap RPC to promote the first authenticated user to owner if no active owners/admins exist in staff_profiles.';
