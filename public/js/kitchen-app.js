// ============================================================================
// BOX COFFEE — Kitchen Display System (KDS) Controller
// Live Sync via Supabase Realtime + LocalStorage / BroadcastChannel
// ============================================================================

import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { getStaffSession, signInStaff, signOutStaff, roleLabel } from "./staff-auth.js";

const kdsState = {
  orders: [],
  branchSlug: getKitchenBranchSlug(),
  activeFilter: "active", // active | new | preparing | ready | handed_off
  searchQuery: "",
  soundEnabled: true,
  checkedItems: {} // { "B-108_0": true }
};

function getKitchenBranchSlug() {
  const match = window.location.pathname.match(/^\/kitchen\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

// Web Audio API Barista Bell Chime (Zero external audio files needed)
function playBaristaOrderBell() {
  if (!kdsState.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two-tone pleasant specialty coffee chime
    const notes = [587.33, 880]; // D5 -> A5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.22, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.46);
    });
  } catch (e) {
    // AudioContext awaits user gesture on some browsers
  }
}

function showLiveToast(message) {
  const toastEl = document.getElementById("kds-live-toast");
  const textEl = document.getElementById("kds-toast-text");
  if (!toastEl || !textEl) return;
  textEl.textContent = message;
  toastEl.classList.add("visible");
  setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 3800);
}

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString("en-US")} د.ع`;
}

function formatElapsedTime(isoStr) {
  if (!isoStr) return "الآن";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000));
  if (diffSec < 45) return "الآن • جديد";
  const mins = Math.floor(diffSec / 60);
  if (mins === 1) return "منذ دقيقة";
  if (mins === 2) return "منذ دقيقتين";
  if (mins <= 10) return `منذ ${mins} دقائق`;
  return `منذ ${mins} دقيقة`;
}

function formatReceiptMoney(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString("en-US")} IQD`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function printKitchenReceipt(order) {
  const receipt = document.getElementById("kds-receipt-print");
  if (!receipt || !order) return;

  const receiptTime = new Date(order.created_at || Date.now()).toLocaleString("en-GB", {
    dateStyle: "short",
    timeStyle: "short"
  });
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsHtml = items.map((item) => {
    const quantity = Number(item.quantity || item.qty) || 1;
    const unitPrice = Number(item.unit_price || item.price_iqd) || 0;
    const name = escapeHtml(item.name_en || item.name || item.name_ar || "ITEM");
    const options = (item.options || []).map((option) =>
      typeof option === "string" ? option : option.name_en || option.name || option.name_ar || ""
    ).filter(Boolean).map(escapeHtml).join(", ");
    return `<div class="kds-receipt-line"><span>${name}${options ? ` (${options})` : ""} x${quantity}</span><strong>${formatReceiptMoney(unitPrice * quantity)}</strong></div>`;
  }).join("");

  receipt.innerHTML = `
    <div class="kds-receipt-brand">EV CAFE</div>
    <div class="kds-receipt-title">KITCHEN ORDER</div>
    <div class="kds-receipt-rule"></div>
    <div class="kds-receipt-meta"><span>ORDER</span><strong>${escapeHtml(order.order_code || "")}</strong></div>
    <div class="kds-receipt-meta"><span>TIME</span><span>${escapeHtml(receiptTime)}</span></div>
    ${order.vehicle_note ? `<div class="kds-receipt-meta"><span>VEHICLE</span><span>${escapeHtml(order.vehicle_note)}</span></div>` : ""}
    ${order.service_point_label ? `<div class="kds-receipt-meta"><span>SERVICE</span><span>${escapeHtml(order.service_point_label)}</span></div>` : ""}
    <div class="kds-receipt-rule"></div>
    <div class="kds-receipt-items">${itemsHtml}</div>
    ${order.order_note ? `<div class="kds-receipt-note">NOTE: ${escapeHtml(order.order_note)}</div>` : ""}
    <div class="kds-receipt-rule"></div>
    <div class="kds-receipt-total"><span>TOTAL</span><strong>${formatReceiptMoney(order.total)}</strong></div>
    <div class="kds-receipt-footer">THANK YOU</div>
  `;
  receipt.hidden = false;
  receipt.setAttribute("aria-hidden", "false");
  document.body.classList.add("kds-printing");

  const finishPrint = () => {
    document.body.classList.remove("kds-printing");
    receipt.hidden = true;
    receipt.setAttribute("aria-hidden", "true");
  };
  window.addEventListener("afterprint", finishPrint, { once: true });
  window.setTimeout(finishPrint, 5000);
  window.print();
}

async function loadKitchenOrders() {
  if (!isSupabaseConfigured || !supabase) {
    kdsState.orders = [];
    renderKDS();
    showLiveToast("تعذر الاتصال بخدمة الطلبات. تحقق من إعداد Supabase والإنترنت.");
    return false;
  }

  if (!kdsState.branchSlug) {
    kdsState.orders = [];
    renderKDS();
    showLiveToast("رابط شاشة المطبخ غير مكتمل. افتح رابط الشاشة الصحيح.");
    return false;
  }

  try {
    const { data, error } = await supabase.rpc("get_kitchen_orders", {
      p_branch_slug: kdsState.branchSlug
    });
    if (error || !data || data.success !== true || !Array.isArray(data.orders)) {
      throw new Error(data?.error || error?.message || "تعذر تحميل الطلبات");
    }

    kdsState.orders = data.orders;
    renderKDS();
    if (kitchenRetryTimer) {
      clearTimeout(kitchenRetryTimer);
      kitchenRetryTimer = null;
    }
    return true;
  } catch (error) {
    console.error("Kitchen remote order load failed:", error);
    showLiveToast(error.message || "تعذر تحميل طلبات المطبخ من الخادم.");
    if (!kitchenRetryTimer) {
      kitchenRetryTimer = setTimeout(() => {
        kitchenRetryTimer = null;
        loadKitchenOrders();
      }, 5000);
    }
    return false;
  }
}

let kitchenRealtimeChannel = null;
let kdsEventsInitialized = false;
let kitchenRetryTimer = null;
function subscribeToKitchenOrders() {
  if (!isSupabaseConfigured || !supabase || kitchenRealtimeChannel) return;
  kitchenRealtimeChannel = supabase
    .channel(`kitchen-orders-${kdsState.branchSlug}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async (payload) => {
      const isInsert = payload.eventType === "INSERT";
      const ok = await loadKitchenOrders();
      if (ok && isInsert) {
        playBaristaOrderBell();
        showLiveToast("وصل طلب جديد إلى المطبخ.");
      }
    })
    .subscribe((status) => {
      // انقطاع مؤقت لا يستدعي إزعاج الباريستا؛ يُعاد الاتصال والجلب تلقائياً
      // بصمت عند SUBSCRIBED أدناه، بلا حاجة لأي تدخل يدوي.
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.debug("Kitchen realtime disconnected temporarily:", status);
      } else if (status === "SUBSCRIBED") {
        // يغطي أول اشتراك وأيضاً إعادة الاتصال التلقائية بعد انقطاع صامت؛
        // إعادة الجلب هنا تلتقط أي طلب وصل أثناء فجوة غير مُكتشَفة بحدث خطأ صريح.
        loadKitchenOrders();
      }
    });
}

function showKitchenLogin(message = "") {
  document.body.classList.add("kds-auth-pending");
  document.getElementById("kds-login-gate").hidden = false;
  const error = document.getElementById("kds-login-error");
  error.textContent = message;
  error.hidden = !message;
}

function acceptKitchenSession(context) {
  const profile = context?.profile;
  if (!profile || !["owner", "admin", "kitchen"].includes(profile.role)) {
    throw new Error("هذا الحساب لا يملك صلاحية شاشة المطبخ.");
  }
  const staffNameEl = document.getElementById("kds-staff-name");
  if (staffNameEl) {
    staffNameEl.textContent = "";
  }
  document.getElementById("kds-login-gate").hidden = true;
  document.body.classList.remove("kds-auth-pending");
}

async function enterKitchen(context) {
  acceptKitchenSession(context);
  initKDSEvents();
  await loadKitchenOrders();
  subscribeToKitchenOrders();
}

async function initKitchenAuth() {
  const form = document.getElementById("kds-login-form");
  const submit = document.getElementById("kds-login-submit");
  supabase?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showKitchenLogin("انتهت جلسة الدخول. سجّل الدخول من جديد.");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "جارٍ التحقق والدخول…";
    try {
      const context = await signInStaff(
        document.getElementById("kds-login-email").value,
        document.getElementById("kds-login-password").value
      );
      if (!["owner", "admin", "kitchen"].includes(context?.profile?.role)) {
        await signOutStaff();
        throw new Error("هذا الحساب لا يملك صلاحية شاشة المطبخ.");
      }
      form.reset();
      await enterKitchen(context);
    } catch (error) {
      showKitchenLogin(error.message || "تعذر تسجيل الدخول.");
    } finally {
      submit.disabled = false;
      submit.textContent = "تسجيل الدخول";
    }
  });

  document.getElementById("kds-signout").addEventListener("click", async () => {
    if (kitchenRealtimeChannel) {
      await supabase.removeChannel(kitchenRealtimeChannel);
      kitchenRealtimeChannel = null;
    }
    try { await signOutStaff(); } catch (error) { console.error("Kitchen sign out failed", error); }
    const nextPath = window.location.pathname || "/kitchen";
    window.location.href = `/login?signed_out=1&next=${encodeURIComponent(nextPath)}`;
  });

  if (!isSupabaseConfigured || !supabase) {
    showKitchenLogin("إعداد اتصال Supabase غير مكتمل؛ شاشة المطبخ مقفلة.");
    submit.disabled = true;
    return;
  }
  try {
    const context = await getStaffSession();
    if (!context) return showKitchenLogin();
    if (!["owner", "admin", "kitchen"].includes(context.profile.role)) {
      await signOutStaff();
      return showKitchenLogin("هذا الحساب لا يملك صلاحية شاشة المطبخ.");
    }
    await enterKitchen(context);
  } catch (error) {
    showKitchenLogin(error.message || "تعذر التحقق من الحساب.");
  }
}

async function handleStatusTransition(orderCode, nextStatus) {
  if (isSupabaseConfigured) {
    if (!supabase) {
      showLiveToast("تعذر الاتصال بقاعدة البيانات؛ لم تتغير حالة الطلب.");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("update_kitchen_order_status", {
        p_order_code: orderCode,
        p_new_status: nextStatus
      });
      if (error || !data || data.success !== true) {
        throw new Error(data?.error || error?.message || "تعذر تحديث حالة الطلب");
      }
      await loadKitchenOrders();
      const statusNames = {
        preparing: "قيد التحضير",
        ready: "جاهز للتسليم",
        handed_off: "تم التسليم للسيارة"
      };
      showLiveToast(`الطلب ${orderCode}: ${statusNames[nextStatus] || nextStatus}`);
    } catch (error) {
      console.error("Kitchen status update failed:", error);
      showLiveToast("لم تُحفظ حالة الطلب. أعد المحاولة بعد التحقق من الاتصال.");
    }
    return;
  }
  showLiveToast("النظام غير متصل بقاعدة البيانات. لا يمكن تعديل الحالة.");
}

function renderKDS() {
  const orders = kdsState.orders || [];

  // Calculate status counts for the filter tabs
  const countNew = orders.filter(o => o.status === "new").length;
  const countConfirmed = orders.filter(o => o.status === "confirmed").length;
  const countPrep = orders.filter(o => o.status === "preparing").length;
  const countReady = orders.filter(o => o.status === "ready").length;
  const countDelivered = orders.filter(o => o.status === "handed_off" || o.status === "delivered").length;
  const countActive = countNew + countConfirmed + countPrep + countReady;

  const setTabCount = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTabCount("tab-count-active", countActive);
  setTabCount("tab-count-new", countNew);
  setTabCount("tab-count-preparing", countPrep);
  setTabCount("tab-count-ready", countReady);
  setTabCount("tab-count-delivered", countDelivered);

  // Filter orders
  const filtered = orders.filter(o => {
    if (kdsState.activeFilter === "active") {
      return o.status === "new" || o.status === "confirmed" || o.status === "preparing" || o.status === "ready";
    }
    if (kdsState.activeFilter === "handed_off") {
      return o.status === "handed_off" || o.status === "delivered";
    }
    return o.status === kdsState.activeFilter;
  });

  const gridEl = document.getElementById("kds-orders-grid");
  const emptyEl = document.getElementById("kds-empty-state");

  if (filtered.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";

  const statusMeta = {
    new: {
      badgeText: "جديد",
      badgeClass: "badge-new",
      btnText: "بدء التحضير",
      btnClass: "btn-start-prep",
      nextStatus: "preparing"
    },
    confirmed: {
      badgeText: "مؤكد",
      badgeClass: "badge-new",
      btnText: "بدء التحضير",
      btnClass: "btn-start-prep",
      nextStatus: "preparing"
    },
    preparing: {
      badgeText: "قيد التحضير",
      badgeClass: "badge-preparing",
      btnText: "جاهز للتسليم ✓",
      btnClass: "btn-mark-ready",
      nextStatus: "ready"
    },
    ready: {
      badgeText: "جاهز للتسليم",
      badgeClass: "badge-ready",
      nextStatus: null
    },
    handed_off: {
      badgeText: "تم التسليم ✓",
      badgeClass: "badge-delivered",
      nextStatus: null
    },
    delivered: {
      badgeText: "تم التسليم ✓",
      badgeClass: "badge-delivered",
      nextStatus: null
    }
  };

  gridEl.innerHTML = filtered
    .map(order => {
      const meta = statusMeta[order.status] || statusMeta.new;
      const items = order.items || [];
      const totalPieces = items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

      const itemsHtml = items
        .map((item, idx) => {
          const checkKey = `${order.order_code}_${idx}`;
          const isChecked = !!kdsState.checkedItems[checkKey];

          const optsHtml = (item.options || [])
            .map(opt => `<span class="item-opt-chip">${escapeHtml(typeof opt === "string" ? opt : opt.name)}</span>`)
            .join("");

          return `
            <div class="ticket-item-row ${isChecked ? "item-checked" : ""}" data-check-key="${escapeHtml(checkKey)}">
              <div class="item-qty-box">${item.quantity}×</div>
              <div class="item-details-col">
                <div class="item-title-line">
                  <h4 class="item-title-text">${escapeHtml(item.name)}</h4>
                  ${isChecked ? `<span class="item-check-indicator">✓ جاهز</span>` : ""}
                </div>
                ${optsHtml ? `<div class="item-options-wrap">${optsHtml}</div>` : ""}
                ${item.note ? `<div class="item-note-alert">ملاحظة: ${escapeHtml(item.note)}</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="kds-order-card status-${escapeHtml(order.status)}">
          <div class="ticket-top-accent"></div>
          <div class="ticket-header">
          <div class="ticket-code-group">
            <span class="ticket-order-code">${escapeHtml(order.order_code)}</span>
            <span class="ticket-status-badge ${meta.badgeClass}">${meta.badgeText}</span>
            <span class="ticket-source-pill">${order.order_mode === "walkin" ? "ويتر — مشاة" : order.source === "roadside" ? "ويتر — سيارة" : "طلب QR"}</span>
            </div>
            <div class="ticket-meta-right">
              <span class="ticket-pieces-pill">${totalPieces} قطع</span>
              <span class="ticket-elapsed-time">${formatElapsedTime(order.created_at)}</span>
            </div>
          </div>

          <div class="ticket-vehicle-banner">
            <span class="vehicle-main-info">${escapeHtml(order.vehicle_note || "استلام من المسار")}</span>
            <span class="vehicle-lane-pill">${escapeHtml(order.service_point_label || "المسار 1")}</span>
          </div>

          <div class="ticket-items-list">
            ${itemsHtml}
            ${order.order_note ? `<div class="item-note-alert order-level-note">ملاحظة الطلب: ${escapeHtml(order.order_note)}</div>` : ""}
          </div>

          <div class="ticket-footer">
            <div class="ticket-price-col">
              <span class="price-caption">الإجمالي</span>
              <span class="ticket-total-price">${formatMoney(order.total)}</span>
            </div>
            <div class="ticket-action-group">
              <button type="button" class="ticket-print-btn" data-action="print-order" data-order-code="${escapeHtml(order.order_code)}">Print</button>
              ${
                meta.nextStatus
                  ? `<button type="button" class="ticket-action-btn ${meta.btnClass}" data-action="advance-status" data-order-code="${escapeHtml(order.order_code)}" data-next-status="${meta.nextStatus}">
                      <span>${meta.btnText}</span>
                    </button>`
                  : ""
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  // Bind status advancement & undo buttons
  gridEl.querySelectorAll('[data-action="advance-status"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.orderCode;
      const next = btn.dataset.nextStatus;
      handleStatusTransition(code, next);
    });
  });

  gridEl.querySelectorAll('[data-action="print-order"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const order = kdsState.orders.find((candidate) => candidate.order_code === btn.dataset.orderCode);
      if (order) printKitchenReceipt(order);
    });
  });

  // Bind interactive item check-off for barista convenience
  gridEl.querySelectorAll(".ticket-item-row").forEach(row => {
    row.addEventListener("click", () => {
      const key = row.dataset.checkKey;
      kdsState.checkedItems[key] = !kdsState.checkedItems[key];
      renderKDS();
    });
  });
}

function initKDSEvents() {
  if (kdsEventsInitialized) return;
  kdsEventsInitialized = true;

  // Refetch when the tab regains visibility (device woke up / user switched back),
  // as a safety net alongside the realtime channel.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isSupabaseConfigured) {
      loadKitchenOrders();
    }
  });

  // Filter Tabs
  document.querySelectorAll(".kds-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".kds-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      kdsState.activeFilter = tab.dataset.filter;
      renderKDS();
    });
  });

  // Search Input
  const searchInput = document.getElementById("kds-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      kdsState.searchQuery = e.target.value || "";
      renderKDS();
    });
  }

  // Sound Toggle
  const soundBtn = document.getElementById("btn-sound-toggle");
  const soundLabel = document.getElementById("sound-status-label");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      kdsState.soundEnabled = !kdsState.soundEnabled;
      soundBtn.classList.toggle("active", kdsState.soundEnabled);
      if (soundLabel) {
        soundLabel.textContent = kdsState.soundEnabled ? "الصوت مفعل" : "الصوت مكتوم";
      }
      if (kdsState.soundEnabled) playBaristaOrderBell();
    });
  }

  // Listen for live orders from Customer / Staff Menu via BroadcastChannel
  if (typeof BroadcastChannel !== "undefined") {
    const bc = new BroadcastChannel("box_coffee_kitchen_sync");
    bc.onmessage = e => {
      if (e.data && e.data.type === "new_order") {
        if (isSupabaseConfigured) {
          loadKitchenOrders().then((ok) => {
            if (ok) {
              playBaristaOrderBell();
              showLiveToast("وصل طلب جديد الآن.");
            }
          });
        }
      } else if (e.data && (e.data.type === "status_changed" || e.data.type === "orders_reset")) {
        if (isSupabaseConfigured) loadKitchenOrders();
      }
    };
  }

  // Also listen via localStorage storage event across tabs
  window.addEventListener("storage", e => {
    if (e.key === "box_coffee_live_orders_v4") {
      if (isSupabaseConfigured) {
        loadKitchenOrders().then((ok) => {
          if (ok) playBaristaOrderBell();
        });
      }
    }
  });

  // Refresh elapsed timestamps every 30 seconds
  setInterval(() => {
    renderKDS();
  }, 30000);
}

// Staff authentication gates every production kitchen operation.
initKitchenAuth();
