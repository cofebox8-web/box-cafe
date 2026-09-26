# بوكس كافي — المرجع الشامل للمشروع

> **نطاق هذا المستند:** مرجع تقني موحّد لكل ما بُني فعلياً في المشروع حتى تاريخ 2026-09-26: نظام تسجيل الدخول، الربط مع Supabase، قاعدة البيانات ودوالها، اللحظية (Realtime)، إدارة الحسابات والمنتجات، والنشر على Vercel.
>
> **العلاقة بالمستندات الأخرى:** هذا المستند يجمع ويشرح الكود الفعلي بالتفصيل التقني (أسماء الملفات، الدوال، الجداول). أما **تدفق النظام والقرارات المعتمدة** فمرجعها الرسمي يبقى [`docs/architecture.md`](architecture.md)، و**تجربة الواجهة** مرجعها [`docs/product-review.md`](product-review.md)، وخطوات **تهيئة Supabase لأول مرة** موجودة في [`docs/supabase-first-run.md`](supabase-first-run.md). عند أي تعارض، يُرجَّح `architecture.md`.
>
> ✅ **تحديث 2026-09-26:** الثغرتان الموصوفتان سابقاً في القسم 7 (الباب الخلفي بكلمة مرور ثابتة، وتخزين كلمات مرور الموظفين نصاً صريحاً في `localStorage`) أُزيلتا من الكود، واستُبدل مسار إضافة الموظفين بدالة خادمية آمنة (`supabase/functions/admin-manage-staff`). **يبقى إجراء واحد مطلوب من المالك قبل الاعتماد على الميزة: نشر الدالة على مشروع Supabase** — راجع القسم 7 وخطوات النشر في [`docs/supabase-first-run.md`](supabase-first-run.md#6-نشر-دالة-إدارة-الموظفين-edge-function). كما يجب **تغيير كلمة مرور حساب `cofebox8@gmail.com` الحقيقية في Supabase الآن** لأنها كانت مكتوبة سابقاً في كود عام وصل لكل متصفح.

---

## 1. نظرة عامة على المشروع

بوكس كافي نظام طلبات لخدمة السيارات (Drive-through)، بأربع واجهات تشغيلية وبوابة دخول موحدة:

| الواجهة | المسار | من يستخدمها | يحتاج حساباً؟ |
|---|---|---|---|
| منيو الزبون والطلب | `/menu/{branch}/{service-point-token}` | الزبون عبر QR | لا |
| بوابة الدخول الموحدة | `/login` | كل الموظفين والإدارة | — |
| طلب موظف الشارع | `/roadside/order` | موظف دور `roadside` | نعم |
| شاشة المطبخ | `/kitchen/{branch}` | موظف دور `kitchen` (والمالك/المدير) | نعم |
| لوحة الإدارة | `/admin` | دور `owner` أو `admin` | نعم |

## 2. المكدس التقني والقيود المعتمدة

- **بلا بناء (build-free):** HTML/CSS/JavaScript حديث فقط، بدون Node.js أو npm أو bundler أو خادم تطبيق. الاستيراد في الواجهة يتم عبر `<script type="module">` وimport مباشر بين ملفات `public/js/*.js`.
- **الاستضافة:** Vercel تخدم مجلد `public/` كملفات ثابتة (`vercel.json`: `framework: null`, `buildCommand: ""`, `outputDirectory: "public"`).
- **قاعدة البيانات/المصادقة/اللحظية:** Supabase (PostgreSQL + Auth + Realtime)، يصلها المتصفح مباشرة عبر عميل `@supabase/supabase-js@2` المحمّل من CDN (`esm.sh`) أو من `window.supabase` إذا كان محمّلاً مسبقاً.
- **المفتاح المستخدم في المتصفح:** مفتاح `publishable` فقط (`public/js/config.js`). **ممنوع** وضع مفتاح `service_role` أو أي سر في أي ملف داخل `public/`. الأمان الفعلي يعتمد بالكامل على سياسات RLS ودوال `SECURITY DEFINER` المضبوطة في الترحيلات.
- **اللغة والتخطيط:** العربية RTL افتراضية في كل الصفحات، مصممة للهاتف والآيباد وسطح المكتب.
- **قاعدة البيانات كترحيلات:** كل تغيير في المخطط يُحفظ كملف SQL مرتب زمنياً تحت `supabase/migrations/`.

## 3. خريطة الملفات

```
public/
  index.html            صفحة هبوط عامة
  login.html            بوابة الدخول الموحدة
  menu.html             منيو الزبون والطلب
  roadside.html         طلب موظف الشارع
  kitchen.html          شاشة المطبخ
  admin.html            لوحة الإدارة (تبويبات داخلية)
  js/
    config.js           رابط Supabase العام + المفتاح publishable
    supabase-client.js   إنشاء عميل Supabase وفحص التهيئة
    staff-auth.js         منطق المصادقة، الجلسات، توجيه الأدوار
    login-app.js          واجهة صفحة /login (تسجيل دخول/استرجاع كلمة مرور)
    menu-app.js            منطق منيو الزبون والسلة والطلب
    roadside-app.js        منطق طلب موظف الشارع
    kitchen-app.js         منطق شاشة المطبخ + Realtime
    admin-app.js           منطق لوحة الإدارة (منيو، طلبات، موظفون، QR)
    demo-data.js           بيانات معاينة محلية (لا تُستخدم في الإنتاج)
  styles/                ملف CSS لكل صفحة + foundation.css مشترك
supabase/migrations/     ترحيلات SQL مرتبة بالتاريخ
docs/                    هذا المرجع + architecture.md + product-review.md + supabase-first-run.md
vercel.json              إعداد الاستضافة وإعادة كتابة المسارات
```

## 4. المسارات في Vercel (`vercel.json`)

| المسار الظاهر | يُعاد كتابته إلى |
|---|---|
| `/menu/:branch/:token`, `/menu/:branch`, `/menu` | `/menu.html` |
| `/kitchen/:branch`, `/kitchen` | `/kitchen.html` |
| `/roadside/order`, `/roadside` | `/roadside.html` |
| `/admin/:section`, `/admin` | `/admin.html` |
| `/login` | `/login.html` |

التوجيه الفعلي بين "تبويبات" الإدارة أو حالات الصفحة يتم داخل JavaScript على العميل بعد تحميل نفس ملف HTML، وليس عبر مسارات خادم إضافية. الموقع منشور على `https://box-cofe-web.vercel.app`، ومستودعه `mustafambusiness-maker/box-cofe-web`، ويتحدّث تلقائياً مع كل دفعة إلى `main`.

## 5. قاعدة البيانات

### 5.1 الجداول (بالترتيب المنطقي)

| الجدول | الغرض | ملاحظات مهمة |
|---|---|---|
| `restaurants` | المطعم (كيان أعلى، يدعم تعدد المطاعم مستقبلاً) | `slug` فريد |
| `branches` | فروع المطعم | `slug` فريد ضمن نفس المطعم |
| `staff_profiles` | ملف الموظف: `user_id` (يطابق `auth.users.id`)، `role`، `branch_id`، `is_active` | **المفتاح الأساسي هو `user_id`**؛ التعليق الموثق على الجدول: "Created/managed only by a trusted Supabase admin workflow; browser users cannot grant themselves roles." |
| `car_service_points` | نقاط الخدمة (مسار سيارات/استلام) لكل فرع، ولكل نقطة `qr_token` عشوائي فريد | تعطيل النقطة أو تدوير الرمز يُبطل QR القديم فوراً |
| `menu_categories` | أقسام المنيو | `sort_order` للترتيب |
| `menu_products` | المنتجات: الاسم، الوصف، الصورة، السعر، التوفر | يبدأ فارغاً بقرار معتمد من المالك |
| `orders` | الطلبات: `source` (`qr`/`roadside`)، `status`، `order_code` عام قصير، الفرع، نقطة الخدمة | لا يوجد `insert` مباشر مسموح؛ الإدخال حصراً عبر RPC معاملاتي |
| `order_items` | بنود كل طلب مع `selected_options` كـ JSONB | مرتبطة بـ `orders` بحذف متسلسل |
| `order_status_events` | سجل تدقيق لتغييرات حالة الطلب (من يغيّر ومتى) | أُضيف في ترحيل المطبخ |

كل الجداول مفعّل عليها **Row Level Security**. القراءة العامة (بدون تسجيل دخول) مسموحة فقط لـ: المطاعم/الفروع/الأقسام/المنتجات **النشطة والمتاحة**. القراءة والتعديل على الطلبات ونقاط الخدمة وملفات الموظفين تمر عبر `current_staff_can_access_branch()` أو `staff_is_restaurant_admin()`، وهما دالتا `SECURITY DEFINER` بـ `search_path = ''` صريح لمنع اختطاف المسار.

### 5.2 ترتيب الترحيلات المطبّقة

| # | الملف | ماذا يضيف |
|---|---|---|
| 1 | `202609230001_initial_schema.sql` | المخطط الأساسي + RLS الأولية |
| 2 | `202609230002_customer_menu_and_ordering.sql` | منيو الزبون وإنشاء الطلب العام |
| 3 | `202609240003_kitchen_display_and_status.sql` | طابور المطبخ وسجل تغييرات الحالة |
| 4 | `202609240004_admin_dashboard_rpcs.sql` | دوال إدارة المنتجات الأساسية |
| 5 | `202609250005_staff_order_visibility.sql` | صلاحيات رؤية الطلبات للموظفين |
| 6 | `202609260006_empty_initial_catalog.sql` | تفريغ منيو المعاينة (بلا حسابات) |
| 7 | `202609260007_admin_menu_authoring.sql` | تأليف كامل للمنيو (أقسام/منتجات) + رفع صور |
| 8 | `202609260008_admin_live_order_feed.sql` | سجل الطلبات الحديث في لوحة الإدارة |
| 9 | `202609260009_roadside_order_entry.sql` | إنشاء طلب موظف الشارع |
| 10 | `202609260010_admin_service_point_qr.sql` | إدارة نقاط الخدمة وQR من لوحة الإدارة |
| 11 | `202609260011_bootstrap_initial_owner.sql` | تفعيل تلقائي لأول مستخدم كـ Super Admin |
| 12 | `202609260012_admin_staff_management.sql` | قراءة/تفعيل قائمة الموظفين من لوحة الإدارة |

خطوات التطبيق اليدوي والتحقق موثقة بالتفصيل في [`docs/supabase-first-run.md`](supabase-first-run.md).

### 5.3 دوال RPC (الكتالوج الكامل)

| الدالة | الترحيل | من يستدعيها | الغرض |
|---|---|---|---|
| `current_staff_can_access_branch(branch_id)` | 001 | داخلياً (RLS) | فحص صلاحية الموظف على فرع معيّن |
| `get_customer_menu(...)` | 002 | صفحة المنيو (`anon`) | جلب منيو فرع/نقطة خدمة فعّالة فقط |
| `place_customer_order(...)` | 002 | صفحة المنيو (`anon`) | إنشاء طلب QR: يتحقق من التوفر والخيارات، يحسب السعر من القاعدة، معاملة واحدة |
| `get_customer_order_status(...)` | 002 | صفحة تأكيد الطلب (`anon`) | تتبع حالة الطلب برمز عام غير قابل للتخمين |
| `staff_has_branch_role(...)` | 003 | داخلياً | فحص دور + فرع معاً |
| `get_kitchen_orders(branch_slug)` | 003 | `kitchen-app.js` | طابور الطلبات النشطة لفرع المطبخ |
| `update_kitchen_order_status(...)` | 003 | `kitchen-app.js` | تغيير حالة الطلب ضمن انتقالات مسموحة + سجل تدقيق |
| `staff_is_restaurant_admin(restaurant_id)` | 004 | داخلياً (RLS) | فحص أن المستخدم مالك/مدير على المطعم |
| `admin_toggle_product_availability(...)` | 004 | `admin-app.js` | تفعيل/إيقاف صنف |
| `admin_upsert_product(...)` | 004 | `admin-app.js` | إنشاء/تعديل صنف (نسخة مبكرة) |
| `admin_delete_product(product_id)` | 004، مكرر بتوقيع في 007 | `admin-app.js` | حذف صنف |
| `admin_get_menu()` | 007 | `admin-app.js` | جلب كامل المنيو (أقسام + منتجات) لإدارتها |
| `admin_save_category(...)` | 007 | `admin-app.js` | إنشاء/تعديل قسم |
| `admin_save_menu_product(...)` | 007 | `admin-app.js` | إنشاء/تعديل صنف (النسخة المعتمدة حالياً) |
| `admin_get_recent_orders(int, int)` | 008 | `admin-app.js` | سجل آخر 24 ساعة من الطلبات، مقيّد بالفرع والدور |
| `place_roadside_order(jsonb, text, text, text)` | 009 | `roadside-app.js` | إنشاء طلب موظف الشارع، بنفس منطق التحقق والتسعير |
| `admin_get_service_points()` | 010 | `admin-app.js` | جلب نقاط الخدمة والفروع |
| `admin_save_service_point(...)` | 010 | `admin-app.js` | إنشاء/تعديل نقطة خدمة |
| `admin_rotate_service_point_qr(id)` | 010 | `admin-app.js` | تدوير رمز QR وإبطال القديم |
| `bootstrap_initial_owner()` | 011 | `staff-auth.js` | تفعيل أول مستخدم Auth مسجّل كـ `owner` تلقائياً إن لم يوجد أي ملف موظف |
| `admin_get_staff()` | 012 | `admin-app.js` (تبويب الموظفين) | قراءة قائمة الموظفين مع البريد من `auth.users` |
| `admin_toggle_staff_status(user_id, is_active)` | 012 | `admin-app.js` | تفعيل/تعطيل حساب موظف (لا يمكن تعطيل النفس) |

**ملاحظة مهمة:** لا توجد حتى الآن أي دالة RPC معتمدة لـ"إنشاء موظف جديد بكلمة مرور" (أي ما يعادل `admin_create_staff`). هذا مرتبط مباشرة بالثغرة الموضحة في القسم 7 أدناه — الواجهة تسد هذه الفجوة حالياً بحل محلي غير آمن بدل استدعاء Supabase Auth Admin API من مسار خادمي موثوق.

## 6. نظام تسجيل الدخول (كما يعمل فعلياً في الكود)

### 6.1 تدفق الدخول

1. المستخدم يفتح `/login` (`public/login.html`)، ويُحمَّل `public/js/login-app.js` كوحدة ES.
2. عند الإرسال، `handleSignInSubmit()` يستدعي `signInStaff(email, password)` من `public/js/staff-auth.js`.
3. `signInStaff()` يحاول أولاً `supabase.auth.signInWithPassword()` (مصادقة حقيقية عبر Supabase Auth).
4. عند نجاح المصادقة، `loadStaffProfile(userId)` يقرأ صف الموظف من `public.staff_profiles` عبر RLS (السياسة "staff can read own profile" تسمح فقط بقراءة الصف الخاص بالمستخدم نفسه، أو سياسات المدير المضافة في ترحيل 012 لرؤية كل الفريق).
5. إن لم يوجد صف بعد، يُستدعى `bootstrap_initial_owner()` كمحاولة أخيرة (لتفعيل أول مستخدم كمالك تلقائياً).
6. `resolveStaffDestination(profile, next)` يحدد الوجهة النهائية حسب الدور:
   - `owner` / `admin` → `/admin`
   - `roadside` (يشترط `branch_id`) → `/roadside/order`
   - `kitchen` → `/kitchen/{branch_slug}`
   - يحترم `?next=` فقط إذا كان مسموحاً لدور المستخدم (`sanitizeNextPath` يمنع فتح روابط خارجية أو حلقات إلى `/login` نفسها — حماية Open Redirect جيدة).
7. الحساب غير المفعّل (`is_active = false`) أو بدور غير معروف يُرفض فوراً، ويُنفَّذ `supabase.auth.signOut()` تلقائياً.
8. استرجاع كلمة المرور: `requestPasswordReset()` يستخدم `supabase.auth.resetPasswordForEmail()` برسالة عامة موحّدة (لا تكشف إن كان البريد مسجلاً أم لا — ممارسة أمان جيدة). عند العودة من رابط البريد (`type=recovery`)، تتحول الصفحة تلقائياً لعرض نموذج `updateStaffPassword()` الذي يستدعي `supabase.auth.updateUser({ password })`.
9. تسجيل الخروج (`signOutStaff`) في `/admin` و`/kitchen/{branch}` و`/roadside/order` ينهي جلسة Supabase Auth ويعيد التوجيه إلى `/login`.

### 6.2 توجيه الحماية على مستوى الصفحة

كل صفحة محمية (`admin.html`, `kitchen.html`, `roadside.html`) تتحقق من الجلسة بنفسها عند التحميل عبر `getStaffSession()`، ولا تعتمد فقط على إخفاء روابط في الواجهة — وهذا يطابق ما ينص عليه `architecture.md`. لكنه يبقى **تحققاً من جهة العميل فقط**، وتبقى RLS على قاعدة البيانات هي خط الدفاع الحقيقي إذا تجاوز أحدهم واجهة العميل.

## 7. ✅ ثغرتان أمنيتان حرجتان — وُجدتا وأُصلحتا في الكود (2026-09-26)

أثناء تحليل الكود الفعلي (وليس التوثيق) وُجد أن `public/js/staff-auth.js` كان يحتوي على **مسارين خطيرين** يتعارضان صراحة مع القيود المعتمدة في `AGENTS.md` و`architecture.md`، ومع تعليق الأمان الموثّق داخل قاعدة البيانات نفسها ("staff_profiles created/managed only by a trusted Supabase admin workflow"). تم إصلاح الاثنتين في الكود؛ التفاصيل أدناه للتوثيق ولفهم سبب التغييرات الحالية في `staff-auth.js` و`admin-app.js`.

### 7.1 باب خلفي (backdoor) ببيانات دخول ثابتة في كود يُشحن للمتصفح

```js
const isMasterOwner =
  cleanEmail === "cofebox8@gmail.com" && rawPassword === "Box@Cafe@76";
```

هذا السطر (وما يتبعه من إنشاء جلسة `owner` كاملة الصلاحيات محلياً) موجود بنص صريح داخل ملف JavaScript يصل إلى متصفح كل زائر عبر "عرض المصدر" (View Source). **أي شخص يقرأ ملف `staff-auth.js` يحصل على بريد وكلمة مرور المالك الكاملة**، بصرف النظر عن أي إعداد في Supabase. كذلك معرّف المستخدم `255f5365-931f-4505-8390-33d73d2b9653` مكتوب صراحة كمعرّف مميّز يُمنح دور `owner` تلقائياً في أكثر من مكان.

**الأثر:** تحكم كامل بلوحة الإدارة (المنيو، الأسعار، الطلبات، الموظفين) من طرف أي شخص اطّلع على ملف JS العام — وهو أمر لا يحتاج حتى اختراقاً، فقط فتح أدوات المطور في المتصفح.

### 7.2 حسابات موظفين وكلمات مرور مخزَّنة نصاً صريحاً في `localStorage`

الدوال `saveLocalStaffAccount` / `getLocalStaffAccounts` تحفظ الحساب (بما فيه **كلمة المرور كنص صريح غير مشفّر**) في `localStorage` تحت المفتاح `box_cofe_staff_accounts_v4`، وتُستخدم في `signInStaff()` كمسار تحقق بديل عن Supabase Auth بالكامل:

```js
const localStaff = getLocalStaffAccounts().find(
  a => a.email.toLowerCase() === cleanEmail && a.password === rawPassword
);
```

هذا يعني عملياً:

- إنشاء "حساب موظف" من تبويب الموظفين في لوحة الإدارة (`admin-app.js`, حقل `staff-password-input`) **لا يُنشئ مستخدم Supabase Auth حقيقياً على الإطلاق** — فقط يكتب سطراً في `localStorage` الخاص بمتصفح الجهاز الذي فتح لوحة الإدارة.
- هذا الحساب **لا يعمل من أي جهاز/متصفح آخر** غير الذي أُنشئ عليه (لأن `localStorage` غير مشترك بين الأجهزة)، وهو ما يفسر لماذا "إدارة الموظفين ما زالت يدوية" رغم وجود واجهة تبدو مكتملة.
- أي شخص يفتح أدوات المطور على نفس الجهاز يمكنه قراءة كل كلمات مرور الموظفين المخزّنة نصاً صريحاً، أو تعديل الحقل مباشرة لمنح نفسه أي دور (`owner` مثلاً) عبر `LOCAL_SESSION_KEY`.
- هذا يخالف صراحة القرار الموثّق في `product-review.md`: *"دخول PIN في واجهة الإدارة وبيانات PIN المحلية ليست مصادقة أو تفويضاً"* — وهذا النظام أسوأ من PIN لأنه يخزّن كلمات مرور حقيقية.

### 7.3 الإصلاح المطبَّق

- أُزيل الباب الخلفي (`isMasterOwner`) والمعرّف الثابت المميّز (`255f5365-931f-4505-8390-33d73d2b9653`) بالكامل من `public/js/staff-auth.js`. حساب المالك يُنشأ ويُصادَق عليه حصراً عبر Supabase Auth الحقيقي، أو عبر `bootstrap_initial_owner()` (RPC آمنة ترفض أي طلب إن وُجد مالك مسبقاً — الترحيل 011).
- أُزيل كامل مسار `localStorage` (`STAFF_STORAGE_KEY`, `LOCAL_SESSION_KEY`, `saveLocalStaffAccount`, `getLocalStaffAccounts`, `toggleLocalStaffAccount`, `deleteLocalStaffAccount`) من `staff-auth.js`، وكذلك نسخة قديمة مماثلة كانت غير مستخدَمة أصلاً في `public/js/demo-data.js` (تعتمد PIN افتراضي `"0000"`) — حُذفت نهائياً. كل ملف من الملفين يُفرغ الآن أي مفتاح `localStorage` قديم من هذا النوع تلقائياً عند التحميل، لحذف كلمات المرور المخزَّنة سابقاً نصاً صريحاً من متصفحات من استخدم النظام قبل الإصلاح.
- أُضيفت **Edge Function** جديدة: [`supabase/functions/admin-manage-staff/index.ts`](../supabase/functions/admin-manage-staff/index.ts)، تعمل حصراً على خادم Supabase وتستخدم `service_role` من جهة الخادم فقط (لا تُشحن أبداً للمتصفح). تتحقق من هوية المستدعي عبر JWT، ثم أنه `owner`/`admin` فعّال في نفس المطعم، ثم تنفّذ:
  - `action: "create"` — تنشئ مستخدم Supabase Auth حقيقياً (`auth.admin.createUser`) وتُدرج صف `staff_profiles` بمعاملة واحدة (مع تراجع تلقائي إن فشل إدراج الصف).
  - `action: "update"` — تعدّل الاسم/الدور/الفرع/الحالة، وتُغيّر كلمة المرور فقط إذا أُرسلت (تبقى فارغة = بلا تغيير). لا تسمح بتعديل حساب `owner` ولا بتعطيل حساب المستخدم لنفسه.
  - `action: "delete"` — تحذف مستخدم Auth فعلياً (`auth.admin.deleteUser`)، وينحذف صف `staff_profiles` تلقائياً بالحذف المتسلسل. تمنع حذف `owner` أو حذف الحساب لنفسه.
  - دور `admin` الجديد يقتصر إنشاؤه/تعيينه على المالك (`owner`) فقط.
- عُدّل `public/js/admin-app.js`: تبويب الموظفين يقرأ القائمة الآن من `admin_get_staff()` RPC الحقيقي (وليس `localStorage`)، ويستدعي `admin-manage-staff` عبر `supabase.functions.invoke()` للإنشاء/التعديل/الحذف، ويستخدم `admin_toggle_staff_status()` RPC الموجودة أصلاً للتفعيل/التعطيل. حقل البريد الإلكتروني أصبح غير قابل للتعديل بعد الإنشاء لتفادي حالات حافة معقدة.

**إجراء وحيد متبقٍ على مسؤولية المالك (لا يمكن تنفيذه من الكود وحده):** نشر الدالة على مشروع Supabase الفعلي عبر Supabase CLI. الخطوات الكاملة في [`docs/supabase-first-run.md`](supabase-first-run.md). إلى حين النشر، سيظهر لتبويب الموظفين خطأ واضح ("تعذر الاتصال بدالة إدارة الموظفين... تأكد من نشرها") بدل أي سلوك وهمي أو غير آمن.

**مهم جداً:** بما أن بريد وكلمة مرور المالك (`cofebox8@gmail.com` / `Box@Cafe@76`) كانا مكتوبين صراحة في كود وصل سابقاً لكل من فتح الموقع، **يجب تغيير كلمة مرور هذا الحساب فوراً من Supabase Authentication → Users**، بصرف النظر عن نشر أي إصلاح كود.

## 8. الربط مع Supabase من المتصفح

- `public/js/config.js`: يحمل `SUPABASE_URL` و`SUPABASE_PUBLISHABLE_KEY` فقط (لا سر). القيم الحالية تشير إلى مشروع `rtzzoyaxivujzvghudgz.supabase.co`.
- `public/js/supabase-client.js`: يبني عميل Supabase عبر `createClient()`، إما من `window.supabase` (لو مضمّن بـ `<script>` عادي) أو بالاستيراد الديناميكي من `https://esm.sh/@supabase/supabase-js@2` مع مهلة سقوط (timeout) ثانيتين وسقوط آمن (fallback) إذا تعذّر تحميل CDN. يفعّل `persistSession`, `autoRefreshToken`, `detectSessionInUrl` (الأخير ضروري لروابط استرجاع كلمة المرور).
- `isSupabaseConfigured` يتحقق أن الرابط والمفتاح ليسا قيماً افتراضية (placeholder) قبل اعتبار Supabase جاهزاً؛ إن لم يكن جاهزاً تُعرض رسائل خطأ عربية واضحة بدل فشل صامت.

## 9. اللحظية (Realtime)

القنوات الحالية تعتمد `postgres_changes` على جدول `orders` فقط:

| القناة | الملف | النطاق |
|---|---|---|
| `kitchen-orders-{branchSlug}` | `kitchen-app.js` | كل تغييرات `orders` (event: `*`)، ثم تُصفّى محلياً حسب الفرع عبر إعادة الجلب من `get_kitchen_orders` |
| `box-coffee-admin-orders` | `admin-app.js` | تغييرات `orders` لتحديث سجل الطلبات في لوحة الإدارة |

RLS يقيّد ما يصل فعلياً عبر القناة بصلاحية الفرع للمستخدم المصادق. عند فشل الاتصال أو انقطاعه، الاعتماد هو على إعادة الجلب (polling/refetch) عند استعادة الاتصال أو عودة التبويب — وليس على `BroadcastChannel` أو `localStorage`، فهذان الأخيران مخصّصان للمعاينة المحلية فقط حسب القرار الموثق في `architecture.md`.

## 10. إدارة المنتجات والمنيو (كيف تُضاف الأصناف فعلياً)

تبويب "المنيو" في `/admin` (`tab-menu`) متصل بالكامل بـ Supabase عبر:

1. `admin_get_menu()` — يجلب كل الأقسام والمنتجات لإدارتها.
2. `admin_save_category(...)` — إنشاء/تعديل قسم (`id` فارغ = إنشاء).
3. `uploadMenuProductImage(file)` — يرفع الصورة إلى Supabase Storage bucket باسم `menu-product-images` عبر `supabase.storage.from(...).upload()`، ثم يُستخرج رابط عام بـ `getPublicUrl()`.
4. `admin_save_menu_product(...)` — يحفظ الاسم والوصف والسعر والتوفر ورابط الصورة ومجموعة الخيارات.
5. `admin_toggle_product_availability(...)` — تبديل حالة التوفر بضغطة واحدة.
6. `admin_delete_product(product_id)` — حذف صنف.

هذا المسار **حقيقي وآمن** (يمر عبر RPC بصلاحية `SECURITY DEFINER` مقيّدة بدور المالك/المدير)، على عكس مسار إضافة الموظفين الموصوف في القسم 7. بمعنى: **"إضافة منتج" تعمل فعلياً وتُحفظ في قاعدة الإنتاج**، أما **"إضافة حساب" فلا تُنشئ حساب دخول حقيقياً بعد**.

## 11. إدارة الحسابات (الموظفين) — الحالة الفعلية اليوم

| الوظيفة في الواجهة | متصلة بـ Supabase فعلياً؟ | التفاصيل |
|---|---|---|
| عرض قائمة الموظفين | ✅ نعم | عبر `admin_get_staff()` |
| تفعيل/تعطيل موظف موجود | ✅ نعم | عبر `admin_toggle_staff_status()` |
| إنشاء موظف جديد بكلمة مرور | ✅ نعم (بعد نشر الدالة) | عبر Edge Function `admin-manage-staff` (`action: "create"`) — تُنشئ مستخدم Supabase Auth حقيقياً |
| تعديل موظف (اسم/دور/فرع/حالة/كلمة مرور) | ✅ نعم (بعد نشر الدالة) | نفس الدالة، `action: "update"` |
| حذف حساب موظف نهائياً | ✅ نعم (بعد نشر الدالة) | نفس الدالة، `action: "delete"` |

**شرط أساسي:** الدالة `supabase/functions/admin-manage-staff` يجب أن تكون **منشورة** على مشروع Supabase قبل عمل الإنشاء/التعديل/الحذف من الواجهة (راجع خطوات النشر في [`docs/supabase-first-run.md`](supabase-first-run.md)). عرض القائمة والتفعيل/التعطيل يعملان فوراً بلا حاجة لنشر أي شيء إضافي لأنهما RPC عاديتان مطبَّقتان أصلاً في الترحيل 012.

خطوة التأسيس الأولى لحساب المالك نفسه تبقى يدوية عبر لوحة تحكم Supabase (Authentication → Users) ثم `staff_profiles`، أو تلقائياً عبر `bootstrap_initial_owner()` عند أول دخول إن لم يوجد مالك بعد — كما هو مفصّل في [`docs/supabase-first-run.md`](supabase-first-run.md).

## 12. تدفق الطلب من البداية للنهاية (ملخص تقني)

1. **زبون QR:** `menu.html``get_customer_menu()` (قراءة عامة) → `place_customer_order()` (معاملة تتحقق من التوفر/الخيارات وتحسب السعر من القاعدة، تمنع تكرار الإرسال) → `get_customer_order_status()` للتتبع عبر رمز عام.
2. **موظف الشارع:** `roadside.html` بعد دخول بدور `roadside` → `place_roadside_order()` (نفس منطق التحقق والتسعير، مربوط بفرع الموظف وهويته).
3. **المطبخ:** `kitchen.html``get_kitchen_orders(branch_slug)` + قناة Realtime `kitchen-orders-{branch}` → `update_kitchen_order_status()` ينقل الحالة ضمن `new/confirmed → preparing → ready` مع تسجيل الحدث في `order_status_events`.
4. **الإدارة:** `admin_get_recent_orders()` لعرض آخر 24 ساعة + قناة `box-coffee-admin-orders` للتحديث اللحظي.

حالات الطلب في المخطط: `new`, `confirmed`, `preparing`, `ready`, `handed_off`, `cancelled`. من يملك صلاحية "تم التسليم" (`handed_off`) ما زال قراراً مفتوحاً حسب `architecture.md`.

## 13. نقاط الخدمة و QR

- إدارة كاملة من تبويب الموظفين/نقاط الخدمة في `/admin`: `admin_get_service_points()`, `admin_save_service_point()`, `admin_rotate_service_point_qr()`.
- كل نقطة خدمة لها `qr_token` عشوائي (UUID) فريد، يفتح `/menu/{branch-slug}/{qr_token}`.
- تدوير الرمز يُبطل الرمز القديم فوراً؛ يجب طباعة QR جديد بعد كل تدوير.
- **شرط أساسي:** ترحيل `202609260010_admin_service_point_qr.sql` يجب أن يكون مطبّقاً على مشروع Supabase قبل ظهور هذه الأدوات في الواجهة.

## 14. النشر (Vercel)

- المستودع: `mustafambusiness-maker/box-cofe-web` (GitHub خاص).
- الرابط المنشور: `https://box-cofe-web.vercel.app`.
- لا يوجد أمر `build` أو `install` — Vercel يخدم `public/` كما هو.
- كل دفعة (`push`) إلى `main` تُعيد النشر تلقائياً؛ لا توجد بيئة staging منفصلة موثقة حتى الآن.

## 15. الحالة التشغيلية والفجوات المعروفة (بخلاف القسم 7)

- **الكاشير (`tab-pos`) والمحاسبة (`tab-accounting`)** في لوحة الإدارة ما زالا يستخدمان بيانات محلية/تجريبية (`demo-data.js` جزئياً) — **لا تُستخدم في البيع الفعلي أو الحسابات الحقيقية** حتى تُوصَل بجداول ودوال Supabase مخصّصة (غير موجودة بعد).
- ملخص الإيرادات الحالي مجموع قيم الطلبات فقط؛ لا يوجد عمود لوسيلة الدفع في المخطط، فلا يصح اعتباره تقرير تحصيل أو ربح صافٍ.
- القرارات التالية ما زالت مفتوحة رسمياً في `architecture.md` ولم تُحسم بالكود: طريقة الدفع عند الاستلام، من ينهي الطلب بـ"تم التسليم"، قواعد الخيارات الإلزامية لكل منتج، هوية العلامة النهائية (شعار/ألوان).
- منيو الإنتاج يبدأ فارغاً بقرار معتمد؛ لا تُنشر QR للعملاء قبل إضافة أصناف حقيقية واختبار نقطة خدمة فعلية وحساب موظف حقيقي (وليس محلياً) — وهذا الشرط الأخير معلّق فعلياً بسبب القسم 7.

## 16. مرجع سريع (Cheat Sheet)

- **تطبيق الترحيلات لأول مرة:** بالترتيب الرقمي 001 → 012 من SQL Editor في Supabase، دون إعادة تنفيذ ما طُبّق مسبقاً (راجع القسم 5.2).
- **إنشاء حساب مالك آمن:** Authentication → Users في Supabase (بريد + كلمة مرور حقيقيان) ثم إدراج صف في `staff_profiles` بـ `role = 'owner'` — وليس عبر تبويب الموظفين حالياً.
- **إضافة منتج:** تبويب "المنيو" في `/admin` — يعمل فعلياً ومباشرة مع القاعدة.
- **إضافة موظف:** انشر `supabase functions deploy admin-manage-staff` أولاً (مرة واحدة)، ثم استخدم تبويب "الموظفين" في `/admin` مباشرة — ينشئ حساب Supabase Auth حقيقياً.
- **رابط الموقع:** `https://box-cofe-web.vercel.app` — **غيّر كلمة مرور `cofebox8@gmail.com` من Supabase الآن** لأنها كانت مكتوبة سابقاً في كود عام (انظر القسم 7.3)، بصرف النظر عن حالة النشر.
