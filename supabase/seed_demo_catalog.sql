-- BOX COFE demo catalog seed
-- Run once in the correct Supabase project's SQL Editor.
-- This inserts clearly labeled demo content with external Unsplash image URLs.

do $$
declare
  v_restaurant uuid;
  v_hot uuid;
  v_cold uuid;
  v_bakery uuid;
  v_spanish uuid;
  v_cappuccino uuid;
  v_iced_spanish uuid;
  v_group uuid;
begin
  select id into v_restaurant
  from public.restaurants
  where slug = 'box-coffee' and is_active
  order by created_at
  limit 1;

  if v_restaurant is null then
    raise exception 'Active BOX COFE restaurant was not found';
  end if;

  if exists (
    select 1 from public.menu_categories
    where restaurant_id = v_restaurant and name = 'مشروبات ساخنة'
  ) then
    raise exception 'Demo catalog already exists for this restaurant';
  end if;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_restaurant, 'مشروبات ساخنة', 'قهوة محضرة طازجة لكل بداية يوم', 1, true)
  returning id into v_hot;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_restaurant, 'مشروبات باردة', 'نكهات باردة ومنعشة بخياراتك المفضلة', 2, true);

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_restaurant, 'مخبوزات وحلويات', 'اختيارات خفيفة مناسبة مع القهوة', 3, true);

  select id into v_cold from public.menu_categories
  where restaurant_id = v_restaurant and name = 'مشروبات باردة';
  select id into v_bakery from public.menu_categories
  where restaurant_id = v_restaurant and name = 'مخبوزات وحلويات';

  insert into public.menu_products
    (restaurant_id, category_id, name, description, image_url, price, sort_order, is_available)
  values
    (v_restaurant, v_hot, 'سبانش لاتيه', 'إسبريسو مع حليب ناعم ولمسة حليب مكثف.', 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=900&q=85', 5500, 1, true)
  returning id into v_spanish;

  insert into public.menu_products
    (restaurant_id, category_id, name, description, image_url, price, sort_order, is_available)
  values
    (v_restaurant, v_hot, 'كابتشينو', 'إسبريسو غني مع حليب مبخر ورغوة ناعمة.', 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=900&q=85', 4500, 2, true)
  returning id into v_cappuccino;

  insert into public.menu_products
    (restaurant_id, category_id, name, description, image_url, price, sort_order, is_available)
  values (v_restaurant, v_hot, 'أمريكانو كلاسيك', 'إسبريسو دبل مع ماء ساخن بنكهة واضحة.', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85', 3500, 3, true);

  insert into public.menu_products
    (restaurant_id, category_id, name, description, image_url, price, sort_order, is_available)
  values (v_restaurant, v_cold, 'آيس سبانش لاتيه', 'قهوة باردة مع الحليب المكثف والثلج.', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=85', 5500, 1, true)
  returning id into v_iced_spanish;

  insert into public.menu_products
    (restaurant_id, category_id, name, description, image_url, price, sort_order, is_available)
  values
    (v_restaurant, v_cold, 'كولد برو', 'قهوة باردة مستخلصة ببطء لنكهة ناعمة.', 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', 6000, 2, true),
    (v_restaurant, v_bakery, 'كرواسون زبدة', 'كرواسون فرنسي هش ومخبوز بالزبدة.', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', 3000, 1, true),
    (v_restaurant, v_bakery, 'كوكيز شوكولاتة', 'كوكيز طري مع قطع شوكولاتة داكنة.', 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=85', 2500, 2, true);

  insert into public.product_option_groups
    (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_spanish, 'الحجم', 'single', true, 1, 1, 1)
  returning id into v_group;
  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values (v_group, 'وسط', 0, true, 1), (v_group, 'كبير', 750, false, 2);

  insert into public.product_option_groups
    (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_spanish, 'نوع الحليب', 'single', false, 0, 1, 2)
  returning id into v_group;
  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values (v_group, 'كامل الدسم', 0, true, 1), (v_group, 'شوفان', 750, false, 2), (v_group, 'لوز', 750, false, 3);

  insert into public.product_option_groups
    (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_cappuccino, 'الحجم', 'single', true, 1, 1, 1)
  returning id into v_group;
  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values (v_group, 'وسط', 0, true, 1), (v_group, 'كبير', 750, false, 2);

  insert into public.product_option_groups
    (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
  values (v_iced_spanish, 'الحجم', 'single', true, 1, 1, 1)
  returning id into v_group;
  insert into public.product_option_items (group_id, name, price_modifier, is_default, sort_order)
  values (v_group, 'وسط', 0, true, 1), (v_group, 'كبير', 750, false, 2);
end $$;
