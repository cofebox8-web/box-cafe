import {
  roleLabel,
  getStaffSession,
  signInStaff,
  signOutStaff
} from './staff-auth.js';
import { supabase, isSupabaseConfigured } from './supabase-client.js';

const syncChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('box_coffee_kitchen_sync')
  : null;

const PAGE_METADATA = {
  hub: {
    title: 'الرئيسية',
    subtitle: 'نظرة سريعة على المبيعات والوصول المباشر لأقسام النظام'
  },
  overview: {
    title: 'الإحصائيات وجرد كم انباع',
    subtitle: 'تقارير المبيعات التفصيلية وعدد الأكواب والقطع المباعة من كل مشروب'
  },
  accounting: {
    title: 'الحسابات والمصروفات',
    subtitle: 'سجل الفواتير وصندوق المصروفات اليومية'
  },
  menu: {
    title: 'المنيو',
    subtitle: 'إدارة المنتجات، الأسعار، الصور، والخيارات الإضافية'
  },
  staff: {
    title: 'الموظفون',
    subtitle: 'إدارة حسابات طاقم العمل والصلاحيات'
  }
};

// Production admin state comes from Supabase only. Local demo storage must not
// become a second source of truth for the catalog shown to staff or customers.
let menuData = { restaurant: { name: 'بوكس كافي', currency_code: 'IQD' }, categories: [], products: [] };
let liveOrders = [];
let liveExpenses = [];
let staffAccounts = [];
let adminProfile = null;
let adminWorkspaceMounted = false;
let adminOrdersChannel = null;
let adminMenuChannel = null;
let adminMenuRefreshTimer = null;
let servicePointBranches = [];
let servicePoints = [];
let activeQrPoint = null;

let activeTab = 'hub';
let selectedPosCategory = 'all';
let selectedAdminCategory = 'all';
let posCart = [];
let posPaymentMethod = 'cash';

function formatIQD(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('en-US')} د.ع`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function showToast(message) {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(window.__adminToastTimer);
  window.__adminToastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

// بديل بصري متسق مع تصميم الموقع لـ window.confirm() الافتراضي بالمتصفح
// (كان يتصرف أحياناً بشكل غير متوقع مع الإجراءات غير المتزامنة — أول ضغطة
// لا تُظهره أحياناً وتحتاج ضغطة ثانية).
function confirmAction(message, { title = 'تأكيد الإجراء', confirmText = 'تأكيد' } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm-action');
    const titleEl = document.getElementById('confirm-action-title');
    const msgEl = document.getElementById('confirm-action-message');
    const confirmBtn = document.getElementById('confirm-action-confirm-btn');
    const cancelBtn = document.getElementById('confirm-action-cancel-btn');
    if (!modal || !msgEl || !confirmBtn || !cancelBtn) {
      resolve(window.confirm(message));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    msgEl.textContent = message;
    confirmBtn.textContent = confirmText;

    const cleanup = (result) => {
      modal.hidden = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdropClick);
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdropClick = (e) => { if (e.target === modal) cleanup(false); };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdropClick);
    modal.hidden = false;
    confirmBtn.focus();
  });
}

async function reloadAdminMenu() {
  if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_get_menu');
  if (error || !data?.success) {
    throw new Error(data?.message || data?.error || error?.message || 'تعذر تحميل المنيو من قاعدة البيانات.');
  }
  menuData = {
    restaurant: { name: 'بوكس كافي', currency_code: 'IQD' },
    restaurant_id: data.restaurant_id,
    categories: Array.isArray(data.categories) ? data.categories : [],
    products: Array.isArray(data.products) ? data.products : []
  };
  renderMenuControlBoxes();
  renderPosTerminal();
  renderAllOverviewAndHubBoxes();
}

async function reloadAdminOrders() {
  if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_get_recent_orders', {
    p_hours: 24,
    p_limit: 150
  });
  if (error || !data?.success) {
    throw new Error(data?.message || data?.error || error?.message || 'تعذر تحميل سجل الطلبات من قاعدة البيانات.');
  }
  liveOrders = Array.isArray(data.orders) ? data.orders : [];
  renderAccountingBoxes();
  renderAllOverviewAndHubBoxes();
}

function servicePointErrorMessage(code) {
  return {
    NOT_AUTHORIZED: 'لا تملك صلاحية إدارة نقاط الخدمة.',
    BRANCH_NOT_ALLOWED: 'لا تملك صلاحية على هذا الفرع.',
    INVALID_LABEL: 'اسم نقطة الخدمة غير صالح (بين 1 و80 حرفاً).',
    INVALID_KIND: 'نوع نقطة الخدمة غير صالح.',
    BRANCH_NOT_FOUND: 'الفرع المحدد غير موجود أو غير مفعّل.',
    SERVICE_POINT_NOT_FOUND: 'تعذر إيجاد نقطة الخدمة.',
    DUPLICATE_LABEL: 'يوجد بالفعل نقطة خدمة بنفس الاسم في هذا الفرع.'
  }[code] || 'تعذر تنفيذ العملية. حاول مرة أخرى.';
}

let servicePointsLoaded = false;

// مصدر الحقيقة الوحيد هو قاعدة البيانات؛ لا تخزين محلي ولا رموز QR وهمية،
// لأن أي رمز لا يطابق ما في car_service_points فعلياً سيفشل عند أي زبون يمسحه.
async function reloadServicePoints() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('تعذر الاتصال بقاعدة البيانات.');
  }
  const { data, error } = await supabase.rpc('admin_get_service_points');
  if (error) throw error;
  if (!data?.success) {
    throw new Error(servicePointErrorMessage(data?.error));
  }
  servicePointBranches = Array.isArray(data.branches) ? data.branches : [];
  servicePoints = Array.isArray(data.service_points) ? data.service_points : [];
  servicePointsLoaded = true;
  renderServicePoints();
}

function getServicePointMenuUrl(point) {
  return `${window.location.origin}/menu/${encodeURIComponent(point.branch_slug)}/${encodeURIComponent(point.qr_token)}`;
}

function renderServicePoints() {
  const grid = document.getElementById('service-points-grid');
  if (!grid) return;
  if (!servicePoints.length) {
    const emptyMsg = servicePointsLoaded
      ? 'لا توجد نقاط خدمة بعد. أضف أول نقطة ثم اطبع QR لعرض المنيو للزبائن.'
      : 'جارٍ تحميل نقاط الخدمة…';
    grid.innerHTML = `<div class="menu-empty-state">${emptyMsg}</div>`;
    return;
  }
  grid.innerHTML = servicePoints.map((point) => `
    <article class="service-point-card">
      <div class="service-point-card-top">
        <div><strong>${escapeHtml(point.label)}</strong><small>${escapeHtml(point.branch_name)} · ${point.kind === 'pickup_point' ? 'نقطة استلام' : 'مسار طلب سيارات'}</small></div>
        <span class="service-point-status ${point.is_active ? 'is-active' : ''}">${point.is_active ? 'مفعلة' : 'متوقفة'}</span>
      </div>
      <div class="service-point-card-actions">
        <button type="button" class="box-btn-primary" data-show-service-qr="${escapeHtml(point.id)}" ${point.is_active ? '' : 'disabled'}>عرض وطباعة QR</button>
        <button type="button" class="box-btn-secondary" data-edit-service-point="${escapeHtml(point.id)}">تعديل</button>
        <button type="button" class="box-btn-secondary" data-toggle-service-point="${escapeHtml(point.id)}">${point.is_active ? 'إيقاف' : 'تفعيل'}</button>
        <button type="button" class="box-btn-danger-sm" data-rotate-service-qr="${escapeHtml(point.id)}">تدوير QR</button>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-show-service-qr]').forEach((button) => button.addEventListener('click', () => {
    const point = servicePoints.find((item) => item.id === button.dataset.showServiceQr);
    if (point) showServicePointQr(point);
  }));
  grid.querySelectorAll('[data-edit-service-point]').forEach((button) => button.addEventListener('click', () => {
    const point = servicePoints.find((item) => item.id === button.dataset.editServicePoint);
    if (point) openServicePointModal(point);
  }));
  grid.querySelectorAll('[data-toggle-service-point]').forEach((button) => button.addEventListener('click', async () => {
    const point = servicePoints.find((item) => item.id === button.dataset.toggleServicePoint);
    if (!point) return;
    button.disabled = true;
    try {
      await saveServicePoint({ ...point, is_active: !point.is_active });
    } finally {
      button.disabled = false;
    }
  }));
  grid.querySelectorAll('[data-rotate-service-qr]').forEach((button) => button.addEventListener('click', async () => {
    const point = servicePoints.find((item) => item.id === button.dataset.rotateServiceQr);
    if (!point) return;
    if (!(await confirmAction(`تدوير رمز QR لـ «${point.label}»؟ الرمز القديم سيتوقف فوراً.`, { title: 'تدوير رمز QR', confirmText: 'تدوير الرمز' }))) return;
    try {
      const { data, error } = await supabase.rpc('admin_rotate_service_point_qr', { p_service_point_id: point.id });
      if (error) throw error;
      if (!data?.success) throw new Error('تعذر تدوير رمز QR.');
      await reloadServicePoints();
      showToast('تم تدوير الرمز. اطبع QR الجديد واستبدل النسخة السابقة.');
    } catch (error) {
      showToast(error.message || 'تعذر تدوير رمز QR.');
    }
  }));
}

async function openServicePointModal(point = null) {
  const modal = document.getElementById('modal-service-point');
  const branchSelect = document.getElementById('service-point-branch');
  if (!servicePointBranches.length && isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('branches').select('id, name, slug').eq('is_active', true).order('name');
      if (!error && Array.isArray(data) && data.length) {
        servicePointBranches = data;
      }
    } catch (err) {
      console.warn('Fallback branch query failed:', err);
    }
  }
  if (!servicePointBranches.length) {
    showToast('لا يوجد فرع متاح لهذا الحساب. تحقق من تفعيل الفرع وصلاحية الحساب.');
    return;
  }
  branchSelect.innerHTML = servicePointBranches.map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join('');
  document.getElementById('service-point-modal-title').textContent = point ? 'تعديل نقطة الخدمة' : 'إضافة نقطة خدمة';
  document.getElementById('service-point-id').value = point?.id || '';
  branchSelect.value = point?.branch_id || servicePointBranches[0].id;
  branchSelect.disabled = Boolean(point);
  upgradeSelectToCustomDropdown(branchSelect);
  const branchTrigger = branchSelect.closest('.custom-select-wrapper')?.querySelector('.custom-select-trigger');
  if (branchTrigger) branchTrigger.disabled = Boolean(point);
  document.getElementById('service-point-label').value = point?.label || '';
  document.getElementById('service-point-kind').value = point?.kind || 'order_lane';
  document.getElementById('service-point-active').checked = point ? Boolean(point.is_active) : true;
  modal.hidden = false;
}

// حرج: لا تُظهر "تم الحفظ" ولا تعرض QR إلا بعد تأكيد قاعدة البيانات فعلياً،
// وبرمز QR الحقيقي الذي تولّده هي (qr_token يُنشأ حصراً داخل Supabase).
// أي رمز يُخترع محلياً في المتصفح لن يطابق car_service_points، فيفشل على
// أي زبون يمسحه فعلياً.
async function saveServicePoint(point) {
  const cleanLabel = String(point.label || '').trim();
  if (!cleanLabel) {
    showToast('أدخل اسماً أو رقماً لنقطة الخدمة.');
    return false;
  }
  if (!isSupabaseConfigured || !supabase) {
    showToast('تعذر الاتصال بقاعدة البيانات؛ لم تُحفظ نقطة الخدمة.');
    return false;
  }

  try {
    const { data, error } = await supabase.rpc('admin_save_service_point', {
      p_service_point_id: point.id || null,
      p_branch_id: point.branch_id,
      p_label: cleanLabel,
      p_kind: point.kind || 'order_lane',
      p_is_active: point.is_active !== false
    });
    if (error) throw error;
    if (!data?.success) throw new Error(servicePointErrorMessage(data?.error));

    await reloadServicePoints();
    showToast('تم حفظ نقطة الخدمة بنجاح في قاعدة البيانات.');
    return true;
  } catch (err) {
    showToast(err.message || 'تعذر حفظ نقطة الخدمة في قاعدة البيانات.');
    return false;
  }
}

function showServicePointQr(point) {
  if (typeof window.QRCode !== 'function') {
    showToast('تعذر تحميل مكتبة إنشاء QR. أعد تحميل الصفحة وحاول مجدداً.');
    return;
  }
  activeQrPoint = point;
  const url = getServicePointMenuUrl(point);
  document.getElementById('qr-point-title').textContent = point.label;
  document.getElementById('qr-point-branch').textContent = point.branch_name;
  document.getElementById('qr-menu-link').href = url;
  document.getElementById('qr-menu-link').textContent = url;
  const qr = document.getElementById('service-point-qr');
  qr.replaceChildren();
  new window.QRCode(qr, { text: url, width: 240, height: 240, colorDark: '#17131e', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
  document.getElementById('modal-qr-preview').hidden = false;
}

function subscribeAdminOrders() {
  if (!supabase || adminOrdersChannel) return;
  adminOrdersChannel = supabase.channel('box-coffee-admin-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      reloadAdminOrders().catch((error) => showToast(error.message || 'تعذر تحديث سجل الطلبات.'));
    })
    .subscribe((status) => {
      // انقطاع مؤقت لا يحتاج إزعاج المستخدم؛ يعيد الاتصال تلقائياً بصمت
      // (Supabase يعيد الاشتراك من تلقاء نفسه، ولا حاجة لتحديث يدوي).
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.debug('Admin orders realtime disconnected temporarily:', status);
      }
    });
}

function scheduleAdminMenuRefresh() {
  window.clearTimeout(adminMenuRefreshTimer);
  adminMenuRefreshTimer = window.setTimeout(() => {
    reloadAdminMenu().catch((error) => showToast(error.message || 'تعذر تحديث المنيو لحظياً.'));
  }, 250);
}

function subscribeAdminMenu() {
  if (!supabase || adminMenuChannel) return;
  adminMenuChannel = supabase.channel('box-coffee-admin-menu')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, scheduleAdminMenuRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_products' }, scheduleAdminMenuRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_option_groups' }, scheduleAdminMenuRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_option_items' }, scheduleAdminMenuRefresh)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.debug('Admin menu realtime disconnected temporarily:', status);
      }
    });
}

async function saveAdminMenuCategory(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return;
  if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_save_category', {
    p_category_id: null,
    p_name: cleanName,
    p_description: null
  });
  if (error || !data?.success) {
    throw new Error(data?.message || data?.error || error?.message || 'تعذرت إضافة القسم إلى قاعدة البيانات.');
  }
  await reloadAdminMenu();
}

async function saveAdminMenuProduct(product) {
  if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_save_menu_product', {
    p_product_id: product.id || null,
    p_category_id: product.category_id,
    p_name: product.name,
    p_description: product.description || null,
    p_price: product.price,
    p_image_url: product.image_url || null,
    p_is_available: product.is_available,
    p_option_groups: product.option_groups || []
  });
  if (error || !data?.success) {
    throw new Error(data?.message || data?.error || error?.message || 'تعذر حفظ المنتج في قاعدة البيانات.');
  }
  await reloadAdminMenu();
}

function renderOptionGroupsEditor(groups = []) {
  const root = document.getElementById('item-option-groups');
  if (!root) return;
  root.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'option-groups-empty';
    empty.innerHTML = `
      <div class="option-empty-icon-wrap">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <strong>لا توجد مجموعات خيارات لهذا المنتج</strong>
      <small>أضف مجموعة خيارات إذا كان للمنتج أحجام (صغير / وسط / كبير) أو خيارات مخصصة كنوع الحليب والإضافات.</small>
    `;
    root.append(empty);
    updateOptionGroupsMeta(0);
    return;
  }
  groups.forEach((group = {}, groupIndex) => {
    const card = document.createElement('div');
    card.className = 'option-group-editor';
    card.dataset.groupIndex = String(groupIndex);
    card.innerHTML = `
      <div class="option-group-editor-head">
        <div class="option-group-title-wrap">
          <span class="option-group-number">${String(groupIndex + 1).padStart(2, '0')}</span>
          <div>
            <strong>مجموعة الخيارات ${groupIndex + 1}</strong>
            <small>حدد طريقة الاختيار ثم أضف الخيارات وأسعارها</small>
          </div>
        </div>
        <button type="button" class="group-remove-pill" data-remove-group aria-label="حذف المجموعة" title="حذف هذه المجموعة">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>حذف المجموعة</span>
        </button>
      </div>
      <div class="form-two-boxes">
        <div class="field-box">
          <label>اسم المجموعة <span class="required-mark">*</span></label>
          <input type="text" class="structured-input" data-group-name maxlength="80" placeholder="مثال: الحجم، نوع الحليب" />
          <small class="field-help">يظهر كعنوان للمجموعة عند الطلب.</small>
        </div>
        <div class="field-box">
          <label>طريقة الاختيار <span class="required-mark">*</span></label>
          <select class="structured-input" data-group-type>
            <option value="single">اختيار واحد فقط (كالحجم)</option>
            <option value="multiple">اختيارات متعددة (كالإضافات)</option>
          </select>
          <small class="field-help">واحد للحجم، ومتعدد للإضافات والنكهات.</small>
        </div>
      </div>
      <label class="option-required-card">
        <input type="checkbox" data-group-required />
        <div class="required-card-info">
          <strong>إلزام الزبون بالاختيار من هذه المجموعة</strong>
          <small>لن يكتمل الطلب في المنيو بدون تحديد أحد الخيارات</small>
        </div>
      </label>
      <div class="option-rows-heading">
        <span>اسم الخيار</span>
        <span>السعر الإضافي</span>
        <span class="sr-spacer" aria-hidden="true"></span>
      </div>
      <div class="option-rows" data-option-rows></div>
      <button type="button" class="option-add-row-btn" data-add-option>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        <span>إضافة خيار جديد للمجموعة</span>
      </button>`;
    card.querySelector('[data-group-name]').value = group.name || '';
    card.querySelector('[data-group-type]').value = group.selection_type === 'multiple' ? 'multiple' : 'single';
    card.querySelector('[data-group-required]').checked = Boolean(group.is_required);
    const rows = card.querySelector('[data-option-rows]');
    const options = Array.isArray(group.options) && group.options.length ? group.options : [{}];
    options.forEach((option) => appendOptionRow(rows, option));
    root.append(card);
  });
  updateOptionGroupsMeta(groups.length);
}

function updateOptionGroupsMeta(count = document.querySelectorAll('#item-option-groups .option-group-editor').length) {
  const badge = document.getElementById('option-groups-count');
  if (badge) badge.textContent = `${count} ${count === 1 ? 'مجموعة' : 'مجموعات'}`;
}

function appendOptionRow(container, option = {}) {
  const row = document.createElement('div');
  row.className = 'option-editor-row';
  row.innerHTML = `
    <div class="option-name-cell">
      <input type="text" class="structured-input" data-option-name maxlength="80" placeholder="مثال: حليب لوز" aria-label="اسم الخيار" />
    </div>
    <div class="option-price-cell">
      <input type="number" class="structured-input" data-option-price min="0" max="1000000" step="250" value="0" placeholder="0" aria-label="السعر الإضافي بالدينار" />
      <span>د.ع</span>
    </div>
    <button type="button" class="option-row-delete-btn option-remove-btn" data-remove-option aria-label="حذف الخيار" title="حذف الخيار">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;
  row.querySelector('[data-option-name]').value = option.name || '';
  row.querySelector('[data-option-price]').value = Number(option.price_modifier) || 0;
  container.append(row);
}

function readOptionGroupsFromForm(validate = false) {
  const groups = [...document.querySelectorAll('#item-option-groups .option-group-editor')].map((card) => {
    const selectionType = card.querySelector('[data-group-type]').value;
    const required = card.querySelector('[data-group-required]').checked;
    const options = [...card.querySelectorAll('.option-editor-row')].map((row) => ({
      name: row.querySelector('[data-option-name]').value.trim(),
      price_modifier: Number(row.querySelector('[data-option-price]').value) || 0,
      is_available: true,
      is_default: false
    })).filter((option) => option.name)
    return {
      name: card.querySelector('[data-group-name]').value.trim(),
      selection_type: selectionType,
      is_required: required,
      min_selections: required ? 1 : 0,
      max_selections: selectionType === 'multiple' ? Math.max(1, options.length) : 1,
      options
    };
  });
  if (validate) {
    if (groups.length > 12) throw new Error('يمكن إضافة 12 مجموعة خيارات كحد أقصى للصنف.');
    for (const group of groups) {
      if (!group.name || group.name.length > 80) throw new Error('أدخل اسماً صحيحاً لكل مجموعة خيارات.');
      if (!group.options.length || group.options.length > 30) throw new Error(`أضف من خيار إلى 30 خياراً في مجموعة «${group.name}».`);
      if (group.options.some((option) => option.price_modifier < 0 || option.price_modifier > 1000000)) {
        throw new Error(`تحقق من السعر الإضافي في مجموعة «${group.name}».`);
      }
    }
  }
  return groups;
}

async function uploadMenuProductImage(file) {
  if (!file) return document.getElementById('item-image-input').value.trim();
  if (!adminProfile?.restaurant_id) throw new Error('تعذر تحديد المطعم لرفع الصورة.');
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('اختر صورة بصيغة JPG أو PNG أو WebP أو AVIF.');
  if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 5 ميغابايت.');
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[file.type];
  const path = `${adminProfile.restaurant_id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('menu-product-images').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from('menu-product-images').getPublicUrl(path).data.publicUrl;
}

/* =========================================================
   إدارة القائمة الجانبية والتنقل بين الصفحات الـ 6 الثابتة
   ========================================================= */
function openSidebarDrawer() {
  const sidebar = document.getElementById('erp-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.hidden = false;
}

function closeSidebarDrawer() {
  const sidebar = document.getElementById('erp-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.hidden = true;
}

function switchFixedPage(tabId) {
  if (!PAGE_METADATA[tabId]) return;
  activeTab = tabId;

  document.querySelectorAll('.erp-fixed-page').forEach((page) => {
    page.classList.toggle('active', page.id === `tab-${tabId}`);
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  const titleEl = document.getElementById('current-page-title');
  const subEl = document.getElementById('current-page-subtitle');
  if (titleEl) titleEl.textContent = PAGE_METADATA[tabId].title;
  if (subEl) subEl.textContent = PAGE_METADATA[tabId].subtitle;

  closeSidebarDrawer();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* =========================================================
   محرك القوائم المنسدلة المخصصة الداكنة (وداعاً للقائمة البيضاء!)
   ========================================================= */
function upgradeSelectToCustomDropdown(selectEl) {
  if (!selectEl || selectEl.id === 'login-staff-select') return;

  let wrapper = selectEl.closest('.custom-select-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.style.display = 'none';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.innerHTML = `
      <span class="custom-select-trigger-text"></span>
      <span class="custom-select-arrow">▼</span>
    `;
    wrapper.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    wrapper.appendChild(menu);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectEl.disabled) return;
      const wasOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-select-wrapper.open').forEach((w) => w.classList.remove('open'));
      if (!wasOpen) wrapper.classList.add('open');
    });
  }

  const trigger = wrapper.querySelector('.custom-select-trigger');
  if (trigger) {
    trigger.disabled = selectEl.disabled;
    if (selectEl.disabled) {
      trigger.style.opacity = '0.55';
      trigger.style.cursor = 'not-allowed';
    } else {
      trigger.style.opacity = '';
      trigger.style.cursor = '';
    }
  }

  const triggerText = wrapper.querySelector('.custom-select-trigger-text');
  const menu = wrapper.querySelector('.custom-select-menu');
  const options = Array.from(selectEl.options || []);
  const selectedOpt = options.find((o) => o.value === selectEl.value) || options[0];

  if (triggerText) {
    triggerText.textContent = selectedOpt ? selectedOpt.textContent : 'اختر...';
  }

  if (menu) {
    menu.innerHTML = options.map((opt) => {
      const isSelected = opt.value === selectEl.value;
      const isDisabled = opt.disabled;
      return `
        <button type="button" class="custom-select-option ${isSelected ? 'selected' : ''}" data-opt-val="${opt.value}" ${isDisabled ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
          <span>${opt.textContent}</span>
          <span class="custom-option-check">✓</span>
        </button>
      `;
    }).join('');

    menu.querySelectorAll('.custom-select-option').forEach((optBtn) => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (optBtn.disabled) return;
        selectEl.value = optBtn.dataset.optVal;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        wrapper.classList.remove('open');
        upgradeSelectToCustomDropdown(selectEl);
      });
    });
  }
}

function upgradeAllSelects() {
  document.querySelectorAll('select.structured-input').forEach((sel) => {
    if (sel.id !== 'login-staff-select') {
      upgradeSelectToCustomDropdown(sel);
    }
  });
}

/* =========================================================
   حساب الإحصائيات وجرد المبيعات بالقطعة (كم انباع)
   ========================================================= */
function computeFinancialsAndSales() {
  staffAccounts = [];

  const validOrders = (liveOrders || []).filter((o) => o.status !== 'cancelled');
  let grossRevenue = 0;
  let cashRevenue = 0;
  let electronicRevenue = 0;
  let unclassifiedRevenue = 0;
  let totalItemsSold = 0;

  const salesByItemMap = new Map();

  (menuData.products || []).forEach((prod) => {
    const catObj = (menuData.categories || []).find((c) => c.id === prod.category_id);
    salesByItemMap.set(prod.name, {
      id: prod.id,
      name: prod.name,
      category: catObj ? catObj.name : 'مشروبات القهوة',
      unitPrice: Number(prod.price) || 0,
      qtySold: 0,
      revenue: 0
    });
  });

  validOrders.forEach((order) => {
    const orderTotal = Number(order.total || order.total_iqd) || 0;
    grossRevenue += orderTotal;
    const payMethod = order.payment_method || null;
    if (payMethod === 'cash') {
      cashRevenue += orderTotal;
    } else if (['card', 'zaincash'].includes(payMethod)) {
      electronicRevenue += orderTotal;
    } else {
      unclassifiedRevenue += orderTotal;
    }

    (order.items || []).forEach((line) => {
      const qty = Number(line.quantity || line.qty) || 1;
      const price = Number(line.unit_price || line.price_iqd) || 0;
      const lineTotal = qty * price;
      totalItemsSold += qty;

      const key = line.name || line.name_ar || 'صنف قهوة';
      if (!salesByItemMap.has(key)) {
        salesByItemMap.set(key, {
          id: key,
          name: key,
          category: 'طلبات مباشرة',
          unitPrice: price,
          qtySold: 0,
          revenue: 0
        });
      }
      const entry = salesByItemMap.get(key);
      entry.qtySold += qty;
      entry.revenue += lineTotal;
    });
  });

  const totalExpenses = (liveExpenses || []).reduce(
    (sum, exp) => sum + (Number(exp.amount || exp.amount_iqd) || 0),
    0
  );
  const netProfit = grossRevenue - totalExpenses;

  const rankedSales = Array.from(salesByItemMap.values()).sort(
    (a, b) => b.qtySold - a.qtySold || b.revenue - a.revenue
  );

  return {
    grossRevenue,
    netProfit,
    totalExpenses,
    cashRevenue,
    electronicRevenue,
    unclassifiedRevenue,
    totalItemsSold,
    ordersCount: validOrders.length,
    topItem: rankedSales[0] && rankedSales[0].qtySold > 0 ? rankedSales[0] : null,
    rankedSales
  };
}

function renderAllOverviewAndHubBoxes() {
  const stats = computeFinancialsAndSales();

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('hub-gross-revenue', formatIQD(stats.grossRevenue));
  setTxt('hub-orders-count', `${stats.ordersCount} طلب خلال آخر 24 ساعة`);
  setTxt('hub-net-profit', formatIQD(stats.netProfit));
  setTxt('hub-expenses-sub', `بعد طرح مصاريف: ${formatIQD(stats.totalExpenses)}`);
  setTxt('hub-items-sold', `${stats.totalItemsSold} كوب / قطعة`);
  setTxt('hub-top-item', stats.topItem ? `الأعلى: ${stats.topItem.name} (${stats.topItem.qtySold})` : 'الأعلى مبيعاً: —');
  setTxt('hub-cash-revenue', formatIQD(stats.grossRevenue));
  setTxt('hub-electronic-sub', `طريقة الدفع غير مسجلة: ${formatIQD(stats.unclassifiedRevenue)}`);

  // شارات الكردات الـ 6 في الصفحة الرئيسية
  setTxt('hub-badge-pos', `${(menuData.products || []).filter((p) => p.is_available !== false).length} صنف جاهز للبيع`);
  setTxt('hub-badge-sales', `${stats.totalItemsSold} قطعة خلال 24 ساعة`);
  setTxt('hub-badge-ledger', `${stats.ordersCount} فاتورة • ${liveExpenses.length} مصروف`);
  setTxt('hub-badge-menu', `${(menuData.products || []).length} صنف • ${(menuData.categories || []).length} أقسام`);
  setTxt('hub-badge-staff', 'حسابات موظفين محمية');

  setTxt('kpi-gross-revenue', formatIQD(stats.grossRevenue));
  setTxt('kpi-orders-count', `${stats.ordersCount} طلب خلال آخر 24 ساعة`);
  setTxt('kpi-net-profit', formatIQD(stats.netProfit));
  setTxt('kpi-expenses-sub', `إجمالي المصاريف المطروحة: ${formatIQD(stats.totalExpenses)}`);
  setTxt('kpi-items-sold', `${stats.totalItemsSold} كوب / قطعة`);
  setTxt('kpi-top-item', stats.topItem ? `الأعلى طلباً: ${stats.topItem.name} (${stats.topItem.qtySold})` : 'الأعلى طلباً: —');
  setTxt('kpi-cash-revenue', formatIQD(stats.grossRevenue));
  setTxt('kpi-electronic-sub', `طريقة الدفع غير مسجلة: ${formatIQD(stats.unclassifiedRevenue)}`);

  const searchQuery = (document.getElementById('sales-search-input')?.value || '').trim().toLowerCase();
  const container = document.getElementById('item-sales-table-body');
  if (!container) return;

  const filtered = stats.rankedSales.filter((row) =>
    !searchQuery ||
    row.name.toLowerCase().includes(searchQuery) ||
    row.category.toLowerCase().includes(searchQuery)
  );

  const maxRev = Math.max(...filtered.map((r) => r.revenue), 1);

  container.innerHTML = filtered.map((row, idx) => {
    const sharePct = stats.grossRevenue > 0
      ? Math.round((row.revenue / stats.grossRevenue) * 100)
      : 0;
    const barWidth = row.revenue > 0 ? Math.max(8, Math.round((row.revenue / maxRev) * 100)) : 4;

    return `
      <div class="sales-item-card">
        <div class="sales-card-head">
          <div class="sales-card-title-group">
            <span class="sales-rank-cell">#${idx + 1}</span>
            <div class="sales-name-cell">
              <strong>${row.name}</strong>
              <small>${row.category}</small>
            </div>
          </div>
          <span class="sales-qty-badge">انباع: ${row.qtySold} كوب/قطعة</span>
        </div>

        <div class="sales-metrics-strip">
          <div class="sales-metric-col">
            <span>سعر المفرد</span>
            <strong>${formatIQD(row.unitPrice)}</strong>
          </div>
          <div class="sales-metric-col">
            <span>إجمالي مبيعات الصنف</span>
            <strong style="color:#C084FC;">${formatIQD(row.revenue)}</strong>
          </div>
        </div>

        <div class="sales-share-cell">
          <div class="sales-bar-track">
            <div class="sales-bar-fill" style="width: ${barWidth}%"></div>
          </div>
          <span class="sales-share-pct">${sharePct}%</span>
        </div>
      </div>
    `;
  }).join('');
}

/* =========================================================
   الصفحة 03: نقطة البيع والكاشير (POS Register)
   ========================================================= */
function renderPosTerminal() {
  const pillsWrap = document.getElementById('pos-category-pills');
  const gridWrap = document.getElementById('pos-products-grid');
  if (!pillsWrap || !gridWrap) return;

  const categories = menuData.categories || [];
  pillsWrap.innerHTML = [
    `<button type="button" class="pos-cat-btn ${selectedPosCategory === 'all' ? 'active' : ''}" data-pos-cat="all">جميع الأصناف (${(menuData.products || []).filter((p) => p.is_available !== false).length})</button>`,
    ...categories.map((cat) => `
      <button type="button" class="pos-cat-btn ${selectedPosCategory === cat.id ? 'active' : ''}" data-pos-cat="${cat.id}">
        ${cat.name}
      </button>
    `)
  ].join('');

  pillsWrap.querySelectorAll('[data-pos-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPosCategory = btn.dataset.posCat;
      renderPosTerminal();
    });
  });

  const availableItems = (menuData.products || []).filter(
    (item) => item.is_available !== false && (selectedPosCategory === 'all' || item.category_id === selectedPosCategory)
  );

  gridWrap.innerHTML = availableItems.length ? availableItems.map((item) => {
    const cat = categories.find((c) => c.id === item.category_id);
    const inCartItem = posCart.find((c) => c.id === item.id);
    const qtyInCart = inCartItem ? inCartItem.qty : 0;
    const media = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}" class="pos-card-thumb" loading="lazy" />`
      : '<div class="pos-card-thumb pos-card-thumb-empty" aria-hidden="true"></div>';

    return `
      <div class="pos-product-card ${qtyInCart > 0 ? 'in-cart' : ''}" data-add-pos="${item.id}">
        <div class="pos-card-main">
          ${media}
          <div class="pos-card-meta">
            <span class="pos-tile-cat">${cat ? escapeHtml(cat.name) : 'صنف'}</span>
            <strong class="pos-tile-name">${escapeHtml(item.name)}</strong>
            <span class="pos-tile-price">${formatIQD(item.price)}</span>
          </div>
          ${qtyInCart > 0 ? `<span class="pos-card-qty-badge">×${qtyInCart}</span>` : ''}
        </div>
        ${qtyInCart > 0 ? `
          <div class="pos-card-stepper-compact">
            <button type="button" class="pos-step-btn-sm" data-pos-delta="-1" data-pos-id="${item.id}" title="تقليل">−</button>
            <span class="pos-step-count">${qtyInCart} بالفاتورة</span>
            <button type="button" class="pos-step-btn-sm" data-pos-delta="1" data-pos-id="${item.id}" title="زيادة">+</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('') : '<div class="menu-empty-state" role="status">ماكو أصناف مضافة حتى الآن.</div>';

  gridWrap.querySelectorAll('[data-add-pos]').forEach((el) => {
    el.addEventListener('click', () => {
      const item = (menuData.products || []).find((i) => i.id === el.dataset.addPos);
      if (!item) return;
      const existing = posCart.find((c) => c.id === item.id);
      if (existing) {
        existing.qty += 1;
      } else {
        posCart.push({
          id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          qty: 1
        });
      }
      renderPosTerminal();
    });
  });

  gridWrap.querySelectorAll('[data-pos-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.posId;
      const delta = Number(btn.dataset.posDelta);
      const target = posCart.find((c) => c.id === id);
      if (!target) return;
      target.qty += delta;
      if (target.qty <= 0) {
        posCart = posCart.filter((c) => c.id !== id);
      }
      renderPosTerminal();
    });
  });

  renderPosCart();
}

function getPosTotals() {
  const subtotal = posCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = Math.max(0, Number(document.getElementById('pos-discount-input')?.value) || 0);
  const netTotal = Math.max(0, subtotal - discount);
  const received = Number(document.getElementById('pos-received-input')?.value) || 0;
  const change = received > netTotal ? received - netTotal : 0;
  return { subtotal, discount, netTotal, received, change };
}

function renderPosCart() {
  const cartEl = document.getElementById('pos-cart-items');
  const totalEl = document.getElementById('pos-total-display');
  const changeEl = document.getElementById('pos-change-display');
  const badgeEl = document.getElementById('pos-cart-count-badge');
  const stickyCountEl = document.getElementById('pos-sticky-count');
  const stickyTotalEl = document.getElementById('pos-sticky-total');
  if (!cartEl) return;

  const totalCount = posCart.reduce((sum, item) => sum + item.qty, 0);
  if (badgeEl) badgeEl.textContent = String(totalCount);
  if (stickyCountEl) stickyCountEl.textContent = String(totalCount);

  if (posCart.length === 0) {
    cartEl.innerHTML = `<div style="color:#94A3B8;text-align:center;padding:22px 10px;font-size:0.78rem;">الفاتورة فارغة — اضغط على أي مشروب من القائمة لإضافته</div>`;
  } else {
    cartEl.innerHTML = posCart.map((item) => `
      <div class="pos-cart-row">
        <div class="pos-cart-row-info">
          <strong>${item.name}</strong>
          <small>${formatIQD(item.price * item.qty)} (${formatIQD(item.price)} × ${item.qty})</small>
        </div>
        <div class="pos-qty-controls">
          <button type="button" class="pos-qty-btn" data-cart-delta="1" data-cart-id="${item.id}">+</button>
          <strong>${item.qty}</strong>
          <button type="button" class="pos-qty-btn" data-cart-delta="-1" data-cart-id="${item.id}">−</button>
        </div>
      </div>
    `).join('');

    cartEl.querySelectorAll('[data-cart-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cartId;
        const delta = Number(btn.dataset.cartDelta);
        const target = posCart.find((c) => c.id === id);
        if (!target) return;
        target.qty += delta;
        if (target.qty <= 0) {
          posCart = posCart.filter((c) => c.id !== id);
        }
        renderPosTerminal();
      });
    });
  }

  const { netTotal, change } = getPosTotals();
  if (totalEl) totalEl.textContent = formatIQD(netTotal);
  if (changeEl) changeEl.textContent = formatIQD(change);
  if (stickyTotalEl) stickyTotalEl.textContent = formatIQD(netTotal);
}

function showThermalReceiptModal(orderObj, receivedAmount = 0, changeAmount = 0) {
  const receiptArea = document.getElementById('receipt-printable-area');
  const receiptModal = document.getElementById('modal-receipt-preview');
  if (!receiptArea || !receiptModal) return;

  const netTotal = Number(orderObj.total || orderObj.total_iqd) || 0;
  const pm = (orderObj.payment_method || 'cash').toUpperCase();

  receiptArea.innerHTML = `
    <div style="text-align:center;border-bottom:1px dashed #64748B;padding-bottom:8px;margin-bottom:8px;">
      <strong style="font-size:1.15rem;letter-spacing:0.15em;">EV CAFE</strong>
      <div>فاتورة كاشير رسمية • رقم ${orderObj.order_code}</div>
      <small>${new Date(orderObj.created_at || Date.now()).toLocaleTimeString('ar-IQ')} | ${orderObj.vehicle_note || 'فرع المطار'}</small>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;border-bottom:1px dashed #64748B;padding-bottom:8px;margin-bottom:8px;">
      ${(orderObj.items || []).map((item) => {
        const qty = Number(item.quantity || item.qty) || 1;
        const prc = Number(item.unit_price || item.price_iqd) || 0;
        return `
          <div style="display:flex;justify-content:space-between;">
            <span>${item.name || item.name_ar} × ${qty}</span>
            <strong>${formatIQD(prc * qty)}</strong>
          </div>
        `;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:800;">
      <span>المجموع الصافي:</span>
      <span>${formatIQD(netTotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#475569;">
      <span>الواصل (${pm}): ${formatIQD(receivedAmount || netTotal)}</span>
      <span>الباقي: ${formatIQD(changeAmount)}</span>
    </div>
  `;
  receiptModal.hidden = false;
}

function submitPosOrder() {
  if (posCart.length === 0) {
    showToast('يرجى اختيار صنف واحد على الأقل لإصدار الفاتورة');
    return;
  }
  showToast('إصدار فواتير الكاشير غير متاح حتى يتم ربطه بدالة الطلبات في Supabase. لم يتم تسجيل أي طلب.');
}

/* =========================================================
   الصفحة 04: الحسابات والمصاريف (Invoices & Expenses Cards)
   ========================================================= */
function renderAccountingBoxes() {
  const ordersWrap = document.getElementById('orders-ledger-body');
  const expensesWrap = document.getElementById('expenses-ledger-body');
  const expensesBanner = document.getElementById('expenses-total-banner');
  const sourceFilter = document.getElementById('filter-order-source')?.value || 'all';

  const validOrders = (liveOrders || []).filter((o) => o.status !== 'cancelled');
  const totalSales = validOrders.reduce((s, o) => s + (Number(o.total || o.total_iqd) || 0), 0);
  const totalExp = (liveExpenses || []).reduce((s, e) => s + (Number(e.amount || e.amount_iqd) || 0), 0);
  const netProfit = totalSales - totalExp;

  const salesEl = document.getElementById('acc-total-sales');
  if (salesEl) salesEl.textContent = formatIQD(totalSales);
  const expEl = document.getElementById('acc-total-expenses');
  if (expEl) expEl.textContent = formatIQD(totalExp);
  const profitEl = document.getElementById('acc-net-profit');
  if (profitEl) profitEl.textContent = formatIQD(netProfit);

  if (expensesBanner) {
    expensesBanner.textContent = totalExp > 0 ? `المجموع: ${formatIQD(totalExp)}` : '';
  }

  if (ordersWrap) {
    const filteredOrders = (liveOrders || []).filter(
      (o) => sourceFilter === 'all' || o.source === sourceFilter
    );

    ordersWrap.innerHTML = filteredOrders.length ? filteredOrders.map((order) => {
      const sourceLabel = order.source === 'roadside' ? 'الويتر' : 'QR';
      const statusLabels = {
        new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز',
        handed_off: 'تم التسليم', cancelled: 'ملغي'
      };
      const chipsHtml = (order.items || []).map(
        (i) => `<span class="invoice-item-chip">${escapeHtml(i.name || i.name_ar)} ×${Number(i.quantity || i.qty || 1)}</span>`
      ).join('');

      const timeStr = order.created_at ? new Date(order.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="invoice-card-box">
          <div class="invoice-card-head">
            <span class="invoice-code-badge">${escapeHtml(order.order_code)}</span>
            <span class="invoice-customer-name">${escapeHtml(order.vehicle_note || order.branch_name || 'فرع المطعم')} • ${sourceLabel}</span>
            <strong class="invoice-total-badge">${formatIQD(order.total || order.total_iqd)}</strong>
            <button type="button" class="box-btn-secondary" data-print-inv="${escapeHtml(order.order_code)}" style="height:26px;padding:0 8px;font-size:0.7rem;">طباعة</button>
          </div>
          <div class="invoice-items-chips">${chipsHtml}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-subtle);">
            <span class="inv-status-btn active" style="font-size:0.7rem;padding:2px 8px;border-radius:6px;">${escapeHtml(statusLabels[order.status] || order.status)}</span>
            <small style="font-size:0.68rem;color:var(--text-dim);">${timeStr}</small>
          </div>
        </div>
      `;
    }).join('') : '<div class="menu-empty-state" role="status">لا توجد طلبات</div>';

    ordersWrap.querySelectorAll('[data-print-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = (liveOrders || []).find((o) => o.order_code === btn.dataset.printInv);
        if (found) showThermalReceiptModal(found);
      });
    });
  }

  if (expensesWrap) {
    expensesWrap.innerHTML = (liveExpenses || []).length ? (liveExpenses || []).map((exp) => `
      <div class="record-item-box">
        <div class="record-box-main">
          <strong>${exp.title}</strong>
          <small>${exp.category || 'مصاريف تشغيلية'} • ${exp.time || ''}</small>
        </div>
        <div class="record-box-end">
          <span class="expense-amount-tag">− ${formatIQD(exp.amount || exp.amount_iqd)}</span>
          <button type="button" class="box-btn-danger-sm" data-del-expense="${exp.id}">حذف</button>
        </div>
      </div>
    `).join('') : '<div class="menu-empty-state" role="status">لا توجد مصروفات مسجلة</div>';

    expensesWrap.querySelectorAll('[data-del-expense]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast('إدارة المصروفات غير متاحة حتى يتم ربطها بجداول Supabase. لم يتغير أي سجل.');
      });
    });
  }
}

/* =========================================================
   الصفحة 05: إدارة الأصناف والأسعار (Menu & Pricing Cards)
   ========================================================= */
function renderMenuControlBoxes() {
  const catWrap = document.getElementById('admin-category-filter');
  const gridWrap = document.getElementById('admin-products-grid');
  const searchVal = (document.getElementById('admin-menu-search')?.value || '').trim().toLowerCase();
  if (!catWrap || !gridWrap) return;

  const categories = menuData.categories || [];
  catWrap.innerHTML = [
    `<button type="button" class="pos-cat-btn ${selectedAdminCategory === 'all' ? 'active' : ''}" data-adm-cat="all">جميع الأقسام (${(menuData.products || []).length})</button>`,
    ...categories.map((cat) => `
      <button type="button" class="pos-cat-btn ${selectedAdminCategory === cat.id ? 'active' : ''}" data-adm-cat="${cat.id}">
        ${cat.name}
      </button>
    `)
  ].join('');

  catWrap.querySelectorAll('[data-adm-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAdminCategory = btn.dataset.admCat;
      renderMenuControlBoxes();
    });
  });

  const filteredItems = (menuData.products || []).filter((item) => {
    const matchCat = selectedAdminCategory === 'all' || item.category_id === selectedAdminCategory;
    const matchSearch = !searchVal || item.name.toLowerCase().includes(searchVal);
    return matchCat && matchSearch;
  });

  gridWrap.innerHTML = filteredItems.length ? filteredItems.map((item) => {
    const cat = categories.find((c) => c.id === item.category_id);
    const isAvail = item.is_available !== false;
    const media = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}" class="menu-item-thumb" loading="lazy" />`
      : '<div class="menu-item-thumb menu-item-thumb-empty" aria-hidden="true">☕</div>';

    return `
      <div class="menu-control-box">
        <div class="menu-box-top">
          <div class="menu-thumb-info">
            ${media}
            <div>
              <strong class="menu-box-name">${escapeHtml(item.name)}</strong>
              <div class="menu-box-cat">${escapeHtml(cat ? cat.name : 'المنيو')}</div>
            </div>
          </div>
          <span class="menu-price-display">${formatIQD(item.price)}</span>
        </div>

        <div class="menu-stepper-row">
          <button type="button" class="stepper-box-btn" data-price-step="250" data-item-id="${item.id}">+ 250 د.ع</button>
          <button type="button" class="stepper-box-btn" data-price-step="-250" data-item-id="${item.id}">− 250 د.ع</button>
        </div>

        <div class="menu-box-actions-triple">
          <button type="button" class="${isAvail ? 'box-btn-primary' : 'box-btn-danger-sm'}" data-toggle-avail="${item.id}">
            ${isAvail ? 'متوفر' : 'متوقف'}
          </button>
          <button type="button" class="box-btn-secondary" data-edit-item="${item.id}">
            تعديل
          </button>
          <button type="button" class="box-btn-danger-sm" data-delete-item="${item.id}">
            حذف
          </button>
        </div>
      </div>
    `;
  }).join('') : '<div class="menu-empty-state" role="status">لا توجد منتجات في هذا القسم</div>';

  gridWrap.querySelectorAll('[data-price-step]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = (menuData.products || []).find((i) => i.id === btn.dataset.itemId);
      if (!target) return;
      const step = Number(btn.dataset.priceStep);
      const updatedPrice = Math.max(0, (Number(target.price) || 0) + step);
      btn.disabled = true;
      try {
        if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
        const { data, error } = await supabase.rpc('admin_save_menu_product', {
          p_product_id: target.id,
          p_category_id: target.category_id,
          p_name: target.name,
          p_description: target.description || null,
          p_price: updatedPrice,
          p_image_url: target.image_url || null,
          p_is_available: target.is_available !== false,
          p_option_groups: target.option_groups || []
        });
        if (error || !data?.success) throw new Error(data?.message || data?.error || error?.message || 'تعذر حفظ السعر.');
        await reloadAdminMenu();
        showToast(`تم تعديل سعر "${target.name}" إلى ${formatIQD(updatedPrice)}`);
      } catch (error) {
        showToast(error?.message || 'تعذر حفظ السعر.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  gridWrap.querySelectorAll('[data-toggle-avail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = menuData.products.find((item) => item.id === btn.dataset.toggleAvail);
      if (!target) return;
      const nextAvailable = target.is_available === false;
      btn.disabled = true;
      try {
        if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
        const { data, error } = await supabase.rpc('admin_toggle_product_availability', {
          p_product_id: target.id,
          p_is_available: nextAvailable
        });
        if (error || !data?.success) throw new Error(data?.message || data?.error || error?.message || 'تعذر تحديث حالة المنتج.');
        await reloadAdminMenu();
        showToast(`تم تحديث حالة "${target.name}" إلى ${nextAvailable ? 'متوفر' : 'متوقف'}`);
      } catch (error) {
        showToast(error?.message || 'تعذر تحديث حالة المنتج.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  gridWrap.querySelectorAll('[data-edit-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openMenuItemModal(btn.dataset.editItem);
    });
  });

  gridWrap.querySelectorAll('[data-delete-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = (menuData.products || []).find((i) => i.id === btn.dataset.deleteItem);
      if (!target) return;
      if (!(await confirmAction(`تحذف "${target.name}" من المنيو؟`, { title: 'حذف منتج', confirmText: 'حذف' }))) return;
      btn.disabled = true;
      try {
        if (!isSupabaseConfigured || !supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
        const { data, error } = await supabase.rpc('admin_delete_product', { p_product_id: target.id });
        if (error || !data?.success) throw new Error(data?.message || data?.error || error?.message || 'تعذر حذف المنتج.');
        await reloadAdminMenu();
        showToast(`تم حذف "${target.name}"`);
      } catch (error) {
        showToast(error?.message || 'تعذر حذف المنتج.');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function openMenuItemModal(itemId = null) {
  const modal = document.getElementById('modal-menu-item');
  const catSelect = document.getElementById('item-category-select');
  const previewImg = document.getElementById('item-image-preview');
  const previewWrap = document.getElementById('item-image-preview-wrap');
  const placeholder = document.getElementById('item-image-placeholder');
  const statusEl = document.getElementById('item-image-status');
  if (!modal || !catSelect) return;

  const categories = menuData.categories || [];
  if (!categories.length) {
    showToast('يرجى إضافة أول قسم في المنيو أولاً عبر زر «＋ إضافة قسم».');
    const catInput = document.getElementById('category-name-input');
    if (catInput) catInput.value = '';
    document.getElementById('modal-add-category').hidden = false;
    return;
  }

  catSelect.innerHTML = categories.map(
    (c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`
  ).join('');

  const item = itemId ? (menuData.products || []).find((i) => i.id === itemId) : null;
  document.getElementById('modal-item-title').textContent = item ? `تعديل المنتج: ${item.name}` : 'إضافة منتج جديد للمنيو';
  document.getElementById('item-id-input').value = item ? item.id : '';
  document.getElementById('item-name-input').value = item ? item.name : '';
  document.getElementById('item-description-input').value = item ? (item.description || '') : '';
  
  if (item && item.category_id) {
    catSelect.value = item.category_id;
  } else if (categories[0]?.id) {
    catSelect.value = categories[0].id;
  }

  const errBanner = document.getElementById('menu-item-modal-error');
  if (errBanner) {
    errBanner.hidden = true;
    errBanner.textContent = '';
  }

  document.getElementById('item-price-input').value = item ? item.price : '';

  const availSelect = document.getElementById('item-available-select');
  if (availSelect) availSelect.value = item && item.is_available === false ? 'false' : 'true';

  const imageInput = document.getElementById('item-image-input');
  if (imageInput) imageInput.value = item ? (item.image_url || '') : '';

  const fileInput = document.getElementById('item-image-file');
  if (fileInput) fileInput.value = '';

  const removeImgBtn = document.getElementById('btn-remove-item-image');
  if (removeImgBtn) {
    removeImgBtn.style.display = item?.image_url ? 'inline-block' : 'none';
    removeImgBtn.onclick = () => {
      if (imageInput) imageInput.value = '';
      if (fileInput) fileInput.value = '';
      if (previewImg) previewImg.src = '';
      if (previewWrap) previewWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      if (statusEl) statusEl.textContent = 'تم إزالة الصورة (سيتم حفظ المنتج بدون صورة)';
      removeImgBtn.style.display = 'none';
    };
  }

  if (item?.image_url) {
    if (previewImg) previewImg.src = item.image_url;
    if (previewWrap) previewWrap.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (statusEl) statusEl.textContent = 'اضغط لاختيار صورة من الاستوديو أو اسحبها هنا';
  }

  renderOptionGroupsEditor(item?.option_groups || []);

  upgradeSelectToCustomDropdown(catSelect);
  if (availSelect) upgradeSelectToCustomDropdown(availSelect);

  modal.hidden = false;
}

const STAFF_ROLE_META = {
  owner: { label: 'المالك (Owner)', badgeColor: '#4A3525', badgeBg: 'rgba(74, 53, 37, 0.08)', icon: '👑' },
  admin: { label: 'مدير نظام مساعد (Admin)', badgeColor: '#785135', badgeBg: 'rgba(120, 81, 53, 0.08)', icon: '🛡️' },
  roadside: { label: 'الويتر والطلبات (Waiter)', badgeColor: '#D97706', badgeBg: 'rgba(217, 119, 6, 0.08)', icon: '☕' },
  kitchen: { label: 'طاقم المطبخ وشاشة الطلبات (Kitchen)', badgeColor: '#16A34A', badgeBg: 'rgba(22, 163, 74, 0.08)', icon: '🍳' }
};

function staffErrorMessage(code) {
  return {
    NOT_AUTHENTICATED: 'يجب تسجيل الدخول من جديد.',
    NOT_AUTHORIZED: 'لا تملك صلاحية إدارة الموظفين.',
    MISSING_NAME: 'يرجى إدخال اسم الموظف الكامل.',
    MISSING_STAFF_ID: 'تعذر تحديد الحساب المطلوب.',
    INVALID_EMAIL: 'صيغة البريد الإلكتروني غير صحيحة.',
    WEAK_PASSWORD: 'كلمة المرور يجب أن لا تقل عن 6 أحرف.',
    INVALID_ROLE: 'الدور المحدد غير صالح.',
    ONLY_OWNER_CAN_CREATE_ADMIN: 'صلاحية إنشاء حساب مدير نظام مقتصرة على المالك.',
    ONLY_OWNER_CAN_ASSIGN_ADMIN: 'صلاحية تعيين دور مدير نظام مقتصرة على المالك.',
    BRANCH_REQUIRED: 'يرجى تحديد الفرع.',
    BRANCH_NOT_FOUND: 'الفرع المحدد غير صالح.',
    EMAIL_ALREADY_EXISTS: 'هذا البريد الإلكتروني مسجل مسبقاً بحساب آخر.',
    STAFF_NOT_FOUND: 'تعذر إيجاد حساب الموظف.',
    CANNOT_MODIFY_OWNER: 'لا يمكن تعديل حساب المالك من هنا.',
    CANNOT_DELETE_OWNER: 'لا يمكن حذف حساب المالك.',
    CANNOT_DEACTIVATE_SELF: 'لا يمكنك تعطيل حسابك الخاص.',
    CANNOT_DELETE_SELF: 'لا يمكنك حذف حسابك الخاص.',
    SERVER_MISCONFIGURED: 'دالة إدارة الموظفين غير مهيأة على الخادم بعد.'
  }[code] || 'تعذر تنفيذ العملية. حاول مرة أخرى.';
}

async function invokeStaffFunction(body) {
  const { data, error } = await supabase.functions.invoke('admin-manage-staff', { body });
  if (error) {
    let code = null;
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        code = parsed?.error;
      }
    } catch {}
    throw new Error(code
      ? staffErrorMessage(code)
      : 'تعذر الاتصال بدالة إدارة الموظفين على Supabase. تأكد من نشرها أولاً (راجع docs/supabase-first-run.md).');
  }
  if (!data?.success) {
    throw new Error(staffErrorMessage(data?.error));
  }
  return data;
}

let staffAccountsLoaded = false;

async function reloadStaffAccounts() {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data, error } = await supabase.rpc('admin_get_staff');
    if (error) throw error;
    if (!data?.success) throw new Error(staffErrorMessage(data?.error));
    staffAccounts = Array.isArray(data.staff) ? data.staff : [];
  } catch (rpcErr) {
    console.warn('RPC admin_get_staff failed, falling back to direct table query:', rpcErr);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from('staff_profiles')
        .select('user_id, full_name, role, is_active, branch_id, created_at, branches(name, slug)');
      if (!pErr && Array.isArray(profiles)) {
        staffAccounts = profiles.map(p => ({
          user_id: p.user_id,
          full_name: p.full_name,
          role: p.role,
          is_active: p.is_active,
          branch_id: p.branch_id,
          branch_name: p.branches?.name || 'جميع الفروع',
          branch_slug: p.branches?.slug || 'airport',
          email: '',
          created_at: p.created_at
        }));
      }
    } catch (fallbackErr) {
      console.warn('Fallback staff query error:', fallbackErr);
    }
  } finally {
    // ALWAYS ensure current logged-in admin/owner is preserved in the accounts list
    if (adminProfile && !staffAccounts.some(s => s.user_id === adminProfile.user_id)) {
      staffAccounts.unshift({
        user_id: adminProfile.user_id,
        full_name: adminProfile.full_name || 'مدير النظام',
        role: adminProfile.role || 'owner',
        is_active: true,
        branch_id: adminProfile.branch_id,
        branch_name: adminProfile.branch_name || 'جميع الفروع',
        branch_slug: adminProfile.branch_slug || 'airport',
        email: adminProfile.email || '',
        created_at: new Date().toISOString()
      });
    }
    staffAccountsLoaded = true;
    renderStaffAccountsBoxes();
  }
}

function renderStaffAccountsBoxes() {
  const grid = document.getElementById('staff-accounts-grid');
  if (!grid) return;

  if (!staffAccounts.length) {
    const emptyMsg = staffAccountsLoaded
      ? 'لا توجد حسابات موظفين حالياً'
      : 'جارٍ التحميل…';
    grid.innerHTML = `<div class="menu-empty-state" style="grid-column: 1 / -1; padding: 22px;">${emptyMsg}</div>`;
    return;
  }

  grid.innerHTML = staffAccounts.map((staff) => {
    const meta = STAFF_ROLE_META[staff.role] || { label: 'موظف', badgeColor: '#4A3525', badgeBg: 'rgba(74, 53, 37, 0.08)', icon: '👤' };
    const isActive = staff.is_active !== false;
    const isOwner = staff.role === 'owner';
    const isSelf = adminProfile && staff.user_id === adminProfile.user_id;

    return `
      <article class="staff-account-box ${isOwner ? 'is-owner-card' : ''}" data-staff-id="${escapeHtml(staff.user_id)}">
        <div class="menu-box-top">
          <div class="menu-thumb-info">
            <div class="staff-icon-wrap" style="background:${meta.badgeBg}; border:1px solid ${meta.badgeColor}33; color:${meta.badgeColor};">
              ${meta.icon}
            </div>
            <div>
              <strong class="menu-box-name">${escapeHtml(staff.full_name)}${isSelf ? ' (أنت)' : ''}</strong>
              <small class="menu-box-cat" dir="ltr" style="text-align:right;">${escapeHtml(staff.email || 'حساب موظف معتمد')}</small>
            </div>
          </div>
          <span class="service-point-status ${isActive ? 'is-active' : ''}">${isActive ? 'مفعل' : 'معطل'}</span>
        </div>

        <div class="staff-meta-row">
          <div class="staff-meta-item">
            <span>الدور الوظيفي:</span>
            <strong style="color:${meta.badgeColor}; font-weight:800;">${meta.label}</strong>
          </div>
          <div class="staff-meta-item">
            <span>الفرع:</span>
            <strong style="color:var(--text-primary);">${escapeHtml(staff.branch_name || 'جميع الفروع')}</strong>
          </div>
        </div>

        ${isOwner ? `
          <div class="staff-owner-badge-note">
            <span class="owner-star-icon">👑</span>
            <span>حساب المالك الرئيسي — أعلى صلاحيات النظام</span>
          </div>
        ` : `
          <div class="service-point-card-actions" style="display:flex; gap:6px; margin-top:4px;">
            <button type="button" class="box-btn-secondary" style="flex:1; font-size:0.75rem; padding:7px 8px; font-weight:700;" data-toggle-staff-status="${escapeHtml(staff.user_id)}" ${isSelf ? 'disabled' : ''}>
              ${isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
            </button>
            <button type="button" class="box-btn-secondary" style="flex:1; font-size:0.75rem; padding:7px 8px; font-weight:700;" data-edit-staff="${escapeHtml(staff.user_id)}">
              تعديل
            </button>
            <button type="button" class="box-btn-danger-sm" style="font-size:0.75rem; padding:7px 8px; font-weight:700;" data-delete-staff="${escapeHtml(staff.user_id)}" ${isSelf ? 'disabled' : ''}>
              حذف
            </button>
          </div>
        `}
      </article>
    `;
  }).join('');
}

async function openStaffModal(staff = null) {
  const modal = document.getElementById('modal-staff-account');
  const title = document.getElementById('modal-staff-title');
  const idInput = document.getElementById('staff-account-id');
  const nameInput = document.getElementById('staff-name-input');
  const emailInput = document.getElementById('staff-email-input');
  const emailHint = document.getElementById('staff-email-hint');
  const passwordInput = document.getElementById('staff-password-input');
  const passwordLabel = document.getElementById('staff-password-label');
  const passwordHint = document.getElementById('staff-password-hint');
  const togglePassBtn = document.getElementById('toggle-staff-password-btn');
  const roleSelect = document.getElementById('staff-role-select');
  const branchSelect = document.getElementById('staff-branch-select');
  const branchHint = document.getElementById('staff-branch-hint');
  const activeSelect = document.getElementById('staff-active-select');
  const errorEl = document.getElementById('staff-modal-error');
  const saveBtn = document.getElementById('staff-save-btn');

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  let branches = servicePointBranches || [];
  if (!branches.length && isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('branches').select('id, name, slug').eq('is_active', true).order('name');
      if (!error && Array.isArray(data) && data.length) {
        branches = data;
        servicePointBranches = data;
      }
    } catch (err) {
      console.warn('Active branch fallback failed:', err);
    }
  }
  if (!branches.length) {
    branches = [
      { id: '564b34a7-ddbf-454b-a4eb-c4629f3f3173', name: 'فرع طريق المطار', slug: 'airport' }
    ];
  }
  branchSelect.innerHTML = branches.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join('');
  const branchFieldBox = document.getElementById('staff-branch-field-box');
  const hasSingleBranch = branches.length <= 1;

  if (togglePassBtn && passwordInput) {
    passwordInput.type = 'password';
    togglePassBtn.textContent = '👁️';
    togglePassBtn.onclick = () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.textContent = isPass ? '🙈' : '👁️';
    };
  }

  const isOwner = adminProfile?.role === 'owner';
  const adminOption = roleSelect.querySelector('option[value="admin"]');
  if (adminOption) {
    adminOption.disabled = !isOwner;
    adminOption.textContent = isOwner
      ? 'مدير نظام مساعد (Admin) 🛡️'
      : 'مدير نظام مساعد (Admin) 🛡️ — مقتصر على المالك';
  }

  const updateBranchUI = () => {
    const isRoleAdmin = roleSelect.value === 'admin';
    branchSelect.disabled = isRoleAdmin;
    if (branchHint) branchHint.style.display = isRoleAdmin ? 'block' : 'none';
    // مع فرع واحد فقط بالمطعم، لا داعي لإظهار حقل اختيار — نعيّنه تلقائياً
    // بصمت (يبقى الحقل ذكياً ويظهر من تلقاء نفسه إن أُضيف فرع ثانٍ لاحقاً).
    if (branchFieldBox) branchFieldBox.style.display = (isRoleAdmin || hasSingleBranch) ? 'none' : '';
    if (hasSingleBranch && !isRoleAdmin && branches[0]) branchSelect.value = branches[0].id;
    upgradeSelectToCustomDropdown(branchSelect);
  };
  roleSelect.onchange = updateBranchUI;

  if (staff) {
    title.textContent = `تعديل حساب الموظف: ${staff.full_name}`;
    idInput.value = staff.user_id;
    nameInput.value = staff.full_name;
    emailInput.value = staff.email || '';
    emailInput.disabled = true;
    if (emailHint) emailHint.style.display = 'block';
    if (passwordLabel) {
      passwordLabel.innerHTML = 'تغيير كلمة المرور <span style="color:var(--text-dim);font-weight:normal;">(اختياري)</span>';
    }
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.required = false;
      passwordInput.placeholder = 'اتركها فارغة إن لم ترغب بتغييرها';
    }
    if (passwordHint) {
      passwordHint.textContent = 'أدخل كلمة مرور جديدة فقط إذا رغبت بتغييرها، وإلا اترك الحقل فارغاً دون تعديل.';
    }
    roleSelect.value = staff.role || 'roadside';
    branchSelect.value = staff.branch_id || branches[0].id;
    activeSelect.value = staff.is_active !== false ? 'true' : 'false';
    if (saveBtn) saveBtn.textContent = 'حفظ التعديلات';
  } else {
    title.textContent = 'إضافة موظف جديد وتحديد الصلاحية';
    idInput.value = '';
    nameInput.value = '';
    emailInput.value = '';
    emailInput.disabled = false;
    if (emailHint) emailHint.style.display = 'none';
    if (passwordLabel) {
      passwordLabel.innerHTML = 'كلمة المرور للدخول <span style="color:#F43F5E;">*</span>';
    }
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.required = true;
      passwordInput.placeholder = '6 أحرف على الأقل';
    }
    if (passwordHint) {
      passwordHint.textContent = 'يستخدمها الموظف لتسجيل الدخول إلى شاشة عمله من صفحة الدخول الموحدة (/login).';
    }
    roleSelect.value = 'roadside';
    branchSelect.value = branches[0].id;
    activeSelect.value = 'true';
    if (saveBtn) saveBtn.textContent = 'حفظ وتفعيل الحساب';
  }

  updateBranchUI();
  upgradeSelectToCustomDropdown(roleSelect);
  upgradeSelectToCustomDropdown(activeSelect);

  modal.hidden = false;
}

/* =========================================================
   إدارة الجلسة والتحقق من الصلاحيات
   ========================================================= */
function acceptAdminSession(context) {
  const profile = context?.profile;
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    window.location.replace('/login?next=/admin');
    return;
  }

  adminProfile = profile;
  const staffNameEl = document.getElementById('active-staff-name');
  if (staffNameEl) staffNameEl.textContent = profile.full_name || context.user.email;
  const staffRoleEl = document.getElementById('active-staff-role');
  if (staffRoleEl) staffRoleEl.textContent = `${roleLabel(profile.role)} • بوكس كافي`;
  document.body.classList.remove('auth-pending');
  mountAdminWorkspace();
}

function mountAdminWorkspace() {
  if (adminWorkspaceMounted) return;
  adminWorkspaceMounted = true;
  try {
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => window.print());
    if (syncChannel) {
      syncChannel.addEventListener('message', () => {
        try {
          renderAllOverviewAndHubBoxes();
          renderAccountingBoxes();
          renderMenuControlBoxes();
          renderPosTerminal();
        } catch (e) {
          console.warn('Sync handler warning:', e);
        }
      });
    }
    renderAllOverviewAndHubBoxes();
    renderPosTerminal();
    renderAccountingBoxes();
    renderMenuControlBoxes();
    renderStaffAccountsBoxes();
    upgradeAllSelects();
    subscribeAdminOrders();
    subscribeAdminMenu();
    reloadAdminOrders().catch((error) => showToast(error.message || 'تعذر تحميل سجل الطلبات.'));
    reloadAdminMenu().catch((error) => showToast(error.message || 'تعذر تحميل منيو المطعم.'));
    reloadServicePoints().catch((error) => showToast(error.message || 'تعذر تحميل نقاط الخدمة.'));
    reloadStaffAccounts().catch((error) => showToast(error.message || 'تعذر تحميل قائمة الموظفين.'));
  } catch (err) {
    console.warn('mountAdminWorkspace partial render:', err);
  }
}

async function restoreAdminSession() {
  try {
    const context = await getStaffSession();
    if (!context || !context.profile || !['owner', 'admin'].includes(context.profile.role)) {
      window.location.replace('/login?next=/admin');
      return false;
    }
    acceptAdminSession(context);
    return true;
  } catch (error) {
    window.location.replace('/login?next=/admin');
    return false;
  }
}

async function initAdminERP() {
  supabase?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      if (adminOrdersChannel) {
        supabase.removeChannel(adminOrdersChannel);
        adminOrdersChannel = null;
      }
      if (adminMenuChannel) {
        supabase.removeChannel(adminMenuChannel);
        adminMenuChannel = null;
      }
      window.location.replace('/login?signed_out=1&next=/admin');
    }
  });
  document.getElementById('btn-open-sidebar')?.addEventListener('click', openSidebarDrawer);
  document.getElementById('btn-close-sidebar')?.addEventListener('click', closeSidebarDrawer);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebarDrawer);

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper.open').forEach((w) => w.classList.remove('open'));
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchFixedPage(btn.dataset.tab));
  });

  document.querySelectorAll('[data-goto-tab]').forEach((box) => {
    box.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      switchFixedPage(box.dataset.gotoTab);
    });
  });

  const clockEl = document.getElementById('admin-live-clock');
  const updateClock = () => {
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('en-GB');
  };
  updateClock();
  setInterval(updateClock, 1000);

  document.getElementById('sales-search-input')?.addEventListener('input', renderAllOverviewAndHubBoxes);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && adminProfile) {
      reloadAdminOrders().catch((error) => showToast(error.message || 'تعذر مزامنة سجل الطلبات.'));
    }
  });
  document.getElementById('admin-menu-search')?.addEventListener('input', renderMenuControlBoxes);
  document.getElementById('filter-order-source')?.addEventListener('change', renderAccountingBoxes);

  // أزرار الكاشير POS
  document.querySelectorAll('.pos-pay-method').forEach((btn) => {
    btn.addEventListener('click', () => {
      posPaymentMethod = btn.dataset.method;
      document.querySelectorAll('.pos-pay-method').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-cash-val]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { netTotal } = getPosTotals();
      const recvInput = document.getElementById('pos-received-input');
      if (!recvInput) return;
      recvInput.value = btn.dataset.cashVal === 'exact' ? String(netTotal) : btn.dataset.cashVal;
      renderPosCart();
    });
  });

  document.getElementById('btn-pos-scroll-cart')?.addEventListener('click', () => {
    document.getElementById('pos-register-box')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('pos-discount-input')?.addEventListener('input', renderPosCart);
  document.getElementById('pos-received-input')?.addEventListener('input', renderPosCart);
  document.getElementById('btn-clear-pos')?.addEventListener('click', () => {
    posCart = [];
    renderPosTerminal();
  });
  document.getElementById('btn-submit-pos-order')?.addEventListener('click', submitPosOrder);

  document.getElementById('btn-pos-scroll-top')?.addEventListener('click', () => {
    const topEl = document.getElementById('pos-catalog-top');
    if (topEl) {
      topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.querySelectorAll('.pos-type-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pos-type-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const hiddenType = document.getElementById('pos-order-type');
      if (hiddenType) hiddenType.value = pill.dataset.orderType || 'drive_thru';
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.closeModal);
      if (modal) modal.hidden = true;
      if (btn.dataset.closeModal === 'modal-qr-preview') document.body.classList.remove('printing-qr');
    });
  });

  document.getElementById('btn-add-service-point')?.addEventListener('click', () => openServicePointModal());
  document.getElementById('form-service-point')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const saved = await saveServicePoint({
        id: document.getElementById('service-point-id').value || null,
        branch_id: document.getElementById('service-point-branch').value,
        label: document.getElementById('service-point-label').value.trim(),
        kind: document.getElementById('service-point-kind').value,
        is_active: document.getElementById('service-point-active').checked
      });
      if (saved) {
        document.getElementById('modal-service-point').hidden = true;
        form.reset();
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  document.getElementById('btn-print-service-qr')?.addEventListener('click', () => {
    if (!activeQrPoint) return;
    document.body.classList.add('printing-qr');
    window.print();
    window.setTimeout(() => document.body.classList.remove('printing-qr'), 500);
  });
  document.getElementById('btn-copy-service-qr')?.addEventListener('click', async () => {
    if (!activeQrPoint) return;
    try {
      await navigator.clipboard.writeText(getServicePointMenuUrl(activeQrPoint));
      showToast('تم نسخ رابط المنيو.');
    } catch {
      showToast('تعذر النسخ تلقائياً. افتح رابط المنيو وانسخه يدوياً.');
    }
  });

  const logoutFromAdmin = async () => {
    try {
      await signOutStaff();
    } catch (error) {
      console.warn('Sign out failed:', error);
    }
    window.location.href = '/login?signed_out=1&next=/admin';
  };
  document.getElementById('btn-open-login')?.addEventListener('click', logoutFromAdmin);
  document.getElementById('btn-header-lock')?.addEventListener('click', logoutFromAdmin);

  // إدارة الموظفين والصلاحيات
  document.getElementById('btn-open-add-staff')?.addEventListener('click', () => openStaffModal(null));

  document.getElementById('form-staff-account')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = document.getElementById('staff-save-btn');
    const errorEl = document.getElementById('staff-modal-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }

    const id = document.getElementById('staff-account-id').value;
    const name = document.getElementById('staff-name-input').value.trim();
    const email = document.getElementById('staff-email-input').value.trim().toLowerCase();
    const password = document.getElementById('staff-password-input').value;
    const role = document.getElementById('staff-role-select').value;
    const branchId = document.getElementById('staff-branch-select').value;
    const isActive = document.getElementById('staff-active-select').value === 'true';

    if (!name) {
      if (errorEl) { errorEl.textContent = 'يرجى إدخال اسم الموظف الكامل.'; errorEl.hidden = false; }
      return;
    }
    if (!id && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      if (errorEl) { errorEl.textContent = 'يرجى إدخال بريد إلكتروني صالح.'; errorEl.hidden = false; }
      return;
    }
    if (!id && (!password || password.length < 6)) {
      if (errorEl) { errorEl.textContent = 'كلمة المرور يجب أن لا تقل عن 6 أحرف.'; errorEl.hidden = false; }
      return;
    }
    if (id && password && password.length < 6) {
      if (errorEl) { errorEl.textContent = 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف، أو اتركها فارغة دون تغيير.'; errorEl.hidden = false; }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جارٍ الحفظ…';
    }

    try {
      const body = id
        ? { action: 'update', staff_id: id, full_name: name, role, branch_id: role === 'admin' ? null : branchId, is_active: isActive, password: password || undefined }
        : { action: 'create', full_name: name, email, password, role, branch_id: role === 'admin' ? null : branchId, is_active: isActive };

      const result = await invokeStaffFunction(body);

      document.getElementById('modal-staff-account').hidden = true;
      if (result?.staff) {
        const existingIdx = staffAccounts.findIndex(s => s.user_id === result.staff.user_id);
        if (existingIdx >= 0) {
          staffAccounts[existingIdx] = result.staff;
        } else {
          staffAccounts.push(result.staff);
        }
      }
      await reloadStaffAccounts();
      showToast(`تم حفظ حساب الموظف «${name}» (${roleLabel(role)}) بنجاح.`);
      form.reset();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'تعذر حفظ حساب الموظف.';
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = id ? 'حفظ التعديلات' : 'حفظ وتفعيل الحساب';
      }
    }
  });

  document.getElementById('staff-accounts-grid')?.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-staff-status]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleStaffStatus;
      const staff = staffAccounts.find(a => a.user_id === id);
      if (!staff) return;
      const nextState = staff.is_active === false;
      toggleBtn.disabled = true;
      try {
        const { data, error } = await supabase.rpc('admin_toggle_staff_status', {
          p_target_user_id: id,
          p_is_active: nextState
        });
        if (error) throw error;
        if (!data?.success) throw new Error(staffErrorMessage(data?.error));
        await reloadStaffAccounts();
        showToast(nextState ? `تم تفعيل حساب «${staff.full_name}».` : `تم إيقاف حساب «${staff.full_name}».`);
      } catch (err) {
        showToast(err.message || 'تعذر تحديث حالة الحساب.');
      } finally {
        toggleBtn.disabled = false;
      }
      return;
    }

    const editBtn = e.target.closest('[data-edit-staff]');
    if (editBtn) {
      const id = editBtn.dataset.editStaff;
      const staff = staffAccounts.find(a => a.user_id === id);
      if (staff) openStaffModal(staff);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-staff]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteStaff;
      const staff = staffAccounts.find(a => a.user_id === id);
      const confirmed = staff && await confirmAction(
        `هل أنت متأكد من حذف حساب الموظف «${staff.full_name}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
        { title: 'حذف حساب موظف', confirmText: 'حذف نهائياً' }
      );
      if (confirmed) {
        deleteBtn.disabled = true;
        try {
          await invokeStaffFunction({ action: 'delete', staff_id: id });
          await reloadStaffAccounts();
          showToast(`تم حذف حساب «${staff.full_name}».`);
        } catch (err) {
          showToast(err.message || 'تعذر حذف الحساب.');
        } finally {
          deleteBtn.disabled = false;
        }
      }
      return;
    }
  });

  // تصفية البيانات التجريبية (System Reset)
  document.getElementById('btn-open-purge-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-purge-test-data');
    if (modal) modal.hidden = false;
  });

  document.getElementById('btn-confirm-purge-execute')?.addEventListener('click', async () => {
    const purgeOrders = Boolean(document.getElementById('chk-purge-orders')?.checked);
    const purgeMenu = Boolean(document.getElementById('chk-purge-menu')?.checked);
    const purgeStaff = Boolean(document.getElementById('chk-purge-staff')?.checked);

    if (!purgeOrders && !purgeMenu && !purgeStaff) {
      showToast('يرجى اختيار عنصر واحد على الأقل لتصفيته.');
      return;
    }

    const confirmed = await confirmAction(
      'تحذير: سيتم حذف البيانات المحددة نهائياً وتصفير الحسابات في النظام. هل أنت متأكد من المتابعة؟',
      { title: 'تأكيد الحذف النهائي', confirmText: 'نعم، تصفية الآن' }
    );
    if (!confirmed) return;

    const executeBtn = document.getElementById('btn-confirm-purge-execute');
    executeBtn.disabled = true;
    executeBtn.textContent = 'جارٍ التصفية الفورية…';

    try {
      const { data, error } = await supabase.rpc('admin_purge_test_data', {
        p_purge_menu: purgeMenu,
        p_purge_orders: purgeOrders,
        p_purge_staff: purgeStaff
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'تعذر استكمال تصفية البيانات.');

      // Clear any local cache
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('box_cofe_') || k.includes('menu'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.removeItem('box_cofe_waiter_cart_v2');
      } catch {}

      document.getElementById('modal-purge-test-data').hidden = true;
      showToast(data.message || 'تمت تصفية البيانات بنجاح.');

      // Reload live data in admin
      if (purgeOrders) await reloadAdminOrders().catch(() => {});
      if (purgeMenu) await reloadAdminMenu().catch(() => {});
      if (purgeStaff) await reloadStaffAccounts().catch(() => {});
      renderAllOverviewAndHubBoxes();
    } catch (err) {
      console.error('Purge error:', err);
      const isMissingRpc = (err.message || '').includes('admin_purge_test_data') || (err.message || '').includes('schema cache');
      if (isMissingRpc) {
        showToast('تنبيه: يجب تشغيل كود SQL أولاً في لوحة Supabase (SQL Editor) لتفعيل التصفية المباشرة.');
      } else {
        showToast(err.message || 'حدث خطأ أثناء تصفية البيانات.');
      }
    } finally {
      executeBtn.disabled = false;
      executeBtn.textContent = 'تأكيد التصفية الفورية 🗑️';
    }
  });

  document.getElementById('btn-open-add-item')?.addEventListener('click', () => openMenuItemModal(null));
  document.getElementById('btn-add-option-group')?.addEventListener('click', () => {
    const root = document.getElementById('item-option-groups');
    const groups = [...readOptionGroupsFromForm(), { name: '', selection_type: 'single', is_required: false, options: [{}] }];
    renderOptionGroupsEditor(groups);
    root?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.getElementById('item-option-groups')?.addEventListener('click', (event) => {
    const group = event.target.closest('.option-group-editor');
    if (!group) return;
    if (event.target.closest('[data-remove-group]')) {
      group.remove();
      updateOptionGroupsMeta();
      if (!document.querySelector('#item-option-groups .option-group-editor')) renderOptionGroupsEditor([]);
    }
    if (event.target.closest('[data-add-option]')) appendOptionRow(group.querySelector('[data-option-rows]'));
    if (event.target.closest('[data-remove-option]')) {
      const rows = group.querySelector('[data-option-rows]');
      event.target.closest('.option-editor-row').remove();
      if (!rows.children.length) appendOptionRow(rows);
    }
  });
  document.getElementById('btn-quick-new-category')?.addEventListener('click', () => {
    const input = document.getElementById('category-name-input');
    if (input) input.value = '';
    document.getElementById('modal-add-category').hidden = false;
  });

  // تفعيل ضغط كارت الصورة لفتح استوديو الهاتف مباشرة
  const pickerZone = document.getElementById('item-image-picker-zone');
  const fileInputEl = document.getElementById('item-image-file');
  pickerZone?.addEventListener('click', () => {
    fileInputEl?.click();
  });
  pickerZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl?.click();
    }
  });

  const updateImageLivePreview = (src, statusText) => {
    const preview = document.getElementById('item-image-preview');
    const previewWrap = document.getElementById('item-image-preview-wrap');
    const placeholder = document.getElementById('item-image-placeholder');
    const status = document.getElementById('item-image-status');
    if (src) {
      if (preview) preview.src = src;
      if (previewWrap) previewWrap.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (preview) preview.src = '';
      if (previewWrap) previewWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }
    if (status && statusText) status.textContent = statusText;
  };

  fileInputEl?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    const removeBtn = document.getElementById('btn-remove-item-image');
    if (file) {
      const url = URL.createObjectURL(file);
      updateImageLivePreview(url, `تم اختيار الصورة: ${file.name} (${Math.round(file.size / 1024)} ك.ب)`);
      if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
      const existingUrl = document.getElementById('item-image-input')?.value.trim();
      if (!existingUrl) {
        updateImageLivePreview('', 'اضغط لاختيار صورة من الاستوديو أو اسحبها هنا');
        if (removeBtn) removeBtn.style.display = 'none';
      }
    }
  });

  document.getElementById('btn-open-expense-modal')?.addEventListener('click', () => {
    upgradeSelectToCustomDropdown(document.getElementById('expense-category-select'));
    document.getElementById('modal-expense').hidden = false;
  });

  // نافذة إضافة قسم جديد المخصصة الداكنة
  document.getElementById('btn-open-add-category')?.addEventListener('click', () => {
    const input = document.getElementById('category-name-input');
    if (input) input.value = '';
    const errBanner = document.getElementById('category-modal-error');
    if (errBanner) {
      errBanner.hidden = true;
      errBanner.textContent = '';
    }
    document.getElementById('modal-add-category').hidden = false;
  });

  document.getElementById('form-add-category')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (document.getElementById('category-name-input')?.value || '').trim();
    const errBanner = document.getElementById('category-modal-error');
    if (errBanner) {
      errBanner.hidden = true;
      errBanner.textContent = '';
    }
    if (!name) return;
    const submit = document.getElementById('category-save-btn') || form.querySelector('[type="submit"]');
    const origText = submit ? submit.textContent : '';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'جارٍ الإضافة…';
    }
    try {
      await saveAdminMenuCategory(name);
      document.getElementById('modal-add-category').hidden = true;
      showToast(`تمت إضافة القسم "${name}" بنجاح`);
      form.reset();

      // تحديث قائمة الأقسام في نافذة المنتج تلقائياً
      const catSelect = document.getElementById('item-category-select');
      if (catSelect) {
        catSelect.innerHTML = (menuData.categories || []).map(
          (c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`
        ).join('');
        const newCat = (menuData.categories || []).find((c) => c.name === name);
        if (newCat) catSelect.value = newCat.id;
        upgradeSelectToCustomDropdown(catSelect);
      }
    } catch (error) {
      if (errBanner) {
        errBanner.textContent = error.message || 'تعذرت إضافة القسم إلى قاعدة البيانات.';
        errBanner.hidden = false;
      }
      showToast(error.message || 'تعذرت إضافة القسم إلى قاعدة البيانات.');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = origText || 'إضافة القسم فوراً';
      }
    }
  });

  document.getElementById('form-menu-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const errBanner = document.getElementById('menu-item-modal-error');
    if (errBanner) {
      errBanner.hidden = true;
      errBanner.textContent = '';
    }
    const id = document.getElementById('item-id-input').value;
    const name = document.getElementById('item-name-input').value.trim();
    const fileInput = document.getElementById('item-image-file');
    const submit = document.getElementById('menu-item-save-btn') || form.querySelector('[type="submit"]');
    const origText = submit ? submit.textContent : '';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'جارٍ الحفظ…';
    }
    try {
      const categoryId = document.getElementById('item-category-select').value;
      if (!categoryId) {
        throw new Error('يرجى اختيار القسم الذي ينتمي له المنتج.');
      }

      let imageUrl = '';
      if (fileInput.files?.[0]) {
        imageUrl = await uploadMenuProductImage(fileInput.files[0]);
      } else {
        imageUrl = (document.getElementById('item-image-input')?.value || '').trim();
      }

      await saveAdminMenuProduct({
        id: id || null,
        name,
        category_id: categoryId,
        price: Number(document.getElementById('item-price-input').value),
        description: document.getElementById('item-description-input').value.trim(),
        is_available: document.getElementById('item-available-select').value === 'true',
        image_url: imageUrl,
        option_groups: readOptionGroupsFromForm(true)
      });
      document.getElementById('modal-menu-item').hidden = true;
      showToast(`تم حفظ المنتج "${name}" بنجاح في المنيو`);
    } catch (error) {
      if (errBanner) {
        errBanner.textContent = error.message || 'تعذر حفظ المنتج في قاعدة البيانات.';
        errBanner.hidden = false;
      }
      showToast(error.message || 'تعذر حفظ المنتج في قاعدة البيانات.');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = origText || 'حفظ وتثبيت المنتج بالمنيو';
      }
    }
  });

  document.getElementById('form-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('تسجيل المصروفات غير متاح حتى يتم ربطه بجداول Supabase. لم يتم تسجيل أي مصروف.');
  });

  await restoreAdminSession();
  if (window.location.hash === '#service-points' && adminProfile) switchFixedPage('staff');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminERP);
} else {
  initAdminERP();
}
