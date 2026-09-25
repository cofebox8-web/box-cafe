-- Remove the built-in preview catalog. The owner creates all real categories,
-- products, images, descriptions, prices, and option groups from the admin UI.
-- Only the exact records inserted by the previous seed block are removed.

delete from public.menu_products as product
using public.restaurants as restaurant
where product.restaurant_id = restaurant.id
  and restaurant.slug = 'box-coffee'
  and product.name in (
    'سبانش لاتيه ساخن',
    'كافيه لاتيه',
    'أمريكانو كلاسيك',
    'قهوة مقطرة V60',
    'آيس سبانش لاتيه',
    'كولد برو منقوع 18 ساعة',
    'كرواسون زبدة فرنسي',
    'كوكيز الشوكولاتة البلجيكية'
  );

delete from public.menu_categories as category
using public.restaurants as restaurant
where category.restaurant_id = restaurant.id
  and restaurant.slug = 'box-coffee'
  and category.name in (
    'قهوة ساخنة',
    'قهوة مثلجة وباردة',
    'مخبوزات وحلويات',
    'شاي ومشروبات منعشة'
  )
  and not exists (
    select 1
    from public.menu_products as product
    where product.category_id = category.id
  );
