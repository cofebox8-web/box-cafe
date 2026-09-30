// BOX COFE — Customer Read-Only Menu Controller
// Vanilla JS ES Module — No Bundler, No Node.js runtime, Pure Read-Only

import { supabase, isSupabaseConfigured } from "./supabase-client.js";

// Application State
const state = {
  branchSlug: "",
  qrToken: "",
  menuData: null,
  activeCategoryId: "all",
  searchQuery: "",
  selectedProductForModal: null,
  menuRealtimeChannel: null,
  menuRefreshTimer: null,
  menuRefreshInFlight: false,
  menuRefreshQueued: false
};

// SVG Icons Dictionary
const ICONS = {
  coffee: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`,
  close: `<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  cupRegular: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>`,
  cupLarge: `<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M19 6h1a4 4 0 0 1 0 8h-1M2 6h17v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6zM6 1v2M10 1v2M14 1v2"/></svg>`,
  sparkle: `<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  milk: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  flame: `<svg class="icon" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  heat: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-9.33-5M15 15a6 6 0 0 0-9.33-5M12 22a6 6 0 0 0-9.33-5"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
};

function getOptionIcon(groupName = "", optName = "") {
  const g = (groupName || "").toLowerCase();
  const o = (optName || "").toLowerCase();
  if (g.includes("حجم") || o.includes("حجم") || o.includes("size")) {
    if (o.includes("كبير") || o.includes("large") || o.includes("lrg")) return ICONS.cupLarge;
    return ICONS.cupRegular;
  }
  if (g.includes("حليب") || o.includes("حليب") || o.includes("milk") || o.includes("شوفان") || o.includes("لوز")) return ICONS.milk;
  if (g.includes("حرار") || o.includes("حار") || o.includes("hot") || o.includes("دافئ")) return ICONS.heat;
  if (g.includes("شوت") || o.includes("shot") || o.includes("إسبريسو")) return ICONS.flame;
  if (g.includes("سكر") || o.includes("حلاوة") || o.includes("sweet") || o.includes("sugar")) return ICONS.star;
  return ICONS.sparkle;
}

// Format Iraqi Dinar / currency
function formatAmountOnly(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(num);
}

function formatMoney(amount, currency = "IQD") {
  return `${formatAmountOnly(amount)} د.ع`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Parse Route Context
function parseRouteContext() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const urlParams = new URLSearchParams(window.location.search);

  let branch = "";
  let token = "";

  const menuIndex = pathParts.indexOf("menu");
  const customerIndex = pathParts.indexOf("customer");
  const targetIndex = menuIndex !== -1 ? menuIndex : customerIndex;

  if (targetIndex !== -1 && pathParts.length > targetIndex + 1) {
    branch = pathParts[targetIndex + 1] || "";
    token = pathParts[targetIndex + 2] || "";
  }

  // Fallback to query params if not in path
  if (!branch) branch = urlParams.get("branch") || "";
  if (!token) token = urlParams.get("token") || "";

  state.branchSlug = branch.trim();
  state.qrToken = token.trim();
}

const MENU_CACHE_PREFIX = "box_cofe_customer_menu_v1";

function getMenuCacheKey() {
  const branch = state.branchSlug || "default";
  const token = state.qrToken || "public";
  return `${MENU_CACHE_PREFIX}_${branch}_${token}`;
}

function readCachedMenu() {
  try {
    const raw = localStorage.getItem(getMenuCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.success === true && Array.isArray(parsed.categories) && Array.isArray(parsed.products)) {
      return parsed;
    }
  } catch (e) {
    console.warn("Could not read menu cache:", e);
  }
  return null;
}

function saveMenuCache(data) {
  try {
    if (data && data.success === true && Array.isArray(data.categories) && Array.isArray(data.products)) {
      localStorage.setItem(getMenuCacheKey(), JSON.stringify(data));
    }
  } catch (e) {
    console.warn("Could not save menu cache:", e);
  }
}

// Fetch Menu Data from Supabase RPC
async function loadMenuData({ silent = false } = {}) {
  if (!silent) showSkeletonLoading(true);
  if (!silent) hideErrorScreen();

  try {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("تعذر الاتصال بقاعدة البيانات. يرجى التحقق من الاتصال بالإنترنت وإعادة المحاولة.");
    }

    let res;
    // Rule:
    // - If route has branch and token, use get_customer_menu
    // - If route is / or /customer without token, use get_public_customer_menu
    if (state.branchSlug && state.qrToken) {
      res = await supabase.rpc("get_customer_menu", {
        p_branch_slug: state.branchSlug,
        p_qr_token: state.qrToken
      });
    } else {
      res = await supabase.rpc("get_public_customer_menu", {
        p_branch_slug: state.branchSlug || null
      });
    }

    if (res.error) {
      throw new Error(res.error.message || "تعذر جلب المنيو من الخادم.");
    }

    if (!res.data || res.data.success !== true) {
      const errCode = res.data?.error;
      const errMsg = res.data?.message || (errCode === "INVALID_SERVICE_POINT"
        ? "رمز نقطة الخدمة غير متوفر أو تم إيقافه مؤقتاً."
        : (errCode === "NO_ACTIVE_SERVICE_POINT"
          ? "لا توجد نقطة خدمة فعالة لعرض المنيو حالياً."
          : "تعذر جلب بيانات المنيو أو نقطة الخدمة."));
      if (!silent) showErrorScreen("تنبيه المنيو", errMsg);
      return;
    }

    state.menuData = res.data;
    if (res.data?.branch?.slug) {
      state.branchSlug = res.data.branch.slug;
    }
    saveMenuCache(res.data);
    renderApp();
    setupCustomerMenuRealtime();
  } catch (err) {
    console.error("Menu fetch exception:", err);
    if (!silent && !state.menuData) {
      showErrorScreen("خطأ في الاتصال", err.message || "تعذر جلب المنيو من الخادم. يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة.");
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
  }, 300);
}

function setupCustomerMenuRealtime() {
  if (!isSupabaseConfigured || !supabase || !state.branchSlug || state.menuRealtimeChannel) return;
  state.menuRealtimeChannel = supabase.channel(`box-coffee-customer-menu-${state.branchSlug}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_products" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, scheduleCustomerMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_items" }, scheduleCustomerMenuRefresh)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleCustomerMenuRefresh();
  });
}

// Master Render Function
function renderApp() {
  if (!state.menuData) return;

  renderHeaderInfo();
  renderCategories();
  renderProducts();
}

function renderHeaderInfo() {
  // Top bar is kept clean and minimalist with only the official brand signature lockup
}

// Render Category Filter Pills
function renderCategories() {
  const list = document.getElementById("categories-list");
  if (!list) return;

  const categories = state.menuData.categories || [];
  let html = `
    <li class="category-item">
      <button type="button" class="category-pill-btn ${state.activeCategoryId === 'all' ? 'active' : ''}"
        data-category-id="all" aria-pressed="${state.activeCategoryId === 'all'}">
        <span>الكل</span>
      </button>
    </li>
  `;

  for (const cat of categories) {
    const isActive = state.activeCategoryId === cat.id;
    html += `
      <li class="category-item">
        <button type="button" class="category-pill-btn ${isActive ? 'active' : ''}"
          data-category-id="${cat.id}" aria-pressed="${isActive}">
          <span>${escapeHtml(cat.name)}</span>
        </button>
      </li>
    `;
  }

  list.innerHTML = html;

  list.querySelectorAll(".category-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const catId = btn.dataset.categoryId;
      state.activeCategoryId = catId;
      renderCategories();
      renderProducts();

      if (catId !== "all") {
        const targetSection = document.getElementById(`cat-section-${catId}`);
        if (targetSection) {
          targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });
}

// Helper to render a single read-only product card
function renderProductCardHtml(p, currency = "IQD") {
  const isAvailable = p.is_available !== false;
  const hasOptions = Array.isArray(p.option_groups) && p.option_groups.length > 0;
  const priceFormatted = formatAmountOnly(p.price);

  return `
    <article class="product-card ${!isAvailable ? 'unavailable' : ''}" data-product-id="${p.id}" tabindex="0" role="button" aria-label="عرض خيارات ${escapeHtml(p.name)}">
      <div class="product-card-media">
        ${!isAvailable ? `<span class="product-soldout-badge">غير متوفر حالياً</span>` : ""}
        ${p.image_url
          ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-card-img" loading="lazy" />`
          : `<div class="product-image-fallback">
              <svg class="placeholder-coffee-svg icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
              <span class="placeholder-brand-text">BOX COFE</span>
            </div>`
        }
      </div>
      <div class="product-card-body">
        <div class="product-card-top-info">
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          ${hasOptions ? `<span class="product-custom-hint">متاح تخصيصه</span>` : ""}
          ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ""}
        </div>
        <div class="product-card-footer">
          <div class="product-price-row">
            <span class="price-amount">${priceFormatted}</span>
            <span class="price-currency">د.ع</span>
          </div>
          <button type="button" class="view-details-btn" data-action="view-details" data-product-id="${p.id}" aria-label="عرض خيارات ${escapeHtml(p.name)}">
            <span>عرض الخيارات</span>
            <svg class="btn-arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        </div>
      </div>
    </article>
  `;
}

// Render Read-Only Product Cards
function renderProducts() {
  const container = document.getElementById("products-container");
  if (!container) return;

  const categories = state.menuData?.categories || [];
  const products = state.menuData?.products || [];
  const currency = state.menuData?.restaurant?.currency_code || "IQD";

  const query = state.searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter(p => {
    const matchCategory = state.activeCategoryId === "all" || p.category_id === state.activeCategoryId;
    const matchSearch = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query));
    return matchCategory && matchSearch;
  });

  if (filteredProducts.length === 0) {
    if (query) {
      container.innerHTML = `
        <div class="menu-empty-view">
          <div class="empty-icon-circle">${ICONS.search}</div>
          <h3>لا توجد نتائج بحث مطابقة</h3>
          <p>لم نجد أي صنف يطابق "<strong>${escapeHtml(query)}</strong>". جرّب كتابة كلمة أخرى.</p>
        </div>
      `;
    } else if (products.length === 0) {
      container.innerHTML = `
        <div class="menu-empty-view">
          <div class="empty-icon-circle">${ICONS.coffee}</div>
          <h3>قائمة المنيو قيد التحديث</h3>
          <p>يقوم فريق بوكس كافي بتحديث قائمة المشروبات والمخبوزات. ستظهر الأصناف هنا فور نشرها.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="menu-empty-view">
          <div class="empty-icon-circle">${ICONS.coffee}</div>
          <h3>لا توجد أصناف في هذا القسم حالياً</h3>
          <p>اختر قسماً آخر أو اختر "الكل" لعرض كافة الأصناف المتاحة.</p>
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
          <div class="category-title-wrap">
            <span class="category-accent-bar" aria-hidden="true"></span>
            <h2 class="category-title">${escapeHtml(cat.name)}</h2>
          </div>
        </div>
        <div class="products-grid">
          ${catProducts.map(p => renderProductCardHtml(p, currency)).join("")}
        </div>
      </section>
    `;
  }

  // Handle products that don't match any category
  const uncategorized = filteredProducts.filter(p => !categories.some(c => c.id === p.category_id));
  if (uncategorized.length > 0) {
    html += `
      <section class="category-block">
        <div class="category-header">
          <div class="category-title-wrap">
            <span class="category-accent-bar" aria-hidden="true"></span>
            <h2 class="category-title">أصناف مميزة</h2>
          </div>
        </div>
        <div class="products-grid">
          ${uncategorized.map(p => renderProductCardHtml(p, currency)).join("")}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;

  // Bind click on card or details button to open details modal
  container.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", () => {
      const prodId = card.dataset.productId;
      if (prodId) openProductDetailsModal(prodId);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const prodId = card.dataset.productId;
        if (prodId) openProductDetailsModal(prodId);
      }
    });
  });
}

// Open Read-Only Product Details Modal
function openProductDetailsModal(productId) {
  const product = state.menuData?.products?.find(p => p.id === productId);
  if (!product) return;

  state.selectedProductForModal = product;
  renderModalContent();

  const modal = document.getElementById("product-modal");
  if (modal) {
    lockBodyScroll();
    modal.showModal();

    // Immediately remove focus so Chrome's auto-focus does not draw a blue focus ring
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

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

// Render Modal Body with Read-Only Sizes, Addons, and Details
function renderModalContent() {
  const p = state.selectedProductForModal;
  if (!p) return;

  const currency = state.menuData?.restaurant?.currency_code || "IQD";

  // Product Thumbnail
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

  const titleEl = document.getElementById("modal-product-title");
  if (titleEl) titleEl.textContent = p.name;

  const descEl = document.getElementById("modal-product-desc");
  if (descEl) descEl.textContent = p.description || "قهوة مختصة محضرة بعناية من بوكس كافي.";

  const basePriceChip = document.getElementById("modal-base-price-chip");
  if (basePriceChip) {
    basePriceChip.textContent = `السعر الأساسي: ${formatMoney(p.price, currency)}`;
  }

  const optionsContainer = document.getElementById("modal-options-container");
  if (!optionsContainer) return;

  let optionsHtml = "";

  if (p.option_groups && p.option_groups.length > 0) {
    for (const group of p.option_groups) {
      const isRequired = Boolean(group.is_required);
      optionsHtml += `
        <div class="modal-read-group">
          <div class="group-title-row">
            <h4 class="group-name-title">${escapeHtml(group.name)}</h4>
            <span class="group-badge ${isRequired ? 'required' : 'optional'}">
              ${isRequired ? 'إلزامي' : 'اختياري'}
            </span>
          </div>
          <div class="read-options-list">
      `;

      const options = group.options || [];
      for (const opt of options) {
        const modifier = Number(opt.price_modifier) || 0;
        const isFree = modifier === 0;
        const modifierText = isFree ? "مشمول مع الصنف" : `+${formatMoney(modifier, currency)}`;
        const iconSvg = getOptionIcon(group.name, opt.name);

        optionsHtml += `
          <div class="read-option-card">
            <div class="read-option-main">
              <span class="read-option-icon" aria-hidden="true">${iconSvg}</span>
              <span class="read-option-name">${escapeHtml(opt.name)}</span>
            </div>
            <span class="read-option-badge ${isFree ? 'included' : 'extra'}">${modifierText}</span>
          </div>
        `;
      }

      optionsHtml += `
          </div>
        </div>
      `;
    }
  } else {
    optionsHtml = `
      <div class="modal-info-note">
        <span class="icon" aria-hidden="true">${ICONS.info}</span>
        <p>هذا الصنف يقدم بالطريقة القياسية المعتمدة لدى باريستا بوكس كافي دون خيارات تخصيص إضافية.</p>
      </div>
    `;
  }

  optionsContainer.innerHTML = optionsHtml;
}

// Mobile & Desktop Scroll Lock (Zero-reflow, no layout shifts)
function lockBodyScroll() {
  document.body.classList.add("modal-open-scroll-locked");
  document.documentElement.classList.add("modal-open-scroll-locked");
}

function unlockBodyScroll() {
  document.body.classList.remove("modal-open-scroll-locked");
  document.documentElement.classList.remove("modal-open-scroll-locked");
}

// UI State Toggles: Skeleton, Error Screen
function showSkeletonLoading(show) {
  const skeleton = document.getElementById("skeleton-loading-container");
  const mainLayout = document.getElementById("main-ordering-layout");
  if (skeleton) skeleton.style.display = show ? "flex" : "none";
  if (mainLayout) mainLayout.style.display = show ? "none" : "block";
}

function showErrorScreen(title, message) {
  const errView = document.getElementById("error-screen-view");
  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");

  if (errView) {
    document.getElementById("error-screen-title").textContent = title;
    document.getElementById("error-screen-message").textContent = message;
    errView.style.display = "flex";
  }
  if (mainLayout) mainLayout.style.display = "none";
  if (searchSec) searchSec.style.display = "none";
}

function hideErrorScreen() {
  const errView = document.getElementById("error-screen-view");
  const mainLayout = document.getElementById("main-ordering-layout");
  const searchSec = document.getElementById("search-filter-section");

  if (errView) errView.style.display = "none";
  if (mainLayout) mainLayout.style.display = "block";
  if (searchSec) searchSec.style.display = "block";
}

// Setup Event Listeners
function setupEventListeners() {
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

  // Close Modal Button & Dialog
  const productModal = document.getElementById("product-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalDismissBtn = document.getElementById("modal-dismiss-btn");

  if (productModal) {
    productModal.addEventListener("close", () => unlockBodyScroll());
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      if (productModal) productModal.close();
    });
  }
  if (modalDismissBtn) {
    modalDismissBtn.addEventListener("click", () => {
      if (productModal) productModal.close();
    });
  }

  // Retry Button on error screen
  const retryBtn = document.getElementById("retry-load-menu-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      loadMenuData();
    });
  }
}

// Application Entry Point
document.addEventListener("DOMContentLoaded", () => {
  parseRouteContext();
  setupEventListeners();

  // Instant Stale-While-Revalidate bootstrap:
  // Render cached menu immediately (0ms instant display)
  const cached = readCachedMenu();
  if (cached && Array.isArray(cached.categories) && cached.categories.length > 0) {
    state.menuData = cached;
    if (cached.branch?.slug) {
      state.branchSlug = cached.branch.slug;
    }
    showSkeletonLoading(false);
    renderApp();
    // Revalidate in background silently
    loadMenuData({ silent: true });
  } else {
    // First visit ever: show skeleton and fetch fresh data
    loadMenuData({ silent: false });
  }

  setupCustomerMenuRealtime();
});
