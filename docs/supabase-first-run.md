# تشغيل Supabase لأول مرة

هذه الخطوات تجهز دخول أول مدير فقط. لا تستخدم مفتاح `service_role` في الموقع أو تشاركه.

## 1. تطبيق الترحيلات

من Supabase افتح **SQL Editor**، ثم نفّذ ملفات `supabase/migrations/` بالترتيب الرقمي:

1. `202609230001_initial_schema.sql`
2. `202609230002_customer_menu_and_ordering.sql`
3. `202609240003_kitchen_display_and_status.sql`
4. `202609240004_admin_dashboard_rpcs.sql`
5. `202609250005_staff_order_visibility.sql`
6. `202609260006_empty_initial_catalog.sql`
7. `202609260007_admin_menu_authoring.sql`
8. `202609260008_admin_live_order_feed.sql`
9. `202609260009_roadside_order_entry.sql`

لا تعِد تنفيذ هذه القائمة عشوائياً إذا كانت بعض الترحيلات مطبقة مسبقاً؛ راجع سجل الترحيلات أولاً.

في مشروع Supabase الحالي، تحقّق من سجل الترحيلات قبل التنفيذ. يلزم تطبيق الترحيل `202609260013_menu_realtime_publication.sql` بعد الترحيلات السابقة لتفعيل التحديث اللحظي للمنيو ونقاط الخدمة.

الترحيل السادس يمسح فقط أصناف وأقسام المعاينة التي أضافها الترحيل الثاني. لا ينشئ حسابات موظفين. يبدأ المنيو فارغاً. الترحيل السابع يضيف إجراءات إدارة الأقسام والأصناف وخياراتها وسياسات رفع الصور. الترحيل الثامن يضيف قراءة حديثة ومحدودة بفروع المطعم لسجل الطلبات في لوحة الإدارة. الترحيل التاسع يضيف إجراء إنشاء طلب لموظف الشارع؛ يفرض دور الحساب والفرع، ويعيد استخدام تحقق المنتجات والخيارات وحساب الأسعار الموجود في إجراء الطلب.

## 2. معرفة المطعم والفرع التمهيديين

الترحيل الثاني ينشئ بيانات المطعم `box-coffee` والفرع `airport` ونقطتي خدمة برموز QR عشوائية، كما ينشئ بيانات منيو تجريبية يمسحها الترحيل السادس. لا توجد حسابات موظفين جاهزة. استخرج المعرّفات التي تحتاجها لإنشاء حساب المالك:

```sql
select id, name, slug from public.restaurants where slug = 'box-coffee';
select id, restaurant_id, name, slug from public.branches where slug = 'airport';
```

## 3. إنشاء حساب المالك

1. من **Authentication → Users** أنشئ مستخدماً ببريد المالك وكلمة مروره. استخدم بريداً تملكه، ولا ترسل كلمة المرور هنا.
2. انسخ `User UID` من قائمة المستخدمين.
3. أضف ملف الصلاحيات في SQL Editor. استبدل المعرفات النصية بالـ UUIDs الفعلية:

```sql
insert into public.staff_profiles
  (user_id, restaurant_id, branch_id, full_name, role, is_active)
values
  ('REPLACE_AUTH_USER_UUID', 'REPLACE_RESTAURANT_UUID', null, 'مالك بوكس كافي', 'owner', true);
```

إذا لم تعد بيانات البدء مناسبة للتشغيل، عدّل أسماءها من SQL Editor بعد حفظ المعرّفات، ولا تنشئ فرعاً ثانياً بالمسار نفسه قبل ضبط تفرد المسارات.

المالك ذو `branch_id = null` يعمل على كل فروع مطعمه. موظف المطبخ يضاف بالطريقة نفسها مع `role = 'kitchen'` و`branch_id` الخاص بفرعه. لا يوجد تسجيل عام للموظفين ولا يستطيع المستخدم منح نفسه دوراً من الموقع.

## 4. فتح شاشة المطبخ

بعد إنشاء فرع `airport` وحساب موظف مطبخ مربوط به، تفتح الشاشة من `/kitchen/airport`. لوحة الإدارة تفتح من `/admin` بحساب المالك أو المدير.

بعد تطبيق الترحيلات يكون المنيو فارغاً. أضف الأقسام والمنتجات والأسعار والصور والأوصاف وخيارات الإضافات يدوياً من إدارة المنيو بعد توصيلها بـ Supabase. لا تنشر QR للعملاء قبل إضافة المنتجات واختبار تدفق الطلب. لا توجد بعد واجهة إدارية تطبع رموز QR. استخرج روابط نقاط الخدمة من Supabase ثم أنشئ منها QR:

```sql
select b.slug as branch_slug, csp.label, csp.qr_token,
       'https://YOUR-VERCEL-DOMAIN/menu/' || b.slug || '/' || csp.qr_token::text as menu_url
from public.car_service_points csp
join public.branches b on b.id = csp.branch_id
where b.slug = 'airport' and csp.is_active;
```

استبدل `YOUR-VERCEL-DOMAIN` بنطاق Vercel الفعلي. لا تنشر هذه الروابط قبل تجربة كل QR بنفسك.

## 6. نشر دالة إدارة الموظفين (Edge Function)

تبويب "الموظفين" في `/admin` (إنشاء/تعديل/حذف حساب موظف) يستدعي دالة خادمية على Supabase اسمها `admin-manage-staff` (المصدر في `supabase/functions/admin-manage-staff/index.ts`). هذه الدالة هي المكان الوحيد المسموح فيه استخدام مفتاح `service_role`، ولا تُشحن أبداً إلى المتصفح. **دون نشرها، عرض قائمة الموظفين والتفعيل/التعطيل يعملان (RPC عادية)، لكن الإنشاء والتعديل والحذف لا يعملون.**

هذه الخطوة تستخدم أداة سطر أوامر (Supabase CLI) على جهازك لنشر كود الدالة إلى خوادم Supabase — وهي أداة تشغيل خارجية، لا تضيف Node.js أو خطوة بناء إلى موقع `public/` نفسه، ولا تخالف كونه ثابتاً بلا bundler.

1. ثبّت Supabase CLI مرة واحدة على جهازك (راجع التعليمات الرسمية لنظام تشغيلك)، ثم سجّل الدخول:
   ```
   supabase login
   ```
2. اربط مجلد المشروع بمشروع Supabase الفعلي (مرجع المشروع هو الجزء الأول من رابط `SUPABASE_URL` في `public/js/config.js`، أي `rtzzoyaxivujzvghudgz`):
   ```
   supabase link --project-ref rtzzoyaxivujzvghudgz
   ```
3. انشر الدالة:
   ```
   supabase functions deploy admin-manage-staff
   ```
   لا حاجة لضبط أي أسرار يدوياً؛ متغيرات `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` تُحقن تلقائياً داخل كل Edge Function من Supabase نفسه.
4. جرّب الدالة بحساب مالك حقيقي من تبويب "الموظفين" في `/admin`: أضف موظفاً تجريبياً، تحقق من ظهوره وقدرته على تسجيل الدخول من `/login`، ثم عدّل حالته واحذفه للتأكد من عمل المسارات الثلاثة.

بعد النشر الأول، أي تعديل لاحق على `supabase/functions/admin-manage-staff/index.ts` يحتاج إعادة تنفيذ أمر `supabase functions deploy admin-manage-staff` فقط لتحديثه.
