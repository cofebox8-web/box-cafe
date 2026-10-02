-- Migration: 202610020022_seed_ev_cafe_menu.sql
-- Description: Professional EV CAFE Menu Seed
--              - 10 structured categories
--              - 70 unique products with accurate IQD pricing & bilingual descriptions
--              - 70 completely UNIQUE, NON-DUPLICATE, studio-grade beverage & dessert photos
--              - Extras & custom options attached
--              - All records inserted into public schema tables for full Admin UI management

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
  -- 4. Category 1: القهوة الساخنة (HOT COFFEE) - 15 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_coffee, 'اسبريسو', 'Espresso — شوت إسبريسو مركز غني برغوة الكريما الذهبية', 2000, 1, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'دبل اسبريسو', 'Double Espresso — جرعة مضاعفة من القهوة المركزة القوية', 2500, 2, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'أمريكانو', 'Americano — إسبريسو نقي ممدد بالماء الساخن بنكهة واضحة', 2000, 3, 'https://images.pexels.com/photos/30925512/pexels-photo-30925512.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'كابتشينو', 'Cappuccino — توازن مثالي بين الإسبريسو والحليب المبخر والرغوة المخملية', 2500, 4, 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'فلات وايت', 'Flat White — قوام ناعم مع طبقة ميكروفوم وحليب مخملي', 2500, 5, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'كورتادو', 'Cortado — نسبة متساوية بين الإسبريسو المركز والحليب الدافئ', 2500, 6, 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'لاتيه (كلاسيك)', 'Latte (Classic) — إسبريسو كلاسيكي مع حليب مبخر ساخن ورسمة فنية', 2500, 7, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'سبانش لاتيه', 'Spanish Latte — لاتيه غني بالحليب المكثف المحلى ونكهة القهوة المميزة', 3000, 8, 'https://images.pexels.com/photos/3475680/pexels-photo-3475680.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'موكا', 'Mocha — مزيج متناغم بين الإسبريسو وصلصة الشوكولاتة الفاخرة والحليب', 3500, 9, 'https://images.pexels.com/photos/1727123/pexels-photo-1727123.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل لاتيه', 'Caramel Latte — لاتيه ناعم متبل بسيروب الكراميل الغني', 3000, 10, 'https://images.unsplash.com/photo-1599398054066-846f28917f38?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق لاتيه', 'Hazelnut Latte — قهوة لاتيه بنكهة البندق الطبيعية الدافئة', 3000, 11, 'https://images.pexels.com/photos/38576602/pexels-photo-38576602.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'بندق محمص لاتيه', 'Roasted Hazelnut Latte — نكهة البندق المحمص الفاخر مع رغوة الحليب', 3000, 12, 'https://images.pexels.com/photos/2260655/pexels-photo-2260655.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'بستاشيو لاتيه', 'Pistachio Latte — لاتيه مخملي بصلصة الفستق الحلبي الطبيعي', 3000, 13, 'https://images.pexels.com/photos/17366784/pexels-photo-17366784.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_coffee, 'كراميل بسكيت لاتيه', 'Caramel Biscuit Latte — نكهة بسكويت الكراميل المقرمش مع القهوة والحليب', 3000, 14, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_coffee, 'قهوة تركية', 'Turkish Coffee — بن تركي أصيل محضر برغوة غنية على الأصول', 1000, 15, 'https://images.pexels.com/photos/29398762/pexels-photo-29398762.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 5. Category 2: المشروبات الساخنة (HOT DRINKS) - 4 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_hot_drinks, 'هوت شوكليت', 'Hot Chocolate — شوكولاتة ساخنة كثيفة وغنية مع رغوة الحليب', 2000, 1, 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_hot_drinks, 'جاي كرك', 'Karak Chai — شاي كرك هندي أصيل ومطبوخ بالهيل والبهارات والحليب', 2000, 2, 'https://images.pexels.com/photos/35024895/pexels-photo-35024895.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي عراقي', 'Iraqi Tea — استكانة شاي عراقي مهيّل وخادر على أصوله', 500, 3, 'https://images.pexels.com/photos/33815730/pexels-photo-33815730.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_hot_drinks, 'شاي بالزعفران', 'Saffron Tea — شاي أحمر فاخر منقوع بخيوط الزعفران الأصلي', 2000, 4, 'https://images.pexels.com/photos/34344554/pexels-photo-34344554.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 6. Category 3: القهوة الباردة (ICED COFFEE) - 8 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_coffee, 'آيس أمريكانو', 'Iced Americano — إسبريسو مزدوج مسكوب فوق قطع الثلج والماء البارد', 2000, 1, 'https://images.pexels.com/photos/32972536/pexels-photo-32972536.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس لاتيه', 'Iced Latte — مزيج الحليب البارد ومكعبات الثلج مع الإسبريسو الطازج', 2500, 2, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس سبانش لاتيه', 'Iced Spanish Latte — الحليب المكثف المحلى مع الثلج والإسبريسو المركز', 3000, 3, 'https://images.pexels.com/photos/4869290/pexels-photo-4869290.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس موكا', 'Iced Mocha — قهوة باردة مثلجة بصلصة الشوكولاتة الداكنة والحليب', 3500, 4, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس كراميل لاتيه', 'Iced Caramel Latte — نكهة الكراميل الغنية مع الحليب المثلج والإسبريسو', 3000, 5, 'https://images.pexels.com/photos/34046778/pexels-photo-34046778.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق لاتيه', 'Iced Hazelnut Latte — قهوة باردة بنكهة البندق الطبيعية المنعشة', 3000, 6, 'https://images.pexels.com/photos/37603081/pexels-photo-37603081.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بندق محمص', 'Iced Roasted Hazelnut — نكهة البندق المحمص الغنية مع القهوة الباردة والثلج', 3000, 7, 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_coffee, 'آيس بستاشيو لاتيه', 'Iced Pistachio Latte — قهوة باردة غنية بصلصة الفستق الحلبي المميزة', 3000, 8, 'https://images.pexels.com/photos/4475024/pexels-photo-4475024.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 7. Category 4: موهيتو (MOJITO) - 10 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_mojito, 'كلاسيك موهيتو', 'Classic Mojito — ليمون طازج، نعناع مفروم، صودا مثلجة وسيروب منعش', 2500, 1, 'https://images.pexels.com/photos/37662775/pexels-photo-37662775.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'فراولة موهيتو', 'Strawberry Mojito — موهيتو مثلج بنكهة الفراولة الطبيعية المنعشة', 2500, 2, 'https://images.pexels.com/photos/36580447/pexels-photo-36580447.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'باشن فروت موهيتو', 'Passion Fruit Mojito — نكهة فاكهة الباشن الاستوائية مع الليمون والنعناع', 2500, 3, 'https://images.pexels.com/photos/33129959/pexels-photo-33129959.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'مانجا موهيتو', 'Mango Mojito — طعم المانجا الاستوائي الغني في موهيتو مثلج', 2500, 4, 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_mojito, 'خوخ موهيتو', 'Peach Mojito — عصير ونكهة الخوخ اللذيذ مع فقاعات الصودا والنعناع', 2500, 5, 'https://images.pexels.com/photos/616833/pexels-photo-616833.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'بلو موهيتو', 'Blue Mojito — موهيتو أزرق منعش بإطلالة رائعة ونكهة كوراساو اللذيذة', 2500, 6, 'https://images.pexels.com/photos/25686145/pexels-photo-25686145.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'بلو بيري موهيتو', 'Blueberry Mojito — توت أزرق طبيعي مع النعناع والليمون والصودا', 2500, 7, 'https://images.pexels.com/photos/28525184/pexels-photo-28525184.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'روز بيري موهيتو', 'Raspberry Mojito — توت العليق الأحمر بنكهة صيفية منعشة', 2500, 8, 'https://images.pexels.com/photos/616838/pexels-photo-616838.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'ليمون نعناع موهيتو', 'Lemon Mint Mojito — تركيبة الليمون الحامض والنعناع الأخضر لانتعاش مضاعف', 2500, 9, 'https://images.pexels.com/photos/7259044/pexels-photo-7259044.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_mojito, 'جوز الهند موهيتو', 'Coconut Mojito — لمسة كوكوت ناعمة ومنعشة مع نكهة الموهيتو الكلاسيكية', 2500, 10, 'https://images.pexels.com/photos/27367754/pexels-photo-27367754.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 8. Category 5: الشاي المثلج (ICED TEA) - 6 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_iced_tea, 'آيس تي خوخ', 'Peach Iced Tea — شاي بارد ومثلج بنكهة الخوخ العطرة اللذيذة', 2500, 1, 'https://images.pexels.com/photos/33573178/pexels-photo-33573178.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي باشن فروت', 'Passion Fruit Iced Tea — شاي مثلج بنكهة فاكهة الباشن المنعشة', 2500, 2, 'https://images.pexels.com/photos/2795027/pexels-photo-2795027.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي مانجا', 'Mango Iced Tea — شاي بارد بطعم المانجا الاستوائية الغنية', 2500, 3, 'https://images.pexels.com/photos/33044332/pexels-photo-33044332.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي بلو بيري', 'Blueberry Iced Tea — شاي مثلج بنكهة التوت الأزرق المنعش', 2500, 4, 'https://images.pexels.com/photos/28525183/pexels-photo-28525183.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي روز بيري', 'Raspberry Iced Tea — شاي مثلج بنكهة توت العليق الأحمر الفاخر', 2500, 5, 'https://images.pexels.com/photos/5946627/pexels-photo-5946627.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_iced_tea, 'آيس تي ليمون نعناع', 'Lemon Mint Iced Tea — شاي بارد مفعم بحموضة الليمون وانتعاش النعناع', 2500, 6, 'https://images.pexels.com/photos/17582266/pexels-photo-17582266.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 9. Category 6: فرابيه (FRAPPE) - 5 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_frappe, 'فرابيه شوكولاتة', 'Chocolate Frappe — مزيج مثلج ومخفوق بصلصة الشوكولاتة الفاخرة والكريمة', 3000, 1, 'https://images.pexels.com/photos/28010210/pexels-photo-28010210.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل', 'Caramel Frappe — قهوة وحليب مثلجان مخفوقان مع الكراميل الذهبي', 3000, 2, 'https://images.pexels.com/photos/2615323/pexels-photo-2615323.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_frappe, 'فرابيه بستاشيو', 'Pistachio Frappe — مخفوق مثلج غني بكريمة الفستق الحلبي الفاخرة', 3000, 3, 'https://images.pexels.com/photos/33984384/pexels-photo-33984384.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_frappe, 'فرابيه كراميل بسكت', 'Caramel Biscuit Frappe — طعم بسكويت الكراميل المقرمش في مخفوق بارد كريمي', 3000, 4, 'https://images.pexels.com/photos/14705139/pexels-photo-14705139.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_frappe, 'فرابيه جوز الهند', 'Coconut Frappe — مخفوق بارد وغني بنكهة جوز الهند الاستوائية', 3000, 5, 'https://images.pexels.com/photos/14705141/pexels-photo-14705141.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 10. Category 7: ماتشا (MATCHA) - 4 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_matcha, 'ماتشا لاتيه', 'Matcha Latte — شاي ماتشا ياباني احتفالي ساخن مع الحليب المبخر المخملي', 2000, 1, 'https://images.pexels.com/photos/38737533/pexels-photo-38737533.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_matcha, 'آيس ماتشا', 'Iced Matcha — ماتشا يابانية مثلجة مسكوبة فوق الحليب البارد والثلج', 3000, 2, 'https://images.pexels.com/photos/31599066/pexels-photo-31599066.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_matcha, 'ستروبيري ماتشا', 'Strawberry Matcha — طبقات مميزة من بيوريه الفراولة الطازجة والحليب والماتشا الخضراء', 3000, 3, 'https://images.pexels.com/photos/32722057/pexels-photo-32722057.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_matcha, 'جوز الهند ماتشا', 'Coconut Matcha — مزيج استوائي فريد بين حليب جوز الهند ونكهة الماتشا النقية', 3000, 4, 'https://images.pexels.com/photos/1193335/pexels-photo-1193335.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 11. Category 8: سموذي (SMOOTHIE) - 4 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_smoothie, 'سموذي فراولة', 'Strawberry Smoothie — فراولة طبيعية مخفوقة مع الثلج بقوام سميك وفاكهي', 2500, 1, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي مانجا', 'Mango Smoothie — مانجا استوائية طبيعية طازجة ومثلجة بقوام غني', 2500, 2, 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_smoothie, 'سموذي باشن فروت', 'Passion Fruit Smoothie — انتعاش فاكهة الباشن في سموذي حامض وحلو متوازن', 2500, 3, 'https://images.pexels.com/photos/1484678/pexels-photo-1484678.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_smoothie, 'سموذي جوز الهند', 'Coconut Smoothie — سموذي كريمي بنكهة جوز الهند الاستوائية المنعشة', 2500, 4, 'https://images.pexels.com/photos/208537/pexels-photo-208537.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 12. Category 9: ميلك شيك (MILKSHAKE) - 5 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_milkshake, 'ميلك شيك فراولة', 'Strawberry Milkshake — ميلك شيك الآيسكريم الغني بقطع ونكهة الفراولة', 4000, 1, 'https://images.pexels.com/photos/28117065/pexels-photo-28117065.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك شوكولاتة', 'Chocolate Milkshake — مزيج الشوكولاتة الكثيفة والآيس كريم مع الكريمة', 4000, 2, 'https://images.pexels.com/photos/39536487/pexels-photo-39536487.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك نوتيلا', 'Nutella Milkshake — طعم شوكولاتة نوتيلا الأصلية المخفوقة مع الحليب والآيسكريم', 4000, 3, 'https://images.pexels.com/photos/39948188/pexels-photo-39948188.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك بستاشيو', 'Pistachio Milkshake — ميلك شيك فاخر بصلصة الفستق الحلبي الغنية', 4000, 4, 'https://images.pexels.com/photos/12419198/pexels-photo-12419198.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_milkshake, 'ميلك شيك كراميل بسكت', 'Caramel Biscuit Milkshake — بسكويت الكراميل المحمص مع الآيسكريم المخفوق', 4000, 5, 'https://images.pexels.com/photos/14705140/pexels-photo-14705140.jpeg?auto=compress&cs=tinysrgb&w=900', true);

  -- =========================================================================
  -- 13. Category 10: المخبوزات والحلويات (PASTRY & DESSERT) - 9 أصناف فريدة بصور حصرية
  -- =========================================================================
  insert into public.menu_products (restaurant_id, category_id, name, description, price, sort_order, image_url, is_available) values
  (v_rest_id, v_cat_pastry, 'كرواسون سادة', 'Croissant (Plain) — كرواسون فرنسي كلاسيكي هش ومخبوز بالزبدة الطبيعية', 2500, 1, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'كرواسون جبن', 'Croissant (Cheese) — كرواسون ذهبي محشو بجبنة غنية ودافئة', 3000, 2, 'https://images.pexels.com/photos/30853716/pexels-photo-30853716.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_pastry, 'كرواسون شوكولاتة', 'Croissant (Chocolate) — كرواسون فرنسي محشو بشوكولاتة داكنة ذائبة', 3000, 3, 'https://images.pexels.com/photos/35095957/pexels-photo-35095957.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_pastry, 'كوكيز شوكولاتة', 'Chocolate Cookie — كوكيز طري ودافي مع قطع شوكولاتة بلجيكية غنية', 2500, 4, 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'براوني', 'Brownie — كعكة براوني شوكولاتة فدج غنية وطرية', 3000, 5, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85', true),
  (v_rest_id, v_cat_pastry, 'إكلير (بستاشيو / لوتس)', 'Éclair (Pistachio / Biscoff) — إكلير فرنسي محشو بكريمة فاخرة مغطى بالفستق أو اللوتس', 3000, 6, 'https://images.pexels.com/photos/33100287/pexels-photo-33100287.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_pastry, 'تارت شوكولاتة', 'Chocolate Tart — قاعدة بسكويت مقرمشة مع غاناش الشوكولاتة الفاخرة', 3000, 7, 'https://images.pexels.com/photos/3026804/pexels-photo-3026804.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_pastry, 'تارت كراميل بيكان', 'Caramel Pecan Tart — تارت كراميل ناعم مع مكسرات البيكان المحمصة', 3000, 8, 'https://images.pexels.com/photos/37829757/pexels-photo-37829757.jpeg?auto=compress&cs=tinysrgb&w=900', true),
  (v_rest_id, v_cat_pastry, 'بودينغ موز', 'Banana Pudding — طبقات بودينغ الفانيلا الكريمية وقطع الموز والبسكويت المقرمش', 3000, 9, 'https://images.pexels.com/photos/28167314/pexels-photo-28167314.jpeg?auto=compress&cs=tinysrgb&w=900', true);

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
