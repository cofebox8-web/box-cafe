-- Migration: 202610020022_seed_ev_cafe_menu.sql
-- Description: Seed full professional EV CAFE menu including all 10 categories,
--              60+ items, exact Iraqi Dinar (IQD) pricing, English & Arabic descriptions,
--              and beautiful high-definition beverage and pastry imagery.

do $$
declare
  v_rest_id uuid;
  v_cat_hot_coffee uuid;
  v_cat_hot_drinks uuid;
  v_cat_iced_coffee uuid;
  v_cat_mojito uuid;
  v_cat_iced_tea uuid;
  v_cat_frappe uuid;
  v_cat_matcha uuid;
  v_cat_smoothie uuid;
  v_cat_milkshake uuid;
  v_cat_pastry uuid;

  v_prod_id uuid;
  v_grp_id uuid;
begin
  -- 1. Identify restaurant
  select id into v_rest_id
  from public.restaurants
  where slug = 'box-coffee' or id = '38dcaba7-adfc-441c-bcc1-bbfd4b3f0d12'
  limit 1;

  if v_rest_id is null then
    select id into v_rest_id from public.restaurants limit 1;
  end if;

  if v_rest_id is null then
    raise exception 'No restaurant found to attach menu items.';
  end if;

  -- 2. Insert Categories
  -- (1) القهوة الساخنة
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'القهوة الساخنة', 'Hot Coffee — خيارات الإسبريسو والقهوة الساخنة المحضرة بإتقان', 1, true)
  returning id into v_cat_hot_coffee;

  -- (2) المشروبات الساخنة
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'المشروبات الساخنة', 'Hot Drinks — شاي، كرك، وهوت شوكليت', 2, true)
  returning id into v_cat_hot_drinks;

  -- (3) القهوة الباردة
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'القهوة الباردة', 'Iced Coffee — قهوة مثلجة منعشة بنكهات غنية', 3, true)
  returning id into v_cat_iced_coffee;

  -- (4) موهيتو
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'موهيتو', 'Mojito — انتعاش الصيف بنكهات الفواكه الطبيعية والنعناع', 4, true)
  returning id into v_cat_mojito;

  -- (5) الشاي المثلج
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'الشاي المثلج', 'Iced Tea — شاي بارد منعش بألذ نكهات الفواكه', 5, true)
  returning id into v_cat_iced_tea;

  -- (6) فرابيه
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'فرابيه', 'Frappe — مشروبات مثلجة ومخفوقة بكريمة غنية', 6, true)
  returning id into v_cat_frappe;

  -- (7) ماتشا
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'ماتشا', 'Matcha — ماتشا يابانية أصلية ساخنة ومثلجة', 7, true)
  returning id into v_cat_matcha;

  -- (8) سموذي
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'سموذي', 'Smoothie — فواكه طبيعية مثلجة بقوام كريمي منعش', 8, true)
  returning id into v_cat_smoothie;

  -- (9) ميلك شيك
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'ميلك شيك', 'Milkshake — خلطات الحليب والآيسكريم الفاخرة', 9, true)
  returning id into v_cat_milkshake;

  -- (10) المخبوزات والحلويات
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'المخبوزات والحلويات', 'Pastry & Dessert — كرواسون طازج، كوكيز وتارت فاخر', 10, true)
  returning id into v_cat_pastry;


  -- =========================================================================
  -- 3. Insert Products: Category 1 (القهوة الساخنة - HOT COFFEE)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_coffee, 'اسبريسو', 'Espresso — جرعة إسبريسو مركزة وغنية بالكريما', 2000, 1, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'دبل اسبريسو', 'Double Espresso — جرعة مضاعفة من القهوة المركزة القوية', 2500, 2, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'أمريكانو', 'Americano — إسبريسو نقي ممدد بالماء الساخن', 2000, 3, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كابتشينو', 'Cappuccino — توازن مثالي بين الإسبريسو والحليب المبخر والرغوة المخملية', 2500, 4, 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'فلات وايت', 'Flat White — قوام ناعم مع طبقة ميكروفوم وحليب مخملي', 2500, 5, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كورتادو', 'Cortado — نسبة متساوية بين الإسبريسو المركز والحليب الدافئ', 2500, 6, 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'لاتيه (كلاسيك)', 'Latte (Classic) — إسبريسو كلاسيكي مع حليب مبخر ساخن', 2500, 7, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'سبانش لاتيه', 'Spanish Latte — لاتيه غني بالحليب المكثف المحلى ونكهة القهوة المميزة', 3000, 8, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'موكا', 'Mocha — مزيج متناغم بين الإسبريسو وصلصة الشوكولاتة الفاخرة والحليب', 3500, 9, 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل لاتيه', 'Caramel Latte — لاتيه ناعم متبل بسيروب الكراميل الغني', 3000, 10, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق لاتيه', 'Hazelnut Latte — قهوة لاتيه بنكهة البندق الطبيعية الدافئة', 3000, 11, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق محمص لاتيه', 'Roasted Hazelnut Latte — نكهة البندق المحمص الفاخر مع رغوة الحليب', 3000, 12, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بستاشيو لاتيه', 'Pistachio Latte — لاتيه مخملي بصلصة الفستق الحلبي (بستاشيو)', 3000, 13, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل بسكيت لاتيه', 'Caramel Biscuit Latte — نكهة بسكويت الكراميل المقرمش مع القهوة والحليب', 3000, 14, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'قهوة تركية', 'Turkish Coffee — بن تركي أصيل محضر على الأصول', 1000, 15, 'https://images.unsplash.com/photo-1561047029-3000c68339ca?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 4. Insert Products: Category 2 (المشروبات الساخنة - HOT DRINKS)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_drinks, 'هوت شوكليت', 'Hot Chocolate — شوكولاتة ساخنة كثيفة وغنية مع رغوة الحليب', 2000, 1, 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'جاي كرك', 'Karak Chai — شاي كرك هندي أصيل ومطبوخ بالهيل والحليب', 2000, 2, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي عراقي', 'Iraqi Tea — استكانة شاي عراقي مهيّل وخادر على أصوله', 500, 3, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي بالزعفران', 'Saffron Tea — شاي فاخر بنكهة خيوط الزعفران الأصلي', 2000, 4, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 5. Insert Products: Category 3 (القهوة الباردة - ICED COFFEE)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_coffee, 'آيس أمريكانو', 'Iced Americano — إسبريسو مزدوج مسكوب فوق الثلج والماء البارد', 2000, 1, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس لاتيه', 'Iced Latte — مزيج الحليب البارد ومكعبات الثلج مع الإسبريسو الطازج', 2500, 2, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس سبانش لاتيه', 'Iced Spanish Latte — الحليب المكثف المحلى مع الثلج والإسبريسو المركز', 3000, 3, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس موكا', 'Iced Mocha — قهوة باردة مثلجة بصلصة الشوكولاتة الداكنة والحليب', 3500, 4, 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس كراميل لاتيه', 'Iced Caramel Latte — نكهة الكراميل الغنية مع الحليب المثلج والإسبريسو', 3000, 5, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق لاتيه', 'Iced Hazelnut Latte — قهوة باردة بنكهة البندق المنعشة', 3000, 6, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق محمص', 'Iced Roasted Hazelnut — نكهة البندق المحمص الغنية مع القهوة الباردة والثلج', 3000, 7, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بستاشيو لاتيه', 'Iced Pistachio Latte — قهوة باردة غنية بصلصة الفستق الحلبي المقرمش', 3000, 8, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 6. Insert Products: Category 4 (موهيتو - MOJITO)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_mojito, 'كلاسيك موهيتو', 'Classic Mojito — ليمون طازج، نعناع مفروم، صودا مثلجة وسيروب منعش', 2500, 1, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'فراولة موهيتو', 'Strawberry Mojito — موهيتو مثلج بنكهة الفراولة الطبيعية المنعشة', 2500, 2, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'باشن فروت موهيتو', 'Passion Fruit Mojito — نكهة فاكهة الباشن الاستوائية مع الليمون والنعناع', 2500, 3, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'مانجا موهيتو', 'Mango Mojito — طعم المانجا الاستوائي الغني في موهيتو مثلج', 2500, 4, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'خوخ موهيتو', 'Peach Mojito — عصير ونكهة الخوخ اللذيذ مع فقاعات الصودا والنعناع', 2500, 5, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'بلو موهيتو', 'Blue Mojito — موهيتو أزرق منعش بإطلالة رائعة ونكهة كوراساو اللذيذة', 2500, 6, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'بلو بيري موهيتو', 'Blueberry Mojito — توت أزرق طبيعي مع النعناع والليمون والصودا', 2500, 7, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'روز بيري موهيتو', 'Raspberry Mojito — توت العليق الأحمر بنكهة صيفية منعشة', 2500, 8, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'ليمون نعناع موهيتو', 'Lemon Mint Mojito — تركيبة الليمون الحامض والنعناع الأخضر لانتعاش مضاعف', 2500, 9, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'جوز الهند موهيتو', 'Coconut Mojito — لمسة كوكوت ناعمة ومنعشة مع نكهة الموهيتو الكلاسيكية', 2500, 10, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 7. Insert Products: Category 5 (الشاي المثلج - ICED TEA)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_tea, 'آيس تي خوخ', 'Peach Iced Tea — شاي بارد ومثلج بنكهة الخوخ العطرة', 2500, 1, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي باشن فروت', 'Passion Fruit Iced Tea — شاي مثلج بنكهة فاكهة الباشن المنعشة', 2500, 2, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي مانجا', 'Mango Iced Tea — شاي بارد بطعم المانجا الاستوائية اللذيذة', 2500, 3, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي بلو بيري', 'Blueberry Iced Tea — شاي مثلج بنكهة التوت الأزرق المنعش', 2500, 4, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي روز بيري', 'Raspberry Iced Tea — شاي مثلج بنكهة توت العليق الأحمر', 2500, 5, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي ليمون نعناع', 'Lemon Mint Iced Tea — شاي بارد مفعم بحموضة الليمون وانتعاش النعناع', 2500, 6, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 8. Insert Products: Category 6 (فرابيه - FRAPPE)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_frappe, 'فرابيه شوكولاتة', 'Chocolate Frappe — مزيج مثلج ومخفوق بصلصة الشوكولاتة الفاخرة والكريمة', 3000, 1, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل', 'Caramel Frappe — قهوة وحليب مثلجان مخفوقان مع الكراميل الذهبي', 3000, 2, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه بستاشيو', 'Pistachio Frappe — مخفوق مثلج غني بكريمة الفستق الحلبي الفاخرة', 3000, 3, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل بسكت', 'Caramel Biscuit Frappe — طعم بسكويت الكراميل المقرمش في مخفوق بارد كريمي', 3000, 4, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه جوز الهند', 'Coconut Frappe — مخفوق بارد وغني بنكهة جوز الهند الاستوائية', 3000, 5, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 9. Insert Products: Category 7 (ماتشا - MATCHA)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_matcha, 'ماتشا لاتيه', 'Matcha Latte — شاي ماتشا ياباني احتفالي ساخن مع الحليب المبخر المخملي', 2000, 1, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'آيس ماتشا', 'Iced Matcha — ماتشا يابانية مثلجة مسكوبة فوق الحليب البارد والثلج', 3000, 2, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'ستروبيري ماتشا', 'Strawberry Matcha — طبقات مميزة من بيوريه الفراولة الطازجة والحليب والماتشا الخضراء', 3000, 3, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'جوز الهند ماتشا', 'Coconut Matcha — مزيج استوائي فريد بين حليب جوز الهند ونكهة الماتشا النقية', 3000, 4, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 10. Insert Products: Category 8 (سموذي - SMOOTHIE)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_smoothie, 'سموذي فراولة', 'Strawberry Smoothie — فراولة طبيعية مخفوقة مع الثلج بقوام سميك وفاكهي', 2500, 1, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي مانجا', 'Mango Smoothie — مانجا استوائية طبيعية طازجة ومثلجة بقوام غني', 2500, 2, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي باشن فروت', 'Passion Fruit Smoothie — انتعاش فاكهة الباشن في سموذي حامض وحلو متوازن', 2500, 3, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي جوز الهند', 'Coconut Smoothie — سموذي كريمي بنكهة جوز الهند الاستوائية المنعشة', 2500, 4, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 11. Insert Products: Category 9 (ميلك شيك - MILKSHAKE)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_milkshake, 'ميلك شيك فراولة', 'Strawberry Milkshake — ميلك شيك الآيسكريم الغني بقطع ونكهة الفراولة', 4000, 1, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك شوكولاتة', 'Chocolate Milkshake — مزيج الشوكولاتة الكثيفة والآيس كريم مع الكريمة', 4000, 2, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك نوتيلا', 'Nutella Milkshake — طعم شوكولاتة نوتيلا الأصلية المخفوقة مع الحليب والآيسكريم', 4000, 3, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك بستاشيو', 'Pistachio Milkshake — ميلك شيك فاخر بصلصة الفستق الحلبي الغنية', 4000, 4, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك كراميل بسكت', 'Caramel Biscuit Milkshake — بسكويت الكراميل المحمص مع الآيسكريم المخفوق', 4000, 5, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 12. Insert Products: Category 10 (المخبوزات والحلويات - PASTRY & DESSERT)
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_pastry, 'كرواسون سادة', 'Croissant (Plain) — كرواسون فرنسي كلاسيكي هش ومخبوز بالزبدة الطبيعية', 2500, 1, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كرواسون جبن', 'Croissant (Cheese) — كرواسون ذهبي محشو بجبنة غنية ودافئة', 3000, 2, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كرواسون شوكولاتة', 'Croissant (Chocolate) — كرواسون فرنسي محشو بشوكولاتة داكنة ذائبة', 3000, 3, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كوكيز شوكولاتة', 'Chocolate Cookie — كوكيز طري ودافي مع قطع شوكولاتة بلجيكية غنية', 2500, 4, 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'براوني', 'Brownie — كعكة براوني شوكولاتة فدج غنية وطرية', 3000, 5, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'إكلير (بستاشيو / لوتس)', 'Éclair (Pistachio / Biscoff) — إكلير فرنسي محشو بكريمة فاخرة مغطى بالفستق أو اللوتس', 3000, 6, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'تارت شوكولاتة', 'Chocolate Tart — قاعدة بسكويت مقرمشة مع غاناش الشوكولاتة الفاخرة', 3000, 7, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'تارت كراميل بيكان', 'Caramel Pecan Tart — تارت كراميل ناعم مع مكسرات البيكان المحمصة', 3000, 8, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'بودينغ موز', 'Banana Pudding — طبقات بودينغ الفانيلا الكريمية وقطع الموز والبسكويت المقرمش', 3000, 9, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 13. Add Extras (إضافات) Option Groups to coffee and drink products
  -- =========================================================================
  -- نضيف مجموعة الإضافات للمشروبات:
  for v_prod_id in
    select id from public.menu_products
    where restaurant_id = v_rest_id and category_id in (v_cat_hot_coffee, v_cat_iced_coffee, v_cat_frappe, v_cat_matcha)
  loop
    insert into public.product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
    values (v_prod_id, 'إضافات وتعديلات', 'multiple', false, 0, 4, 1)
    returning id into v_grp_id;

    insert into public.product_option_items (group_id, name, price_modifier, is_available, is_default, sort_order) values
    (v_grp_id, 'شوت اسبريسو إضافي', 1000, true, false, 1),
    (v_grp_id, 'كريمة مخفوقة', 500, true, false, 2),
    (v_grp_id, 'نكهة إضافية', 500, true, false, 3),
    (v_grp_id, 'حليب خالي من اللاكتوز', 1000, true, false, 4);
  end loop;

end $$;
