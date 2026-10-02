-- Migration: 202610020022_seed_ev_cafe_menu.sql
-- Description: Professional EV CAFE Menu Seed
--              - 10 structured categories
--              - 70 unique products with accurate IQD pricing & bilingual descriptions
--              - 70 completely UNIQUE, NON-DUPLICATE, studio-grade beverage & dessert photos
--              - Extras & custom options attached
--              - All records inserted into public schema tables so they appear in Admin UI for full management

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
  -- 1. Identify Restaurant
  select id into v_rest_id
  from public.restaurants
  where slug = 'box-coffee' or id = '38dcaba7-adfc-441c-bcc1-bbfd4b3f0d12'
  limit 1;

  if v_rest_id is null then
    select id into v_rest_id from public.restaurants limit 1;
  end if;

  if v_rest_id is null then
    raise exception 'لم يتم العثور على سجل المطعم في قاعدة البيانات.';
  end if;

  -- 2. Clear previous menu rows if any exist for this restaurant to ensure a clean slate
  delete from public.product_option_items where group_id in (
    select g.id from public.product_option_groups g
    join public.menu_products p on p.id = g.product_id
    where p.restaurant_id = v_rest_id
  );
  delete from public.product_option_groups where product_id in (
    select id from public.menu_products where restaurant_id = v_rest_id
  );
  delete from public.menu_products where restaurant_id = v_rest_id;
  delete from public.menu_categories where restaurant_id = v_rest_id;

  -- 3. Insert 10 Categories
  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'القهوة الساخنة', 'Hot Coffee — خيارات الإسبريسو والقهوة الساخنة المحضرة بإتقان', 1, true)
  returning id into v_cat_hot_coffee;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'المشروبات الساخنة', 'Hot Drinks — شاي، كرك، وهوت شوكليت', 2, true)
  returning id into v_cat_hot_drinks;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'القهوة الباردة', 'Iced Coffee — قهوة مثلجة منعشة بنكهات غنية', 3, true)
  returning id into v_cat_iced_coffee;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'موهيتو', 'Mojito — انتعاش الصيف بنكهات الفواكه الطبيعية والنعناع', 4, true)
  returning id into v_cat_mojito;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'الشاي المثلج', 'Iced Tea — شاي بارد منعش بألذ نكهات الفواكه', 5, true)
  returning id into v_cat_iced_tea;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'فرابيه', 'Frappe — مشروبات مثلجة ومخفوقة بكريمة غنية', 6, true)
  returning id into v_cat_frappe;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'ماتشا', 'Matcha — ماتشا يابانية أصلية ساخنة ومثلجة', 7, true)
  returning id into v_cat_matcha;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'سموذي', 'Smoothie — فواكه طبيعية مثلجة بقوام كريمي منعش', 8, true)
  returning id into v_cat_smoothie;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'ميلك شيك', 'Milkshake — خلطات الحليب والآيسكريم الفاخرة', 9, true)
  returning id into v_cat_milkshake;

  insert into public.menu_categories (restaurant_id, name, description, sort_order, is_active)
  values (v_rest_id, 'المخبوزات والحلويات', 'Pastry & Dessert — كرواسون طازج، كوكيز وتارت فاخر', 10, true)
  returning id into v_cat_pastry;


  -- =========================================================================
  -- 4. Category 1: القهوة الساخنة (HOT COFFEE) - 15 صنف فريد بصور فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_coffee, 'اسبريسو', 'Espresso — شوت إسبريسو مركز غني برغوة الكريما الذهبية', 2000, 1, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'دبل اسبريسو', 'Double Espresso — جرعة مضاعفة من القهوة المركزة القوية', 2500, 2, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'أمريكانو', 'Americano — إسبريسو نقي ممدد بالماء الساخن بنكهة واضحة', 2000, 3, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كابتشينو', 'Cappuccino — توازن مثالي بين الإسبريسو والحليب المبخر والرغوة المخملية', 2500, 4, 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'فلات وايت', 'Flat White — قوام ناعم مع طبقة ميكروفوم وحليب مخملي', 2500, 5, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كورتادو', 'Cortado — نسبة متساوية بين الإسبريسو المركز والحليب الدافئ', 2500, 6, 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'لاتيه (كلاسيك)', 'Latte (Classic) — إسبريسو كلاسيكي مع حليب مبخر ساخن ورسمة فنية', 2500, 7, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'سبانش لاتيه', 'Spanish Latte — لاتيه غني بالحليب المكثف المحلى ونكهة القهوة المميزة', 3000, 8, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'موكا', 'Mocha — مزيج متناغم بين الإسبريسو وصلصة الشوكولاتة الفاخرة والحليب', 3500, 9, 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل لاتيه', 'Caramel Latte — لاتيه ناعم متبل بسيروب الكراميل الغني', 3000, 10, 'https://images.unsplash.com/photo-1599398054066-846f28917f38?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق لاتيه', 'Hazelnut Latte — قهوة لاتيه بنكهة البندق الطبيعية الدافئة', 3000, 11, 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق محمص لاتيه', 'Roasted Hazelnut Latte — نكهة البندق المحمص الفاخر مع رغوة الحليب', 3000, 12, 'https://images.unsplash.com/photo-1521302080334-4bebac2763a6?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بستاشيو لاتيه', 'Pistachio Latte — لاتيه مخملي بصلصة الفستق الحلبي الطبيعي', 3000, 13, 'https://images.unsplash.com/photo-1529892485617-25f63cd7b1e9?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل بسكيت لاتيه', 'Caramel Biscuit Latte — نكهة بسكويت الكراميل المقرمش مع القهوة والحليب', 3000, 14, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'قهوة تركية', 'Turkish Coffee — بن تركي أصيل محضر برغوة غنية على الأصول', 1000, 15, 'https://images.unsplash.com/photo-1561047029-3000c68339ca?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 5. Category 2: المشروبات الساخنة (HOT DRINKS) - 4 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_drinks, 'هوت شوكليت', 'Hot Chocolate — شوكولاتة ساخنة كثيفة وغنية مع رغوة الحليب', 2000, 1, 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'جاي كرك', 'Karak Chai — شاي كرك هندي أصيل ومطبوخ بالهيل والبهارات والحليب', 2000, 2, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي عراقي', 'Iraqi Tea — استكانة شاي عراقي مهيّل وخادر على أصوله', 500, 3, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي بالزعفران', 'Saffron Tea — شاي أحمر فاخر منقوع بخيوط الزعفران الأصلي', 2000, 4, 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 6. Category 3: القهوة الباردة (ICED COFFEE) - 8 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_coffee, 'آيس أمريكانو', 'Iced Americano — إسبريسو مزدوج مسكوب فوق قطع الثلج والماء البارد', 2000, 1, 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس لاتيه', 'Iced Latte — مزيج الحليب البارد ومكعبات الثلج مع الإسبريسو الطازج', 2500, 2, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس سبانش لاتيه', 'Iced Spanish Latte — الحليب المكثف المحلى مع الثلج والإسبريسو المركز', 3000, 3, 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس موكا', 'Iced Mocha — قهوة باردة مثلجة بصلصة الشوكولاتة الداكنة والحليب', 3500, 4, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس كراميل لاتيه', 'Iced Caramel Latte — نكهة الكراميل الغنية مع الحليب المثلج والإسبريسو', 3000, 5, 'https://images.unsplash.com/photo-1579888944880-d98341245702?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق لاتيه', 'Iced Hazelnut Latte — قهوة باردة بنكهة البندق الطبيعية المنعشة', 3000, 6, 'https://images.unsplash.com/photo-1530373239216-42518e6b4063?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق محمص', 'Iced Roasted Hazelnut — نكهة البندق المحمص الغنية مع القهوة الباردة والثلج', 3000, 7, 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بستاشيو لاتيه', 'Iced Pistachio Latte — قهوة باردة غنية بصلصة الفستق الحلبي المميزة', 3000, 8, 'https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 7. Category 4: موهيتو (MOJITO) - 10 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_mojito, 'كلاسيك موهيتو', 'Classic Mojito — ليمون طازج، نعناع مفروم، صودا مثلجة وسيروب منعش', 2500, 1, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'فراولة موهيتو', 'Strawberry Mojito — موهيتو مثلج بنكهة الفراولة الطبيعية المنعشة', 2500, 2, 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'باشن فروت موهيتو', 'Passion Fruit Mojito — نكهة فاكهة الباشن الاستوائية مع الليمون والنعناع', 2500, 3, 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'مانجا موهيتو', 'Mango Mojito — طعم المانجا الاستوائي الغني في موهيتو مثلج', 2500, 4, 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'خوخ موهيتو', 'Peach Mojito — عصير ونكهة الخوخ اللذيذ مع فقاعات الصودا والنعناع', 2500, 5, 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'بلو موهيتو', 'Blue Mojito — موهيتو أزرق منعش بإطلالة رائعة ونكهة كوراساو اللذيذة', 2500, 6, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'بلو بيري موهيتو', 'Blueberry Mojito — توت أزرق طبيعي مع النعناع والليمون والصودا', 2500, 7, 'https://images.unsplash.com/photo-1506802913710-40e2e66339c9?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'روز بيري موهيتو', 'Raspberry Mojito — توت العليق الأحمر بنكهة صيفية منعشة', 2500, 8, 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'ليمون نعناع موهيتو', 'Lemon Mint Mojito — تركيبة الليمون الحامض والنعناع الأخضر لانتعاش مضاعف', 2500, 9, 'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'جوز الهند موهيتو', 'Coconut Mojito — لمسة كوكوت ناعمة ومنعشة مع نكهة الموهيتو الكلاسيكية', 2500, 10, 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 8. Category 5: الشاي المثلج (ICED TEA) - 6 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_tea, 'آيس تي خوخ', 'Peach Iced Tea — شاي بارد ومثلج بنكهة الخوخ العطرة اللذيذة', 2500, 1, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي باشن فروت', 'Passion Fruit Iced Tea — شاي مثلج بنكهة فاكهة الباشن المنعشة', 2500, 2, 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي مانجا', 'Mango Iced Tea — شاي بارد بطعم المانجا الاستوائية الغنية', 2500, 3, 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي بلو بيري', 'Blueberry Iced Tea — شاي مثلج بنكهة التوت الأزرق المنعش', 2500, 4, 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي روز بيري', 'Raspberry Iced Tea — شاي مثلج بنكهة توت العليق الأحمر الفاخر', 2500, 5, 'https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي ليمون نعناع', 'Lemon Mint Iced Tea — شاي بارد مفعم بحموضة الليمون وانتعاش النعناع', 2500, 6, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 9. Category 6: فرابيه (FRAPPE) - 5 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_frappe, 'فرابيه شوكولاتة', 'Chocolate Frappe — مزيج مثلج ومخفوق بصلصة الشوكولاتة الفاخرة والكريمة', 3000, 1, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل', 'Caramel Frappe — قهوة وحليب مثلجان مخفوقان مع الكراميل الذهبي', 3000, 2, 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه بستاشيو', 'Pistachio Frappe — مخفوق مثلج غني بكريمة الفستق الحلبي الفاخرة', 3000, 3, 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل بسكت', 'Caramel Biscuit Frappe — طعم بسكويت الكراميل المقرمش في مخفوق بارد كريمي', 3000, 4, 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_frappe, 'فرابيه جوز الهند', 'Coconut Frappe — مخفوق بارد وغني بنكهة جوز الهند الاستوائية', 3000, 5, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 10. Category 7: ماتشا (MATCHA) - 4 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_matcha, 'ماتشا لاتيه', 'Matcha Latte — شاي ماتشا ياباني احتفالي ساخن مع الحليب المبخر المخملي', 2000, 1, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'آيس ماتشا', 'Iced Matcha — ماتشا يابانية مثلجة مسكوبة فوق الحليب البارد والثلج', 3000, 2, 'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'ستروبيري ماتشا', 'Strawberry Matcha — طبقات مميزة من بيوريه الفراولة الطازجة والحليب والماتشا الخضراء', 3000, 3, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_matcha, 'جوز الهند ماتشا', 'Coconut Matcha — مزيج استوائي فريد بين حليب جوز الهند ونكهة الماتشا النقية', 3000, 4, 'https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 11. Category 8: سموذي (SMOOTHIE) - 4 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_smoothie, 'سموذي فراولة', 'Strawberry Smoothie — فراولة طبيعية مخفوقة مع الثلج بقوام سميك وفاكهي', 2500, 1, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي مانجا', 'Mango Smoothie — مانجا استوائية طبيعية طازجة ومثلجة بقوام غني', 2500, 2, 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي باشن فروت', 'Passion Fruit Smoothie — انتعاش فاكهة الباشن في سموذي حامض وحلو متوازن', 2500, 3, 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي جوز الهند', 'Coconut Smoothie — سموذي كريمي بنكهة جوز الهند الاستوائية المنعشة', 2500, 4, 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 12. Category 9: ميلك شيك (MILKSHAKE) - 5 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_milkshake, 'ميلك شيك فراولة', 'Strawberry Milkshake — ميلك شيك الآيسكريم الغني بقطع ونكهة الفراولة', 4000, 1, 'https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك شوكولاتة', 'Chocolate Milkshake — مزيج الشوكولاتة الكثيفة والآيس كريم مع الكريمة', 4000, 2, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك نوتيلا', 'Nutella Milkshake — طعم شوكولاتة نوتيلا الأصلية المخفوقة مع الحليب والآيسكريم', 4000, 3, 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك بستاشيو', 'Pistachio Milkshake — ميلك شيك فاخر بصلصة الفستق الحلبي الغنية', 4000, 4, 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك كراميل بسكت', 'Caramel Biscuit Milkshake — بسكويت الكراميل المحمص مع الآيسكريم المخفوق', 4000, 5, 'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 13. Category 10: المخبوزات والحلويات (PASTRY & DESSERT) - 9 أصناف فريدة
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_pastry, 'كرواسون سادة', 'Croissant (Plain) — كرواسون فرنسي كلاسيكي هش ومخبوز بالزبدة الطبيعية', 2500, 1, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كرواسون جبن', 'Croissant (Cheese) — كرواسون ذهبي محشو بجبنة غنية ودافئة', 3000, 2, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كرواسون شوكولاتة', 'Croissant (Chocolate) — كرواسون فرنسي محشو بشوكولاتة داكنة ذائبة', 3000, 3, 'https://images.unsplash.com/photo-1549903072-7e6e0bedb7fb?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كوكيز شوكولاتة', 'Chocolate Cookie — كوكيز طري ودافي مع قطع شوكولاتة بلجيكية غنية', 2500, 4, 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'براوني', 'Brownie — كعكة براوني شوكولاتة فدج غنية وطرية', 3000, 5, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'إكلير (بستاشيو / لوتس)', 'Éclair (Pistachio / Biscoff) — إكلير فرنسي محشو بكريمة فاخرة مغطى بالفستق أو اللوتس', 3000, 6, 'https://images.unsplash.com/photo-1623334044303-241021148842?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'تارت شوكولاتة', 'Chocolate Tart — قاعدة بسكويت مقرمشة مع غاناش الشوكولاتة الفاخرة', 3000, 7, 'https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'تارت كراميل بيكان', 'Caramel Pecan Tart — تارت كراميل ناعم مع مكسرات البيكان المحمصة', 3000, 8, 'https://images.unsplash.com/photo-1535920527002-b35e96722eb9?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'بودينغ موز', 'Banana Pudding — طبقات بودينغ الفانيلا الكريمية وقطع الموز والبسكويت المقرمش', 3000, 9, 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?auto=format&fit=crop&w=900&q=85', true);


  -- =========================================================================
  -- 14. Add Extras (إضافات) Option Groups to coffee and drink products
  -- =========================================================================
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
