import {
  getLiveMenuData,
  getDemoKitchenOrders,
  saveDemoKitchenOrders,
  addDailyExpense,
  deleteDailyExpense
} from './demo-data.js';
import { roleLabel, getStaffSession, signInStaff, signOutStaff } from './staff-auth.js';
import { supabase, isSupabaseConfigured } from './supabase-client.js';

const syncChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('box_coffee_kitchen_sync')
  : null;

const PAGE_METADATA = {
  hub: {
    title: 'الرئيسية وخانات النظام',
    subtitle: 'جميع أقسام الإدارة والكاشير والحسابات في خانات ثابتة ومنظمة'
  },
  overview: {
    title: 'الإحصائيات وجرد كم انباع',
    subtitle: 'تقارير المبيعات التفصيلية وعدد الأكواب والقطع المباعة من كل مشروب'
  },
  pos: {
    title: 'نقطة البيع والكاشير (POS)',
    subtitle: 'إصدار فواتير مباشرة، حساب الواصل والباقي، وإرسال فوري للمطبخ'
  },
  accounting: {
    title: 'الحسابات والمصاريف اليومية',
    subtitle: 'كردات فواتير الطلبات وصندوق المصروفات التشغيلية'
  },
  menu: {
    title: 'إدارة الأصناف والأسعار',
    subtitle: 'تعديل الأسعار الفوري (+250 / -250 د.ع) وإضافة وتعديل وحذف الأصناف'
  },
  staff: {
    title: 'حسابات الموظفين وتسجيل الدخول',
    subtitle: 'إدارة صلاحيات حسابات الموظفين ونطاق فروعهم'
  }
};

let menuData = getLiveMenuData();
let liveOrders = [];
let liveExpenses = [];
let staffAccounts = [];
let adminProfile = null;
let adminWorkspaceMounted = false;
let adminOrdersChannel = null;

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

async function reloadAdminMenu() {
  if (!supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_get_menu');
  if (error) throw error;
  if (!data?.success) throw new Error('لا تملك صلاحية إدارة منيو هذا المطعم.');

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
  if (!supabase) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { data, error } = await supabase.rpc('admin_get_recent_orders', {
    p_hours: 24,
    p_limit: 150
  });
  if (error) throw error;
  if (!data?.success) throw new Error('لا تملك صلاحية عرض طلبات المطعم.');
  liveOrders = Array.isArray(data.orders) ? data.orders : [];
  renderAccountingBoxes();
  renderAllOverviewAndHubBoxes();
}

function subscribeAdminOrders() {
  if (!supabase || adminOrdersChannel) return;
  adminOrdersChannel = supabase.channel('box-coffee-admin-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      reloadAdminOrders().catch((error) => showToast(error.message || 'تعذر تحديث سجل الطلبات.'));
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        showToast('انقطع تحديث الطلبات المباشر. حدّث الصفحة إذا لم تعد المزامنة.');
      }
    });
}

async function saveAdminMenuCategory(name) {
  const { data, error } = await supabase.rpc('admin_save_category', {
    p_category_id: null,
    p_name: name,
    p_description: null
  });
  if (error) throw error;
  if (!data?.success) throw new Error('تعذرت إضافة القسم. تحقق من الاسم والصلاحية.');
  await reloadAdminMenu();
}

async function saveAdminMenuProduct(product) {
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
  if (error) throw error;
  if (!data?.success) throw new Error('تعذر حفظ الصنف. تحقق من السعر والقسم والخيارات.');
  await reloadAdminMenu();
}

function renderOptionGroupsEditor(groups = []) {
  const root = document.getElementById('item-option-groups');
  if (!root) return;
  root.replaceChildren();
  groups.forEach((group = {}, groupIndex) => {
    const card = document.createElement('div');
    card.className = 'option-group-editor';
    card.dataset.groupIndex = String(groupIndex);
    card.innerHTML = `
      <div class="option-group-editor-head">
        <strong>مجموعة ${groupIndex + 1}</strong>
        <button type="button" class="option-remove-btn" data-remove-group aria-label="حذف المجموعة">حذف المجموعة</button>
      </div>
      <div class="form-two-boxes">
        <div class="field-box"><label>اسم المجموعة</label><input type="text" class="structured-input" data-group-name maxlength="80" placeholder="مثال: حجم المشروب" /></div>
        <div class="field-box"><label>طريقة الاختيار</label><select class="structured-input" data-group-type><option value="single">اختيار واحد</option><option value="multiple">اختيارات متعددة</option></select></div>
      </div>
      <label class="option-required-toggle"><input type="checkbox" data-group-required /> الاختيار إلزامي</label>
      <div class="option-rows" data-option-rows></div>
      <button type="button" class="option-add-row" data-add-option>+ إضافة خيار</button>`;
    card.querySelector('[data-group-name]').value = group.name || '';
    card.querySelector('[data-group-type]').value = group.selection_type === 'multiple' ? 'multiple' : 'single';
    card.querySelector('[data-group-required]').checked = Boolean(group.is_required);
    const rows = card.querySelector('[data-option-rows]');
    const options = Array.isArray(group.options) && group.options.length ? group.options : [{}];
    options.forEach((option) => appendOptionRow(rows, option));
    root.append(card);
  });
}

function appendOptionRow(container, option = {}) {
  const row = document.createElement('div');
  row.className = 'option-editor-row';
  row.innerHTML = `
    <input type="text" class="structured-input" data-option-name maxlength="80" placeholder="اسم الخيار" aria-label="اسم الخيار" />
    <input type="number" class="structured-input" data-option-price min="0" max="1000000" step="250" value="0" placeholder="إضافة السعر" aria-label="السعر الإضافي بالدينار" />
    <button type="button" class="option-remove-btn" data-remove-option aria-label="حذف الخيار">حذف</button>`;
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
      const wasOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-select-wrapper.open').forEach((w) => w.classList.remove('open'));
      if (!wasOpen) wrapper.classList.add('open');
    });
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
      return `
        <button type="button" class="custom-select-option ${isSelected ? 'selected' : ''}" data-opt-val="${opt.value}">
          <span>${opt.textContent}</span>
          <span class="custom-option-check">✓</span>
        </button>
      `;
    }).join('');

    menu.querySelectorAll('.custom-select-option').forEach((optBtn) => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
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
      <div class="pos-product-card ${qtyInCart > 0 ? 'in-cart' : ''}">
        <div class="pos-card-main" data-add-pos="${item.id}">
          ${media}
          <div class="pos-card-meta">
            <span class="pos-tile-cat">${cat ? cat.name : 'قهوة مختصة'}</span>
            <strong class="pos-tile-name">${item.name}</strong>
            <span class="pos-tile-price">${formatIQD(item.price)}</span>
          </div>
        </div>
        <div class="pos-card-controls">
          ${qtyInCart === 0
            ? `<button type="button" class="pos-add-full-btn" data-add-pos="${item.id}">+ إضافة للفاتورة</button>`
            : `
              <div class="pos-inline-stepper">
                <button type="button" class="pos-step-btn" data-pos-delta="1" data-pos-id="${item.id}">+</button>
                <span class="pos-step-qty">${qtyInCart} في الفاتورة</span>
                <button type="button" class="pos-step-btn" data-pos-delta="-1" data-pos-id="${item.id}">−</button>
              </div>
            `
          }
        </div>
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
    btn.addEventListener('click', () => {
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
      <strong style="font-size:1.15rem;letter-spacing:0.15em;">BOX COFE</strong>
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

  const { subtotal, discount, netTotal, received, change } = getPosTotals();
  const carInfo = (document.getElementById('pos-car-info')?.value || '').trim() || 'كاشير مباشر';
  const existing = getDemoKitchenOrders();
  const maxNum = existing.reduce((max, o) => {
    const num = parseInt(String(o.order_code || '').replace(/[^0-9]/g, ''), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 108);
  const orderNum = `B-${maxNum + 1}`;

  const newOrder = {
    id: `ord-pos-${Date.now()}`,
    order_code: orderNum,
    status: 'new',
    total: netTotal,
    subtotal_iqd: subtotal,
    discount_iqd: discount,
    payment_method: posPaymentMethod,
    currency_code: 'IQD',
    vehicle_note: carInfo,
    order_note: '',
    service_point_label: 'نقطة البيع والكاشير POS',
    branch_name: 'فرع طريق المطار',
    tracking_token: `track-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: posCart.map((c, i) => ({
      id: `pos-item-${Date.now()}-${i}`,
      name: c.name,
      quantity: c.qty,
      unit_price: c.price,
      note: '',
      options: ['تحضير قياسي']
    }))
  };

  existing.unshift(newOrder);
  saveDemoKitchenOrders(existing, 'new_order', { order: newOrder });
  showThermalReceiptModal(newOrder, received, change);

  posCart = [];
  if (document.getElementById('pos-car-info')) document.getElementById('pos-car-info').value = '';
  if (document.getElementById('pos-discount-input')) document.getElementById('pos-discount-input').value = '0';
  if (document.getElementById('pos-received-input')) document.getElementById('pos-received-input').value = '';

  renderPosTerminal();
  renderAllOverviewAndHubBoxes();
  renderAccountingBoxes();
  showToast(`تم إصدار الفاتورة ${orderNum} وإرسالها لشاشة المطبخ`);
}

/* =========================================================
   الصفحة 04: الحسابات والمصاريف (Invoices & Expenses Cards)
   ========================================================= */
function renderAccountingBoxes() {
  const ordersWrap = document.getElementById('orders-ledger-body');
  const expensesWrap = document.getElementById('expenses-ledger-body');
  const expensesBanner = document.getElementById('expenses-total-banner');
  const sourceFilter = document.getElementById('filter-order-source')?.value || 'all';

  const totalExp = (liveExpenses || []).reduce((s, e) => s + (Number(e.amount || e.amount_iqd) || 0), 0);
  if (expensesBanner) {
    expensesBanner.textContent = `إجمالي المصاريف اليوم: ${formatIQD(totalExp)} (${liveExpenses.length} عملية)`;
  }

  if (ordersWrap) {
    const filteredOrders = (liveOrders || []).filter(
      (o) => sourceFilter === 'all' || o.source === sourceFilter
    );

    ordersWrap.innerHTML = filteredOrders.length ? filteredOrders.map((order) => {
      const sourceLabel = order.source === 'roadside' ? 'موظف الشارع' : 'QR';
      const statusLabels = {
        new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز',
        handed_off: 'تم التسليم', cancelled: 'ملغي'
      };
      const chipsHtml = (order.items || []).map(
        (i) => `<span class="invoice-item-chip">${escapeHtml(i.name || i.name_ar)} ×${Number(i.quantity || i.qty || 1)}</span>`
      ).join('');

      return `
        <div class="invoice-card-box">
          <div class="invoice-card-head">
            <span class="invoice-code-badge">${escapeHtml(order.order_code)}</span>
            <span class="invoice-customer-name">${escapeHtml(order.vehicle_note || order.branch_name || 'فرع المطعم')} • ${sourceLabel}</span>
            <strong class="invoice-total-badge">${formatIQD(order.total || order.total_iqd)}</strong>
            <button type="button" class="box-btn-secondary" data-print-inv="${escapeHtml(order.order_code)}" style="height:28px;padding:0 8px;font-size:0.7rem;">طباعة</button>
          </div>
          <div class="invoice-items-chips">${chipsHtml}</div>
          <div class="invoice-status-pills">
            <span class="inv-status-btn active">${escapeHtml(statusLabels[order.status] || order.status)}</span>
          </div>
        </div>
      `;
    }).join('') : '<div class="menu-empty-state" role="status">ماكو طلبات مسجلة خلال آخر 24 ساعة.</div>';

    ordersWrap.querySelectorAll('[data-print-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = (liveOrders || []).find((o) => o.order_code === btn.dataset.printInv);
        if (found) showThermalReceiptModal(found);
      });
    });
  }

  if (expensesWrap) {
    expensesWrap.innerHTML = (liveExpenses || []).map((exp) => `
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
    `).join('');

    expensesWrap.querySelectorAll('[data-del-expense]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteDailyExpense(btn.dataset.delExpense);
        renderAccountingBoxes();
        renderAllOverviewAndHubBoxes();
        showToast('تم حذف المصروف وتحديث صافي الربح');
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
      : '<div class="menu-item-thumb menu-item-thumb-empty" aria-hidden="true"></div>';

    return `
      <div class="menu-control-box">
        <div class="menu-box-top">
          <div class="menu-thumb-info">
            ${media}
            <div>
              <strong class="menu-box-name">${item.name}</strong>
              <div class="menu-box-cat">${cat ? cat.name : 'مشروبات'}</div>
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
  }).join('') : '<div class="menu-empty-state" role="status">ماكو أصناف مضافة بعد. أضف قسمك وأصنافك من الأزرار أعلاه.</div>';

  gridWrap.querySelectorAll('[data-price-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = (menuData.products || []).find((i) => i.id === btn.dataset.itemId);
      if (!target) return;
      const step = Number(btn.dataset.priceStep);
      const updatedPrice = Math.max(0, (Number(target.price) || 0) + step);
      saveAdminMenuProduct({ ...target, price: updatedPrice })
        .then(() => showToast(`تم تعديل سعر "${target.name}" إلى ${formatIQD(updatedPrice)}`))
        .catch((error) => showToast(error.message || 'تعذر تحديث السعر في قاعدة البيانات.'));
    });
  });

  gridWrap.querySelectorAll('[data-toggle-avail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = menuData.products.find((item) => item.id === btn.dataset.toggleAvail);
      if (!target) return;
      try {
        const { data, error } = await supabase.rpc('admin_toggle_product_availability', {
          p_product_id: target.id,
          p_is_available: target.is_available === false
        });
        if (error) throw error;
        if (!data?.success) throw new Error('تعذر تغيير حالة التوفر.');
        await reloadAdminMenu();
        showToast(`تم تحديث حالة "${target.name}"`);
      } catch (error) {
        showToast(error.message || 'تعذر تحديث حالة الصنف.');
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
      if (!window.confirm(`تحذف "${target.name}" من المنيو؟`)) return;
      try {
        const { data, error } = await supabase.rpc('admin_delete_product', { p_product_id: target.id });
        if (error) throw error;
        if (!data?.success) throw new Error('تعذر حذف الصنف.');
        await reloadAdminMenu();
        showToast(`تم حذف "${target.name}"`);
      } catch (error) {
        showToast(error.message || 'تعذر حذف الصنف.');
      }
    });
  });
}

function openMenuItemModal(itemId = null) {
  const modal = document.getElementById('modal-menu-item');
  const catSelect = document.getElementById('item-category-select');
  if (!modal || !catSelect) return;
  if (!(menuData.categories || []).length) {
    showToast('أضف قسماً للمنيو أولاً، ثم أضف الأصناف داخله.');
    return;
  }

  catSelect.innerHTML = (menuData.categories || []).map(
    (c) => `<option value="${c.id}">${c.name}</option>`
  ).join('');

  const item = itemId ? (menuData.products || []).find((i) => i.id === itemId) : null;
  document.getElementById('modal-item-title').textContent = item ? `تعديل الصنف: ${item.name}` : 'إضافة صنف جديد للمنيو';
  document.getElementById('item-id-input').value = item ? item.id : '';
  document.getElementById('item-name-input').value = item ? item.name : '';
  document.getElementById('item-description-input').value = item ? (item.description || '') : '';
  document.getElementById('item-category-select').value = item ? item.category_id : (menuData.categories[0]?.id || '');
  document.getElementById('item-price-input').value = item ? item.price : '';
  document.getElementById('item-available-select').value = item && item.is_available === false ? 'false' : 'true';
  document.getElementById('item-image-input').value = item ? (item.image_url || '') : '';
  document.getElementById('item-image-file').value = '';
  document.getElementById('item-image-status').textContent = item?.image_url ? 'تُحفظ الصورة الحالية ما لم تختر صورة جديدة.' : 'اختر صورة واضحة بحجم لا يتجاوز 5 ميغابايت.';
  renderOptionGroupsEditor(item?.option_groups || []);

  upgradeSelectToCustomDropdown(catSelect);
  upgradeSelectToCustomDropdown(document.getElementById('item-available-select'));
  modal.hidden = false;
}

function renderStaffAccountsBoxes() {
  const grid = document.getElementById('staff-accounts-grid');
  if (!grid) return;
  grid.textContent = 'تُدار دعوات الموظفين وحساباتهم من Supabase Auth في هذه المرحلة. لن تُحفظ كلمات مرور أو رموز PIN داخل المتصفح.';
}

/* =========================================================
   ربط الأحداث عند تشغيل النظام
   ========================================================= */
function setStaffLoginError(message) {
  const errorEl = document.getElementById('login-error-msg');
  if (!errorEl) return;
  errorEl.textContent = message || '';
  errorEl.hidden = !message;
}

function acceptAdminSession(context) {
  const profile = context?.profile;
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    throw new Error('هذا الحساب لا يملك صلاحية دخول لوحة الإدارة.');
  }

  adminProfile = profile;
  document.getElementById('active-staff-name').textContent = profile.full_name || context.user.email;
  document.getElementById('active-staff-role').textContent = `${roleLabel(profile.role)} • بوكس كافي`;
  document.body.classList.remove('auth-pending');
  document.getElementById('modal-staff-login').hidden = true;
  setStaffLoginError('');
  mountAdminWorkspace();
}

function mountAdminWorkspace() {
  if (adminWorkspaceMounted) return;
  adminWorkspaceMounted = true;
  document.getElementById('btn-print-receipt')?.addEventListener('click', () => window.print());
  if (syncChannel) {
    syncChannel.addEventListener('message', () => {
      renderAllOverviewAndHubBoxes();
      renderAccountingBoxes();
      renderMenuControlBoxes();
      renderPosTerminal();
    });
  }
  renderAllOverviewAndHubBoxes();
  renderPosTerminal();
  renderAccountingBoxes();
  renderMenuControlBoxes();
  renderStaffAccountsBoxes();
  upgradeAllSelects();
  subscribeAdminOrders();
  reloadAdminOrders().catch((error) => showToast(error.message || 'تعذر تحميل سجل الطلبات.'));
  reloadAdminMenu().catch((error) => showToast(error.message || 'تعذر تحميل منيو المطعم.'));
}

async function restoreAdminSession() {
  const submit = document.getElementById('login-submit-btn');
  if (!isSupabaseConfigured || !supabase) {
    setStaffLoginError('إعداد اتصال Supabase غير مكتمل. أكمل إعداد المشروع قبل تسجيل الدخول.');
    if (submit) submit.disabled = true;
    return false;
  }

  try {
    const context = await getStaffSession();
    if (!context) {
      document.getElementById('modal-staff-login').hidden = false;
      document.getElementById('login-email-input')?.focus();
      return false;
    }
    acceptAdminSession(context);
    return true;
  } catch (error) {
    try { await signOutStaff(); } catch { /* keep the login gate closed even if sign-out cannot reach Supabase */ }
    setStaffLoginError(error.message || 'تعذر التحقق من الحساب.');
    document.getElementById('modal-staff-login').hidden = false;
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
      document.body.classList.add('auth-pending');
      document.getElementById('modal-staff-login').hidden = false;
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
    });
  });

  const logoutFromAdmin = async () => {
    document.body.classList.add('auth-pending');
    document.getElementById('modal-staff-login').hidden = false;
    try {
      await signOutStaff();
    } catch (error) {
      console.warn('Sign out failed:', error);
    }
    document.getElementById('login-password-input').value = '';
    setStaffLoginError('تم تسجيل الخروج.');
  };
  document.getElementById('btn-open-login')?.addEventListener('click', logoutFromAdmin);
  document.getElementById('btn-header-lock')?.addEventListener('click', logoutFromAdmin);

  document.getElementById('form-staff-login')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.getElementById('login-submit-btn');
    const email = document.getElementById('login-email-input').value;
    const password = document.getElementById('login-password-input').value;
    setStaffLoginError('');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'جارٍ التحقق…';
    }

    try {
      const context = await signInStaff(email, password);
      if (!['owner', 'admin'].includes(context?.profile?.role)) {
        await signOutStaff();
        throw new Error('هذا الحساب لا يملك صلاحية دخول لوحة الإدارة.');
      }
      acceptAdminSession(context);
      form.reset();
    } catch (error) {
      setStaffLoginError(error.message || 'تعذر تسجيل الدخول.');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'دخول';
      }
    }
  });

  document.getElementById('btn-open-add-item')?.addEventListener('click', () => openMenuItemModal(null));
  document.getElementById('btn-add-option-group')?.addEventListener('click', () => {
    const root = document.getElementById('item-option-groups');
    renderOptionGroupsEditor([...readOptionGroupsFromForm(), { name: '', selection_type: 'single', is_required: false, options: [{}] }]);
  });
  document.getElementById('item-option-groups')?.addEventListener('click', (event) => {
    const group = event.target.closest('.option-group-editor');
    if (!group) return;
    if (event.target.closest('[data-remove-group]')) group.remove();
    if (event.target.closest('[data-add-option]')) appendOptionRow(group.querySelector('[data-option-rows]'));
    if (event.target.closest('[data-remove-option]')) {
      const rows = group.querySelector('[data-option-rows]');
      event.target.closest('.option-editor-row').remove();
      if (!rows.children.length) appendOptionRow(rows);
    }
  });
  document.getElementById('item-image-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    const status = document.getElementById('item-image-status');
    if (status) status.textContent = file ? `الصورة المحددة: ${file.name}` : 'اختر صورة واضحة بحجم لا يتجاوز 5 ميغابايت.';
  });
  document.getElementById('btn-open-expense-modal')?.addEventListener('click', () => {
    upgradeSelectToCustomDropdown(document.getElementById('expense-category-select'));
    document.getElementById('modal-expense').hidden = false;
  });

  // نافذة إضافة قسم جديد المخصصة الداكنة (بدلاً من prompt الأبيض)
  document.getElementById('btn-open-add-category')?.addEventListener('click', () => {
    const input = document.getElementById('category-name-input');
    if (input) input.value = '';
    document.getElementById('modal-add-category').hidden = false;
  });

  document.getElementById('form-add-category')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('category-name-input')?.value || '').trim();
    if (!name) return;
    const submit = e.currentTarget.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await saveAdminMenuCategory(name);
      document.getElementById('modal-add-category').hidden = true;
      showToast(`تمت إضافة القسم "${name}" بنجاح`);
      e.currentTarget.reset();
    } catch (error) {
      showToast(error.message || 'تعذرت إضافة القسم إلى قاعدة البيانات.');
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.getElementById('form-menu-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('item-id-input').value;
    const name = document.getElementById('item-name-input').value.trim();
    const fileInput = document.getElementById('item-image-file');
    const submit = e.currentTarget.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const imageUrl = await uploadMenuProductImage(fileInput.files?.[0]);
      await saveAdminMenuProduct({
        id: id || null,
        name,
        description: document.getElementById('item-description-input').value.trim(),
        category_id: document.getElementById('item-category-select').value,
        price: Number(document.getElementById('item-price-input').value),
        is_available: document.getElementById('item-available-select').value === 'true',
        image_url: imageUrl,
        option_groups: readOptionGroupsFromForm(true)
      });
      document.getElementById('modal-menu-item').hidden = true;
      showToast(`تم حفظ الصنف "${name}" في منيو المطعم`);
    } catch (error) {
      showToast(error.message || 'تعذر حفظ الصنف في قاعدة البيانات.');
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.getElementById('form-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('expense-title-input').value.trim();
    const amount = Number(document.getElementById('expense-amount-input').value) || 0;
    const category = document.getElementById('expense-category-select').value;

    addDailyExpense({ title, amount, category });
    document.getElementById('form-expense').reset();
    document.getElementById('modal-expense').hidden = true;
    renderAccountingBoxes();
    renderAllOverviewAndHubBoxes();
    showToast(`تم تسجيل المصروف وخصم ${formatIQD(amount)} من صافي الربح`);
  });

  await restoreAdminSession();
}

document.addEventListener('DOMContentLoaded', initAdminERP);
