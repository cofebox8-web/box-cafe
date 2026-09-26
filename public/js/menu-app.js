// Box Coffee - Customer Menu & QR Ordering Controller
// Standard Vanilla JS ES Module - No Frameworks, No Build Step

import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { DEMO_MENU_DATA, getLiveMenuData, simulateDemoOrder, simulateGetOrderStatus } from "./demo-data.js";

// Application State
const state = {
  isDemo: false,
  branchSlug: "",
  qrToken: "",
  menuData: null,
  activeCategoryId: "all",
  searchQuery: "",
  cart: [],
  selectedProductForModal: null,
  modalSelectedOptions: {}, // group_id -> array of option_ids or single option_id
  modalQuantity: 1,
  modalItemNote: "",
  isSubmitting: false,
  confirmedOrder: null,
  trackingToken: null,
  statusPollingTimer: null,
  menuRealtimeChannel: null,
  menuRefreshTimer: null,
  menuRefreshInFlight: false,
  menuRefreshQueued: false,
  menuPollTimer: null
};

// SVG Icons Dictionary (Clean, Scalable, No Emojis)
const ICONS = {
  coffee: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`,
  cart: `<svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  plus: `<svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus: `<svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash: `<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  close: `<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkCircle: `<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  car: `<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="8" rx="2"/><path d="m5 11 2-5h10l2 5"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  alertCircle: `<svg class="icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  cupRegular: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>`,
  cupLarge: `<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M19 6h1a4 4 0 0 1 0 8h-1M2 6h17v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6zM6 1v2M10 1v2M14 1v2"/></svg>`,
  milk: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  sparkle: `<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  flame: `<svg class="icon" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  heat: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-9.33-5M15 15a6 6 0 0 0-9.33-5M12 22a6 6 0 0 0-9.33-5"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
};

// Helper: Resolve contextual icon for product options
function getOptionIcon(groupName = "", optName = "") {
  const g = (groupName || "").toLowerCase();
  const o = (optName || "").toLowerCase();

  if (g.includes("حجم") || o.includes("حجم") || o.includes("size")) {
    if (o.includes("كبير") || o.includes("large") || o.includes("lrg")) {
      return ICONS.cupLarge || ICONS.coffee;
    }
    return ICONS.cupRegular || ICONS.coffee;
  }
  if (g.includes("حليب") || o.includes("حليب") || o.includes("milk") || o.includes("شوفان") || o.includes("لوز")) {
    return ICONS.milk || ICONS.sparkle;
  }
  if (g.includes("حرار") || o.includes("حار") || o.includes("hot") || o.includes("دافئ")) {
    return ICONS.heat || ICONS.flame;
  }
  if (g.includes("ثلج") || o.includes("بارد") || o.includes("ice") || o.includes("cold")) {
    return ICONS.sparkle;
  }
  if (g.includes("شوت") || o.includes("shot") || o.includes("إسبريسو")) {
    return ICONS.flame || ICONS.coffee;
  }
  if (g.includes("سكر") || o.includes("حلاوة") || o.includes("sweet") || o.includes("sugar")) {
    return ICONS.star;
  }
  return ICONS.sparkle || ICONS.coffee;
}

// Parse URL Parameters and Route Context
function parseRouteContext() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const urlParams = new URLSearchParams(window.location.search);
  state.isDemo = urlParams.get("demo") === "1";

  let branch = "";
  let token = "";

  const menuIndex = pathParts.indexOf("menu");
  if (menuIndex !== -1 && pathParts.length > menuIndex + 1) {
    branch = pathParts[menuIndex + 1] || "";
    token = pathParts[menuIndex + 2] || "";
  }

  // Fallback to query params
  if (!branch) branch = urlParams.get("branch") || "";
  if (!token) token = urlParams.get("token") || "";

  // Demo data requires an explicit preview flag; production errors never become fake orders.
  if (!branch && state.isDemo) branch = "airport";
  if (!token && state.isDemo) token = "a0000000-0000-0000-0000-000000000001";

  state.branchSlug = branch;
  state.qrToken = token;
}

// Local Cart Storage Scoped by Branch and Service Point Token
function getCartStorageKey() {
  const branch = state.branchSlug || "default";
  const token = state.qrToken || "default";
  return `box_cofe_cart_${branch}_${token}`;
}

function getIdempotencyStorageKey() {
  return `box_cofe_order_key_${state.branchSlug}_${state.qrToken}`;
}

function getOrderIdempotencyKey(fingerprint) {
  const storageKey = getIdempotencyStorageKey();
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved?.fingerprint === fingerprint && saved.key) return saved.key;
  } catch { /* replace invalid local attempt data */ }

  let key = globalThis.crypto?.randomUUID?.();
  if (!key && globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (!key) throw new Error("المتصفح لا يدعم إرسالاً آمناً للطلب. افتح المنيو من اتصال HTTPS محدّث.");
  try { sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key })); } catch { /* submission still works without session storage */ }
  return key;
}

function loadSavedCart() {
  try {
    const raw = sessionStorage.getItem(getCartStorageKey());
    if (raw) {
      state.cart = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to load saved cart:", err);
    state.cart = [];
  }
}

function saveCart() {
  try {
    sessionStorage.setItem(getCartStorageKey(), JSON.stringify(state.cart));
  } catch (err) {
    console.warn("Failed to save cart:", err);
  }
}

// Format Currency
function formatMoney(amount, currencyCode = "IQD") {
  const formatted = Number(amount || 0).toLocaleString("ar-IQ");
  const currencyLabels = {
    IQD: "د.ع",
    SAR: "ر.س",
    AED: "د.إ",
    USD: "$"
  };
  const unit = currencyLabels[currencyCode] || currencyCode;
  return `${formatted} ${unit}`;
}

// Initialize Application
async function initApp() {
  parseRouteContext();
  loadSavedCart();
  setupEventListeners();

  if (!state.isDemo && (!isSupabaseConfigured || !supabase)) {
    showErrorScreen("الخدمة غير متاحة حالياً", "تعذر الاتصال بخدمة المنيو. تحقق من إعداد Supabase أو أعد المحاولة لاحقاً.");
    return;
  }

  // If branch or token is completely missing and not demo mode
  if (!state.branchSlug || !state.qrToken) {
    showErrorScreen("رابط نقطة الخدمة غير مكتمل", "يرجى مسح رمز QR الموجود على لوحة المسار للوصول إلى المنيو المخصص لنقطتك.");
    return;
  }

  // Optional Demo Visual Test States for review
  const urlParams = new URLSearchParams(window.location.search);
  const demoState = urlParams.get("demo_state");
  if (state.isDemo && demoState === "active_cart" && state.cart.length === 0) {
    state.cart = [
      {
        cartItemId: "prod-spanish-hot_custom",
        product_id: "prod-spanish-hot",
        product_name: "سبانش لاتيه ساخن",
        unit_price: 6500,
        quantity: 2,
        selected_option_ids: ["opt-size-lrg", "opt-milk-oat"],
        selected_options: [
          { group_name: "الحجم", name: "كبير (Large)", price_modifier: 750 },
          { group_name: "نوع الحليب", name: "حليب شوفان عضوي", price_modifier: 750 }
        ],
        note: "حلاوة خفيفة"
      },
      {
        cartItemId: "prod-croissant__",
        product_id: "prod-croissant",
        product_name: "كرواسون زبدة فرنسي فاخر",
        unit_price: 3000,
        quantity: 1,
        selected_option_ids: [],
        selected_options: [],
        note: "تسخين خفيف"
      }
    ];
    saveCart();
  }

  await loadMenuData();
  setupCustomerMenuRealtime();
  if (state.menuData && !state.isDemo) {
    try {
      const savedOrder = JSON.parse(sessionStorage.getItem(`box_cofe_confirmed_${state.branchSlug}_${state.qrToken}`) || "null");
      if (savedOrder?.trackingToken && savedOrder?.order) {
        state.confirmedOrder = savedOrder.order;
        state.trackingToken = savedOrder.trackingToken;
        showOrderConfirmation(savedOrder.order);
        startCustomerOrderStatusPolling();
      }
    } catch { /* ignore invalid or expired tab state */ }
  }
}

// Fetch Menu Data from Supabase RPC or Demo Mock
async function loadMenuData({ silent = false } = {}) {
  if (!silent) showSkeletonLoading(true);
  if (!silent) hideErrorScreen();

  const urlParams = new URLSearchParams(window.location.search);
  const demoState = urlParams.get("demo_state");

  try {
    if (state.isDemo) {
      state.menuData = DEMO_MENU_DATA;
      renderApp();
      if (demoState === "confirmed") {
        showOrderConfirmation({
          success: true,
          order_code: "B-104",
          total: 16000,
          currency_code: "IQD",
          created_at: new Date().toISOString(),
          items_count: 3,
          service_point_label: DEMO_MENU_DATA.service_point.label,
          branch_name: DEMO_MENU_DATA.branch.name,
          tracking_token: "demo-track-104",
          status: "new"
        });
      }
      if (urlParams.get("open_modal")) {
        openProductCustomizationModal(urlParams.get("open_modal"));
      }
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      showErrorScreen("نظام الطلب غير متصل", "تعذر بدء منيو بوكس كافي لأن إعداد اتصال Supabase غير متوفر.");
      return;
    }

    const res = await supabase.rpc("get_customer_menu", {
      p_branch_slug: state.branchSlug,
      p_qr_token: state.qrToken
    });

    if (res.error) {
      throw new Error(res.error.message || "تعذر جلب المنيو من الخادم.");
    }
    if (!res.data || res.data.success !== true) {
      throw new Error(res.data?.message || res.data?.error || "تعذر جلب بيانات المنيو لهذا الفرع أو نقطة الخدمة.");
    }

    state.menuData = res.data;
    renderApp();
  } catch (err) {
    console.error("Network or execution exception:", err);
    if (!silent) {
      showErrorScreen("خطأ في الاتصال", "تعذر جلب المنيو من الخادم. يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة.");
    } else {
      console.warn("Live menu refresh failed; keeping the last confirmed menu.", err);
    }
  } finally {
    if (!silent) showSkeletonLoading(false);
  }
}

function scheduleCustomerMenuRefresh() {
  window.clearTimeout(state.menuRefreshTimer);
  state.menuRefreshTimer = window.setTimeout(async () => {
    if (state.menuRefreshInFlight) {
      state.menuRefreshQueued = true;
      return;
    }
    state.menuRefreshInFlight = true;
    try {
      await loadMenuData({ silent: true });
    } finally {
      state.menuRefreshInFlight = false;
      if (state.menuRefreshQueued) {
        state.menuRefreshQueued = false;
        scheduleCustomerMenuRefresh();
      }
    }
  }, 250);
}

function setupCustomerMenuRealtime() {
  if (state.isDemo || !isSupabaseConfigured || !supabase || state.menuRealtimeChannel) return;
  state.menuRealtimeChannel = supabase.channel(`box-coffee-menu-${state.branchSlug}-${state.qrToken}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_products" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_items" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "car_service_points" }, scheduleCustomerMenuRefresh)
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Customer menu realtime is unavailable; visibility refresh remains active.");
      }
    });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleCustomerMenuRefresh();
  });
  state.menuPollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") scheduleCustomerMenuRefresh();
  }, 60000);
}

// Render Header, Categories, Products, and Cart
function renderApp() {
  const data = state.menuData;
  if (!data) return;

  // 1. Header Information
  const branchNameEl = document.getElementById("header-branch-name");
  const pointTagEl = document.getElementById("header-point-tag");
  const demoBannerEl = document.getElementById("demo-mode-banner");

  if (branchNameEl) branchNameEl.textContent = data.branch?.name || "فرع طريق المطار";
  if (pointTagEl) {
    const rawLabel = data.service_point?.label || "المسار 1 — خدمة السيارات";
    const parts = rawLabel.split(/[—\-]/).map(s => s.trim()).filter(Boolean);
    const mainLane = parts[0] || "المسار 1";
    const subService = parts[1] || "خدمة السيارات";
    pointTagEl.innerHTML = `
      <span class="point-tag-icon" aria-hidden="true">${ICONS.car}</span>
      <span class="point-tag-texts">
        <strong class="point-lane-title">${escapeHtml(mainLane)}</strong>
        <small class="point-lane-sub">${escapeHtml(subService)}</small>
      </span>
    `;
  }

  if (demoBannerEl) {
    demoBannerEl.style.display = state.isDemo ? "flex" : "none";
  }

  // 2. Render Category Navigation Tabs
  renderCategoriesTabs(data.categories);

  // 3. Render Product Sections
  renderProducts();

  // 4. Update Cart Displays
  updateCartUI();
}

// Render Category Navigation Pills
function renderCategoriesTabs(categories) {
  const navContainer = document.getElementById("categories-list");
  if (!navContainer) return;

  // لا نكرر اسم القسم للزبون إذا كانت هناك سجلات قديمة بنفس الاسم في قاعدة البيانات.
  const seenCategoryNames = new Set();
  const uniqueCategories = categories.filter((cat) => {
    const key = String(cat.name || "").trim().toLocaleLowerCase("ar");
    if (!key || seenCategoryNames.has(key)) return false;
    seenCategoryNames.add(key);
    return true;
  });

  let html = `
    <li>
      <button type="button" class="category-tab ${state.activeCategoryId === 'all' ? 'active' : ''}" data-cat-id="all">
        الكل
      </button>
    </li>
  `;

  for (const cat of uniqueCategories) {
    const isActive = state.activeCategoryId === cat.id ? "active" : "";
    html += `
      <li>
        <button type="button" class="category-tab ${isActive}" data-cat-id="${cat.id}">
          ${escapeHtml(cat.name)}
        </button>
      </li>
    `;
  }

  navContainer.innerHTML = html;

  navContainer.querySelectorAll(".category-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const catId = btn.dataset.catId;
      state.activeCategoryId = catId;

      navContainer.querySelectorAll(".category-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (catId === "all") {
        window.scrollTo({ top: document.getElementById("categories-nav-section").offsetTop - 70, behavior: "smooth" });
      } else {
        const targetSection = document.getElementById(`cat-section-${catId}`);
        if (targetSection) {
          targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });
}

// Render Products Grid Grouped by Category
function renderProducts() {
  const container = document.getElementById("products-container");
  if (!container || !state.menuData) return;

  const { categories, products, restaurant } = state.menuData;
  const currency = restaurant?.currency_code || "IQD";

  // Filter products by search query if any
  const query = state.searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter(p => {
    if (!query) return true;
    const nameMatch = p.name.toLowerCase().includes(query);
    const descMatch = (p.description || "").toLowerCase().includes(query);
    return nameMatch || descMatch;
  });

  if (filteredProducts.length === 0) {
    if (query) {
      container.innerHTML = `
        <div class="cart-empty-view" style="padding: 4rem 1rem;">
          ${ICONS.search}
          <p>لم يتم العثور على أي صنف يطابق بحثك «${escapeHtml(query)}»</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="cart-empty-view" style="padding: 4rem 1rem;">
          ${ICONS.coffee}
          <p style="font-weight:700; font-size:1.1rem; color:var(--text-primary); margin-bottom:6px;">المنيو قيد التجهيز والتحديث</p>
          <span style="font-size:0.85rem; color:var(--text-secondary);">سيتم إدراج قائمة الأصناف والمشروبات قريباً من قِبل إدارة بوكس كافي.</span>
        </div>
      `;
    }
    return;
  }

  let html = "";

  // Group filtered products by category
  for (const cat of categories) {
    const catProducts = filteredProducts.filter(p => p.category_id === cat.id);
    if (catProducts.length === 0) continue;

    html += `
      <section class="category-block" id="cat-section-${cat.id}">
        <div class="category-header">
          <h2 class="category-title">${escapeHtml(cat.name)}</h2>
        </div>
        <div class="products-grid">
    `;

    for (const p of catProducts) {
      const hasOptions = p.option_groups && p.option_groups.length > 0;
      const isAvailable = p.is_available !== false;

      let actionControlHtml = "";

      if (!isAvailable) {
        actionControlHtml = `<span class="out-of-stock-badge">غير متوفر</span>`;
      } else {
        // Unified button for ALL products: consistent '+ إضافة' button & badge
        const inCartQty = state.cart
          .filter(item => item.product_id === p.id)
          .reduce((sum, item) => sum + item.quantity, 0);

        const actionLabel = hasOptions ? "اختيار وإضافة" : "إضافة للسلة";
        actionControlHtml = `
          <div class="card-options-in-cart-group">
            ${inCartQty > 0 ? `<span class="in-cart-count-pill">${inCartQty} في السلة</span>` : ""}
            <button type="button" class="add-product-btn" data-action="choose-product" data-product-id="${p.id}" aria-label="إضافة ${escapeHtml(p.name)}">
              ${ICONS.plus} <span>${actionLabel}</span>
            </button>
          </div>
        `;
      }

      const badgeHtml = p.badge
        ? `<span class="product-badge">${escapeHtml(p.badge)}</span>`
        : "";

      html += `
        <article class="product-card ${!isAvailable ? 'unavailable' : ''}" data-product-id="${p.id}">
          <div class="product-card-media">
            ${badgeHtml}
            ${p.image_url
              ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-card-img" loading="lazy" />`
              : `<div class="product-image-fallback">${ICONS.coffee}</div>`
            }
          </div>
          <div class="product-card-body">
            <div class="product-card-header">
              <h3 class="product-name">${escapeHtml(p.name)}</h3>
              ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ""}
            </div>
            <div class="product-card-bottom">
              <div class="price-container">
                <span class="price-value">${formatMoney(p.price, currency)}</span>
              </div>
              <div class="card-action-slot">
                ${actionControlHtml}
              </div>
            </div>
          </div>
        </article>
      `;
    }

    html += `
        </div>
      </section>
    `;
  }

  container.innerHTML = html;

  // Bind Quick Add for direct items
  container.querySelectorAll('[data-action="card-quick-add"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.productId;
      quickAddSimpleProduct(prodId);
    });
  });

  // Bind In-Card Stepper Increment
  container.querySelectorAll('[data-action="card-increment"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.productId;
      incrementSimpleProduct(prodId);
    });
  });

  // Bind In-Card Stepper Decrement
  container.querySelectorAll('[data-action="card-decrement"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.productId;
      decrementSimpleProduct(prodId);
    });
  });

  // Bind Customize Product for items with options
  container.querySelectorAll('[data-action="choose-product"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.productId;
      const product = state.menuData?.products.find(item => item.id === prodId);
      if (!product?.option_groups?.length) quickAddSimpleProduct(prodId);
      else openProductCustomizationModal(prodId);
    });
  });
}

// Quick Add Simple Product without Options
function quickAddSimpleProduct(productId) {
  const product = state.menuData?.products.find(p => p.id === productId);
  if (!product) return;

  const cartItemId = `${product.id}__`;
  const existing = state.cart.find(item => item.cartItemId === cartItemId);

  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + 1);
  } else {
    state.cart.push({
      cartItemId: cartItemId,
      product_id: product.id,
      product_name: product.name,
      unit_price: Number(product.price),
      quantity: 1,
      selected_option_ids: [],
      selected_options: [],
      note: ""
    });
  }

  saveCart();
  updateCartUI();
  renderProducts();
}

// Increment Simple Product Quantity
function incrementSimpleProduct(productId) {
  const cartItem = state.cart.find(
    item => item.product_id === productId && (!item.selected_option_ids || item.selected_option_ids.length === 0)
  );
  if (cartItem && cartItem.quantity < 20) {
    cartItem.quantity++;
    saveCart();
    updateCartUI();
    renderProducts();
  }
}

// Decrement Simple Product Quantity
function decrementSimpleProduct(productId) {
  const index = state.cart.findIndex(
    item => item.product_id === productId && (!item.selected_option_ids || item.selected_option_ids.length === 0)
  );
  if (index !== -1) {
    if (state.cart[index].quantity > 1) {
      state.cart[index].quantity--;
    } else {
      state.cart.splice(index, 1);
    }
    saveCart();
    updateCartUI();
    renderProducts();
  }
}

// Open Product Customization Modal
function openProductCustomizationModal(productId) {
  const product = state.menuData.products.find(p => p.id === productId);
  if (!product) return;

  // Ensure every product has a clean option group for a 100% unified experience
  if (state.isDemo && (!product.option_groups || product.option_groups.length === 0)) {
    const isBakery = product.category_id && String(product.category_id).includes("bakery");
    product.option_groups = [
      {
        id: `default-prep-${product.id}`,
        name: isBakery ? "طريقة التحضير والتقديم" : "درجة الحرارة والتقديم",
        selection_type: "single",
        is_required: true,
        options: isBakery
          ? [
              { id: `opt-warm-${product.id}`, name: "تسخين طازج ومقرمش", price_modifier: 0, is_default: true },
              { id: `opt-normal-${product.id}`, name: "بدون تسخين (عادي)", price_modifier: 0, is_default: false }
            ]
          : [
              { id: `opt-std-${product.id}`, name: "تحضير قياسي متوازن", price_modifier: 0, is_default: true },
              { id: `opt-extra-${product.id}`, name: "تركيز مضاعف للقهوة", price_modifier: 750, is_default: false }
            ]
      }
    ];
  }

  state.selectedProductForModal = product;
  state.modalQuantity = 1;
  state.modalItemNote = "";
  state.modalSelectedOptions = {};

  // Pre-select defaults for required option groups
  if (product.option_groups) {
    for (const group of product.option_groups) {
      if (group.selection_type === "single") {
        const defOpt = group.options.find(o => o.is_default) || (group.is_required ? group.options[0] : null);
        if (defOpt) {
          state.modalSelectedOptions[group.id] = defOpt.id;
        }
      } else {
        // Multiple choices
        state.modalSelectedOptions[group.id] = [];
        for (const opt of group.options) {
          if (opt.is_default) {
            state.modalSelectedOptions[group.id].push(opt.id);
          }
        }
      }
    }
  }

  renderModalContent();

  const modal = document.getElementById("product-modal");
  if (modal) {
    lockBodyScroll();
    modal.showModal();
    // Light dismiss on backdrop click
    modal.onclick = (e) => {
      const rect = modal.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
        && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        modal.close();
      }
    };
  }
}

// ==========================================
// Mobile Body Scroll Lock for Modals/Dialogs
// ==========================================
let activeModalCount = 0;
let savedWindowScrollY = 0;

function lockBodyScroll() {
  if (activeModalCount === 0) {
    savedWindowScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedWindowScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  activeModalCount++;
}

function unlockBodyScroll() {
  if (activeModalCount > 0) {
    activeModalCount--;
  }
  if (activeModalCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    window.scrollTo(0, savedWindowScrollY);
  }
}

// Render Modal Body and Options
function renderModalContent() {
  const p = state.selectedProductForModal;
  if (!p) return;

  const currency = state.menuData.restaurant?.currency_code || "IQD";

  // Product Thumbnail & Base Price Display (1:1 Natural Aspect Ratio)
  const bannerEl = document.getElementById("modal-product-banner");
  const imgEl = document.getElementById("modal-product-image");
  if (bannerEl && imgEl) {
    if (p.image_url) {
      imgEl.src = p.image_url;
      imgEl.alt = p.name;
      bannerEl.style.display = "block";
    } else {
      bannerEl.style.display = "none";
    }
  }

  document.getElementById("modal-product-title").textContent = p.name;
  const descEl = document.getElementById("modal-product-desc");
  if (descEl) descEl.textContent = p.description || "";

  const basePriceChip = document.getElementById("modal-base-price-chip");
  if (basePriceChip) basePriceChip.textContent = `السعر الأساسي: ${formatMoney(p.price, currency)}`;

  const optionsContainer = document.getElementById("modal-options-container");
  let optionsHtml = "";

  if (p.option_groups && p.option_groups.length > 0) {
    for (const group of p.option_groups) {
      const isSingle = group.selection_type === "single";
      const isRequired = group.is_required;

      optionsHtml += `
        <div class="option-group-section" data-group-id="${group.id}">
          <div class="group-title-row">
            <h4 class="group-name-title">${escapeHtml(group.name)}</h4>
            <span class="group-requirement-pill ${isRequired ? 'required' : 'optional'}">
              ${isRequired ? 'إلزامي' : 'اختياري'}
            </span>
          </div>
          <div class="option-tiles-grid">
      `;

      for (const opt of group.options) {
        let isChecked = false;
        if (isSingle) {
          isChecked = state.modalSelectedOptions[group.id] === opt.id;
        } else {
          isChecked = Array.isArray(state.modalSelectedOptions[group.id]) &&
                      state.modalSelectedOptions[group.id].includes(opt.id);
        }

        const modifierText = opt.price_modifier > 0 ? `+${formatMoney(opt.price_modifier, currency)}` : "مشمول";
        const iconSvg = getOptionIcon(group.name, opt.name);

        optionsHtml += `
          <button type="button" class="option-tile ${isChecked ? 'active' : ''}"
            data-action="select-option"
            data-group-id="${group.id}"
            data-opt-id="${opt.id}"
            aria-pressed="${isChecked}">
            <div class="tile-main-info">
              <span class="tile-icon-bubble">${iconSvg}</span>
              <span class="tile-name">${escapeHtml(opt.name)}</span>
            </div>
            <div class="tile-side-info">
              <span class="tile-price-tag ${opt.price_modifier > 0 ? 'paid' : 'free'}">${modifierText}</span>
              <span class="tile-check-bubble">${ICONS.check}</span>
            </div>
          </button>
        `;
      }

      optionsHtml += `
          </div>
        </div>
      `;
    }
  } else {
    optionsHtml = `<p style="color: var(--text-secondary); font-size: var(--font-sm); margin: 0 0 1rem;">صنف جاهز للإضافة مباشرة إلى السلة بدون تخصيص.</p>`;
  }

  // Quick Barista Note Section with Suggestions
  optionsHtml += `
    <div class="modal-item-note-group">
      <div class="note-label-row">
        <label for="modal-item-note">ملاحظة خاصة للباريستا (اختياري)</label>
      </div>
      <div class="quick-suggestion-chips">
        <button type="button" class="quick-chip-btn" data-action="quick-tag" data-tag="سكر خفيف">سكر خفيف</button>
        <button type="button" class="quick-chip-btn" data-action="quick-tag" data-tag="بدون سكر">بدون سكر</button>
        <button type="button" class="quick-chip-btn" data-action="quick-tag" data-tag="ثلج قليل">ثلج قليل</button>
        <button type="button" class="quick-chip-btn" data-action="quick-tag" data-tag="حار جداً">حار جداً</button>
      </div>
      <input type="text" id="modal-item-note" class="text-input-field modal-note-input" maxlength="100"
        placeholder="اكتب أي ملاحظة للباريستا (مثلاً: رغوة زيادة، سكر جانبي...)" value="${escapeHtml(state.modalItemNote)}" />
    </div>
  `;

  optionsContainer.innerHTML = optionsHtml;

  // Bind Mini Choice Card Click
  optionsContainer.querySelectorAll('[data-action="select-option"]').forEach(card => {
    card.addEventListener("click", () => {
      const groupId = card.dataset.groupId;
      const optId = card.dataset.optId;
      const group = p.option_groups.find(g => g.id === groupId);
      if (!group) return;

      if (group.selection_type === "single") {
        state.modalSelectedOptions[groupId] = optId;
      } else {
        if (!Array.isArray(state.modalSelectedOptions[groupId])) {
          state.modalSelectedOptions[groupId] = [];
        }
        const idx = state.modalSelectedOptions[groupId].indexOf(optId);
        if (idx !== -1) {
          state.modalSelectedOptions[groupId].splice(idx, 1);
        } else {
          const max = group.max_selections || 99;
          if (state.modalSelectedOptions[groupId].length < max) {
            state.modalSelectedOptions[groupId].push(optId);
          }
        }
      }

      renderModalContent();
    });
  });

  // Bind Quick Tag suggestions
  optionsContainer.querySelectorAll('[data-action="quick-tag"]').forEach(tagBtn => {
    tagBtn.addEventListener("click", () => {
      const tag = tagBtn.dataset.tag;
      const input = document.getElementById("modal-item-note");
      if (input) {
        if (input.value && !input.value.includes(tag)) {
          input.value += `، ${tag}`;
        } else if (!input.value) {
          input.value = tag;
        }
        state.modalItemNote = input.value;
      }
    });
  });

  // Bind item note input
  const noteInput = document.getElementById("modal-item-note");
  if (noteInput) {
    noteInput.addEventListener("input", (e) => {
      state.modalItemNote = e.target.value;
    });
  }

  updateModalPriceCalculation();
}

// Update Modal Realtime Price Calculation & Quantity
function updateModalPriceCalculation() {
  const p = state.selectedProductForModal;
  if (!p) return;

  const currency = state.menuData.restaurant?.currency_code || "IQD";
  let unitPrice = Number(p.price);

  if (p.option_groups) {
    for (const group of p.option_groups) {
      const selected = state.modalSelectedOptions[group.id];
      if (!selected) continue;

      if (group.selection_type === "single") {
        const opt = group.options.find(o => o.id === selected);
        if (opt) unitPrice += Number(opt.price_modifier || 0);
      } else if (Array.isArray(selected)) {
        for (const optId of selected) {
          const opt = group.options.find(o => o.id === optId);
          if (opt) unitPrice += Number(opt.price_modifier || 0);
        }
      }
    }
  }

  const lineTotal = unitPrice * state.modalQuantity;

  // Update stepper display
  const countEl = document.getElementById("modal-quantity-count");
  if (countEl) countEl.textContent = state.modalQuantity;

  // Update total on add button
  const addBtn = document.getElementById("modal-add-btn");
  if (addBtn) {
    addBtn.innerHTML = `
      <span>إضافة إلى السلة</span>
      <span>${formatMoney(lineTotal, currency)}</span>
    `;

    // Validate required groups
    let isValid = true;
    if (p.option_groups) {
      for (const group of p.option_groups) {
        if (group.is_required) {
          const val = state.modalSelectedOptions[group.id];
          if (!val || (Array.isArray(val) && val.length < (group.min_selections || 1))) {
            isValid = false;
            break;
          }
        }
      }
    }
    addBtn.disabled = !isValid;
  }
}

// Add Item from Modal to Cart
function addModalItemToCart() {
  const p = state.selectedProductForModal;
  if (!p) return;

  let unitPrice = Number(p.price);
  const selectedOptionsSnapshot = [];
  const selectedOptionIds = [];

  if (p.option_groups) {
    for (const group of p.option_groups) {
      const selected = state.modalSelectedOptions[group.id];
      if (!selected) continue;

      if (group.selection_type === "single") {
        const opt = group.options.find(o => o.id === selected);
        if (opt) {
          unitPrice += Number(opt.price_modifier || 0);
          selectedOptionIds.push(opt.id);
          selectedOptionsSnapshot.push({
            group_name: group.name,
            name: opt.name,
            price_modifier: opt.price_modifier
          });
        }
      } else if (Array.isArray(selected)) {
        for (const optId of selected) {
          const opt = group.options.find(o => o.id === optId);
          if (opt) {
            unitPrice += Number(opt.price_modifier || 0);
            selectedOptionIds.push(opt.id);
            selectedOptionsSnapshot.push({
              group_name: group.name,
              name: opt.name,
              price_modifier: opt.price_modifier
            });
          }
        }
      }
    }
  }

  // Create Cart Item Entry
  const cartItemId = `${p.id}_${selectedOptionIds.sort().join("_")}_${(state.modalItemNote || "").trim()}`;

  const existing = state.cart.find(item => item.cartItemId === cartItemId);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + state.modalQuantity);
  } else {
    state.cart.push({
      cartItemId: cartItemId,
      product_id: p.id,
      product_name: p.name,
      unit_price: unitPrice,
      quantity: state.modalQuantity,
      selected_option_ids: selectedOptionIds,
      selected_options: selectedOptionsSnapshot,
      note: state.modalItemNote.trim()
    });
  }

  saveCart();
  updateCartUI();
  renderProducts();

  // Close Modal
  const modal = document.getElementById("product-modal");
  if (modal) modal.close();
}

// Update Cart UI (Desktop Sidebar & Mobile Drawer)
function updateCartUI() {
  const currency = state.menuData?.restaurant?.currency_code || "IQD";
  let totalQuantity = 0;
  let subtotal = 0;

  for (const item of state.cart) {
    totalQuantity += item.quantity;
    subtotal += item.unit_price * item.quantity;
  }

  // Update Badges
  const mobileBar = document.getElementById("mobile-floating-cart-bar");
  const mobileCountPill = document.getElementById("mobile-cart-count-pill");
  const mobileTotalAmount = document.getElementById("mobile-cart-total-amount");
  const desktopCountBadge = document.getElementById("desktop-cart-count-badge");

  if (mobileBar) {
    if (totalQuantity > 0) {
      mobileBar.classList.add("visible");
    } else {
      mobileBar.classList.remove("visible");
    }
  }

  if (mobileCountPill) mobileCountPill.textContent = totalQuantity;
  if (mobileTotalAmount) mobileTotalAmount.textContent = formatMoney(subtotal, currency);
  if (desktopCountBadge) desktopCountBadge.textContent = `${totalQuantity} أصناف`;

  // Toggle Active Cart Section vs Empty States (Completely hides input boxes when empty)
  const desktopActiveSection = document.getElementById("desktop-cart-active-section");
  const desktopEmpty = document.getElementById("desktop-cart-empty");
  const mobileActiveSection = document.getElementById("mobile-cart-active-section");
  const mobileEmpty = document.getElementById("mobile-cart-empty");
  const mobileFooter = document.getElementById("mobile-cart-footer");
  const clearBtns = document.querySelectorAll(".clear-cart-btn");

  if (totalQuantity > 0) {
    if (desktopActiveSection) desktopActiveSection.style.display = "block";
    if (desktopEmpty) desktopEmpty.style.display = "none";
    if (mobileActiveSection) mobileActiveSection.style.display = "block";
    if (mobileEmpty) mobileEmpty.style.display = "none";
    if (mobileFooter) mobileFooter.style.display = "flex";
    clearBtns.forEach(btn => btn.style.display = "inline-flex");
  } else {
    if (desktopActiveSection) desktopActiveSection.style.display = "none";
    if (desktopEmpty) desktopEmpty.style.display = "block";
    if (mobileActiveSection) mobileActiveSection.style.display = "none";
    if (mobileEmpty) mobileEmpty.style.display = "block";
    if (mobileFooter) mobileFooter.style.display = "none";
    clearBtns.forEach(btn => btn.style.display = "none");
  }

  // Render Items List into Desktop and Mobile Containers
  renderCartItemsList("desktop-cart-items-list", "desktop-cart-empty", subtotal, totalQuantity);
  renderCartItemsList("mobile-cart-items-list", "mobile-cart-empty", subtotal, totalQuantity);

  // Update Totals
  document.querySelectorAll(".cart-total-amount").forEach(el => {
    el.textContent = formatMoney(subtotal, currency);
  });

  // Enable/Disable submit button
  document.querySelectorAll(".submit-order-btn").forEach(btn => {
    btn.disabled = totalQuantity === 0 || state.isSubmitting;
  });
}

function renderCartItemsList(listId, emptyId, subtotal, totalQuantity) {
  const listEl = document.getElementById(listId);
  const emptyEl = document.getElementById(emptyId);
  const currency = state.menuData?.restaurant?.currency_code || "IQD";

  if (!listEl || !emptyEl) return;

  if (totalQuantity === 0) {
    listEl.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  listEl.style.display = "flex";
  emptyEl.style.display = "none";

  let html = "";
  for (const item of state.cart) {
    const optionsText = item.selected_options.map(o => o.name).join(" • ");
    const lineTotal = item.unit_price * item.quantity;

    html += `
      <div class="cart-item-row" data-cart-item-id="${escapeHtml(item.cartItemId)}">
        <div class="cart-item-main">
          <div class="cart-item-info">
            <strong>${escapeHtml(item.product_name)}</strong>
            ${optionsText ? `<div class="cart-item-options-text">${escapeHtml(optionsText)}</div>` : ""}
            ${item.note ? `<div class="cart-item-note-text">ملاحظة: ${escapeHtml(item.note)}</div>` : ""}
          </div>
          <span class="cart-item-price-sum">${formatMoney(lineTotal, currency)}</span>
        </div>
        <div class="cart-item-controls-row">
          <button type="button" class="item-delete-btn" data-action="delete-item" data-cart-item-id="${escapeHtml(item.cartItemId)}">
            ${ICONS.trash} <span>حذف</span>
          </button>
          <div class="mini-stepper">
            <button type="button" data-action="decrement-item" data-cart-item-id="${escapeHtml(item.cartItemId)}" aria-label="تقليل الكمية">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-action="increment-item" data-cart-item-id="${escapeHtml(item.cartItemId)}" aria-label="زيادة الكمية">+</button>
          </div>
        </div>
      </div>
    `;
  }

  listEl.innerHTML = html;

  // Bind Steppers and Delete actions
  listEl.querySelectorAll('[data-action="increment-item"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.cartItemId;
      const item = state.cart.find(i => i.cartItemId === id);
      if (item && item.quantity < 20) {
        item.quantity++;
        saveCart();
        updateCartUI();
        renderProducts();
      }
    });
  });

  listEl.querySelectorAll('[data-action="decrement-item"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.cartItemId;
      const item = state.cart.find(i => i.cartItemId === id);
      if (item) {
        if (item.quantity > 1) {
          item.quantity--;
        } else {
          state.cart = state.cart.filter(i => i.cartItemId !== id);
        }
        saveCart();
        updateCartUI();
        renderProducts();
      }
    });
  });

  listEl.querySelectorAll('[data-action="delete-item"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.cartItemId;
      state.cart = state.cart.filter(i => i.cartItemId !== id);
      saveCart();
      updateCartUI();
      renderProducts();
    });
  });
}

// Order Submission Process
async function submitOrder() {
  if (state.cart.length === 0 || state.isSubmitting) return;

  state.isSubmitting = true;
  updateCartUI();

  // Read Vehicle and Order notes from synced input fields
  const vehicleNote = (
    document.querySelector(".vehicle-note-input:focus")?.value ||
    document.querySelector(".vehicle-note-input")?.value ||
    ""
  ).trim();
  const customerName = "";
  const orderNote = (
    document.querySelector(".order-note-input:focus")?.value ||
    document.querySelector(".order-note-input")?.value ||
    ""
  ).trim();

  // Format Items payload for RPC
  const itemsPayload = state.cart.map(item => ({
    product_id: item.product_id,
    quantity: item.quantity,
    selected_option_ids: item.selected_option_ids || [],
    note: item.note || ""
  }));
  const requestFingerprint = JSON.stringify({
    branch: state.branchSlug,
    token: state.qrToken,
    items: itemsPayload,
    vehicleNote,
    orderNote
  });
  const idempotencyKey = getOrderIdempotencyKey(requestFingerprint);

  try {
    let result = null;

    if (state.isDemo) {
      await new Promise(resolve => setTimeout(resolve, 800)); // simulate server check
      result = simulateDemoOrder({
        items: itemsPayload,
        customer_name: customerName,
        vehicle_note: vehicleNote,
        order_note: orderNote,
        idempotency_key: idempotencyKey
      });
    } else {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("تعذر إرسال الطلب. خدمة الاتصال بقاعدة البيانات غير متوفرة حالياً.");
      }

      const { data, error } = await supabase.rpc("place_customer_order", {
        p_branch_slug: state.branchSlug,
        p_qr_token: state.qrToken,
        p_items: itemsPayload,
        p_idempotency_key: idempotencyKey,
        p_customer_name: customerName || null,
        p_vehicle_note: vehicleNote || null,
        p_order_note: orderNote || null
      });

      if (error) {
        throw new Error(error.message || "تعذر إرسال الطلب إلى الخادم. يرجى إعادة المحاولة.");
      }

      if (!data || data.success !== true) {
        throw new Error(data?.message || data?.error || "تعذر تأكيد الطلب من الخادم. يرجى إعادة المحاولة.");
      }

      result = data;
    }

    // Success! Clear cart and show confirmation screen
    state.cart = [];
    saveCart();
    state.confirmedOrder = result;
    state.trackingToken = result.tracking_token || null;
    try { sessionStorage.removeItem(getIdempotencyStorageKey()); } catch { /* ignore storage errors */ }
    if (!state.isDemo && state.trackingToken) {
      try {
        sessionStorage.setItem(`box_cofe_confirmed_${state.branchSlug}_${state.qrToken}`, JSON.stringify({ order: result, trackingToken: state.trackingToken }));
      } catch { /* the order is already safely stored on the server */ }
    }

    // Close mobile cart drawer if open
    const mobileDrawer = document.getElementById("mobile-cart-drawer");
    if (mobileDrawer && mobileDrawer.open) {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      mobileDrawer.close();
    }

    showOrderConfirmation(result);
    if (!state.isDemo && state.trackingToken) startCustomerOrderStatusPolling();
  } catch (err) {
    console.error("Order submission failed:", err);
    alert(err.message || "حدث خطأ أثناء إرسال الطلب. يرجى إعادة المحاولة.");
  } finally {
    state.isSubmitting = false;
    updateCartUI();
    renderProducts();
  }
}

// Show Order Confirmation View inside the same page
function showOrderConfirmation(order) {
  // Hide main layout and categories
  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");
  const promptSec = document.getElementById("customer-hero-section") || document.getElementById("roadside-quick-prompt");
  const mobileBar = document.getElementById("mobile-floating-cart-bar");

  if (mainLayout) mainLayout.style.display = "none";
  if (searchSec) searchSec.style.display = "none";
  if (promptSec) promptSec.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  const confEl = document.getElementById("order-confirmation-overlay");
  if (!confEl) return;

  confEl.classList.add("visible");

  // Prevent browser focus-restore from jumping to the middle of the page
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  // Force instant scroll to top
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (confEl.scrollIntoView) {
      confEl.scrollIntoView({ block: "start", behavior: "instant" });
    }
  });

  setTimeout(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, 40);

  document.getElementById("confirmed-order-code").textContent = order.order_code || "—";
  document.getElementById("confirmed-service-point").textContent = order.service_point_label || "مسار السيارات";
  document.getElementById("confirmed-total-amount").textContent = formatMoney(order.total, order.currency_code);
  document.getElementById("confirmed-items-count").textContent = `${order.items_count || 0} صنف`;

  const statusTextEl = document.getElementById("order-live-status-text");
  if (statusTextEl) {
    statusTextEl.textContent = getOrderStatusLabel(order.status || "new");
  }
}

// Reset Order Confirmation to Start New Order
function resetNewOrder() {
  if (state.statusPollingTimer) clearInterval(state.statusPollingTimer);
  state.statusPollingTimer = null;
  try { sessionStorage.removeItem(`box_cofe_confirmed_${state.branchSlug}_${state.qrToken}`); } catch { /* ignore storage errors */ }
  state.confirmedOrder = null;
  state.trackingToken = null;
  state.cart = [];
  saveCart();

  const confEl = document.getElementById("order-confirmation-overlay");
  if (confEl) confEl.classList.remove("visible");

  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");
  const promptSec = document.getElementById("customer-hero-section") || document.getElementById("roadside-quick-prompt");

  if (mainLayout) mainLayout.style.display = "";
  if (searchSec) searchSec.style.display = "";
  if (promptSec) promptSec.style.display = "";

  updateCartUI();
  renderProducts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// UI State Toggles: Skeleton, Error Screen
function showSkeletonLoading(show) {
  const skeleton = document.getElementById("skeleton-loading-container");
  const mainLayout = document.getElementById("main-ordering-layout");
  const confEl = document.getElementById("order-confirmation-overlay");
  const errView = document.getElementById("error-screen-view");

  if (skeleton) skeleton.classList.toggle("visible", show);

  if (show) {
    if (mainLayout) mainLayout.style.display = "none";
  } else {
    const isOverlayActive = (confEl && confEl.classList.contains("visible")) || (errView && errView.classList.contains("visible"));
    if (mainLayout && !isOverlayActive) {
      mainLayout.style.display = "";
    }
  }
}

function showErrorScreen(title, message) {
  showSkeletonLoading(false);
  const errView = document.getElementById("error-screen-view");
  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");
  const promptSec = document.getElementById("customer-hero-section") || document.getElementById("roadside-quick-prompt");

  if (mainLayout) mainLayout.style.display = "none";
  if (searchSec) searchSec.style.display = "none";
  if (promptSec) promptSec.style.display = "none";

  if (errView) {
    errView.classList.add("visible");
    document.getElementById("error-screen-title").textContent = title;
    document.getElementById("error-screen-message").textContent = message;
  }
}

function hideErrorScreen() {
  const errView = document.getElementById("error-screen-view");
  if (errView) errView.classList.remove("visible");
  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");
  const promptSec = document.getElementById("customer-hero-section") || document.getElementById("roadside-quick-prompt");

  if (mainLayout) mainLayout.style.display = "";
  if (searchSec) searchSec.style.display = "";
  if (promptSec) promptSec.style.display = "";
}

function getOrderStatusLabel(status) {
  return ({
    new: "جديد — بانتظار بدء التحضير",
    confirmed: "تم استلام الطلب — بانتظار المطبخ",
    preparing: "قيد التحضير في المطبخ",
    ready: "جاهز للتسليم في المسار",
    handed_off: "تم التسليم بالهناء والعافية",
    delivered: "تم التسليم بالهناء والعافية",
    cancelled: "تم إلغاء الطلب"
  })[status] || status || "بانتظار تحديث الحالة";
}

async function refreshCustomerOrderStatus(silent = false) {
  if (!state.trackingToken || state.isDemo || !supabase) return;
  try {
    const { data, error } = await supabase.rpc("get_customer_order_status", {
      p_tracking_token: state.trackingToken
    });
    if (error || !data || data.success !== true) throw new Error(data?.message || error?.message || "تعذر تحديث حالة الطلب");
    if (state.confirmedOrder) {
      state.confirmedOrder.status = data.status;
      try {
        sessionStorage.setItem(`box_cofe_confirmed_${state.branchSlug}_${state.qrToken}`, JSON.stringify({
          order: state.confirmedOrder,
          trackingToken: state.trackingToken
        }));
      } catch { /* current page still shows the latest server status */ }
    }
    const statusTextEl = document.getElementById("order-live-status-text");
    if (statusTextEl) statusTextEl.textContent = getOrderStatusLabel(data.status);
    if (["handed_off", "delivered", "cancelled"].includes(data.status) && state.statusPollingTimer) {
      clearInterval(state.statusPollingTimer);
      state.statusPollingTimer = null;
    }
  } catch (error) {
    if (!silent) console.warn("Order status refresh failed:", error);
  }
}

function startCustomerOrderStatusPolling() {
  if (state.isDemo || !state.trackingToken) return;
  if (state.statusPollingTimer) clearInterval(state.statusPollingTimer);
  refreshCustomerOrderStatus(true);
  state.statusPollingTimer = setInterval(() => {
    if (document.visibilityState === "visible") refreshCustomerOrderStatus(true);
  }, 8000);
}

// Setup Event Listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear-btn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      if (searchClear) searchClear.style.display = state.searchQuery ? "grid" : "none";
      renderProducts();
    });
  }

  if (searchClear) {
    searchClear.addEventListener("click", () => {
      state.searchQuery = "";
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      searchClear.style.display = "none";
      renderProducts();
    });
  }

  // Keep notes synchronized between desktop and mobile drawers
  document.querySelectorAll(".vehicle-note-input").forEach(input => {
    input.addEventListener("input", (e) => {
      document.querySelectorAll(".vehicle-note-input").forEach(other => {
        if (other !== e.target) other.value = e.target.value;
      });
    });
  });

  document.querySelectorAll(".order-note-input").forEach(input => {
    input.addEventListener("input", (e) => {
      document.querySelectorAll(".order-note-input").forEach(other => {
        if (other !== e.target) other.value = e.target.value;
      });
    });
  });

  // Modal Stepper
  const btnMinus = document.getElementById("modal-stepper-minus");
  const btnPlus = document.getElementById("modal-stepper-plus");

  if (btnMinus) {
    btnMinus.addEventListener("click", () => {
      if (state.modalQuantity > 1) {
        state.modalQuantity--;
        updateModalPriceCalculation();
      }
    });
  }

  if (btnPlus) {
    btnPlus.addEventListener("click", () => {
      if (state.modalQuantity < 20) {
        state.modalQuantity++;
        updateModalPriceCalculation();
      }
    });
  }

  // Add from Modal to Cart
  const modalAddBtn = document.getElementById("modal-add-btn");
  if (modalAddBtn) {
    modalAddBtn.addEventListener("click", () => {
      addModalItemToCart();
    });
  }

  // Close Modal Button
  const productModal = document.getElementById("product-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  if (productModal) {
    productModal.addEventListener("close", () => unlockBodyScroll());
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      if (productModal) productModal.close();
    });
  }

  // Mobile Bottom Bar -> Open Mobile Cart Drawer
  const mobileBarBtn = document.getElementById("mobile-cart-trigger-btn");
  const mobileCartDrawer = document.getElementById("mobile-cart-drawer");
  const mobileDrawerClose = document.getElementById("mobile-drawer-close-btn");

  if (mobileCartDrawer) {
    mobileCartDrawer.addEventListener("close", () => unlockBodyScroll());
  }

  if (mobileBarBtn && mobileCartDrawer) {
    mobileBarBtn.addEventListener("click", () => {
      lockBodyScroll();
      mobileCartDrawer.showModal();
    });
  }

  if (mobileDrawerClose && mobileCartDrawer) {
    mobileDrawerClose.addEventListener("click", () => {
      mobileCartDrawer.close();
    });
  }

  // Clear Cart Dialog Handlers
  const confirmClearDialog = document.getElementById("confirm-clear-dialog");
  const btnDoClearCart = document.getElementById("btn-do-clear-cart");
  const btnCancelClearCart = document.getElementById("btn-cancel-clear-cart");

  if (confirmClearDialog) {
    confirmClearDialog.addEventListener("close", () => unlockBodyScroll());
  }

  document.querySelectorAll('[data-action="open-clear-cart"]').forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.cart.length === 0) return;
      if (confirmClearDialog) {
        lockBodyScroll();
        confirmClearDialog.showModal();
      }
    });
  });

  if (btnDoClearCart) {
    btnDoClearCart.addEventListener("click", () => {
      state.cart = [];
      saveCart();
      updateCartUI();
      renderProducts();
      if (confirmClearDialog) confirmClearDialog.close();
    });
  }

  if (btnCancelClearCart) {
    btnCancelClearCart.addEventListener("click", () => {
      if (confirmClearDialog) confirmClearDialog.close();
    });
  }

  if (confirmClearDialog) {
    confirmClearDialog.onclick = (e) => {
      const rect = confirmClearDialog.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
        && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) confirmClearDialog.close();
    };
  }

  // Submit Order Buttons (both desktop sidebar and mobile drawer)
  document.querySelectorAll(".submit-order-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      submitOrder();
    });
  });

  // Safe Order Live Status Refresh Button
  const refreshStatusBtn = document.getElementById("refresh-order-status-btn");
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener("click", async () => {
      if (!state.trackingToken) return;

      refreshStatusBtn.disabled = true;
      try {
        if (state.isDemo) {
          await new Promise(r => setTimeout(r, 450));
          const statusData = simulateGetOrderStatus(state.trackingToken);
          const statusTextEl = document.getElementById("order-live-status-text");
          if (statusData && statusTextEl) statusTextEl.textContent = getOrderStatusLabel(statusData.status);
        } else {
          await refreshCustomerOrderStatus();
        }
      } finally {
        refreshStatusBtn.disabled = false;
      }
    });
  }

  // Reset / New Order Button
  const resetBtn = document.getElementById("reset-new-order-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetNewOrder();
    });
  }

  // Retry Button on Error Screen
  const retryBtn = document.getElementById("retry-load-menu-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      loadMenuData();
    });
  }
}

// XSS Prevention Utility
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Live Kitchen Status Sync Listener (Updates customer confirmation screen automatically)
function setupCustomerLiveOrderSync() {
  if (!state.isDemo) return;
  const applyLiveStatusUpdate = () => {
    if (!state.trackingToken) return;
    const statusTextEl = document.getElementById("order-live-status-text");
    if (!statusTextEl) return;
    const statusData = simulateGetOrderStatus(state.trackingToken);
    if (statusData && statusData.status_label) {
      statusTextEl.textContent = statusData.status_label;
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    const bc = new BroadcastChannel("box_coffee_kitchen_sync");
    bc.onmessage = (e) => {
      if (e.data && e.data.type === "status_changed") {
        applyLiveStatusUpdate();
      } else if (e.data && e.data.type === "menu_updated") {
        state.menuData = getLiveMenuData();
        renderApp();
      }
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key === "box_coffee_live_orders_v4") {
      applyLiveStatusUpdate();
    } else if (e.key === "box_coffee_live_menu_v4") {
      state.menuData = getLiveMenuData();
      renderApp();
    }
  });
}

// Launch application on DOM Ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupCustomerLiveOrderSync();
  });
} else {
  initApp();
  setupCustomerLiveOrderSync();
}
