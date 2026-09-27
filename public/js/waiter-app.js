import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { getStaffSession, signInStaff, signOutStaff } from "./staff-auth.js";

const $ = (id) => document.getElementById(id);
const state = {
  profile: null,
  menu: null,
  items: [],
  category: "all",
  search: "",
  product: null,
  picks: {},
  quantity: 1,
  idempotencyKey: null,
  busy: false,
  orderType: "car", // 'car' or 'walkin'
  menuChannel: null,
  menuRefreshTimer: null,
  menuRefreshInFlight: false,
  menuRefreshQueued: false
};

const digits = new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 });
const money = (value) => `${digits.format(Math.round(Number(value) || 0))} د.ع`;
const text = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function notify(message, tone = "info") {
  const el = $("rs-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  if (tone !== "error") {
    window.setTimeout(() => { if (el.textContent === message) el.hidden = true; }, 5000);
  }
}

function setState(title, description, mark = "···") {
  const stateEl = $("rs-catalog-state");
  if (stateEl) {
    stateEl.innerHTML = `<span class="rs-state-mark">${text(mark)}</span><h2>${text(title)}</h2><p>${text(description)}</p>`;
    stateEl.hidden = false;
  }
  const prodEl = $("rs-products");
  if (prodEl) prodEl.replaceChildren();
}

async function enterWithProfile(profile) {
  // Staff role in DB is 'roadside', presented to user as 'الويتر'
  if (profile.role !== "roadside" && profile.role !== "owner" && profile.role !== "admin") {
    await signOutStaff().catch(() => {});
    throw new Error("هذه الصفحة مخصصة للويتر فقط. استخدم حساب ويتر مربوطاً بفرع.");
  }
  state.profile = profile;
  $("rs-login-gate").hidden = true;
  $("rs-app").hidden = false;
  document.body.classList.remove("roadside-auth-pending");
  $("rs-staff-name").textContent = profile.full_name || "الويتر";
  await loadMenu();
  setupWaiterMenuRealtime();
}

async function loadMenu({ silent = false } = {}) {
  const previousMenu = state.menu;
  if (!silent) setState("تحميل منيو الفرع", "نتحقق من الأصناف المتاحة والأسعار الحالية.");
  $("rs-connection").textContent = "جاري الاتصال…";

  try {
    const branchId = state.profile?.branch_id;
    if (!branchId) throw new Error("حساب الويتر غير مربوط بفرع فعّال. يرجى مراجعة إدارة النظام لتحديد الفرع.");

    const { data: points, error: pointError } = await supabase.from("car_service_points")
      .select("qr_token,label,created_at").eq("branch_id", branchId).eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1);

    if (pointError) throw pointError;
    const point = points?.[0];
    if (!point) throw new Error("لا توجد نقطة طلب مفعّلة لهذا الفرع. اطلب من الإدارة تفعيل نقطة الخدمة.");

    const { data: branch, error: branchError } = await supabase.from("branches")
      .select("name,slug,is_active").eq("id", branchId).maybeSingle();

    if (branchError) throw branchError;
    if (!branch?.is_active) throw new Error("فرع حسابك متوقف حالياً.");

    const { data, error } = await supabase.rpc("get_customer_menu", {
      p_branch_slug: branch.slug,
      p_qr_token: point.qr_token
    });

    if (error || !data || data.success !== true) {
      throw new Error(data?.message || error?.message || "تعذر تحميل منيو الفرع.");
    }

    state.menu = data;
    $("rs-branch-name").textContent = data.branch?.name || branch.name;
    $("rs-point-name").textContent = data.service_point?.label || point.label;
    $("rs-connection").textContent = "متصل بنظام بوكس كافي";
    renderCatalog();
  } catch (error) {
    if (silent && previousMenu) {
      state.menu = previousMenu;
      $("rs-connection").textContent = "متصل — آخر تحديث محفوظ";
      console.warn("Live waiter menu refresh failed; keeping last menu.", error);
      return;
    }
    state.menu = null;
    $("rs-connection").textContent = "غير متصل بالنظام";
    setState("تعذر تحميل منيو الفرع", "تحقق من الاتصال بالإنترنت أو راجع مدير النظام.", "!");
    notify(error.message || "تعذر تحميل منيو الفرع من قاعدة البيانات.", "error");
  }
}

function scheduleWaiterMenuRefresh() {
  window.clearTimeout(state.menuRefreshTimer);
  state.menuRefreshTimer = window.setTimeout(async () => {
    if (state.menuRefreshInFlight) {
      state.menuRefreshQueued = true;
      return;
    }
    state.menuRefreshInFlight = true;
    try {
      await loadMenu({ silent: true });
    } finally {
      state.menuRefreshInFlight = false;
      if (state.menuRefreshQueued) {
        state.menuRefreshQueued = false;
        scheduleWaiterMenuRefresh();
      }
    }
  }, 300);
}

function setupWaiterMenuRealtime() {
  if (!isSupabaseConfigured || !supabase || state.menuChannel) return;
  const branchId = state.profile?.branch_id;
  if (!branchId) return;
  state.menuChannel = supabase.channel(`box-coffee-waiter-menu-${branchId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleWaiterMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_products" }, scheduleWaiterMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, scheduleWaiterMenuRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_option_items" }, scheduleWaiterMenuRefresh)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleWaiterMenuRefresh();
  });
}

function renderCatalog() {
  const categories = state.menu?.categories || [];
  const products = state.menu?.products || [];
  const nav = $("rs-categories");

  nav.innerHTML = `<button class="rs-category" type="button" data-category="all" aria-pressed="${state.category === "all"}">الكل</button>` +
    categories.map((category) => `<button class="rs-category" type="button" data-category="${text(category.id)}" aria-pressed="${state.category === category.id}">${text(category.name)}</button>`).join("");

  const query = state.search.trim().toLocaleLowerCase("ar");
  const visible = products.filter((product) =>
    (state.category === "all" || product.category_id === state.category) &&
    (!query || `${product.name} ${product.description || ""}`.toLocaleLowerCase("ar").includes(query))
  );

  $("rs-catalog-count").textContent = products.length ? `${digits.format(visible.length)} صنف` : "";
  $("rs-catalog-state").hidden = products.length > 0;

  if (!products.length) {
    setState("المنيو فارغ حالياً", "تستطيع الإدارة إضافة الأقسام والأصناف والأسعار من لوحة الإدارة.", "☕");
    $("rs-catalog-count").textContent = "٠ أصناف";
    return;
  }
  if (!visible.length) {
    setState("لم نجد هذا الصنف", "جرّب كلمة بحث أخرى أو غيّر القسم.", "⌕");
    return;
  }

  $("rs-products").innerHTML = visible.map((product) => {
    const isAvail = product.is_available !== false;
    const image = product.image_url
      ? `<img src="${text(product.image_url)}" alt="${text(product.name)}" loading="lazy" />`
      : `<span aria-hidden="true">☕</span>`;

    return `
      <article class="rs-product ${!isAvail ? 'is-disabled' : ''}" data-product-id="${text(product.id)}">
        <div class="rs-product-visual">${image}</div>
        <div class="rs-product-content">
          <h3>${text(product.name)}</h3>
          <p>${text(product.description || "")}</p>
          <div class="rs-product-bottom">
            <span class="rs-product-price">${money(product.price)}</span>
            <button class="rs-add" data-add="${text(product.id)}" type="button" aria-label="إضافة ${text(product.name)}" ${!isAvail ? 'disabled' : ''}>+</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function optionSelected(groupId, optionId) {
  return (state.picks[groupId] || []).includes(optionId);
}

function productUnitPrice(product, picks = state.picks) {
  return Number(product.price || 0) + (product.option_groups || []).flatMap((group) => picks[group.id] || []).reduce((total, id) => {
    const option = (product.option_groups || []).flatMap((group) => group.options || []).find((item) => item.id === id);
    return total + Number(option?.price_modifier || 0);
  }, 0);
}

function openProduct(product) {
  state.product = product;
  state.quantity = 1;
  state.picks = {};

  for (const group of product.option_groups || []) {
    const defaults = (group.options || []).filter((option) => option.is_default).map((option) => option.id);
    if (defaults.length) {
      state.picks[group.id] = group.selection_type === "single" ? [defaults[0]] : defaults;
    }
  }

  $("rs-dialog-title").textContent = product.name;
  $("rs-dialog-description").textContent = product.description || "حدد الحجم والإضافات المطلوبة";

  const groups = product.option_groups || [];
  $("rs-option-groups").innerHTML = groups.map((group) => {
    const isSingle = group.selection_type === "single";
    return `
      <div class="rs-option-group">
        <h3>${text(group.name)} <small>${group.is_required ? "(إلزامي)" : "(اختياري)"}</small></h3>
        ${(group.options || []).map((option) => `
          <label class="rs-option">
            <span>
              <input type="${isSingle ? "radio" : "checkbox"}" name="grp_${text(group.id)}" value="${text(option.id)}" data-option-group="${text(group.id)}" ${optionSelected(group.id, option.id) ? "checked" : ""} />
              ${text(option.name)}
            </span>
            <em>${Number(option.price_modifier || 0) > 0 ? `+ ${money(option.price_modifier)}` : "مشمول"}</em>
          </label>
        `).join("")}
      </div>
    `;
  }).join("");

  updateDialogPrice();
  $("rs-product-dialog").showModal();
}

function updateDialogPrice() {
  if (!state.product) return;
  const unit = productUnitPrice(state.product);
  $("rs-qty").textContent = digits.format(state.quantity);
  $("rs-dialog-price").textContent = money(unit * state.quantity);
}

function addToCart(product, selectedOptionIds, quantity) {
  state.items.push({
    product,
    selectedOptionIds,
    quantity
  });
  state.idempotencyKey = null;
  renderCart();
  notify(`تمت إضافة "${product.name}" إلى السلة.`);
}

function renderCart() {
  const count = state.items.reduce((sum, item) => sum + item.quantity, 0);
  $("rs-cart-count").textContent = digits.format(count);
  $("rs-clear-cart").hidden = !state.items.length;
  $("rs-submit").disabled = !state.items.length || state.busy;

  const total = state.items.reduce((sum, item) => {
    const unit = productUnitPrice(item.product, Object.fromEntries(
      (item.product.option_groups || []).map((g) => [g.id, (g.options || []).filter((o) => item.selectedOptionIds.includes(o.id)).map((o) => o.id)])
    ));
    return sum + (unit * item.quantity);
  }, 0);

  $("rs-total").textContent = money(total);

  if (!state.items.length) {
    $("rs-cart-body").innerHTML = `
      <div class="rs-cart-empty">
        <span aria-hidden="true">＋</span>
        <strong>السلة فارغة</strong>
        <p>اختر من المشروبات والمخبوزات لبدء تسجيل الطلب.</p>
      </div>
    `;
    return;
  }

  $("rs-cart-body").innerHTML = state.items.map((item, index) => {
    const selected = (item.product.option_groups || []).flatMap((group) =>
      (group.options || []).filter((option) => item.selectedOptionIds.includes(option.id)).map((option) => option.name)
    );
    const unit = productUnitPrice(item.product, Object.fromEntries(
      (item.product.option_groups || []).map((g) => [g.id, (g.options || []).filter((o) => item.selectedOptionIds.includes(o.id)).map((o) => o.id)])
    ));

    return `
      <div class="rs-cart-line">
        <div class="rs-cart-line-main">
          <div>
            <div class="rs-cart-line-name">${text(item.product.name)}</div>
            ${selected.length ? `<div class="rs-cart-line-sub">${selected.map(text).join("، ")}</div>` : ""}
          </div>
          <span class="rs-cart-line-price">${money(unit * item.quantity)}</span>
        </div>
        <div class="rs-cart-line-actions">
          <div class="rs-stepper">
            <button type="button" data-cart="minus" data-index="${index}" aria-label="تقليل">−</button>
            <span>${digits.format(item.quantity)}</span>
            <button type="button" data-cart="plus" data-index="${index}" aria-label="زيادة">+</button>
          </div>
          <button class="rs-remove" type="button" data-cart="remove" data-index="${index}">حذف</button>
        </div>
      </div>
    `;
  }).join("");
}

function onCartAction(action, index) {
  const item = state.items[index];
  if (!item) return;
  if (action === "minus") item.quantity -= 1;
  if (action === "plus") item.quantity = Math.min(50, item.quantity + 1);
  if (action === "remove" || item.quantity < 1) state.items.splice(index, 1);
  state.idempotencyKey = null;
  renderCart();
}

function selectionError() {
  for (const group of state.product.option_groups || []) {
    const chosen = state.picks[group.id] || [];
    const min = Math.max(Number(group.min_selections || 0), group.is_required ? 1 : 0);
    const max = Number(group.max_selections || (group.selection_type === "multiple" ? 99 : 1));
    if (chosen.length < min) return `اختر ${group.name} لإكمال الطلب.`;
    if (chosen.length > max) return `الحد الأعلى لاختيارات ${group.name} هو ${digits.format(max)}.`;
  }
  return "";
}

function setOrderType(type) {
  state.orderType = type;
  const carBtn = $("type-car-btn");
  const walkinBtn = $("type-walkin-btn");
  const labelEl = $("rs-vehicle-label");
  const inputEl = $("rs-vehicle-note");

  if (carBtn) carBtn.classList.toggle("active", type === "car");
  if (walkinBtn) walkinBtn.classList.toggle("active", type === "walkin");

  if (type === "car") {
    if (labelEl) labelEl.innerHTML = `وصف السيارة / رقم اللوحة <small>(لخدمة المسار)</small>`;
    if (inputEl) inputEl.placeholder = "مثال: لاندكروزر أبيض، تاهو أسود 4567";
  } else {
    if (labelEl) labelEl.innerHTML = `اسم الزبون / رقم الطاولة <small>(طلب صالة/مشاة)</small>`;
    if (inputEl) inputEl.placeholder = "مثال: طاولة 4، أو اسم الزبون";
  }
}

async function submitOrder() {
  if (state.busy || !state.items.length) return;
  state.busy = true;

  const submitBtn = $("rs-submit");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `جاري الحفظ والإرسال للمطبخ… <span class="spinner" aria-hidden="true">⏳</span>`;

  if (!state.idempotencyKey) {
    state.idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const items = state.items.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
    selected_option_ids: item.selectedOptionIds,
    note: ""
  }));

  const rawVehicle = $("rs-vehicle-note").value.trim();
  const rawOrderNote = $("rs-order-note").value.trim();

  // The order type is stored as a first-class database field. Keep this note
  // for the vehicle description or walk-in customer/table reference only.
  const fullVehicleNote = rawVehicle || null;

  try {
    if (!supabase) throw new Error("خدمة الطلب غير متصلة بالنظام.");

    const { data, error } = await supabase.rpc("place_waiter_order", {
      p_items: items,
      p_order_mode: state.orderType,
      p_vehicle_note: fullVehicleNote,
      p_order_note: rawOrderNote || null,
      p_idempotency_key: state.idempotencyKey
    });

    if (error || !data?.success || !data.order_code) {
      throw new Error(data?.message || data?.error || error?.message || "تعذر حفظ الطلب في قاعدة البيانات.");
    }

    const orderCode = data.order_code;
    $("rs-order-code").textContent = orderCode || "—";
    $("rs-success-dialog").showModal();

    // Reset Cart
    state.items = [];
    state.idempotencyKey = null;
    $("rs-vehicle-note").value = "";
    $("rs-order-note").value = "";
    renderCart();
    notify(`تم إرسال الطلب ${orderCode} للمطبخ بنجاح!`, "success");
  } catch (error) {
    console.error("Waiter order submit failed", error);
    notify(error.message || "فشل إرسال الطلب. يرجى إعادة المحاولة.", "error");
  } finally {
    state.busy = false;
    submitBtn.innerHTML = `إرسال إلى المطبخ <span aria-hidden="true">←</span>`;
    renderCart();
  }
}

// Event Listeners
$("rs-login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = $("rs-login-error");
  const button = $("rs-login-submit");
  errorBox.hidden = true;
  button.disabled = true;
  button.textContent = "جاري التحقق…";

  try {
    const result = await signInStaff($("rs-email").value, $("rs-password").value);
    await enterWithProfile(result.profile);
  } catch (error) {
    errorBox.textContent = error.message || "تعذر تسجيل الدخول.";
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = `دخول الويتر <span aria-hidden="true">←</span>`;
  }
});

$("rs-signout")?.addEventListener("click", async () => {
  try {
    await signOutStaff();
  } catch (error) {
    console.error("Waiter sign out failed", error);
  }
  state.profile = null;
  state.menu = null;
  state.items = [];
  window.location.href = "/login?signed_out=1&next=/waiter";
});

$("rs-categories")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderCatalog();
});

$("rs-search")?.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCatalog();
});

$("rs-products")?.addEventListener("click", (event) => {
  const card = event.target.closest(".rs-product");
  const button = event.target.closest("[data-add]");
  const productId = button?.dataset.add || card?.dataset.productId;
  if (!productId) return;
  const product = (state.menu?.products || []).find((item) => item.id === productId);
  if (product && product.is_available !== false) openProduct(product);
});

$("rs-option-groups")?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-option-group]");
  if (!input || !state.product) return;
  const group = state.product.option_groups.find((entry) => entry.id === input.dataset.optionGroup);
  let selected = [...(state.picks[group.id] || [])];

  if (group.selection_type === "single") {
    selected = [input.value];
  } else if (input.checked) {
    const max = Number(group.max_selections || 99);
    if (selected.length >= max) {
      input.checked = false;
      $("rs-option-error").textContent = `يمكن اختيار ${digits.format(max)} كحد أعلى.`;
      $("rs-option-error").hidden = false;
      return;
    }
    selected.push(input.value);
  } else {
    selected = selected.filter((id) => id !== input.value);
  }

  state.picks[group.id] = selected;
  $("rs-option-error").hidden = true;
  updateDialogPrice();
});

$("rs-qty-minus")?.addEventListener("click", () => {
  state.quantity = Math.max(1, state.quantity - 1);
  updateDialogPrice();
});

$("rs-qty-plus")?.addEventListener("click", () => {
  state.quantity = Math.min(50, state.quantity + 1);
  updateDialogPrice();
});

$("rs-dialog-close")?.addEventListener("click", () => $("rs-product-dialog").close());
$("rs-product-dialog")?.addEventListener("click", (event) => {
  if (event.target === $("rs-product-dialog")) $("rs-product-dialog").close();
});

$("rs-product-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = selectionError();
  if (error) {
    $("rs-option-error").textContent = error;
    $("rs-option-error").hidden = false;
    return;
  }
  const ids = Object.values(state.picks).flat();
  addToCart(state.product, ids, state.quantity);
  $("rs-product-dialog").close();
});

$("rs-cart-body")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart]");
  if (button) onCartAction(button.dataset.cart, Number(button.dataset.index));
});

$("rs-clear-cart")?.addEventListener("click", () => {
  state.items = [];
  state.idempotencyKey = null;
  renderCart();
});

// Order Type Switcher
$("type-car-btn")?.addEventListener("click", () => setOrderType("car"));
$("type-walkin-btn")?.addEventListener("click", () => setOrderType("walkin"));

$("rs-submit")?.addEventListener("click", submitOrder);

$("rs-next-order")?.addEventListener("click", () => {
  $("rs-success-dialog").close();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Initialize
renderCart();
if (!isSupabaseConfigured || !supabase) {
  $("rs-login-error").textContent = "إعدادات Supabase غير مكتملة. راجع عنوان المشروع ومفتاح النشر في config.js.";
  $("rs-login-error").hidden = false;
} else {
  getStaffSession().then((session) => {
    if (session) enterWithProfile(session.profile);
  }).catch((error) => {
    $("rs-login-error").textContent = error.message || "تعذر استعادة جلسة الدخول.";
    $("rs-login-error").hidden = false;
  });
}
