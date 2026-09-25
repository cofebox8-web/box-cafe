-- Admin-owned menu authoring: categories, products, descriptions, images, and options.
-- No catalog rows are seeded by this migration.

create or replace function public.admin_get_menu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_categories jsonb;
  v_products jsonb;
begin
  select profile.restaurant_id
    into v_restaurant_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', category.id,
      'name', category.name,
      'description', category.description,
      'sort_order', category.sort_order,
      'is_active', category.is_active
    ) order by category.sort_order, category.name), '[]'::jsonb)
    into v_categories
  from public.menu_categories as category
  where category.restaurant_id = v_restaurant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id,
      'category_id', product.category_id,
      'name', product.name,
      'description', product.description,
      'image_url', product.image_url,
      'price', product.price,
      'sort_order', product.sort_order,
      'is_available', product.is_available,
      'option_groups', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', option_group.id,
            'name', option_group.name,
            'selection_type', option_group.selection_type,
            'is_required', option_group.is_required,
            'min_selections', option_group.min_selections,
            'max_selections', option_group.max_selections,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                  'id', option_item.id,
                  'name', option_item.name,
                  'price_modifier', option_item.price_modifier,
                  'is_available', option_item.is_available,
                  'is_default', option_item.is_default
                ) order by option_item.sort_order, option_item.name)
              from public.product_option_items as option_item
              where option_item.group_id = option_group.id
            ), '[]'::jsonb)
          ) order by option_group.sort_order, option_group.name)
        from public.product_option_groups as option_group
        where option_group.product_id = product.id
      ), '[]'::jsonb)
    ) order by product.sort_order, product.name), '[]'::jsonb)
    into v_products
  from public.menu_products as product
  where product.restaurant_id = v_restaurant_id;

  return jsonb_build_object(
    'success', true,
    'restaurant_id', v_restaurant_id,
    'categories', v_categories,
    'products', v_products
  );
end;
$$;

create or replace function public.admin_save_category(
  p_category_id uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_category_id uuid;
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_description text := nullif(pg_catalog.btrim(p_description), '');
begin
  select profile.restaurant_id
    into v_restaurant_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;
  if v_name is null or pg_catalog.char_length(v_name) > 80 then
    return jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY_NAME');
  end if;
  if v_description is not null and pg_catalog.char_length(v_description) > 300 then
    return jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY_DESCRIPTION');
  end if;

  if p_category_id is null then
    insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
    values (
      v_restaurant_id,
      v_name,
      v_description,
      coalesce((select pg_catalog.max(category.sort_order) + 1
                from public.menu_categories as category
                where category.restaurant_id = v_restaurant_id), 1),
      true
    )
    returning id into v_category_id;
  else
    update public.menu_categories as category
    set name = v_name,
        description = v_description
    where category.id = p_category_id
      and category.restaurant_id = v_restaurant_id
    returning category.id into v_category_id;

    if v_category_id is null then
      return jsonb_build_object('success', false, 'error', 'CATEGORY_NOT_FOUND');
    end if;
  end if;

  return jsonb_build_object('success', true, 'category_id', v_category_id);
end;
$$;

create or replace function public.admin_save_menu_product(
  p_product_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_image_url text,
  p_is_available boolean,
  p_option_groups jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_product_id uuid;
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_description text := nullif(pg_catalog.btrim(p_description), '');
  v_image_url text := nullif(pg_catalog.btrim(p_image_url), '');
  v_group jsonb;
  v_option jsonb;
  v_group_id uuid;
  v_group_name text;
  v_selection_type text;
  v_required boolean;
  v_min integer;
  v_max integer;
  v_group_index integer := 0;
  v_option_index integer;
  v_option_count integer;
  v_option_name text;
  v_option_price numeric;
begin
  select profile.restaurant_id
    into v_restaurant_id
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
    and profile.role in ('owner', 'admin');

  if v_restaurant_id is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;
  if v_name is null or pg_catalog.char_length(v_name) > 120 then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_NAME');
  end if;
  if v_description is not null and pg_catalog.char_length(v_description) > 500 then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_DESCRIPTION');
  end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_PRICE');
  end if;
  if p_is_available is null then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_AVAILABILITY');
  end if;
  if not exists (
    select 1 from public.menu_categories as category
    where category.id = p_category_id
      and category.restaurant_id = v_restaurant_id
  ) then
    return jsonb_build_object('success', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  if v_image_url is not null and v_image_url !~ '^https://' then
    return jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_IMAGE_URL');
  end if;
  if p_option_groups is null or pg_catalog.jsonb_typeof(p_option_groups) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_GROUPS');
  end if;
  if pg_catalog.jsonb_array_length(p_option_groups) > 12 then
    return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_GROUPS');
  end if;

  -- Validate all submitted groups and choices before changing any rows.
  for v_group in select value from pg_catalog.jsonb_array_elements(p_option_groups) as x(value)
  loop
    if pg_catalog.jsonb_typeof(v_group) <> 'object'
       or pg_catalog.jsonb_typeof(v_group->'options') <> 'array' then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_GROUP');
    end if;
    if (v_group ? 'is_required' and pg_catalog.jsonb_typeof(v_group->'is_required') <> 'boolean')
       or (v_group ? 'min_selections' and (pg_catalog.jsonb_typeof(v_group->'min_selections') <> 'number'
           or (v_group->>'min_selections') !~ '^[0-9]+$'))
       or (v_group ? 'max_selections' and (pg_catalog.jsonb_typeof(v_group->'max_selections') <> 'number'
           or (v_group->>'max_selections') !~ '^[0-9]+$')) then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_GROUP');
    end if;
    v_group_name := nullif(pg_catalog.btrim(v_group->>'name'), '');
    v_selection_type := v_group->>'selection_type';
    v_required := coalesce((v_group->>'is_required')::boolean, false);
    v_min := coalesce((v_group->>'min_selections')::integer, case when v_required then 1 else 0 end);
    v_max := coalesce((v_group->>'max_selections')::integer, 1);

    if v_group_name is null or pg_catalog.char_length(v_group_name) > 80
       or v_selection_type is null or v_selection_type not in ('single', 'multiple')
       or pg_catalog.jsonb_array_length(v_group->'options') < 1
       or pg_catalog.jsonb_array_length(v_group->'options') > 30
       or v_min < 0 or v_max < v_min
       or (v_required and v_min < 1)
       or (v_selection_type = 'single' and (v_min > 1 or v_max > 1)) then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_GROUP');
    end if;

    v_option_count := pg_catalog.jsonb_array_length(v_group->'options');
    if v_max > v_option_count then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION_LIMIT');
    end if;

    for v_option in
      select value from pg_catalog.jsonb_array_elements(v_group->'options') as x(value)
    loop
      if pg_catalog.jsonb_typeof(v_option) <> 'object'
         or (v_option ? 'price_modifier' and pg_catalog.jsonb_typeof(v_option->'price_modifier') <> 'number')
         or (v_option ? 'is_available' and pg_catalog.jsonb_typeof(v_option->'is_available') <> 'boolean')
         or (v_option ? 'is_default' and pg_catalog.jsonb_typeof(v_option->'is_default') <> 'boolean') then
        return jsonb_build_object('success', false, 'error', 'INVALID_OPTION');
      end if;
      v_option_name := nullif(pg_catalog.btrim(v_option->>'name'), '');
      v_option_price := coalesce((v_option->>'price_modifier')::numeric, 0);
      if v_option_name is null or pg_catalog.char_length(v_option_name) > 80
         or v_option_price < 0 or v_option_price > 1000000 then
        return jsonb_build_object('success', false, 'error', 'INVALID_OPTION');
      end if;
    end loop;
  end loop;

  if p_product_id is null then
    insert into public.menu_products (
      restaurant_id, category_id, name, description, price, image_url, is_available, sort_order
    ) values (
      v_restaurant_id, p_category_id, v_name, v_description, p_price, v_image_url, p_is_available,
      coalesce((select pg_catalog.max(product.sort_order) + 1
                from public.menu_products as product
                where product.category_id = p_category_id), 1)
    ) returning id into v_product_id;
  else
    update public.menu_products as product
    set category_id = p_category_id,
        name = v_name,
        description = v_description,
        price = p_price,
        image_url = v_image_url,
        is_available = p_is_available,
        updated_at = pg_catalog.now()
    where product.id = p_product_id
      and product.restaurant_id = v_restaurant_id
    returning product.id into v_product_id;

    if v_product_id is null then
      return jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
    end if;

    delete from public.product_option_groups as option_group
    where option_group.product_id = v_product_id;
  end if;

  v_group_index := 0;
  for v_group in select value from pg_catalog.jsonb_array_elements(p_option_groups) as x(value)
  loop
    v_group_index := v_group_index + 1;
    v_required := coalesce((v_group->>'is_required')::boolean, false);
    v_min := coalesce((v_group->>'min_selections')::integer, case when v_required then 1 else 0 end);
    v_max := coalesce((v_group->>'max_selections')::integer, 1);
    insert into public.product_option_groups (
      product_id, name, selection_type, is_required, min_selections, max_selections, sort_order
    ) values (
      v_product_id,
      pg_catalog.btrim(v_group->>'name'),
      v_group->>'selection_type',
      v_required,
      v_min,
      v_max,
      v_group_index
    ) returning id into v_group_id;

    v_option_index := 0;
    for v_option in
      select value from pg_catalog.jsonb_array_elements(v_group->'options') as x(value)
    loop
      v_option_index := v_option_index + 1;
      insert into public.product_option_items (
        group_id, name, price_modifier, is_available, is_default, sort_order
      ) values (
        v_group_id,
        pg_catalog.btrim(v_option->>'name'),
        coalesce((v_option->>'price_modifier')::numeric, 0),
        coalesce((v_option->>'is_available')::boolean, true),
        coalesce((v_option->>'is_default')::boolean, false),
        v_option_index
      );
    end loop;
  end loop;

  return jsonb_build_object('success', true, 'product_id', v_product_id);
end;
$$;

revoke all on function public.admin_get_menu() from public, anon;
revoke all on function public.admin_save_category(uuid, text, text) from public, anon;
revoke all on function public.admin_save_menu_product(uuid, uuid, text, text, numeric, text, boolean, jsonb) from public, anon;
grant execute on function public.admin_get_menu() to authenticated;
grant execute on function public.admin_save_category(uuid, text, text) to authenticated;
grant execute on function public.admin_save_menu_product(uuid, uuid, text, text, numeric, text, boolean, jsonb) to authenticated;

insert into storage.buckets (id, name, public)
values ('menu-product-images', 'menu-product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "menu images are publicly readable" on storage.objects;
create policy "menu images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-product-images');

drop policy if exists "restaurant admins upload menu images" on storage.objects;
create policy "restaurant admins upload menu images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-product-images'
    and public.staff_is_restaurant_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "restaurant admins update menu images" on storage.objects;
create policy "restaurant admins update menu images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-product-images'
    and public.staff_is_restaurant_admin((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'menu-product-images'
    and public.staff_is_restaurant_admin((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "restaurant admins delete menu images" on storage.objects;
create policy "restaurant admins delete menu images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-product-images'
    and public.staff_is_restaurant_admin((storage.foldername(name))[1]::uuid)
  );
