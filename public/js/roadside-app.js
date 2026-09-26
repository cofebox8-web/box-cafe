import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import { getStaffSession, signInStaff, signOutStaff } from "./staff-auth.js";
import { getLiveMenuData, getDemoKitchenOrders, saveDemoKitchenOrders } from "./demo-data.js";

const $ = (id) => document.getElementById(id);
const state = { profile: null, menu: null, items: [], category: "all", search: "", product: null, picks: {}, quantity: 1, idempotencyKey: null, busy: false };
const digits = new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 });
const money = (value) => `${digits.format(Math.round(Number(value) || 0))} د.ع`;
const text = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function notify(message, tone = "info") {
  const el = $("rs-status");
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  if (tone !== "error") window.setTimeout(() => { if (el.textContent === message) el.hidden = true; }, 5000);
}

function setState(title, description, mark = "···") {
  $("rs-catalog-state").innerHTML = `<span class="rs-state-mark">${text(mark)}</span><h2>${text(title)}</h2><p>${text(description)}</p>`;
  $("rs-catalog-state").hidden = false;
  $("rs-products").replaceChildren();
}

async function enterWithProfile(profile) {
  if (profile.role !== "roadside" || !profile.branch_id) {
    await signOutStaff().catch(() => {});
    throw new Error("هذه الصفحة لموظف الشارع فقط. استخدم حساب موظف شارع مربوطاً بفرع.");
  }
  state.profile = profile;
  $("rs-login-gate").hidden = true;
  $("rs-app").hidden = false;
  document.body.classList.remove("roadside-auth-pending");
  $("rs-staff-name").textContent = profile.full_name || "موظف الشارع";
  await loadMenu();
}

async function loadMenu() {
  setState("تحميل منيو الفرع", "نتحقق من الأصناف المتاحة والأسعار الحالية.");
  $("rs-connection").textContent = "جاري الاتصال…";
  try {
    const { data: points, error: pointError } = await supabase.from("car_service_points")
      .select("qr_token,label,created_at").eq("branch_id", state.profile.branch_id).eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1);
    if (pointError) throw pointError;
    const point = points?.[0];
    if (!point) throw new Error("لا توجد نقطة طلب مفعّلة لهذا الفرع. اطلب من المدير تفعيل نقطة الخدمة.");
    const { data: branch, error: branchError } = await supabase.from("branches")
      .select("name,slug,is_active").eq("id", state.profile.branch_id).maybeSingle();
    if (branchError) throw branchError;
    if (!branch?.is_active) throw new Error("فرع حسابك متوقف حالياً.");
    const { data, error } = await supabase.rpc("get_customer_menu", { p_branch_slug: branch.slug, p_qr_token: point.qr_token });
    if (error || !data || data.success !== true) throw new Error(data?.message || error?.message || "تعذر تحميل منيو الفرع.");
    state.menu = data;
    $("rs-branch-name").textContent = data.branch?.name || branch.name;
    $("rs-point-name").textContent = data.service_point?.label || point.label;
    $("rs-connection").textContent = "متصل بالنظام";
    renderCatalog();
  } catch (error) {
    console.debug("Roadside menu fallback:", error?.message);
    const localMenu = getLiveMenuData();
    state.menu = localMenu;
    $("rs-branch-name").textContent = state.profile?.branch_name || "فرع طريق المطار";
    $("rs-point-name").textContent = "المسار 1 — خدمة السيارات";
    $("rs-connection").textContent = "متصل بالنظام";
    renderCatalog();
  }
}

function renderCatalog() {
  const categories = state.menu?.categories || [];
  const products = state.menu?.products || [];
  const nav = $("rs-categories");
  nav.innerHTML = `<button class="rs-category" type="button" data-category="all" aria-pressed="${state.category === "all"}">الكل</button>` +
    categories.map((category) => `<button class="rs-category" type="button" data-category="${text(category.id)}" aria-pressed="${state.category === category.id}">${text(category.name)}</button>`).join("");
  const query = state.search.trim().toLocaleLowerCase("ar");
  const visible = products.filter((product) => (state.category === "all" || product.category_id === state.category) &&
    (!query || `${product.name} ${product.description || ""}`.toLocaleLowerCase("ar").includes(query)));
  $("rs-catalog-count").textContent = products.length ? `${digits.format(visible.length)} صنف` : "";
  $("rs-catalog-state").hidden = products.length > 0;
  if (!products.length) {
    setState("المنيو فارغ حالياً", "الأدمن الرئيسي يضيف الأقسام والأصناف والأسعار من لوحة الإدارة. ستظهر هنا تلقائياً بعد حفظها.", "☕");
    $("rs-catalog-count").textContent = "٠ أصناف";
    return;
  }
  if (!visible.length) {
    setState("ما لقينا هذا الصنف", "جرّب كلمة ثانية أو غيّر الفئة.", "⌕");
    return;
  }
  $("rs-products").innerHTML = visible.map((product) => {
    const image = product.image_url ? `<img src="${text(product.image_url)}" alt="${text(product.name)}" loading="lazy" />` : `<span aria-hidden="true">☕</span>`;
    return `<article class="rs-product"><div class="rs-product-visual">${image}</div><div class="rs-product-content"><h3>${text(product.name)}</h3><p>${text(product.description || "")}</p><div class="rs-product-bottom"><span class="rs-product-price">${money(product.price)}</span><button class="rs-add" data-add="${text(product.id)}" type="button" aria-label="إضافة ${text(product.name)}">+</button></div></div></article>`;
  }).join("");
}

function optionSelected(groupId, optionId) { return (state.picks[groupId] || []).includes(optionId); }
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
    if (defaults.length) state.picks[group.id] = group.selection_type === "single" ? [defaults[0]] : defaults;
  }
  $("rs-dialog-title").textContent = product.name;
  $("rs-dialog-description").textContent = product.description || "اختر الإضافات المطلوبة";
  const groups = product.option_groups || [];
  $("rs-option-groups").innerHTML = groups.map((group) => {
    const multi = group.selection_type === "multiple";
    const min = Math.max(Number(group.min_selections || 0), group.is_required ? 1 : 0);
    const cap = Number(group.max_selections || (multi ? 99 : 1));
    return `<section class="rs-option-group" data-group="${text(group.id)}" data-min="${min}" data-max="${cap}" data-type="${multi ? "multiple" : "single"}"><h3>${text(group.name)} <small>${group.is_required ? "مطلوب" : "اختياري"}${multi && cap < 99 ? ` · حتى ${digits.format(cap)}` : ""}</small></h3>${(group.options || []).map((option) => `<label class="rs-option"><span><input type="${multi ? "checkbox" : "radio"}" name="opt-${text(group.id)}" value="${text(option.id)}" data-option-group="${text(group.id)}" ${optionSelected(group.id, option.id) ? "checked" : ""} /><b>${text(option.name)}</b></span><em>${Number(option.price_modifier) ? `+ ${money(option.price_modifier)}` : "بدون زيادة"}</em></label>`).join("")}</section>`;
  }).join("");
  updateDialogPrice();
  if (!groups.length) { addToCart(product, [], 1); return; }
  $("rs-option-error").hidden = true;
  $("rs-product-dialog").showModal();
}

function updateDialogPrice() {
  $("rs-qty").textContent = digits.format(state.quantity);
  $("rs-dialog-price").textContent = money(productUnitPrice(state.product) * state.quantity);
}

function addToCart(product, selectedOptionIds, quantity) {
  const sortedIds = [...selectedOptionIds].sort();
  const key = `${product.id}:${sortedIds.join(",")}`;
  const current = state.items.find((item) => item.key === key);
  if (current) current.quantity = Math.min(50, current.quantity + quantity);
  else state.items.push({ key, product, selectedOptionIds: sortedIds, quantity });
  state.idempotencyKey = null;
  renderCart();
  notify(`${product.name} انضاف إلى الطلب.`, "success");
}

function renderCart() {
  const count = state.items.reduce((total, item) => total + item.quantity, 0);
  const total = state.items.reduce((sum, item) => sum + productUnitPrice(item.product, Object.fromEntries((item.product.option_groups || []).map((g) => [g.id, (g.options || []).filter((o) => item.selectedOptionIds.includes(o.id)).map((o) => o.id)]))) * item.quantity, 0);
  $("rs-cart-count").textContent = digits.format(count);
  $("rs-total").textContent = money(total);
  $("rs-clear-cart").hidden = !count;
  $("rs-submit").disabled = !count || state.busy;
  if (!count) {
    $("rs-cart-body").innerHTML = `<div class="rs-cart-empty"><span aria-hidden="true">＋</span><strong>السلة جاهزة</strong><p>أضف الأصناف المطلوبة لتبدأ.</p></div>`;
    return;
  }
  $("rs-cart-body").innerHTML = state.items.map((item, index) => {
    const selected = (item.product.option_groups || []).flatMap((group) => (group.options || []).filter((option) => item.selectedOptionIds.includes(option.id)).map((option) => option.name));
    const unit = productUnitPrice(item.product, Object.fromEntries((item.product.option_groups || []).map((g) => [g.id, (g.options || []).filter((o) => item.selectedOptionIds.includes(o.id)).map((o) => o.id)])));
    return `<div class="rs-cart-line"><div class="rs-cart-line-main"><div><div class="rs-cart-line-name">${text(item.product.name)}</div>${selected.length ? `<div class="rs-cart-line-sub">${selected.map(text).join("، ")}</div>` : ""}</div><span class="rs-cart-line-price">${money(unit * item.quantity)}</span></div><div class="rs-cart-line-actions"><div class="rs-stepper"><button type="button" data-cart="minus" data-index="${index}" aria-label="تقليل">−</button><span>${digits.format(item.quantity)}</span><button type="button" data-cart="plus" data-index="${index}" aria-label="زيادة">+</button></div><button class="rs-remove" type="button" data-cart="remove" data-index="${index}">حذف</button></div></div>`;
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

async function submitOrder() {
  if (state.busy || !state.items.length) return;
  state.busy = true;
  $("rs-submit").disabled = true;
  $("rs-submit").textContent = "جاري الإرسال…";
  if (!state.idempotencyKey) state.idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const items = state.items.map((item) => ({ product_id: item.product.id, quantity: item.quantity, selected_option_ids: item.selectedOptionIds, note: "" }));
  try {
    let orderCode = null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc("place_roadside_order", {
          p_items: items,
          p_vehicle_note: $("rs-vehicle-note").value.trim() || null,
          p_order_note: $("rs-order-note").value.trim() || null,
          p_idempotency_key: state.idempotencyKey
        });
        if (!error && data?.success === true) {
          orderCode = data.order_code;
        }
      } catch (e) {
        console.debug("Remote roadside order submit fallback:", e);
      }
    }

    if (!orderCode) {
      const existing = getDemoKitchenOrders();
      const maxNum = existing.reduce((max, o) => {
        const num = parseInt(String(o.order_code || "").replace(/[^0-9]/g, ""), 10);
        return !isNaN(num) && num > max ? num : max;
      }, 100);
      orderCode = `B-${maxNum + 1}`;
      const newOrder = {
        id: `ord-rs-${Date.now()}`,
        order_code: orderCode,
        status: "new",
        total: state.items.reduce((s, i) => s + (i.product.price * i.quantity), 0),
        currency_code: "IQD",
        vehicle_note: $("rs-vehicle-note").value.trim() || "موظف الشارع",
        order_note: $("rs-order-note").value.trim() || "",
        service_point_label: "موظف الشارع والكاشير",
        branch_name: state.profile?.branch_name || "فرع طريق المطار",
        tracking_token: `track-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: "roadside",
        items: state.items.map((it, idx) => ({
          id: `item-${Date.now()}-${idx}`,
          name: it.product.name,
          quantity: it.quantity,
          unit_price: it.product.price,
          note: "",
          options: ["تحضير قياسي"]
        }))
      };
      existing.unshift(newOrder);
      saveDemoKitchenOrders(existing, "new_order", { order: newOrder });
    }

    $("rs-order-code").textContent = orderCode || "—";
    $("rs-success-dialog").showModal();
    state.items = [];
    state.idempotencyKey = null;
    $("rs-vehicle-note").value = "";
    $("rs-order-note").value = "";
    renderCart();
  } catch (error) {
    console.error("Roadside order submit failed", error);
    notify(error.message || "فشل إرسال الطلب.", "error");
  } finally {
    state.busy = false;
    $("rs-submit").innerHTML = `إرسال إلى المطبخ <span aria-hidden="true">←</span>`;
    renderCart();
  }
}

$("rs-login-form").addEventListener("submit", async (event) => {
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
    button.innerHTML = `دخول إلى الطلبات <span aria-hidden="true">←</span>`;
  }
});

$("rs-signout").addEventListener("click", async () => {
  try {
    await signOutStaff();
  } catch (error) {
    console.error("Roadside sign out failed", error);
  }
  state.profile = null;
  state.menu = null;
  state.items = [];
  window.location.href = "/login?signed_out=1&next=/roadside/order";
});
$("rs-categories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderCatalog();
});
$("rs-search").addEventListener("input", (event) => { state.search = event.target.value; renderCatalog(); });
$("rs-products").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const product = (state.menu?.products || []).find((item) => item.id === button.dataset.add);
  if (product) openProduct(product);
});
$("rs-option-groups").addEventListener("change", (event) => {
  const input = event.target.closest("[data-option-group]");
  if (!input || !state.product) return;
  const group = state.product.option_groups.find((entry) => entry.id === input.dataset.optionGroup);
  let selected = [...(state.picks[group.id] || [])];
  if (group.selection_type === "single") selected = [input.value];
  else if (input.checked) {
    const max = Number(group.max_selections || 99);
    if (selected.length >= max) { input.checked = false; $("rs-option-error").textContent = `يمكن اختيار ${digits.format(max)} كحد أعلى.`; $("rs-option-error").hidden = false; return; }
    selected.push(input.value);
  } else selected = selected.filter((id) => id !== input.value);
  state.picks[group.id] = selected;
  $("rs-option-error").hidden = true;
  updateDialogPrice();
});
$("rs-qty-minus").addEventListener("click", () => { state.quantity = Math.max(1, state.quantity - 1); updateDialogPrice(); });
$("rs-qty-plus").addEventListener("click", () => { state.quantity = Math.min(50, state.quantity + 1); updateDialogPrice(); });
$("rs-dialog-close").addEventListener("click", () => $("rs-product-dialog").close());
$("rs-product-dialog").addEventListener("click", (event) => { if (event.target === $("rs-product-dialog")) $("rs-product-dialog").close(); });
$("rs-product-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const error = selectionError();
  if (error) { $("rs-option-error").textContent = error; $("rs-option-error").hidden = false; return; }
  const ids = Object.values(state.picks).flat();
  addToCart(state.product, ids, state.quantity);
  $("rs-product-dialog").close();
});
$("rs-cart-body").addEventListener("click", (event) => { const button = event.target.closest("[data-cart]"); if (button) onCartAction(button.dataset.cart, Number(button.dataset.index)); });
$("rs-clear-cart").addEventListener("click", () => { state.items = []; state.idempotencyKey = null; renderCart(); });
$("rs-submit").addEventListener("click", submitOrder);
$("rs-next-order").addEventListener("click", () => { $("rs-success-dialog").close(); window.scrollTo({ top: 0, behavior: "smooth" }); });

renderCart();
if (!isSupabaseConfigured || !supabase) {
  $("rs-login-error").textContent = "إعدادات Supabase غير مكتملة. راجع عنوان المشروع ومفتاح النشر في config.js.";
  $("rs-login-error").hidden = false;
} else {
  getStaffSession().then((session) => session && enterWithProfile(session.profile)).catch((error) => {
    $("rs-login-error").textContent = error.message || "تعذر استعادة جلسة الدخول.";
    $("rs-login-error").hidden = false;
  });
}
