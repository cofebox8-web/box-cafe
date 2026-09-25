-- Restricted product-management RPCs for authenticated restaurant admins.
-- The application schema uses menu_products.name (not a separate products/name_ar table).

create or replace function public.staff_is_restaurant_admin(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles as profile
    where profile.user_id = (select auth.uid())
      and profile.restaurant_id = target_restaurant_id
      and profile.is_active
      and profile.role in ('owner', 'admin')
  );
$$;

revoke all on function public.staff_is_restaurant_admin(uuid) from public, anon;
grant execute on function public.staff_is_restaurant_admin(uuid) to authenticated;

create or replace function public.admin_toggle_product_availability(
  p_product_id uuid,
  p_is_available boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_product public.menu_products%rowtype;
begin
  select product.restaurant_id
    into v_restaurant_id
  from public.menu_products as product
  where product.id = p_product_id;

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
  end if;

  if not public.staff_is_restaurant_admin(v_restaurant_id) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  update public.menu_products as product
  set is_available = p_is_available,
      updated_at = now()
  where product.id = p_product_id
  returning product.* into v_product;

  return jsonb_build_object(
    'success', true,
    'product_id', v_product.id,
    'is_available', v_product.is_available
  );
end;
$$;

create or replace function public.admin_upsert_product(
  p_restaurant_id uuid,
  p_category_id uuid,
  p_name text,
  p_price numeric,
  p_image_url text default null,
  p_is_available boolean default true,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  if not public.staff_is_restaurant_admin(p_restaurant_id) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 120 then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_NAME');
  end if;

  if p_price is null or p_price < 0 then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_PRICE');
  end if;

  if not exists (
    select 1
    from public.menu_categories as category
    where category.id = p_category_id
      and category.restaurant_id = p_restaurant_id
  ) then
    return jsonb_build_object('success', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;

  if p_product_id is null then
    insert into public.menu_products (
      restaurant_id, category_id, name, price, image_url, is_available
    ) values (
      p_restaurant_id, p_category_id, trim(p_name), p_price,
      nullif(trim(p_image_url), ''), p_is_available
    )
    returning id into v_product_id;
  else
    update public.menu_products as product
    set category_id = p_category_id,
        name = trim(p_name),
        price = p_price,
        image_url = nullif(trim(p_image_url), ''),
        is_available = p_is_available,
        updated_at = now()
    where product.id = p_product_id
      and product.restaurant_id = p_restaurant_id
    returning product.id into v_product_id;

    if v_product_id is null then
      return jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
    end if;
  end if;

  return jsonb_build_object('success', true, 'product_id', v_product_id);
end;
$$;

create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  select product.restaurant_id
    into v_restaurant_id
  from public.menu_products as product
  where product.id = p_product_id;

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
  end if;

  if not public.staff_is_restaurant_admin(v_restaurant_id) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  delete from public.menu_products as product
  where product.id = p_product_id;

  return jsonb_build_object('success', true, 'product_id', p_product_id);
end;
$$;

revoke all on function public.admin_toggle_product_availability(uuid, boolean) from public, anon;
revoke all on function public.admin_upsert_product(uuid, uuid, text, numeric, text, boolean, uuid) from public, anon;
revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_toggle_product_availability(uuid, boolean) to authenticated;
grant execute on function public.admin_upsert_product(uuid, uuid, text, numeric, text, boolean, uuid) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
