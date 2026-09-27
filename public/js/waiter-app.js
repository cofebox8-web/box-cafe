// BOX COFE — Official Waiter POS Controller
// High-Speed Ordering Terminal with Luxury Customer Menu Aesthetics

import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { getStaffSession, signInStaff, signOutStaff } from "./staff-auth.js";

const $ = (id) => document.getElementById(id);

// Application State
const state = {
  profile: null,
  menuData: null,
  cartItems: [],
  activeCategoryId: "all",
  searchQuery: "",
  activeProductForModal: null,
  dialogPicks: {},
  dialogQuantity: 1,
  orderMode: "car", // 'car' or 'walkin'
  idempotencyKey: null,
  submitting: false,
  menuRealtimeChannel: null,
  menuRefreshTimer: null,
  menuRefreshInFlight: false,
  menuRefreshQueued: false,
  toastTimer: null
};

// Number and currency formatters
const digitFormat = new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 });
function formatAmount(amount) {
  return digitFormat.format(Math.round(Number(amount) || 0));
}
function formatMoney(amount) {
  return `${formatAmount(amount)} د.ع`;
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

// Toast Feedback Notification
function showToast(message, type = "info") {
  const toast = $("waiter-toast");
  if (!toast) return;

  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.className = `waiter-toast ${type}`;
  toast.style.display = "inline-flex";

  state.toastTimer = window.setTimeout(() => {
    toast.style.display = "none";
  }, 3200);
}

// Auth State Management
async function initAuth() {
  if (!isSupabaseConfigured || !supabase) {
    showLoginError("تعذر الاتصال بقاعدة البيانات. يرجى التحقق من الاتصال بالإنترنت.");
    return;
  }

  try {
    const session = await getStaffSession();
    if (session && session.profile) {
      await enterWithProfile(session.profile);
    } else {
      showLoginGate(true);
    }
  } catch (err) {
    console.warn("Session check fallback:", err);
    showLoginGate(true);
  }
}

function showLoginGate(show) {
  const gate = $("waiter-login-gate");
  const app = $("waiter-app");
  if (gate) gate.style.display = show ? "flex" : "none";
  if (app) app.style.display = show ? "none" : "block";
}

function showLoginError(msg) {
  const el = $("waiter-login-error");
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

async function enterWithProfile(profile) {
  // Validate Staff Role
  if (profile.role !== "roadside" && profile.role !== "owner" && profile.role !== "admin") {
    await signOutStaff().catch(() => {});
    throw new Error("هذا الحساب غير مصرح له باستخدام نقطة بيع الويتر.");
  }

  state.profile = profile;
  showLoginGate(false);

  // Set Header Information
  const nameEl = $("waiter-name-badge");
  const branchEl = $("waiter-branch-quiet");
  if (nameEl) nameEl.textContent = profile.full_name || "الويتر";
  if (branchEl) branchEl.textContent = profile.branch_name ? `· ${profile.branch_name}` : "";

  await loadMenuData();
  setupWaiterRealtime();
}

// Fetch Branch Menu
async function loadMenuData({ silent = false } = {}) {
  const container = $("waiter-products-container");
  if (!silent && container) {
    container.innerHTML = `
      <div style="padding: 40px 16px; text-align: center; color: var(--text-muted);">
        <p style="margin: 0; font-weight: 600;">جاري تحميل منيو الفرع…</p>
      </div>
    `;
  }

  try {
    const branchId = state.profile?.branch_id;
    if (!branchId) throw new Error("حساب الويتر غير مربوط بفرع فعّال. يرجى مراجعة الإدارة.");

    // Fetch active branch
    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("id, name, slug, is_active")
      .eq("id", branchId)
      .maybeSingle();

    if (branchErr || !branch || !branch.is_active) {
      throw new Error("فرع حسابك متوقف حالياً أو غير متوفر.");
    }

    // Attempt to fetch service point
    const { data: points } = await supabase
      .from("car_service_points")
      .select("qr_token, label, is_active")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .limit(1);

    const point = points?.[0];
    let res;

    if (point?.qr_token) {
      res = await supabase.rpc("get_customer_menu", {
        p_branch_slug: branch.slug,
        p_qr_token: point.qr_token
      });
    } else {
      res = await supabase.rpc("get_public_customer_menu", {
        p_branch_slug: branch.slug
      });
    }

    if (res.error || !res.data || res.data.success !== true) {
      throw new Error(res.data?.message || res.error?.message || "تعذر تحميل المنيو لهذا الفرع.");
    }

    state.menuData = res.data;
    renderCategories();
    renderCatalog();
  } catch (err) {
    console.error("Waiter loadMenu error:", err);
    if (!silent) {
      if (container) {
        container.innerHTML = `
          <div style="padding: 40px 16px; text-align: center; color: var(--status-error-text);">
            <p style="margin: 0 0 12px; font-weight: 700;">تعذر تحميل قائمة المنيو</p>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(err.message || "")}</p>
          </div>
        `;
      }
      showToast(err.message || "تعذر تحميل المنيو", "error");
    }
  }
}

// Realtime Listener for Instant Catalog & Price Updates
function setupWaiterRealtime() {
  if (!isSupabaseConfigured || !supabase || state.menuRealtimeChannel) return;
  const branchId = state.profile?.branch_id;
  if (!branchId) return;

  state.menuRealtimeChannel = supabase.channel(`waiter-pos-menu-${branchId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_products" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_items" }, scheduleRefresh)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRefresh();
  });
}

function scheduleRefresh() {
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
        scheduleRefresh();
      }
    }
  }, 400);
}

// Render Categories Bar
function renderCategories() {
  const list = $("waiter-categories-list");
  if (!list) return;

  const categories = state.menuData?.categories || [];
  let html = `
    <li>
      <button type="button" class="category-pill-btn ${state.activeCategoryId === 'all' ? 'active' : ''}" data-category="all">
        الكل
      </button>
    </li>
  `;

  for (const cat of categories) {
    const isActive = state.activeCategoryId === cat.id;
    html += `
      <li>
        <button type="button" class="category-pill-btn ${isActive ? 'active' : ''}" data-category="${escapeHtml(cat.id)}">
          ${escapeHtml(cat.name)}
        </button>
      </li>
    `;
  }

  list.innerHTML = html;
}

// Render Product Cards grouped by Category
function renderCatalog() {
  const container = $("waiter-products-container");
  if (!container) return;

  const categories = state.menuData?.categories || [];
  const products = state.menuData?.products || [];

  const query = state.searchQuery.trim().toLowerCase();
  const filtered = products.filter(p => {
    const matchCategory = state.activeCategoryId === "all" || p.category_id === state.activeCategoryId;
    const matchSearch = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query));
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 48px 16px; text-align: center; color: var(--text-muted);">
        <p style="font-size: 1.05rem; font-weight: 700; margin: 0 0 6px;">لا توجد أصناف مطابقة</p>
        <p style="font-size: 0.84rem; margin: 0;">جرّب كلمة بحث أخرى أو اختر قسماً آخر.</p>
      </div>
    `;
    return;
  }

  let html = "";

  for (const cat of categories) {
    const catProducts = filtered.filter(p => p.category_id === cat.id);
    if (catProducts.length === 0) continue;

    html += `
      <section class="category-block" id="cat-sec-${cat.id}">
        <div class="category-header">
          <div class="category-title-wrap">
            <span class="category-accent-bar" aria-hidden="true"></span>
            <h2 class="category-title">${escapeHtml(cat.name)}</h2>
          </div>
        </div>
        <div class="products-grid">
          ${catProducts.map(renderProductCardHtml).join("")}
        </div>
      </section>
    `;
  }

  // Uncategorized items
  const uncategorized = filtered.filter(p => !categories.some(c => c.id === p.category_id));
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
          ${uncategorized.map(renderProductCardHtml).join("")}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;
}

function renderProductCardHtml(p) {
  const isAvailable = p.is_available !== false;
  const hasOptions = Array.isArray(p.option_groups) && p.option_groups.length > 0;
  const priceFormatted = formatAmount(p.price);

  return `
    <article class="product-card ${!isAvailable ? 'unavailable' : ''}" data-product-id="${escapeHtml(p.id)}">
      <div class="product-card-media">
        ${!isAvailable ? `<span class="product-soldout-badge">غير متوفر</span>` : ""}
        ${p.image_url
          ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-card-img" loading="lazy" />`
          : `<div class="product-image-fallback">
              <svg class="placeholder-coffee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
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
          <button type="button" class="waiter-add-btn" data-action="add-product" data-product-id="${escapeHtml(p.id)}" ${!isAvailable ? 'disabled' : ''}>
            <span>إضافة</span>
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

// Product Action (Fast 1-tap add vs Modal for options)
function onProductClick(productId) {
  const product = state.menuData?.products?.find(p => p.id === productId);
  if (!product || product.is_available === false) return;

  const hasOptions = Array.isArray(product.option_groups) && product.option_groups.length > 0;

  if (!hasOptions) {
    // 1-tap immediate add
    addToCart(product, [], 1);
  } else {
    // Open clean options dialog
    openCustomizationDialog(product);
  }
}

// Option Customization Dialog
function openCustomizationDialog(product) {
  state.activeProductForModal = product;
  state.dialogQuantity = 1;
  state.dialogPicks = {};

  // Initialize defaults
  for (const group of product.option_groups || []) {
    const defaults = (group.options || []).filter(o => o.is_default).map(o => o.id);
    if (defaults.length > 0) {
      state.dialogPicks[group.id] = group.selection_type === "single" ? [defaults[0]] : defaults;
    } else {
      state.dialogPicks[group.id] = [];
    }
  }

  $("dialog-product-name").textContent = product.name;
  $("dialog-qty").textContent = "1";
  $("dialog-option-error").style.display = "none";

  renderDialogOptions();
  updateDialogTotalPrice();

  const dialog = $("product-dialog");
  if (dialog) dialog.showModal();
}

function renderDialogOptions() {
  const container = $("dialog-options-container");
  if (!container || !state.activeProductForModal) return;

  const groups = state.activeProductForModal.option_groups || [];
  let html = "";

  for (const group of groups) {
    const isRequired = Boolean(group.is_required);
    const isSingle = group.selection_type === "single";
    const selectedIds = state.dialogPicks[group.id] || [];

    html += `
      <div class="option-group-card">
        <div class="option-group-title-row">
          <h4 class="option-group-name">${escapeHtml(group.name)}</h4>
          <span class="group-badge ${isRequired ? 'required' : 'optional'}">
            ${isRequired ? 'إلزامي' : 'اختياري'}
          </span>
        </div>
        <div class="options-choice-list">
    `;

    for (const opt of group.options || []) {
      const modifier = Number(opt.price_modifier) || 0;
      const isSelected = selectedIds.includes(opt.id);
      const priceText = modifier > 0 ? `+${formatMoney(modifier)}` : "مشمول مع الصنف";

      html += `
        <label class="option-choice-item ${isSelected ? 'selected' : ''}">
          <div class="choice-label-wrap">
            <input
              type="${isSingle ? 'radio' : 'checkbox'}"
              name="opt_group_${escapeHtml(group.id)}"
              value="${escapeHtml(opt.id)}"
              data-group-id="${escapeHtml(group.id)}"
              ${isSelected ? 'checked' : ''}
            />
            <span>${escapeHtml(opt.name)}</span>
          </div>
          <span class="choice-price-tag">${priceText}</span>
        </label>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Bind change events
  container.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", () => {
      const groupId = input.dataset.groupId;
      const group = state.activeProductForModal?.option_groups?.find(g => g.id === groupId);
      if (!group) return;

      const isSingle = group.selection_type === "single";
      let picks = [...(state.dialogPicks[groupId] || [])];

      if (isSingle) {
        picks = [input.value];
      } else {
        if (input.checked) {
          const max = Number(group.max_selections || 99);
          if (picks.length >= max) {
            input.checked = false;
            showDialogOptionError(`الحد الأقصى لاختيارات ${group.name} هو ${max}`);
            return;
          }
          picks.push(input.value);
        } else {
          picks = picks.filter(id => id !== input.value);
        }
      }

      state.dialogPicks[groupId] = picks;
      showDialogOptionError(null);
      renderDialogOptions();
      updateDialogTotalPrice();
    });
  });
}

function showDialogOptionError(msg) {
  const el = $("dialog-option-error");
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

function calculateProductUnitPrice(product, selectedOptionIds = []) {
  let unit = Number(product.price || 0);
  const groups = product.option_groups || [];

  for (const group of groups) {
    for (const opt of group.options || []) {
      if (selectedOptionIds.includes(opt.id)) {
        unit += Number(opt.price_modifier || 0);
      }
    }
  }
  return unit;
}

function updateDialogTotalPrice() {
  if (!state.activeProductForModal) return;
  const selectedIds = Object.values(state.dialogPicks).flat();
  const unit = calculateProductUnitPrice(state.activeProductForModal, selectedIds);
  const total = unit * state.dialogQuantity;
  $("dialog-total-price").textContent = formatMoney(total);
}

function validateDialogSelections() {
  if (!state.activeProductForModal) return false;
  const groups = state.activeProductForModal.option_groups || [];

  for (const group of groups) {
    const picks = state.dialogPicks[group.id] || [];
    const min = Math.max(Number(group.min_selections || 0), group.is_required ? 1 : 0);
    const max = Number(group.max_selections || (group.selection_type === "multiple" ? 99 : 1));

    if (picks.length < min) {
      showDialogOptionError(`يرجى تحديد خيار في "${group.name}".`);
      return false;
    }
    if (picks.length > max) {
      showDialogOptionError(`الحد الأقصى لخيارات "${group.name}" هو ${max}.`);
      return false;
    }
  }
  return true;
}

// Cart Management
function addToCart(product, selectedOptionIds = [], quantity = 1) {
  // Check if identical item (same product & same options) exists in cart
  const sortedNew = [...selectedOptionIds].sort().join(",");
  const existing = state.cartItems.find(item => {
    const sortedExisting = [...item.selectedOptionIds].sort().join(",");
    return item.product.id === product.id && sortedExisting === sortedNew;
  });

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.cartItems.push({
      product,
      selectedOptionIds,
      quantity
    });
  }

  state.idempotencyKey = null;
  renderCart();
  showToast(`تمت إضافة "${product.name}" إلى السلة`, "success");
}

function renderCart() {
  const container = $("cart-items-container");
  const emptyView = $("cart-empty-view");
  const countBadge = $("cart-count-badge");
  const clearBtn = $("cart-clear-btn");
  const submitBtn = $("cart-submit-btn");
  const totalPriceEl = $("cart-total-amount");

  const mobileCount = $("mobile-cart-items-count");
  const mobileTotal = $("mobile-cart-total-price");

  const totalItemsCount = state.cartItems.reduce((acc, i) => acc + i.quantity, 0);

  let grandTotal = 0;
  for (const item of state.cartItems) {
    const unitPrice = calculateProductUnitPrice(item.product, item.selectedOptionIds);
    grandTotal += unitPrice * item.quantity;
  }

  // Update counts & total
  if (countBadge) countBadge.textContent = String(totalItemsCount);
  if (clearBtn) clearBtn.style.display = state.cartItems.length > 0 ? "inline-block" : "none";
  if (submitBtn) submitBtn.disabled = state.cartItems.length === 0 || state.submitting;
  if (totalPriceEl) totalPriceEl.textContent = formatMoney(grandTotal);

  if (mobileCount) mobileCount.textContent = `${totalItemsCount} أصناف`;
  if (mobileTotal) mobileTotal.textContent = formatMoney(grandTotal);

  if (!container) return;

  if (state.cartItems.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-view" id="cart-empty-view">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" stroke-width="1.8"/></svg>
        <span>السلة فارغة</span>
      </div>
    `;
    return;
  }

  let html = "";
  state.cartItems.forEach((item, index) => {
    const unitPrice = calculateProductUnitPrice(item.product, item.selectedOptionIds);
    const lineTotal = unitPrice * item.quantity;

    // Collect names of selected options
    const optionNames = [];
    for (const group of item.product.option_groups || []) {
      for (const opt of group.options || []) {
        if (item.selectedOptionIds.includes(opt.id)) {
          optionNames.push(opt.name);
        }
      }
    }

    html += `
      <div class="cart-item-row" data-cart-index="${index}">
        <div class="cart-item-top">
          <div class="cart-item-info">
            <span class="cart-item-name">${escapeHtml(item.product.name)}</span>
            ${optionNames.length > 0
              ? `<span class="cart-item-options">${escapeHtml(optionNames.join(" · "))}</span>`
              : ""
            }
          </div>
          <span class="cart-item-price">${formatMoney(lineTotal)}</span>
        </div>
        <div class="cart-item-actions">
          <div class="cart-stepper">
            <button type="button" data-action="decrease-qty" data-index="${index}" aria-label="تقليل الكمية">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-action="increase-qty" data-index="${index}" aria-label="زيادة الكمية">+</button>
          </div>
          <button type="button" class="cart-item-remove-btn" data-action="remove-item" data-index="${index}">حذف</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind actions
  container.querySelectorAll("[data-action='decrease-qty']").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (state.cartItems[idx]) {
        if (state.cartItems[idx].quantity > 1) {
          state.cartItems[idx].quantity--;
        } else {
          state.cartItems.splice(idx, 1);
        }
        renderCart();
      }
    });
  });

  container.querySelectorAll("[data-action='increase-qty']").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (state.cartItems[idx] && state.cartItems[idx].quantity < 50) {
        state.cartItems[idx].quantity++;
        renderCart();
      }
    });
  });

  container.querySelectorAll("[data-action='remove-item']").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (state.cartItems[idx]) {
        state.cartItems.splice(idx, 1);
        renderCart();
      }
    });
  });
}

// Order Mode Switcher
function setOrderMode(mode) {
  state.orderMode = mode;

  const carBtn = $("mode-car-btn");
  const walkinBtn = $("mode-walkin-btn");
  const vehicleInput = $("order-vehicle-input");
  const walkinInput = $("order-walkin-input");

  if (carBtn) {
    carBtn.classList.toggle("active", mode === "car");
    carBtn.setAttribute("aria-checked", mode === "car");
  }
  if (walkinBtn) {
    walkinBtn.classList.toggle("active", mode === "walkin");
    walkinBtn.setAttribute("aria-checked", mode === "walkin");
  }

  if (mode === "car") {
    if (vehicleInput) vehicleInput.style.display = "block";
    if (walkinInput) walkinInput.style.display = "none";
  } else {
    if (vehicleInput) vehicleInput.style.display = "none";
    if (walkinInput) walkinInput.style.display = "block";
  }
}

// Place Order RPC
async function submitOrder() {
  if (state.submitting || state.cartItems.length === 0) return;
  state.submitting = true;

  const submitBtn = $("cart-submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>جارٍ إرسال الطلب…</span>`;
  }

  if (!state.idempotencyKey) {
    state.idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const itemsPayload = state.cartItems.map(item => ({
    product_id: item.product.id,
    quantity: item.quantity,
    selected_option_ids: item.selectedOptionIds,
    note: ""
  }));

  const vehicleVal = $("order-vehicle-input")?.value?.trim() || "";
  const walkinVal = $("order-walkin-input")?.value?.trim() || "";
  const orderNoteVal = $("order-kitchen-note")?.value?.trim() || "";

  const finalContextNote = state.orderMode === "car" ? vehicleVal : walkinVal;

  try {
    if (!supabase) throw new Error("خدمة الاتصال بالنظام غير متوفرة.");

    const { data, error } = await supabase.rpc("place_waiter_order", {
      p_items: itemsPayload,
      p_order_mode: state.orderMode,
      p_vehicle_note: finalContextNote || null,
      p_order_note: orderNoteVal || null,
      p_idempotency_key: state.idempotencyKey
    });

    if (error || !data || data.success !== true || !data.order_code) {
      throw new Error(data?.message || data?.error || error?.message || "تعذر حفظ الطلب في قاعدة البيانات.");
    }

    const orderCode = data.order_code;
    const finalTotal = data.total_price || 0;

    // Show Success Dialog
    const successDialog = $("success-dialog");
    if (successDialog) {
      $("success-order-code").textContent = `#${orderCode}`;
      $("success-order-total").textContent = `المجموع: ${formatMoney(finalTotal)}`;
      successDialog.showModal();
    }

    // Reset Cart
    state.cartItems = [];
    state.idempotencyKey = null;
    if ($("order-vehicle-input")) $("order-vehicle-input").value = "";
    if ($("order-walkin-input")) $("order-walkin-input").value = "";
    if ($("order-kitchen-note")) $("order-kitchen-note").value = "";

    // Close Mobile Drawer if open
    closeMobileCartDrawer();
    renderCart();
    showToast(`تم إنشاء الطلب #${orderCode} بنجاح`, "success");
  } catch (err) {
    console.error("Order submit exception:", err);
    showToast(err.message || "فشل إرسال الطلب. يرجى المحاولة ثانية.", "error");
  } finally {
    state.submitting = false;
    if (submitBtn) {
      submitBtn.innerHTML = `<span>إنشاء الطلب</span><span aria-hidden="true">←</span>`;
    }
    renderCart();
  }
}

// Mobile Cart Drawer Toggles
function openMobileCartDrawer() {
  const panel = $("waiter-cart-panel");
  if (panel) panel.classList.add("open");
}

function closeMobileCartDrawer() {
  const panel = $("waiter-cart-panel");
  if (panel) panel.classList.remove("open");
}

// Bind Global Event Listeners
function setupEventListeners() {
  // Login Form
  $("waiter-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("waiter-email")?.value?.trim() || "";
    const password = $("waiter-password")?.value || "";
    const submitBtn = $("waiter-login-submit");

    showLoginError(null);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الدخول…";
    }

    try {
      const result = await signInStaff(email, password);
      await enterWithProfile(result.profile);
    } catch (err) {
      showLoginError(err.message || "تعذر تسجيل الدخول. تأكد من البيانات.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "دخول";
      }
    }
  });

  // Logout
  $("waiter-signout-btn")?.addEventListener("click", async () => {
    try {
      await signOutStaff();
    } catch (err) {
      console.warn("Signout error:", err);
    }
    state.profile = null;
    state.menuData = null;
    state.cartItems = [];
    showLoginGate(true);
  });

  // Search Input
  $("waiter-search")?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderCatalog();
  });

  // Category Pills delegation
  $("waiter-categories-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;

    state.activeCategoryId = btn.dataset.category;
    renderCategories();
    renderCatalog();

    if (state.activeCategoryId !== "all") {
      const section = $(`cat-sec-${state.activeCategoryId}`);
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Catalog Click delegation (Card or Add button)
  $("waiter-products-container")?.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-action='add-product']");
    const card = e.target.closest(".product-card");
    const productId = addBtn?.dataset.productId || card?.dataset.productId;

    if (productId) {
      onProductClick(productId);
    }
  });

  // Dialog Stepper & Add
  $("dialog-qty-minus")?.addEventListener("click", () => {
    if (state.dialogQuantity > 1) {
      state.dialogQuantity--;
      $("dialog-qty").textContent = String(state.dialogQuantity);
      updateDialogTotalPrice();
    }
  });

  $("dialog-qty-plus")?.addEventListener("click", () => {
    if (state.dialogQuantity < 50) {
      state.dialogQuantity++;
      $("dialog-qty").textContent = String(state.dialogQuantity);
      updateDialogTotalPrice();
    }
  });

  $("dialog-close-btn")?.addEventListener("click", () => {
    $("product-dialog")?.close();
  });

  $("dialog-add-btn")?.addEventListener("click", () => {
    if (!validateDialogSelections()) return;
    const selectedIds = Object.values(state.dialogPicks).flat();
    addToCart(state.activeProductForModal, selectedIds, state.dialogQuantity);
    $("product-dialog")?.close();
  });

  // Cart Clear
  $("cart-clear-btn")?.addEventListener("click", () => {
    state.cartItems = [];
    state.idempotencyKey = null;
    renderCart();
  });

  // Order Mode Toggles
  $("mode-car-btn")?.addEventListener("click", () => setOrderMode("car"));
  $("mode-walkin-btn")?.addEventListener("click", () => setOrderMode("walkin"));

  // Submit Order
  $("cart-submit-btn")?.addEventListener("click", submitOrder);

  // Mobile Drawer Controls
  $("mobile-cart-open-btn")?.addEventListener("click", openMobileCartDrawer);
  $("cart-mobile-close-btn")?.addEventListener("click", closeMobileCartDrawer);

  // Success Dialog - New Order Button
  $("success-new-order-btn")?.addEventListener("click", () => {
    $("success-dialog")?.close();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// App Entrypoint
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initAuth();
});
