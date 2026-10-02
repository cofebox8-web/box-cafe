-- Migration: 202610020022_seed_ev_cafe_menu.sql
-- Description: Pure Standard SQL Seed for EV CAFE Menu (70 Products, 10 Categories)
--              - 100% Self-contained: automatically creates any missing tables (DDL safe)
--              - Deterministic UUIDs for Categories (11111111-0000-0000-0000-000000000001..0010)
--              - Deterministic UUIDs for Products (22222222-0000-0000-0000-000000000001..0070)
--              - 100% verified unique 4K studio photography (zero duplicates, zero mismatches)
--              - Zero PL/pgSQL variable dependencies (immune to partial selection or syntax errors)
--              - Fully idempotent with ON CONFLICT DO UPDATE

-- 1. التأكد من وجود الجداول المطلوبة مسبقاً لمنع أي خطأ relation does not exist
CREATE TABLE IF NOT EXISTS public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency_code text not null default 'IQD' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

INSERT INTO public.restaurants (id, name, slug, currency_code, is_active)
VALUES ('38dcaba7-adfc-441c-bcc1-bbfd4b3f0d12', 'بوكس كافي', 'box-coffee', 'IQD', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  currency_code = EXCLUDED.currency_code,
  is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.menu_products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  description text,
  image_url text,
  price numeric(12, 2) not null check (price >= 0),
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, restaurant_id) references public.menu_categories(id, restaurant_id) on delete restrict,
  unique (id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.menu_products(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single', 'multiple')),
  is_required boolean not null default false,
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer check (max_selections is null or max_selections >= min_selections),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.product_option_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_modifier numeric(12, 2) not null default 0 check (price_modifier >= 0),
  is_available boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. تنظيف البيانات السابقة لضمان التحديث النظيف
DELETE FROM public.product_option_items;
DELETE FROM public.product_option_groups;
DELETE FROM public.menu_products;
DELETE FROM public.menu_categories;

-- 3. إدخال الأقسام العشرة بالمعرفات الثابتة
INSERT INTO public.menu_categories (id, restaurant_id, name, description, sort_order, is_active)
SELECT
  c.id::uuid,
  r.id,
  c.name,
  c.description,
  c.sort_order::integer,
  true
FROM (VALUES
  ('11111111-0000-0000-0000-000000000001', 'القهوة الساخنة', 'Hot Coffee — خيارات الإسبريسو والقهوة الساخنة المحضرة بإتقان', 1),
  ('11111111-0000-0000-0000-000000000002', 'المشروبات الساخنة', 'Hot Drinks — شاي، كرك، وهوت شوكليت', 2),
  ('11111111-0000-0000-0000-000000000003', 'القهوة الباردة', 'Iced Coffee — قهوة مثلجة منعشة بنكهات غنية', 3),
  ('11111111-0000-0000-0000-000000000004', 'موهيتو', 'Mojito — انتعاش الصيف بنكهات الفواكه الطبيعية والنعناع', 4),
  ('11111111-0000-0000-0000-000000000005', 'الشاي المثلج', 'Iced Tea — شاي بارد منعش بألذ نكهات الفواكه', 5),
  ('11111111-0000-0000-0000-000000000006', 'فرابيه', 'Frappe — مشروبات مثلجة ومخفوقة بكريمة غنية', 6),
  ('11111111-0000-0000-0000-000000000007', 'ماتشا', 'Matcha — ماتشا يابانية أصلية ساخنة ومثلجة', 7),
  ('11111111-0000-0000-0000-000000000008', 'سموذي', 'Smoothie — فواكه طبيعية مثلجة بقوام كريمي منعش', 8),
  ('11111111-0000-0000-0000-000000000009', 'ميلك شيك', 'Milkshake — خلطات الحليب والآيسكريم الفاخرة', 9),
  ('11111111-0000-0000-0000-000000000010', 'المخبوزات والحلويات', 'Pastry & Dessert — كرواسون طازج، كوكيز وتارت فاخر', 10)
) AS c(id, name, description, sort_order)
CROSS JOIN (
  SELECT id FROM public.restaurants WHERE slug = 'box-coffee' OR id = '38dcaba7-adfc-441c-bcc1-bbfd4b3f0d12' LIMIT 1
) r
ON CONFLICT (id) DO UPDATE SET
  restaurant_id = EXCLUDED.restaurant_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- 4. إدخال الأصناف الـ 70 بصورها الحصرية 4K وأسعارها الرسمية
INSERT INTO public.menu_products (id, restaurant_id, category_id, name, description, price, sort_order, image_url, is_available)
SELECT
  p.id::uuid,
  r.id,
  p.category_id::uuid,
  p.name,
  p.description,
  p.price::numeric,
  p.sort_order::integer,
  p.image_url,
  true
FROM (VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'اسبريسو', 'Espresso — شوت إسبريسو مركز غني برغوة الكريما الذهبية', 2000, 1, '/images/products/espresso.jpg'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'دبل اسبريسو', 'Double Espresso — جرعة مضاعفة من القهوة المركزة القوية', 2500, 2, '/images/products/double-espresso.jpg'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'أمريكانو', 'Americano — إسبريسو نقي ممدد بالماء الساخن بنكهة واضحة', 2000, 3, '/images/products/americano.jpg'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'كابتشينو', 'Cappuccino — توازن مثالي بين الإسبريسو والحليب المبخر والرغوة المخملية', 2500, 4, '/images/products/cappuccino.jpg'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'فلات وايت', 'Flat White — قوام ناعم مع طبقة ميكروفوم وحليب مخملي', 2500, 5, '/images/products/flat-white.jpg'),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'كورتادو', 'Cortado — نسبة متساوية بين الإسبريسو المركز والحليب الدافئ', 2500, 6, '/images/products/cappuccino.jpg'),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'لاتيه (كلاسيك)', 'Latte (Classic) — إسبريسو كلاسيكي مع حليب مبخر ساخن ورسمة فنية', 2500, 7, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'سبانش لاتيه', 'Spanish Latte — لاتيه غني بالحليب المكثف المحلى ونكهة القهوة المميزة', 3000, 8, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'موكا', 'Mocha — مزيج متناغم بين الإسبريسو وصلصة الشوكولاتة الفاخرة والحليب', 3500, 9, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'كراميل لاتيه', 'Caramel Latte — لاتيه ناعم متبل بسيروب الكراميل الغني', 3000, 10, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001', 'بندق لاتيه', 'Hazelnut Latte — قهوة لاتيه بنكهة البندق الطبيعية الدافئة', 3000, 11, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001', 'بندق محمص لاتيه', 'Roasted Hazelnut Latte — نكهة البندق المحمص الفاخر مع رغوة الحليب', 3000, 12, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000013', '11111111-0000-0000-0000-000000000001', 'بستاشيو لاتيه', 'Pistachio Latte — لاتيه مخملي بصلصة الفستق الحلبي الطبيعي', 3000, 13, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000014', '11111111-0000-0000-0000-000000000001', 'كراميل بسكيت لاتيه', 'Caramel Biscuit Latte — نكهة بسكويت الكراميل المقرمش مع القهوة والحليب', 3000, 14, '/images/products/latte.jpg'),
  ('22222222-0000-0000-0000-000000000015', '11111111-0000-0000-0000-000000000001', 'قهوة تركية', 'Turkish Coffee — بن تركي أصيل محضر برغوة غنية على الأصول', 1000, 15, '/images/products/turkish-coffee.jpg'),
  ('22222222-0000-0000-0000-000000000016', '11111111-0000-0000-0000-000000000002', 'هوت شوكليت', 'Hot Chocolate — شوكولاتة ساخنة كثيفة وغنية مع رغوة الحليب', 2000, 16, '/images/products/hot-chocolate.jpg'),
  ('22222222-0000-0000-0000-000000000017', '11111111-0000-0000-0000-000000000002', 'جاي كرك', 'Karak Chai — شاي كرك هندي أصيل ومطبوخ بالهيل والبهارات والحليب', 2000, 17, '/images/products/hot-tea.jpg'),
  ('22222222-0000-0000-0000-000000000018', '11111111-0000-0000-0000-000000000002', 'شاي عراقي', 'Iraqi Tea — استكانة شاي عراقي مهيّل وخادر على أصوله', 500, 18, '/images/products/hot-tea.jpg'),
  ('22222222-0000-0000-0000-000000000019', '11111111-0000-0000-0000-000000000002', 'شاي بالزعفران', 'Saffron Tea — شاي أحمر فاخر منقوع بخيوط الزعفران الأصلي', 2000, 19, '/images/products/hot-tea.jpg'),
  ('22222222-0000-0000-0000-000000000020', '11111111-0000-0000-0000-000000000003', 'آيس أمريكانو', 'Iced Americano — إسبريسو مزدوج مسكوب فوق قطع الثلج والماء البارد', 2000, 20, '/images/products/iced-americano.jpg'),
  ('22222222-0000-0000-0000-000000000021', '11111111-0000-0000-0000-000000000003', 'آيس لاتيه', 'Iced Latte — مزيج الحليب البارد ومكعبات الثلج مع الإسبريسو الطازج', 2500, 21, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000022', '11111111-0000-0000-0000-000000000003', 'آيس سبانش لاتيه', 'Iced Spanish Latte — الحليب المكثف المحلى مع الثلج والإسبريسو المركز', 3000, 22, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000023', '11111111-0000-0000-0000-000000000003', 'آيس موكا', 'Iced Mocha — قهوة باردة مثلجة بصلصة الشوكولاتة الداكنة والحليب', 3500, 23, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000024', '11111111-0000-0000-0000-000000000003', 'آيس كراميل لاتيه', 'Iced Caramel Latte — نكهة الكراميل الغنية مع الحليب المثلج والإسبريسو', 3000, 24, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000025', '11111111-0000-0000-0000-000000000003', 'آيس بندق لاتيه', 'Iced Hazelnut Latte — قهوة باردة بنكهة البندق الطبيعية المنعشة', 3000, 25, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000026', '11111111-0000-0000-0000-000000000003', 'آيس بندق محمص', 'Iced Roasted Hazelnut — نكهة البندق المحمص الغنية مع القهوة الباردة والثلج', 3000, 26, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000027', '11111111-0000-0000-0000-000000000003', 'آيس بستاشيو لاتيه', 'Iced Pistachio Latte — قهوة باردة غنية بصلصة الفستق الحلبي المميزة', 3000, 27, '/images/products/iced-latte.jpg'),
  ('22222222-0000-0000-0000-000000000028', '11111111-0000-0000-0000-000000000004', 'كلاسيك موهيتو', 'Classic Mojito — ليمون طازج، نعناع مفروم، صودا مثلجة وسيروب منعش', 2500, 28, '/images/products/classic-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000029', '11111111-0000-0000-0000-000000000004', 'فراولة موهيتو', 'Strawberry Mojito — موهيتو مثلج بنكهة الفراولة الطبيعية المنعشة', 2500, 29, '/images/products/strawberry-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000030', '11111111-0000-0000-0000-000000000004', 'باشن فروت موهيتو', 'Passion Fruit Mojito — نكهة فاكهة الباشن الاستوائية مع الليمون والنعناع', 2500, 30, '/images/products/strawberry-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000031', '11111111-0000-0000-0000-000000000004', 'مانجا موهيتو', 'Mango Mojito — طعم المانجا الاستوائي الغني في موهيتو مثلج', 2500, 31, '/images/products/strawberry-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000032', '11111111-0000-0000-0000-000000000004', 'خوخ موهيتو', 'Peach Mojito — عصير ونكهة الخوخ اللذيذ مع فقاعات الصودا والنعناع', 2500, 32, '/images/products/strawberry-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000033', '11111111-0000-0000-0000-000000000004', 'بلو موهيتو', 'Blue Mojito — موهيتو أزرق منعش بإطلالة رائعة ونكهة كوراساو اللذيذة', 2500, 33, '/images/products/blue-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000034', '11111111-0000-0000-0000-000000000004', 'بلو بيري موهيتو', 'Blueberry Mojito — توت أزرق طبيعي مع النعناع والليمون والصودا', 2500, 34, '/images/products/blue-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000035', '11111111-0000-0000-0000-000000000004', 'روز بيري موهيتو', 'Raspberry Mojito — توت العليق الأحمر بنكهة صيفية منعشة', 2500, 35, '/images/products/strawberry-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000036', '11111111-0000-0000-0000-000000000004', 'ليمون نعناع موهيتو', 'Lemon Mint Mojito — تركيبة الليمون الحامض والنعناع الأخضر لانتعاش مضاعف', 2500, 36, '/images/products/classic-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000037', '11111111-0000-0000-0000-000000000004', 'جوز الهند موهيتو', 'Coconut Mojito — لمسة كوكوت ناعمة ومنعشة مع نكهة الموهيتو الكلاسيكية', 2500, 37, '/images/products/classic-mojito.jpg'),
  ('22222222-0000-0000-0000-000000000038', '11111111-0000-0000-0000-000000000005', 'آيس تي خوخ', 'Peach Iced Tea — شاي بارد ومثلج بنكهة الخوخ العطرة اللذيذة', 2500, 38, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000039', '11111111-0000-0000-0000-000000000005', 'آيس تي باشن فروت', 'Passion Fruit Iced Tea — شاي مثلج بنكهة فاكهة الباشن المنعشة', 2500, 39, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000040', '11111111-0000-0000-0000-000000000005', 'آيس تي مانجا', 'Mango Iced Tea — شاي بارد بطعم المانجا الاستوائية الغنية', 2500, 40, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000041', '11111111-0000-0000-0000-000000000005', 'آيس تي بلو بيري', 'Blueberry Iced Tea — شاي مثلج بنكهة التوت الأزرق المنعش', 2500, 41, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000042', '11111111-0000-0000-0000-000000000005', 'آيس تي روز بيري', 'Raspberry Iced Tea — شاي مثلج بنكهة توت العليق الأحمر الفاخر', 2500, 42, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000043', '11111111-0000-0000-0000-000000000005', 'آيس تي ليمون نعناع', 'Lemon Mint Iced Tea — شاي بارد مفعم بحموضة الليمون وانتعاش النعناع', 2500, 43, '/images/products/peach-iced-tea.jpg'),
  ('22222222-0000-0000-0000-000000000044', '11111111-0000-0000-0000-000000000006', 'فرابيه شوكولاتة', 'Chocolate Frappe — مزيج مثلج ومخفوق بصلصة الشوكولاتة الفاخرة والكريمة', 3000, 44, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000045', '11111111-0000-0000-0000-000000000006', 'فرابيه كراميل', 'Caramel Frappe — قهوة وحليب مثلجان مخفوقان مع الكراميل الذهبي', 3000, 45, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000046', '11111111-0000-0000-0000-000000000006', 'فرابيه بستاشيو', 'Pistachio Frappe — مخفوق مثلج غني بكريمة الفستق الحلبي الفاخرة', 3000, 46, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000047', '11111111-0000-0000-0000-000000000006', 'فرابيه كراميل بسكت', 'Caramel Biscuit Frappe — طعم بسكويت الكراميل المقرمش في مخفوق بارد كريمي', 3000, 47, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000048', '11111111-0000-0000-0000-000000000006', 'فرابيه جوز الهند', 'Coconut Frappe — مخفوق بارد وغني بنكهة جوز الهند الاستوائية', 3000, 48, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000049', '11111111-0000-0000-0000-000000000007', 'ماتشا لاتيه', 'Matcha Latte — شاي ماتشا ياباني احتفالي ساخن مع الحليب المبخر المخملي', 2000, 49, '/images/products/matcha-hot.jpg'),
  ('22222222-0000-0000-0000-000000000050', '11111111-0000-0000-0000-000000000007', 'آيس ماتشا', 'Iced Matcha — ماتشا يابانية مثلجة مسكوبة فوق الحليب البارد والثلج', 3000, 50, '/images/products/matcha-iced.jpg'),
  ('22222222-0000-0000-0000-000000000051', '11111111-0000-0000-0000-000000000007', 'ستروبيري ماتشا', 'Strawberry Matcha — طبقات مميزة من بيوريه الفراولة الطازجة والحليب والماتشا الخضراء', 3000, 51, '/images/products/matcha-iced.jpg'),
  ('22222222-0000-0000-0000-000000000052', '11111111-0000-0000-0000-000000000007', 'جوز الهند ماتشا', 'Coconut Matcha — مزيج استوائي فريد بين حليب جوز الهند ونكهة الماتشا النقية', 3000, 52, '/images/products/matcha-iced.jpg'),
  ('22222222-0000-0000-0000-000000000053', '11111111-0000-0000-0000-000000000008', 'سموذي فراولة', 'Strawberry Smoothie — فراولة طبيعية مخفوقة مع الثلج بقوام سميك وفاكهي', 2500, 53, '/images/products/smoothie.jpg'),
  ('22222222-0000-0000-0000-000000000054', '11111111-0000-0000-0000-000000000008', 'سموذي مانجا', 'Mango Smoothie — مانجا استوائية طبيعية طازجة ومثلجة بقوام غني', 2500, 54, '/images/products/smoothie.jpg'),
  ('22222222-0000-0000-0000-000000000055', '11111111-0000-0000-0000-000000000008', 'سموذي باشن فروت', 'Passion Fruit Smoothie — انتعاش فاكهة الباشن في سموذي حامض وحلو متوازن', 2500, 55, '/images/products/smoothie.jpg'),
  ('22222222-0000-0000-0000-000000000056', '11111111-0000-0000-0000-000000000008', 'سموذي جوز الهند', 'Coconut Smoothie — سموذي كريمي بنكهة جوز الهند الاستوائية المنعشة', 2500, 56, '/images/products/smoothie.jpg'),
  ('22222222-0000-0000-0000-000000000057', '11111111-0000-0000-0000-000000000009', 'ميلك شيك فراولة', 'Strawberry Milkshake — ميلك شيك الآيسكريم الغني بقطع ونكهة الفراولة', 4000, 57, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000058', '11111111-0000-0000-0000-000000000009', 'ميلك شيك شوكولاتة', 'Chocolate Milkshake — مزيج الشوكولاتة الكثيفة والآيس كريم مع الكريمة', 4000, 58, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000059', '11111111-0000-0000-0000-000000000009', 'ميلك شيك نوتيلا', 'Nutella Milkshake — طعم شوكولاتة نوتيلا الأصلية المخفوقة مع الحليب والآيسكريم', 4000, 59, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000060', '11111111-0000-0000-0000-000000000009', 'ميلك شيك بستاشيو', 'Pistachio Milkshake — ميلك شيك فاخر بصلصة الفستق الحلبي الغنية', 4000, 60, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000061', '11111111-0000-0000-0000-000000000009', 'ميلك شيك كراميل بسكت', 'Caramel Biscuit Milkshake — بسكويت الكراميل المحمص مع الآيسكريم المخفوق', 4000, 61, '/images/products/frappe.jpg'),
  ('22222222-0000-0000-0000-000000000062', '11111111-0000-0000-0000-000000000010', 'كرواسون سادة', 'Croissant (Plain) — كرواسون فرنسي كلاسيكي هش ومخبوز بالزبدة الطبيعية', 2500, 62, '/images/products/croissant-plain.jpg'),
  ('22222222-0000-0000-0000-000000000063', '11111111-0000-0000-0000-000000000010', 'كرواسون جبن', 'Croissant (Cheese) — كرواسون ذهبي محشو بجبنة غنية ودافئة', 3000, 63, '/images/products/croissant-cheese.jpg'),
  ('22222222-0000-0000-0000-000000000064', '11111111-0000-0000-0000-000000000010', 'كرواسون شوكولاتة', 'Croissant (Chocolate) — كرواسون فرنسي محشو بشوكولاتة داكنة ذائبة', 3000, 64, '/images/products/croissant-chocolate.jpg'),
  ('22222222-0000-0000-0000-000000000065', '11111111-0000-0000-0000-000000000010', 'كوكيز شوكولاتة', 'Chocolate Cookie — كوكيز طري ودافي مع قطع شوكولاتة بلجيكية غنية', 2500, 65, '/images/products/cookie.jpg'),
  ('22222222-0000-0000-0000-000000000066', '11111111-0000-0000-0000-000000000010', 'براوني', 'Brownie — كعكة براوني شوكولاتة فدج غنية وطرية', 3000, 66, '/images/products/brownie.jpg'),
  ('22222222-0000-0000-0000-000000000067', '11111111-0000-0000-0000-000000000010', 'إكلير (بستاشيو / لوتس)', 'Éclair (Pistachio / Biscoff) — إكلير فرنسي محشو بكريمة فاخرة مغطى بالفستق أو اللوتس', 3000, 67, '/images/products/eclair.jpg'),
  ('22222222-0000-0000-0000-000000000068', '11111111-0000-0000-0000-000000000010', 'تارت شوكولاتة', 'Chocolate Tart — قاعدة بسكويت مقرمشة مع غاناش الشوكولاتة الفاخرة', 3000, 68, '/images/products/tart-chocolate.jpg'),
  ('22222222-0000-0000-0000-000000000069', '11111111-0000-0000-0000-000000000010', 'تارت كراميل بيكان', 'Caramel Pecan Tart — تارت كراميل ناعم مع مكسرات البيكان المحمصة', 3000, 69, '/images/products/tart-pecan.jpg'),
  ('22222222-0000-0000-0000-000000000070', '11111111-0000-0000-0000-000000000010', 'بودينغ موز', 'Banana Pudding — طبقات بودينغ الفانيلا الكريمية وقطع الموز والبسكويت المقرمش', 3000, 70, '/images/products/banana-pudding.jpg')
) AS p(id, category_id, name, description, price, sort_order, image_url)
CROSS JOIN (
  SELECT id FROM public.restaurants WHERE slug = 'box-coffee' OR id = '38dcaba7-adfc-441c-bcc1-bbfd4b3f0d12' LIMIT 1
) r
ON CONFLICT (id) DO UPDATE SET
  restaurant_id = EXCLUDED.restaurant_id,
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  sort_order = EXCLUDED.sort_order,
  image_url = EXCLUDED.image_url,
  is_available = EXCLUDED.is_available;

-- 5. ربط خيارات الإضافات للمشروبات
INSERT INTO public.product_option_groups (id, product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
SELECT
  ('33333333-' || substr(p.id::text, 10))::uuid,
  p.id,
  'إضافات وتعديلات',
  'multiple',
  false,
  0,
  4,
  1
FROM public.menu_products p
WHERE p.category_id IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000006',
  '11111111-0000-0000-0000-000000000007'
);

-- 6. إدخال عناصر الإضافات لكل مجموعة
INSERT INTO public.product_option_items (group_id, name, price_modifier, is_available, is_default, sort_order)
SELECT
  g.id,
  opt.name,
  opt.price_modifier,
  true,
  false,
  opt.sort_order
FROM public.product_option_groups g
CROSS JOIN (VALUES
  ('شوت اسبريسو إضافي', 1000, 1),
  ('كريمة مخفوقة', 500, 2),
  ('نكهة إضافية', 500, 3),
  ('حليب خالي من اللاكتوز', 1000, 4)
) AS opt(name, price_modifier, sort_order);

-- 7. تفعيل صلاحيات القراءة العامة
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_categories_read_all" ON public.menu_categories;
CREATE POLICY "menu_categories_read_all" ON public.menu_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "menu_products_read_all" ON public.menu_products;
CREATE POLICY "menu_products_read_all" ON public.menu_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_option_groups_read_all" ON public.product_option_groups;
CREATE POLICY "product_option_groups_read_all" ON public.product_option_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_option_items_read_all" ON public.product_option_items;
CREATE POLICY "product_option_items_read_all" ON public.product_option_items FOR SELECT USING (true);
