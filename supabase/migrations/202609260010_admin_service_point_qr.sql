-- Secure service point management and QR provisioning for restaurant owners/admins.

create or replace function public.admin_get_service_points()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_branches jsonb;
  v_points jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', branch.id,
      'name', branch.name,
      'slug', branch.slug
    ) order by branch.name), '[]'::jsonb)
    into v_branches
  from public.branches as branch
  where branch.restaurant_id = v_restaurant_id
    and branch.is_active
    and (v_branch_id is null or branch.id = v_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', point.id,
      'branch_id', point.branch_id,
      'branch_name', branch.name,
      'branch_slug', branch.slug,
      'label', point.label,
      'kind', point.kind,
      'qr_token', point.qr_token,
      'is_active', point.is_active,
      'created_at', point.created_at
    ) order by branch.name, point.label), '[]'::jsonb)
    into v_points
  from public.car_service_points as point
  join public.branches as branch on branch.id = point.branch_id
  where branch.restaurant_id = v_restaurant_id
    and (v_branch_id is null or branch.id = v_branch_id);

  return jsonb_build_object(
    'success', true,
    'branches', v_branches,
    'service_points', v_points
  );
end;
$$;

create or replace function public.admin_save_service_point(
  p_service_point_id uuid,
  p_branch_id uuid,
  p_label text,
  p_kind text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_staff_branch_id uuid;
  v_saved_id uuid;
  v_label text := pg_catalog.btrim(coalesce(p_label, ''));
begin
  select profile.restaurant_id, profile.branch_id
    into v_restaurant_id, v_staff_branch_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;
  if p_branch_id is null or (v_staff_branch_id is not null and v_staff_branch_id <> p_branch_id) then
    return jsonb_build_object('success', false, 'error', 'BRANCH_NOT_ALLOWED');
  end if;
  if v_label = '' or pg_catalog.char_length(v_label) > 80 then
    return jsonb_build_object('success', false, 'error', 'INVALID_LABEL');
  end if;
  if p_kind is null or p_kind not in ('order_lane', 'pickup_point') then
    return jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  end if;
  if not exists (
    select 1 from public.branches as branch
    where branch.id = p_branch_id
      and branch.restaurant_id = v_restaurant_id
      and branch.is_active
  ) then
    return jsonb_build_object('success', false, 'error', 'BRANCH_NOT_FOUND');
  end if;

  if p_service_point_id is null then
    insert into public.car_service_points (branch_id, label, kind, is_active)
    values (p_branch_id, v_label, p_kind, coalesce(p_is_active, true))
    returning id into v_saved_id;
  else
    update public.car_service_points as point
    set label = v_label,
        kind = p_kind,
        is_active = coalesce(p_is_active, true)
    from public.branches as branch
    where point.id = p_service_point_id
      and point.branch_id = branch.id
      and point.branch_id = p_branch_id
      and branch.restaurant_id = v_restaurant_id
      and (v_staff_branch_id is null or branch.id = v_staff_branch_id)
    returning point.id into v_saved_id;
    if v_saved_id is null then
      return jsonb_build_object('success', false, 'error', 'SERVICE_POINT_NOT_FOUND');
    end if;
  end if;

  return jsonb_build_object('success', true, 'service_point_id', v_saved_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'DUPLICATE_LABEL');
end;
$$;

create or replace function public.admin_rotate_service_point_qr(p_service_point_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_staff_branch_id uuid;
  v_new_token uuid;
begin
  select profile.restaurant_id, profile.branch_id
    into v_restaurant_id, v_staff_branch_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  update public.car_service_points as point
  set qr_token = pg_catalog.gen_random_uuid()
  from public.branches as branch
  where point.id = p_service_point_id
    and point.branch_id = branch.id
    and branch.restaurant_id = v_restaurant_id
    and (v_staff_branch_id is null or branch.id = v_staff_branch_id)
  returning point.qr_token into v_new_token;

  if v_new_token is null then
    return jsonb_build_object('success', false, 'error', 'SERVICE_POINT_NOT_FOUND');
  end if;
  return jsonb_build_object('success', true, 'qr_token', v_new_token);
end;
$$;

revoke all on function public.admin_get_service_points() from public, anon;
revoke all on function public.admin_save_service_point(uuid, uuid, text, text, boolean) from public, anon;
revoke all on function public.admin_rotate_service_point_qr(uuid) from public, anon;
grant execute on function public.admin_get_service_points() to authenticated;
grant execute on function public.admin_save_service_point(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_rotate_service_point_qr(uuid) to authenticated;
