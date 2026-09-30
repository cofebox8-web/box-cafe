// BOX COFE — Official Waiter POS Controller
// Vanilla JS ES Module — Pure Static, High-Performance, Luxury POS Terminal

import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { getStaffSession, signInStaff, signOutStaff } from "./staff-auth.js";

// Application State
const state = {
  profile: null,
  menuData: null,
  activeCategoryId: "all",
  searchQuery: "",
  selectedProductForModal: null,
  modalSelectedOptions: {}, // { groupId: [optionId, ...] }
  modalQuantity: 1,
  cart: [],
  orderMode: "car", // 'car' | 'walkin'
  vehicleNote: "",
  walkinNote: "",
  orderNote: "",
  isSubmitting: false,
  pendingSubmitAfterLogin: false,
  realtimeChannel: null,
  orderRealtimeChannel: null,
  orderRealtimeUserId: null,
  orderRealtimeRetryTimer: null,
  orderRealtimeHasSubscribed: false,
  orderStatusRefreshInFlight: false,
  orderStatusByCode: new Map(),
  readyDeliveryOrders: new Map(),
  readyDeliveryPanel: null,
  markingDeliveredCodes: new Set(),
  waiterAudioContext: null,
  refreshTimer: null,
  refreshInFlight: false
};

// SVG Icons Dictionary (Matching menu-app.js)
const ICONS = {
  coffee: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  check: `<svg class="icon icon-sm" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  cupRegular: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>`,
  cupLarge: `<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M19 6h1a4 4 0 0 1 0 8h-1M2 6h17v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6zM6 1v2M10 1v2M14 1v2"/></svg>`,
  sparkle: `<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  milk: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  flame: `<svg class="icon" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  heat: `<svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-9.33-5M15 15a6 6 0 0 0-9.33-5M12 22a6 6 0 0 0-9.33-5"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
};

function formatAmount(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

function formatMoney(amount, currency = "IQD") {
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

function $(id) {
  return document.getElementById(id);
}

// --------------------------------------------------------------------------
// 1. Initialization & Session Check
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initPOS();
});

async function initPOS() {
  loadSavedCart();
  setupEventListeners();

  // Check Staff Auth Session silently
  try {
    const staffSession = await getStaffSession(supabase);
    if (staffSession?.profile) {
      state.profile = staffSession.profile;
      updateAuthUI(staffSession.profile);
    } else {
      updateAuthUI(null);
    }
  } catch (err) {
    console.debug("Silent staff session check:", err?.message);
    updateAuthUI(null);
  }

  // Load Menu Data immediately (No blocking screen!)
  await loadMenuData();
  setupRealtime();
  if (state.profile?.role === "roadside") setupOrderRealtime();
}

function updateAuthUI(profile) {
  const authBadges = document.querySelectorAll("#waiter-auth-badge, .waiter-status-pill");
  const loginTriggers = document.querySelectorAll("#waiter-login-trigger, #desktop-login-trigger, .waiter-login-trigger-btn");
  const nameTexts = document.querySelectorAll("#waiter-name-text, .waiter-name-text");

  if (profile) {
    authBadges.forEach(b => b.style.display = "inline-flex");
    loginTriggers.forEach(t => t.style.display = "none");
    const roleStr = profile.role === "roadside" ? "الويتر" : "إدارة";
    const displayName = profile.full_name || profile.email || "موظف";
    nameTexts.forEach(nt => {
      nt.textContent = `${roleStr}: ${displayName}`;
      nt.title = `${roleStr}: ${displayName}`;
    });
  } else {
    authBadges.forEach(b => b.style.display = "none");
    loginTriggers.forEach(t => t.style.display = "inline-flex");
  }

  if (profile?.role === "roadside") {
    const readyPanel = ensureWaiterReadyPanel();
    if (readyPanel) readyPanel.style.display = "flex";
  } else if (state.readyDeliveryPanel) {
    state.readyDeliveryPanel.style.display = "none";
  }
}

// --------------------------------------------------------------------------
// 2. Menu Catalog Loading & Realtime
// --------------------------------------------------------------------------
async function loadMenuData({ silent = false } = {}) {
  const skeleton = $("skeleton-loading-container");
  const workspace = $("pos-workspace");
  const errorScreen = $("error-screen-view");

  if (!silent) {
    if (skeleton) skeleton.style.display = "block";
    if (workspace) workspace.style.display = "none";
    if (errorScreen) errorScreen.style.display = "none";
  }

  try {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("تعذر الاتصال بقاعدة البيانات. يرجى التحقق من الاتصال بالإنترنت.");
    }

    let res;
    // If waiter profile has branch, fetch customer menu for that branch
    if (state.profile?.branch_slug) {
      res = await supabase.rpc("get_public_customer_menu", {
        p_branch_slug: state.profile.branch_slug
      });
    } else {
      res = await supabase.rpc("get_public_customer_menu", {});
    }

    if (res.error || !res.data || res.data.success !== true) {
      throw new Error(res.data?.message || res.error?.message || "تعذر جلب أصناف المنيو من الخادم.");
    }

    state.menuData = res.data;
    renderCategories();
    renderProducts();
    renderCart();

    if (skeleton) skeleton.style.display = "none";
    if (workspace) workspace.style.display = "grid";
    if (errorScreen) errorScreen.style.display = "none";
  } catch (err) {
    console.error("loadMenuData error:", err);
    if (!silent) {
      if (skeleton) skeleton.style.display = "none";
      if (workspace) workspace.style.display = "none";
      if (errorScreen) {
        errorScreen.style.display = "flex";
        const msg = $("error-screen-message");
        if (msg) msg.textContent = err.message || "حدث خطأ أثناء تحميل الأصناف.";
      }
    }
  }
}

function setupRealtime() {
  if (!isSupabaseConfigured || !supabase || state.realtimeChannel) return;

  state.realtimeChannel = supabase.channel("waiter-pos-live-menu")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_products" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_items" }, scheduleRefresh)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    scheduleRefresh();
    recoverOrderRealtime();
  });

  window.addEventListener("online", recoverOrderRealtime);
  document.addEventListener("pointerdown", unlockWaiterAudio, { once: true, capture: true });
  document.addEventListener("keydown", unlockWaiterAudio, { once: true, capture: true });
}

function setupOrderRealtime() {
  const userId = state.profile?.user_id;
  const branchId = state.profile?.branch_id;
  if (!isSupabaseConfigured || !supabase || !userId || !branchId || state.profile?.role !== "roadside") return;
  if (state.orderRealtimeChannel && state.orderRealtimeUserId === userId) return;

  disposeOrderRealtime();
  const channel = supabase.channel(`waiter-orders-${branchId}-${userId}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "orders",
      filter: `created_by=eq.${userId}`
    }, handleWaiterOrderUpdate)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "order_status_events",
      filter: `branch_id=eq.${branchId}`
    }, handleWaiterOrderStatusEvent);
  state.orderRealtimeChannel = channel;
  state.orderRealtimeUserId = userId;
  channel.subscribe((status) => {
      if (state.orderRealtimeChannel !== channel) return;
      if (status === "SUBSCRIBED") {
        if (state.orderRealtimeRetryTimer) {
          window.clearTimeout(state.orderRealtimeRetryTimer);
          state.orderRealtimeRetryTimer = null;
        }
        const isReconnect = state.orderRealtimeHasSubscribed;
        state.orderRealtimeHasSubscribed = true;
        loadWaiterReadyOrders();
        refreshWaiterOrderStatuses({ notifyReady: isReconnect });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("Waiter order realtime disconnected:", status);
        scheduleOrderRealtimeRetry();
      }
    });
}

function ensureWaiterReadyPanel() {
  if (state.readyDeliveryPanel?.isConnected) return state.readyDeliveryPanel;
  const main = document.querySelector(".waiter-main-view");
  const search = $("search-filter-section");
  if (!main || !search) return null;

  const panel = document.createElement("section");
  panel.className = "waiter-cart-panel waiter-ready-delivery-panel";
  panel.setAttribute("aria-label", "طلبات جاهزة للتسليم");
  panel.style.cssText = "display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-card);box-shadow:var(--shadow-card);overflow:hidden;margin:0 0 24px;";
  panel.innerHTML = `
    <div class="cart-header-row">
      <div class="cart-title-group">
        <h2>جاهزة للتسليم</h2>
        <span class="cart-total-badge" data-ready-count>0</span>
      </div>
    </div>
    <div data-ready-list style="padding:12px 16px;display:grid;gap:10px;">
      <p data-ready-empty style="margin:0;color:var(--text-muted);font-size:.9rem;">لا توجد طلبات جاهزة حالياً</p>
    </div>`;
  search.insertAdjacentElement("afterend", panel);
  state.readyDeliveryPanel = panel;
  return panel;
}

function renderWaiterReadyOrders() {
  const panel = ensureWaiterReadyPanel();
  if (!panel) return;
  const list = panel.querySelector("[data-ready-list]");
  const count = panel.querySelector("[data-ready-count]");
  const orders = [...state.readyDeliveryOrders.values()];
  if (count) count.textContent = String(orders.length);
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = `<p data-ready-empty style="margin:0;color:var(--text-muted);font-size:.9rem;">لا توجد طلبات جاهزة حالياً</p>`;
    return;
  }

  list.innerHTML = orders.map(order => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-surface);">
      <strong style="direction:ltr;font-size:1rem;">${escapeHtml(order.order_code)}</strong>
      <button type="button" class="cart-submit-btn" data-mark-delivered="${escapeHtml(order.order_code)}" ${state.markingDeliveredCodes.has(order.order_code) ? "disabled" : ""} style="width:auto;min-height:42px;padding:8px 18px;">
        ${state.markingDeliveredCodes.has(order.order_code) ? "جارٍ التأكيد…" : "تم التسليم"}
      </button>
    </div>`).join("");

  list.querySelectorAll("[data-mark-delivered]").forEach(button => {
    button.addEventListener("click", () => markWaiterOrderDelivered(button.dataset.markDelivered));
  });
}

async function loadWaiterReadyOrders({ notifyReadyOrderId = null } = {}) {
  if (state.profile?.role !== "roadside" || !supabase) return false;
  ensureWaiterReadyPanel();
  try {
    const previousOrderIds = new Set([...state.readyDeliveryOrders.values()].map(order => order.id));
    const { data, error } = await supabase.rpc("get_waiter_ready_orders");
    if (error) throw error;
    if (!data?.success || !Array.isArray(data.orders)) throw new Error(data?.error || "تعذر تحميل الطلبات الجاهزة");

    state.readyDeliveryOrders = new Map(data.orders
      .filter(order => order?.order_code && order.status === "ready")
      .map(order => [order.order_code, order]));
    for (const order of state.readyDeliveryOrders.values()) {
      state.orderStatusByCode.set(order.order_code, "ready");
      if (notifyReadyOrderId && order.id === notifyReadyOrderId && !previousOrderIds.has(order.id)) {
        notifyWaiterOrderReady(order.order_code);
      }
    }
    renderWaiterReadyOrders();
    return true;
  } catch (error) {
    console.warn("Waiter ready queue load failed:", error?.message || error);
    const panel = ensureWaiterReadyPanel();
    const list = panel?.querySelector("[data-ready-list]");
    if (list && state.readyDeliveryOrders.size === 0) {
      list.innerHTML = `<p role="alert" style="margin:0;color:var(--status-soldout-text);font-size:.9rem;">تعذر تحميل الطلبات الجاهزة. أعد المحاولة بعد التحقق من الاتصال.</p>`;
    }
    return false;
  }
}

async function markWaiterOrderDelivered(orderCode) {
  if (!orderCode || state.markingDeliveredCodes.has(orderCode)) return;
  state.markingDeliveredCodes.add(orderCode);
  renderWaiterReadyOrders();
  try {
    const { data, error } = await supabase.rpc("mark_order_delivered", { p_order_code: orderCode });
    if (error) throw error;
    if (data?.success !== true) {
      if (data?.error === "INVALID_TRANSITION") {
        await loadWaiterReadyOrders();
      }
      throw new Error(data?.error || "تعذر تأكيد التسليم");
    }
    state.readyDeliveryOrders.delete(orderCode);
    state.orderStatusByCode.set(orderCode, "handed_off");
    showToast(`تم تسليم الطلب ${orderCode}`, "success");
  } catch (error) {
    console.error("Mark order delivered failed:", error);
    showToast(error?.message === "NOT_AUTHORIZED" ? "ليس لديك صلاحية تسليم هذا الطلب" : "تعذر تأكيد التسليم. أعد المحاولة.", "error");
  } finally {
    state.markingDeliveredCodes.delete(orderCode);
    renderWaiterReadyOrders();
  }
}

async function refreshWaiterOrderStatuses({ notifyReady = false } = {}) {
  const profile = state.profile;
  if (!profile?.user_id || !profile.branch_id || !supabase || state.orderStatusRefreshInFlight) return false;

  state.orderStatusRefreshInFlight = true;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select("order_code, status, created_by")
      .eq("branch_id", profile.branch_id)
      .eq("created_by", profile.user_id)
      .gte("created_at", since);
    if (error) throw error;

    for (const order of data || []) {
      const previousStatus = state.orderStatusByCode.get(order.order_code);
      if (notifyReady && previousStatus && previousStatus !== "ready" && order.status === "ready") {
        notifyWaiterOrderReady(order.order_code);
      }
      state.orderStatusByCode.set(order.order_code, order.status);
    }
    return true;
  } catch (error) {
    console.warn("Waiter order status reconciliation failed:", error?.message || error);
    return false;
  } finally {
    state.orderStatusRefreshInFlight = false;
  }
}

function handleWaiterOrderUpdate(payload) {
  const order = payload?.new;
  const userId = state.profile?.user_id;
  if (!order?.order_code || order.created_by !== userId) return;

  const previousStatus = state.orderStatusByCode.get(order.order_code);
  const oldStatus = payload?.old?.status ?? previousStatus;
  if (order.status === "ready" && oldStatus && oldStatus !== "ready") {
    notifyWaiterOrderReady(order.order_code);
  }
  state.orderStatusByCode.set(order.order_code, order.status);
  if (order.status === "ready") {
    state.readyDeliveryOrders.set(order.order_code, order);
    renderWaiterReadyOrders();
  } else if (order.status === "handed_off" || order.status === "delivered") {
    state.readyDeliveryOrders.delete(order.order_code);
    renderWaiterReadyOrders();
  }
}

function handleWaiterOrderStatusEvent(payload) {
  const event = payload?.new;
  if (!event?.order_id || event.branch_id !== state.profile?.branch_id) return;

  if (event.new_status === "ready") {
    loadWaiterReadyOrders({ notifyReadyOrderId: event.order_id });
  } else if (event.new_status === "handed_off" || event.new_status === "delivered") {
    const readyOrder = [...state.readyDeliveryOrders.values()].find(order => order.id === event.order_id);
    if (readyOrder) {
      state.readyDeliveryOrders.delete(readyOrder.order_code);
      state.orderStatusByCode.set(readyOrder.order_code, event.new_status);
      renderWaiterReadyOrders();
    } else {
      loadWaiterReadyOrders();
    }
  }
}

function recoverOrderRealtime() {
  if (document.visibilityState === "hidden" || !state.profile || state.profile.role !== "roadside") return;
  const channel = state.orderRealtimeChannel;
  if (!channel || channel.state !== "joined") {
    if (channel) scheduleOrderRealtimeRetry();
    else setupOrderRealtime();
    return;
  }
  loadWaiterReadyOrders();
  refreshWaiterOrderStatuses({ notifyReady: state.orderRealtimeHasSubscribed });
}

function scheduleOrderRealtimeRetry() {
  if (state.orderRealtimeRetryTimer || !state.profile?.user_id) return;
  state.orderRealtimeRetryTimer = window.setTimeout(async () => {
    state.orderRealtimeRetryTimer = null;
    const oldChannel = state.orderRealtimeChannel;
    state.orderRealtimeChannel = null;
    if (oldChannel) await supabase.removeChannel(oldChannel).catch(() => {});
    setupOrderRealtime();
  }, 2500);
}

function disposeOrderRealtime() {
  if (state.orderRealtimeRetryTimer) {
    window.clearTimeout(state.orderRealtimeRetryTimer);
    state.orderRealtimeRetryTimer = null;
  }
  const channel = state.orderRealtimeChannel;
  state.orderRealtimeChannel = null;
  state.orderRealtimeUserId = null;
  state.orderRealtimeHasSubscribed = false;
  state.orderStatusByCode.clear();
  state.readyDeliveryOrders.clear();
  renderWaiterReadyOrders();
  if (channel && supabase) supabase.removeChannel(channel).catch(() => {});
}

function unlockWaiterAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    if (!state.waiterAudioContext) state.waiterAudioContext = new AudioContext();
    if (state.waiterAudioContext.state === "suspended") state.waiterAudioContext.resume().catch(() => {});
  } catch (error) {
    console.debug("Waiter notification sound is unavailable:", error?.message || error);
  }
}

function playWaiterReadyBell() {
  unlockWaiterAudio();
  const context = state.waiterAudioContext;
  if (!context || context.state !== "running") return;

  const now = context.currentTime;
  [784, 988].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.16;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.44);
  });
}

function notifyWaiterOrderReady(orderCode) {
  playWaiterReadyBell();
  showToast(`الطلب #${orderCode} جاهز للتسليم`, "success");
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(async () => {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      await loadMenuData({ silent: true });
    } finally {
      state.refreshInFlight = false;
    }
  }, 400);
}

// --------------------------------------------------------------------------
// 3. Category Navigation & Search
// --------------------------------------------------------------------------
function renderCategories() {
  const list = $("categories-list");
  if (!list) return;

  const categories = state.menuData?.categories || [];
  let html = `
    <li class="category-item">
      <button type="button" class="category-pill-btn ${state.activeCategoryId === 'all' ? 'active' : ''}" data-cat-id="all">
        الكل
      </button>
    </li>
  `;

  for (const cat of categories) {
    const isActive = state.activeCategoryId === cat.id;
    html += `
      <li class="category-item">
        <button type="button" class="category-pill-btn ${isActive ? 'active' : ''}" data-cat-id="${cat.id}">
          ${escapeHtml(cat.name)}
        </button>
      </li>
    `;
  }

  list.innerHTML = html;

  list.querySelectorAll(".category-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const catId = btn.dataset.catId;
      state.activeCategoryId = catId;
      list.querySelectorAll(".category-pill-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Auto-scroll the clicked pill smoothly into the center of the scroll container
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

      if (catId === "all") {
        renderProducts();
      } else {
        renderProducts();
        const section = $(`cat-section-${catId}`);
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });

  initCategoryNavScroll();
}

function initCategoryNavScroll() {
  const nav = $("categories-nav-section") || document.querySelector(".categories-nav");
  if (!nav) return;

  function updateFades() {
    const maxScroll = nav.scrollWidth - nav.clientWidth;
    if (maxScroll <= 6) {
      nav.className = "categories-nav fade-none";
      return;
    }
    const scrollPos = Math.abs(nav.scrollLeft);
    const atStart = scrollPos <= 6;
    const atEnd = scrollPos >= (maxScroll - 8);

    if (atStart) {
      nav.className = "categories-nav fade-left-only";
    } else if (atEnd) {
      nav.className = "categories-nav fade-right-only";
    } else {
      nav.className = "categories-nav fade-both";
    }
  }

  if (!nav._hasScrollListener) {
    nav.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades, { passive: true });
    nav._hasScrollListener = true;
  }

  requestAnimationFrame(updateFades);
}

// --------------------------------------------------------------------------
// 4. Products Rendering (Exact 2-Col Mobile Cards with POS Add)
// --------------------------------------------------------------------------
function getProductQuantityInCart(productId) {
  return state.cart
    .filter(item => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

function renderProductCardHtml(p, currency = "IQD") {
  const isAvailable = Boolean(p.is_available);
  const hasOptions = Array.isArray(p.option_groups) && p.option_groups.length > 0;
  const cartQty = getProductQuantityInCart(p.id);
  const priceFormatted = formatAmount(p.price);

  return `
    <article class="product-card ${!isAvailable ? 'unavailable' : ''}" data-product-id="${p.id}" tabindex="0" role="button" aria-label="${escapeHtml(p.name)}">
      <div class="product-card-media">
        ${!isAvailable ? `<span class="product-soldout-badge">غير متوفر حالياً</span>` : ""}
        ${cartQty > 0 ? `<span class="card-cart-qty-badge" title="الكمية في السلة">${cartQty}</span>` : ""}
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
          <button type="button" class="pos-full-add-btn" data-action="pos-add" data-product-id="${p.id}" ${!isAvailable ? 'disabled' : ''} aria-label="إضافة ${escapeHtml(p.name)} للطلب">
            <svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>إضافة للطلب</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const container = $("waiter-products-container");
  if (!container) return;

  const categories = state.menuData?.categories || [];
  const products = state.menuData?.products || [];
  const currency = state.menuData?.restaurant?.currency_code || "IQD";

  const query = state.searchQuery.trim().toLowerCase();
  const filtered = products.filter(p => {
    const matchCategory = state.activeCategoryId === "all" || p.category_id === state.activeCategoryId;
    const matchSearch = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query));
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    if (query) {
      container.innerHTML = `
        <div class="menu-empty-view">
          <div class="empty-icon-circle">${ICONS.search}</div>
          <h3>لا توجد نتائج بحث مطابقة</h3>
          <p>لم نجد أي صنف يطابق "<strong>${escapeHtml(query)}</strong>".</p>
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
  for (const cat of categories) {
    const catProducts = filtered.filter(p => p.category_id === cat.id);
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
          ${uncategorized.map(p => renderProductCardHtml(p, currency)).join("")}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;

  // Bind Card & Single Full-Width Add Button Events
  container.querySelectorAll(".product-card").forEach(card => {
    const productId = card.dataset.productId;
    const p = products.find(x => x.id === productId);
    if (!p || !p.is_available) return;

    const triggerAction = (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const hasOptions = Array.isArray(p.option_groups) && p.option_groups.length > 0;
      if (hasOptions) {
        openCustomizationModal(p);
      } else {
        handleQuickAdd(p);
      }
    };

    // Full card tap/click
    card.addEventListener("click", triggerAction);

    // Full-width add button tap/click
    const addBtn = card.querySelector(".pos-full-add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", triggerAction);
    }

    // Keyboard support (Enter / Space)
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        triggerAction(e);
      }
    });
  });
}

// Ultra-Fast 1-Tap Add with Default Options
function handleQuickAdd(product) {
  const defaultOpts = [];
  if (Array.isArray(product.option_groups)) {
    for (const group of product.option_groups) {
      const opts = group.options || [];
      const def = opts.find(o => o.is_default && o.is_available) || opts[0];
      if (def) {
        defaultOpts.push({
          groupId: group.id,
          groupName: group.name,
          optionId: def.id,
          optionName: def.name,
          priceModifier: Number(def.price_modifier) || 0
        });
      }
    }
  }

  addToCart(product, defaultOpts, 1);
  showToast(`تمت إضافة ${product.name} إلى السلة ✓`, "success");
  renderProducts(); // Refresh card qty badge
  renderCart();
}

// --------------------------------------------------------------------------
// 5. Customization Modal Handling & Bulletproof Scroll Lock
// --------------------------------------------------------------------------
let activeModalCount = 0;
let savedWindowScrollY = 0;

function lockBodyScroll() {
  if (activeModalCount === 0) {
    savedWindowScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.classList.add("modal-open");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  activeModalCount++;
}

function unlockBodyScroll() {
  if (activeModalCount > 0) activeModalCount--;
  if (activeModalCount === 0) {
    document.body.classList.remove("modal-open");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    if (savedWindowScrollY) {
      window.scrollTo(0, savedWindowScrollY);
    }
  }
}

function openCustomizationModal(product) {
  state.selectedProductForModal = product;
  state.modalQuantity = 1;
  state.modalSelectedOptions = {};

  // Pre-select default options
  if (Array.isArray(product.option_groups)) {
    for (const group of product.option_groups) {
      state.modalSelectedOptions[group.id] = [];
      const opts = group.options || [];
      const defaultOpt = opts.find(o => o.is_default && o.is_available);
      if (defaultOpt) {
        state.modalSelectedOptions[group.id].push(defaultOpt.id);
      } else if (group.is_required && opts.length > 0) {
        const firstAvail = opts.find(o => o.is_available);
        if (firstAvail) state.modalSelectedOptions[group.id].push(firstAvail.id);
      }
    }
  }

  renderModalContent();

  const modal = $("customization-modal");
  if (modal) {
    lockBodyScroll();
    modal.showModal();
  }
}

function closeCustomizationModal() {
  const modal = $("customization-modal");
  if (modal && modal.open) {
    modal.close();
  }
}

function calculateModalTotalPrice() {
  const p = state.selectedProductForModal;
  if (!p) return 0;

  let unitPrice = Number(p.price) || 0;
  if (Array.isArray(p.option_groups)) {
    for (const group of p.option_groups) {
      const selectedIds = state.modalSelectedOptions[group.id] || [];
      for (const optId of selectedIds) {
        const opt = (group.options || []).find(o => o.id === optId);
        if (opt) unitPrice += Number(opt.price_modifier) || 0;
      }
    }
  }
  return unitPrice * state.modalQuantity;
}

function updateModalPriceDisplay() {
  const total = calculateModalTotalPrice();
  const label = $("modal-calc-price");
  if (label) label.textContent = formatMoney(total);
  const qtyVal = $("modal-qty-val");
  if (qtyVal) qtyVal.textContent = state.modalQuantity;
}

function renderModalContent() {
  const p = state.selectedProductForModal;
  if (!p) return;

  const thumbBox = $("pos-modal-thumb-box");
  const imgEl = $("pos-modal-image");
  if (thumbBox && imgEl) {
    if (p.image_url) {
      imgEl.src = p.image_url;
      imgEl.alt = p.name;
      thumbBox.style.display = "block";
    } else {
      thumbBox.style.display = "none";
    }
  }

  const titleEl = $("pos-modal-title");
  if (titleEl) titleEl.textContent = p.name;

  const descEl = $("pos-modal-desc");
  if (descEl) descEl.textContent = p.description || "قهوة مختصة محضرة بعناية من بوكس كافي.";

  const basePriceEl = $("pos-modal-base-price");
  if (basePriceEl) basePriceEl.textContent = `${formatMoney(p.price)}`;

  const bodyEl = $("pos-modal-options-body");
  if (!bodyEl) return;

  let html = "";
  if (Array.isArray(p.option_groups) && p.option_groups.length > 0) {
    for (const group of p.option_groups) {
      const isSingle = group.selection_type === "single" || group.max_selections === 1;
      const isReq = Boolean(group.is_required);
      const selectedIds = state.modalSelectedOptions[group.id] || [];
      const opts = group.options || [];

      html += `
        <div class="pos-options-group" data-group-id="${group.id}">
          <div class="pos-group-title-row">
            <h4 class="pos-group-title">${escapeHtml(group.name)}</h4>
            <span class="pos-group-badge ${isReq ? 'required' : 'optional'}">
              ${isReq ? 'إجباري' : 'اختياري'}
            </span>
          </div>
          <div class="pos-segmented-group" data-count="${opts.length}">
            ${opts.map(opt => {
              const isSelected = selectedIds.includes(opt.id);
              const mod = Number(opt.price_modifier) || 0;
              const priceText = mod > 0 ? `+${formatAmount(mod)} د.ع` : (mod < 0 ? `${formatAmount(mod)} د.ع` : "مشمول");
              return `
                <button type="button" class="pos-segment-pill ${isSelected ? 'selected' : ''}" data-group-id="${group.id}" data-option-id="${opt.id}" data-single="${isSingle ? 'true' : 'false'}">
                  <span class="segment-name">${escapeHtml(opt.name)}</span>
                  <span class="segment-price">${priceText}</span>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }
  } else {
    html = `
      <div class="modal-info-note">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <p>هذا الصنف يُحضّر بالوصفة القياسية لبوكس كافي دون خيارات إضافية.</p>
      </div>
    `;
  }

  bodyEl.innerHTML = html;

  // Bind segmented pill buttons
  bodyEl.querySelectorAll(".pos-segment-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const groupId = pill.dataset.groupId;
      const optionId = pill.dataset.optionId;
      const isSingle = pill.dataset.single === "true";

      if (!state.modalSelectedOptions[groupId]) {
        state.modalSelectedOptions[groupId] = [];
      }

      if (isSingle) {
        state.modalSelectedOptions[groupId] = [optionId];
        pill.closest(".pos-segmented-group").querySelectorAll(".pos-segment-pill").forEach(c => c.classList.remove("selected"));
        pill.classList.add("selected");
      } else {
        const idx = state.modalSelectedOptions[groupId].indexOf(optionId);
        if (idx >= 0) {
          state.modalSelectedOptions[groupId].splice(idx, 1);
          pill.classList.remove("selected");
        } else {
          state.modalSelectedOptions[groupId].push(optionId);
          pill.classList.add("selected");
        }
      }

      updateModalPriceDisplay();
    });
  });

  updateModalPriceDisplay();
}

// --------------------------------------------------------------------------
// 6. Cart Management (Operations & Persistence)
// --------------------------------------------------------------------------
function loadSavedCart() {
  try {
    const raw = sessionStorage.getItem("box_cofe_waiter_cart_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) state.cart = parsed;
    }
    const savedMode = sessionStorage.getItem("box_cofe_waiter_mode");
    if (savedMode === "car" || savedMode === "walkin") state.orderMode = savedMode;
  } catch {}
}

function saveCart() {
  try {
    sessionStorage.setItem("box_cofe_waiter_cart_v2", JSON.stringify(state.cart));
    sessionStorage.setItem("box_cofe_waiter_mode", state.orderMode);
  } catch {}
}

function addToCart(product, selectedOptions = [], quantity = 1) {
  let unitPrice = Number(product.price) || 0;
  for (const opt of selectedOptions) {
    unitPrice += Number(opt.priceModifier) || 0;
  }

  // Create a signature to group identical items with identical options
  const optionSignature = selectedOptions
    .map(o => o.optionId)
    .sort()
    .join("|");

  const existingIndex = state.cart.findIndex(
    item => item.productId === product.id && item.optionSignature === optionSignature
  );

  if (existingIndex >= 0) {
    state.cart[existingIndex].quantity += quantity;
  } else {
    state.cart.push({
      cartItemId: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      productId: product.id,
      productName: product.name,
      basePrice: Number(product.price) || 0,
      unitPrice,
      quantity,
      optionSignature,
      options: selectedOptions,
      image_url: product.image_url || ""
    });
  }

  saveCart();
}

function updateCartQuantity(cartItemId, delta) {
  const item = state.cart.find(x => x.cartItemId === cartItemId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(x => x.cartItemId !== cartItemId);
  }

  saveCart();
  renderProducts(); // Refresh badges
  renderCart();
}

function removeCartItem(cartItemId) {
  state.cart = state.cart.filter(x => x.cartItemId !== cartItemId);
  saveCart();
  renderProducts();
  renderCart();
}

function clearCart() {
  if (state.cart.length === 0) return;
  state.cart = [];
  saveCart();
  renderProducts();
  renderCart();
  showToast("تم تفريغ السلة", "success");
}

function getCartTotals() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return { count, total };
}

// --------------------------------------------------------------------------
// 7. Cart Rendering (Desktop & Mobile Drawer Sync)
// --------------------------------------------------------------------------
function renderCart() {
  const { count, total } = getCartTotals();
  const formattedTotal = `${formatAmount(total)} د.ع`;

  // 1. Desktop Panel Elements
  const dCount = $("desktop-cart-count");
  if (dCount) dCount.textContent = count;
  const dTotal = $("desktop-cart-total");
  if (dTotal) dTotal.innerHTML = `${formatAmount(total)} <small>د.ع</small>`;
  const dClear = $("desktop-cart-clear");
  if (dClear) dClear.style.display = count > 0 ? "inline-block" : "none";
  const dSubmit = $("desktop-submit-btn");
  if (dSubmit) dSubmit.disabled = count === 0 || state.isSubmitting;

  // 2. Mobile Floating Bar & Drawer Elements
  const mFloatBar = $("mobile-floating-bar");
  if (mFloatBar) mFloatBar.style.display = count > 0 ? "flex" : "none";
  const mFloatCount = $("mobile-floating-count");
  if (mFloatCount) mFloatCount.textContent = count;
  const mFloatTotal = $("mobile-floating-total");
  if (mFloatTotal) mFloatTotal.textContent = formattedTotal;

  const mCount = $("mobile-cart-count");
  if (mCount) mCount.textContent = count;
  const mTotal = $("mobile-cart-total");
  if (mTotal) mTotal.innerHTML = `${formatAmount(total)} <small>د.ع</small>`;
  const mClear = $("mobile-cart-clear");
  if (mClear) mClear.style.display = count > 0 ? "inline-block" : "none";
  const mSubmit = $("mobile-submit-btn");
  if (mSubmit) mSubmit.disabled = count === 0 || state.isSubmitting;

  // 3. Render Items in both containers
  const desktopContainer = $("desktop-cart-items");
  const mobileContainer = $("mobile-cart-items");

  const itemsHtml = state.cart.length === 0
    ? `
      <div class="cart-empty-message">
        ${ICONS.coffee}
        <p>السلة فارغة حالياً</p>
        <span style="font-size:0.75rem; color:var(--text-muted);">انقر على الأصناف لإضافتها للطلب</span>
      </div>
    `
    : state.cart.map(item => `
      <div class="cart-item-card" data-cart-id="${item.cartItemId}">
        <div class="cart-item-header">
          <h4 class="cart-item-name">${escapeHtml(item.productName)}</h4>
          <button type="button" class="cart-item-remove-btn" data-action="remove" data-cart-id="${item.cartItemId}" aria-label="حذف">
            ${ICONS.trash}
          </button>
        </div>
        ${item.options && item.options.length > 0 ? `
          <div class="cart-item-options-row">
            ${item.options.map(o => `<span class="cart-option-chip">${escapeHtml(o.optionName)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="cart-item-footer">
          <div class="cart-stepper">
            <button type="button" class="stepper-btn" data-action="decrease" data-cart-id="${item.cartItemId}" aria-label="تقليل">−</button>
            <span class="stepper-qty">${item.quantity}</span>
            <button type="button" class="stepper-btn" data-action="increase" data-cart-id="${item.cartItemId}" aria-label="زيادة">+</button>
          </div>
          <span class="cart-item-price">${formatAmount(item.unitPrice * item.quantity)} د.ع</span>
        </div>
      </div>
    `).join("");

  if (desktopContainer) desktopContainer.innerHTML = itemsHtml;
  if (mobileContainer) mobileContainer.innerHTML = itemsHtml;

  // Bind Steppers and Remove Buttons for both
  [desktopContainer, mobileContainer].forEach(container => {
    if (!container) return;
    container.querySelectorAll("[data-action='increase']").forEach(btn => {
      btn.addEventListener("click", () => updateCartQuantity(btn.dataset.cartId, 1));
    });
    container.querySelectorAll("[data-action='decrease']").forEach(btn => {
      btn.addEventListener("click", () => updateCartQuantity(btn.dataset.cartId, -1));
    });
    container.querySelectorAll("[data-action='remove']").forEach(btn => {
      btn.addEventListener("click", () => removeCartItem(btn.dataset.cartId));
    });
  });

  // 4. Sync Order Mode Switchers & Context Inputs
  syncOrderModeUI();
}

function syncOrderModeUI() {
  const isCar = state.orderMode === "car";

  // Desktop Tabs
  const dCarBtn = $("mode-car-btn");
  const dWalkBtn = $("mode-walkin-btn");
  if (dCarBtn) dCarBtn.classList.toggle("active", isCar);
  if (dWalkBtn) dWalkBtn.classList.toggle("active", !isCar);

  const dGroupVehicle = $("group-vehicle-note");
  const dGroupWalkin = $("group-walkin-note");
  if (dGroupVehicle) dGroupVehicle.style.display = isCar ? "flex" : "none";
  if (dGroupWalkin) dGroupWalkin.style.display = isCar ? "none" : "flex";

  // Mobile Drawer Tabs
  const mCarBtn = $("drawer-mode-car-btn");
  const mWalkBtn = $("drawer-mode-walkin-btn");
  if (mCarBtn) mCarBtn.classList.toggle("active", isCar);
  if (mWalkBtn) mWalkBtn.classList.toggle("active", !isCar);

  const mGroupVehicle = $("drawer-group-vehicle");
  const mGroupWalkin = $("drawer-group-walkin");
  if (mGroupVehicle) mGroupVehicle.style.display = isCar ? "flex" : "none";
  if (mGroupWalkin) mGroupWalkin.style.display = isCar ? "none" : "flex";

  // Sync inputs
  const dVeh = $("input-vehicle-note");
  const mVeh = $("drawer-vehicle-note");
  if (dVeh && dVeh.value !== state.vehicleNote) dVeh.value = state.vehicleNote;
  if (mVeh && mVeh.value !== state.vehicleNote) mVeh.value = state.vehicleNote;

  const dWalk = $("input-walkin-note");
  const mWalk = $("drawer-walkin-note");
  if (dWalk && dWalk.value !== state.walkinNote) dWalk.value = state.walkinNote;
  if (mWalk && mWalk.value !== state.walkinNote) mWalk.value = state.walkinNote;

  const dNote = $("input-order-note");
  const mNote = $("drawer-order-note");
  if (dNote && dNote.value !== state.orderNote) dNote.value = state.orderNote;
  if (mNote && mNote.value !== state.orderNote) mNote.value = state.orderNote;
}

// --------------------------------------------------------------------------
// 8. Order Placement Flow (RPC: place_waiter_order)
// --------------------------------------------------------------------------
async function handleCheckoutSubmit() {
  if (state.cart.length === 0 || state.isSubmitting) return;

  // Validate Context
  if (state.orderMode === "car") {
    if (!state.vehicleNote.trim()) {
      showToast("يرجى كتابة رقم أو نوع السيارة لتمييز الطلب", "error");
      const dVeh = $("input-vehicle-note");
      const mVeh = $("drawer-vehicle-note");
      if (dVeh) { dVeh.classList.add("has-error"); dVeh.focus(); }
      if (mVeh) { mVeh.classList.add("has-error"); mVeh.focus(); }
      return;
    }
  } else {
    if (!state.walkinNote.trim()) {
      showToast("يرجى كتابة اسم الزبون أو رقم الطاولة", "error");
      const dWalk = $("input-walkin-note");
      const mWalk = $("drawer-walkin-note");
      if (dWalk) { dWalk.classList.add("has-error"); dWalk.focus(); }
      if (mWalk) { mWalk.classList.add("has-error"); mWalk.focus(); }
      return;
    }
  }

  // Check Staff Authentication
  if (!state.profile || state.profile.role !== "roadside") {
    state.pendingSubmitAfterLogin = true;
    openLoginModal("سجّل الدخول بحساب الويتر لإرسال هذا الطلب للمطبخ");
    return;
  }

  // Build Payload
  const itemsPayload = state.cart.map(item => ({
    product_id: item.productId,
    quantity: item.quantity,
    option_item_ids: item.options.map(o => o.optionId)
  }));

  const vehicleNote = state.orderMode === "car" ? state.vehicleNote.trim() : state.walkinNote.trim();
  const orderNote = state.orderNote.trim() || null;

  setSubmitting(true);

  try {
    const res = await supabase.rpc("place_waiter_order", {
      p_items: itemsPayload,
      p_order_mode: state.orderMode,
      p_vehicle_note: vehicleNote,
      p_order_note: orderNote,
      p_idempotency_key: crypto.randomUUID()
    });

    if (res.error || !res.data || res.data.success !== true) {
      throw new Error(res.data?.message || res.error?.message || "تعذر إرسال الطلب للمطبخ.");
    }

    const orderData = res.data;
    if (orderData.order_code) {
      state.orderStatusByCode.set(orderData.order_code, orderData.status || "new");
    }

    // Success! Clear cart
    state.cart = [];
    state.vehicleNote = "";
    state.walkinNote = "";
    state.orderNote = "";
    saveCart();
    renderProducts();
    renderCart();

    // Close mobile drawer if open
    const drawer = $("mobile-cart-drawer");
    if (drawer && drawer.open) drawer.close();

    // Show Success Modal
    openSuccessModal(orderData);
  } catch (err) {
    console.error("Order submit error:", err);
    showToast(err.message || "تعذر إرسال الطلب", "error");
  } finally {
    setSubmitting(false);
  }
}

function setSubmitting(submitting) {
  state.isSubmitting = submitting;
  const dSubmit = $("desktop-submit-btn");
  const mSubmit = $("mobile-submit-btn");

  const text = submitting ? "جاري الإرسال للمطبخ…" : "تأكيد وإرسال الطلب للمطبخ";
  if (dSubmit) {
    dSubmit.disabled = submitting;
    dSubmit.querySelector("span").textContent = text;
  }
  if (mSubmit) {
    mSubmit.disabled = submitting;
    mSubmit.querySelector("span").textContent = text;
  }
}

function openSuccessModal(orderData) {
  const dialog = $("success-dialog");
  if (!dialog) return;

  const codeEl = $("success-order-code");
  if (codeEl) codeEl.textContent = orderData.order_code ? `#${orderData.order_code}` : "#—";

  const modeTotalEl = $("success-mode-and-total");
  if (modeTotalEl) {
    const modeLabel = state.orderMode === "car" ? "خدمة سيارات" : "صالة / استلام";
    const totalLabel = formatMoney(orderData.total ?? orderData.total_amount ?? 0);
    modeTotalEl.textContent = `${modeLabel} • المجموع: ${totalLabel}`;
  }

  lockBodyScroll();
  dialog.showModal();
}

// --------------------------------------------------------------------------
// 9. Login Modal Handling
// --------------------------------------------------------------------------
function openLoginModal(hint = "") {
  const modal = $("waiter-login-modal");
  if (!modal) return;

  const errEl = $("login-error-alert");
  const errMsg = $("login-error-message");
  if (errEl) {
    if (hint) {
      if (errMsg) errMsg.textContent = hint;
      errEl.style.display = "flex";
      errEl.style.color = "var(--coffee-primary)";
      errEl.style.background = "var(--bg-page)";
      errEl.style.borderColor = "var(--border-color)";
    } else {
      errEl.style.display = "none";
    }
  }

  // Reset password field and visibility toggle
  const passInput = $("login-password");
  if (passInput) {
    passInput.value = "";
    passInput.type = "password";
  }
  const eyeIcon = document.querySelector("#toggle-waiter-password-btn .icon-eye");
  const eyeOffIcon = document.querySelector("#toggle-waiter-password-btn .icon-eye-off");
  if (eyeIcon) eyeIcon.style.display = "block";
  if (eyeOffIcon) eyeOffIcon.style.display = "none";

  lockBodyScroll();
  modal.showModal();
}

function closeLoginModal() {
  const modal = $("waiter-login-modal");
  if (modal && modal.open) modal.close();
}

// --------------------------------------------------------------------------
// 10. Event Listeners & Binding
// --------------------------------------------------------------------------
function setupEventListeners() {
  // Search Bar
  const searchInput = $("search-input");
  const clearSearchBtn = $("search-clear-btn");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      if (clearSearchBtn) clearSearchBtn.style.display = state.searchQuery ? "flex" : "none";
      renderProducts();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      state.searchQuery = "";
      clearSearchBtn.style.display = "none";
      renderProducts();
    });
  }

  // Retry Button
  const retryBtn = $("retry-load-menu-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => loadMenuData());
  }

  // Customization Modal Controls & Backdrop / Touch Containment
  const customModal = $("customization-modal");
  if (customModal) {
    customModal.addEventListener("close", () => unlockBodyScroll());
    customModal.addEventListener("click", (e) => {
      const rect = customModal.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
        && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        closeCustomizationModal();
      }
    });
    // Prevent touch scrolling outside the scrollable body from moving background
    customModal.addEventListener("touchmove", (e) => {
      if (!e.target.closest(".modal-scrollable-body")) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  const modalCloseBtn = $("pos-modal-close");
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeCustomizationModal);

  const minusBtn = $("modal-qty-minus");
  if (minusBtn) {
    minusBtn.addEventListener("click", () => {
      if (state.modalQuantity > 1) {
        state.modalQuantity--;
        updateModalPriceDisplay();
      }
    });
  }

  const plusBtn = $("modal-qty-plus");
  if (plusBtn) {
    plusBtn.addEventListener("click", () => {
      state.modalQuantity++;
      updateModalPriceDisplay();
    });
  }

  const confirmAddBtn = $("modal-confirm-add-btn");
  if (confirmAddBtn) {
    confirmAddBtn.addEventListener("click", () => {
      const p = state.selectedProductForModal;
      if (!p) return;

      // Extract chosen options with details
      const selectedOptsList = [];
      if (Array.isArray(p.option_groups)) {
        for (const group of p.option_groups) {
          const ids = state.modalSelectedOptions[group.id] || [];
          for (const optId of ids) {
            const opt = (group.options || []).find(o => o.id === optId);
            if (opt) {
              selectedOptsList.push({
                groupId: group.id,
                groupName: group.name,
                optionId: opt.id,
                optionName: opt.name,
                priceModifier: Number(opt.price_modifier) || 0
              });
            }
          }
        }
      }

      addToCart(p, selectedOptsList, state.modalQuantity);
      closeCustomizationModal();
      showToast(`تمت إضافة ${p.name} إلى السلة ✓`, "success");
      renderProducts();
      renderCart();
    });
  }

  // Desktop Order Mode Selector
  $("mode-car-btn")?.addEventListener("click", () => {
    state.orderMode = "car";
    saveCart();
    syncOrderModeUI();
  });
  $("mode-walkin-btn")?.addEventListener("click", () => {
    state.orderMode = "walkin";
    saveCart();
    syncOrderModeUI();
  });

  // Mobile Drawer Order Mode Selector
  $("drawer-mode-car-btn")?.addEventListener("click", () => {
    state.orderMode = "car";
    saveCart();
    syncOrderModeUI();
  });
  $("drawer-mode-walkin-btn")?.addEventListener("click", () => {
    state.orderMode = "walkin";
    saveCart();
    syncOrderModeUI();
  });

  // Context Inputs Sync
  const dVeh = $("input-vehicle-note");
  const mVeh = $("drawer-vehicle-note");
  [dVeh, mVeh].forEach(input => {
    input?.addEventListener("input", (e) => {
      state.vehicleNote = e.target.value;
      if (dVeh && dVeh !== e.target) dVeh.value = state.vehicleNote;
      if (mVeh && mVeh !== e.target) mVeh.value = state.vehicleNote;
      dVeh?.classList.remove("has-error");
      mVeh?.classList.remove("has-error");
    });
  });

  const dWalk = $("input-walkin-note");
  const mWalk = $("drawer-walkin-note");
  [dWalk, mWalk].forEach(input => {
    input?.addEventListener("input", (e) => {
      state.walkinNote = e.target.value;
      if (dWalk && dWalk !== e.target) dWalk.value = state.walkinNote;
      if (mWalk && mWalk !== e.target) mWalk.value = state.walkinNote;
      dWalk?.classList.remove("has-error");
      mWalk?.classList.remove("has-error");
    });
  });

  const dNote = $("input-order-note");
  const mNote = $("drawer-order-note");
  [dNote, mNote].forEach(input => {
    input?.addEventListener("input", (e) => {
      state.orderNote = e.target.value;
      if (dNote && dNote !== e.target) dNote.value = state.orderNote;
      if (mNote && mNote !== e.target) mNote.value = state.orderNote;
    });
  });

  // Clear Cart Buttons
  $("desktop-cart-clear")?.addEventListener("click", clearCart);
  $("mobile-cart-clear")?.addEventListener("click", clearCart);

  // Submit Buttons
  $("desktop-submit-btn")?.addEventListener("click", handleCheckoutSubmit);
  $("mobile-submit-btn")?.addEventListener("click", handleCheckoutSubmit);

  // Mobile Drawer Dialog & Touch Containment
  const drawer = $("mobile-cart-drawer");
  if (drawer) {
    drawer.addEventListener("close", () => unlockBodyScroll());
    drawer.addEventListener("click", (e) => {
      const rect = drawer.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
        && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        drawer.close();
      }
    });
    drawer.addEventListener("touchmove", (e) => {
      if (!e.target.closest(".cart-items-scroll-area")) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // Mobile Floating Bar Click (Opens Drawer)
  $("mobile-floating-bar")?.addEventListener("click", () => {
    if (drawer) {
      lockBodyScroll();
      drawer.showModal();
    }
  });
  $("mobile-drawer-close")?.addEventListener("click", () => {
    if (drawer) drawer.close();
  });

  // New Order Button (in Success Modal)
  const successDialog = $("success-dialog");
  if (successDialog) {
    successDialog.addEventListener("close", () => unlockBodyScroll());
  }
  $("success-new-order-btn")?.addEventListener("click", () => {
    if (successDialog && successDialog.open) successDialog.close();
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Login Modal Events & Touch Containment
  const loginModal = $("waiter-login-modal");
  if (loginModal) {
    loginModal.addEventListener("close", () => unlockBodyScroll());
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        closeLoginModal();
      }
    });
    loginModal.addEventListener("touchmove", (e) => {
      if (!e.target.closest(".waiter-login-box")) {
        e.preventDefault();
      }
    }, { passive: false });
  }
  $("desktop-login-trigger")?.addEventListener("click", () => openLoginModal());
  $("login-modal-close")?.addEventListener("click", closeLoginModal);

  // Password Visibility Toggle
  const togglePassBtn = $("toggle-waiter-password-btn");
  if (togglePassBtn) {
    togglePassBtn.addEventListener("click", () => {
      const passInput = $("login-password");
      if (!passInput) return;
      const isPass = passInput.type === "password";
      passInput.type = isPass ? "text" : "password";
      togglePassBtn.setAttribute("aria-pressed", String(isPass));
      const eyeIcon = togglePassBtn.querySelector(".icon-eye");
      const eyeOffIcon = togglePassBtn.querySelector(".icon-eye-off");
      if (eyeIcon) eyeIcon.style.display = isPass ? "none" : "block";
      if (eyeOffIcon) eyeOffIcon.style.display = isPass ? "block" : "none";
      passInput.focus();
    });
  }

  const loginForm = $("waiter-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("login-email")?.value?.trim();
      const pass = $("login-password")?.value;
      const errEl = $("login-error-alert");
      const errMsg = $("login-error-message");
      const submitBtn = $("login-submit-btn");
      const spinner = $("login-submit-spinner");
      const lockIcon = $("login-submit-icon");
      const submitLabel = $("login-submit-label");

      if (!email || !pass) {
        if (errEl) {
          if (errMsg) errMsg.textContent = "يرجى إدخال البريد الإلكتروني وكلمة المرور.";
          errEl.style.display = "flex";
          errEl.style.color = "#DC2626";
          errEl.style.background = "#FEF2F2";
          errEl.style.borderColor = "#FECACA";
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.style.display = "inline-block";
      if (lockIcon) lockIcon.style.display = "none";
      if (submitLabel) submitLabel.textContent = "جارٍ تسجيل الدخول…";
      if (errEl) errEl.style.display = "none";

      try {
        const { profile } = await signInStaff(email, pass, supabase);
        if (profile.role !== "roadside" && profile.role !== "owner" && profile.role !== "admin") {
          throw new Error("هذا الحساب ليس لديه صلاحية استخدام نقطة البيع.");
        }

        state.profile = profile;
        updateAuthUI(profile);
        if (profile.role === "roadside") setupOrderRealtime();
        closeLoginModal();
        showToast(`مرحباً بك، ${profile.full_name || "الويتر"} 👋`, "success");

        // If there was a pending order waiting for login, submit it now!
        if (state.pendingSubmitAfterLogin) {
          state.pendingSubmitAfterLogin = false;
          handleCheckoutSubmit();
        }
      } catch (err) {
        if (errEl) {
          if (errMsg) errMsg.textContent = err.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
          errEl.style.display = "flex";
          errEl.style.color = "#DC2626";
          errEl.style.background = "#FEF2F2";
          errEl.style.borderColor = "#FECACA";
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.style.display = "none";
        if (lockIcon) lockIcon.style.display = "inline-block";
        if (submitLabel) submitLabel.textContent = "تسجيل الدخول";
      }
    });
  }

  // Sign out triggers (both header and desktop cart)
  document.querySelectorAll("#waiter-signout-btn, #desktop-signout-btn, .waiter-signout-btn, .waiter-signout-link").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      disposeOrderRealtime();
      try {
        await signOutStaff(supabase);
      } catch (err) {
        console.warn("Sign out error:", err);
      }
      state.profile = null;
      const nextPath = window.location.pathname || "/waiter";
      window.location.href = `/login?signed_out=1&next=${encodeURIComponent(nextPath)}`;
    });
  });

  // Login triggers (both header and desktop cart)
  document.querySelectorAll("#waiter-login-trigger, #desktop-login-trigger, .waiter-login-trigger-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openLoginModal();
    });
  });
}

// --------------------------------------------------------------------------
// 11. Toast Notifications
// --------------------------------------------------------------------------
let toastTimeout = null;
function showToast(message, type = "success") {
  const container = $("toast-container");
  if (!container) return;

  window.clearTimeout(toastTimeout);
  container.innerHTML = `
    <div class="pos-toast ${type}">
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  toastTimeout = window.setTimeout(() => {
    container.innerHTML = "";
  }, 2400);
}
