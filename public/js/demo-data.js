// Demo Data for Box Coffee Menu & Ordering Preview
// Provides realistic specialty coffee items, categories, option groups, and branches

export const DEMO_MENU_DATA = {
  restaurant: {
    id: "rest-001",
    name: "بوكس كافي",
    currency_code: "IQD"
  },
  branch: {
    id: "branch-airport",
    name: "فرع طريق المطار",
    slug: "airport",
    is_active: true,
    accepting_orders: true
  },
  service_point: {
    id: "sp-001",
    label: "المسار 1 — خدمة السيارات",
    qr_token: "a0000000-0000-0000-0000-000000000001",
    is_active: true
  },
  categories: [
    {
      id: "cat-hot",
      name: "قهوة ساخنة",
      description: "إسبريسو غني ومشروبات ساخنة محضرة بإتقان",
      sort_order: 1
    },
    {
      id: "cat-cold",
      name: "قهوة مثلجة وباردة",
      description: "مشروبات الإسبريسو الباردة والتقطير المنعش",
      sort_order: 2
    },
    {
      id: "cat-bakery",
      name: "مخبوزات وحلويات",
      description: "مخبوزات فرنسية طازجة تكمل تجربة قهوتك",
      sort_order: 3
    },
    {
      id: "cat-refresh",
      name: "شاي ومشروبات منعشة",
      description: "ماتشا وشاي مختص وعصائر طبيعية",
      sort_order: 4
    }
  ],
  products: [
    {
      id: "prod-spanish-hot",
      category_id: "cat-hot",
      name: "سبانش لاتيه ساخن",
      description: "إسبريسو متوازن مع الحليب المبخر والحليب المكثف المحلى بطابع دافئ وغني",
      price: 5000,
      image_url: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80",
      badge: "الأكثر طلباً 🔥",
      sort_order: 1,
      is_available: true,
      option_groups: [
        {
          id: "optg-size-1",
          name: "الحجم",
          selection_type: "single",
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: "opt-size-reg", name: "وسط (Regular)", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-size-lrg", name: "كبير (Large)", price_modifier: 750, is_default: false, is_available: true }
          ]
        },
        {
          id: "optg-milk-1",
          name: "نوع الحليب",
          selection_type: "single",
          is_required: false,
          min_selections: 0,
          max_selections: 1,
          options: [
            { id: "opt-milk-whole", name: "حليب كامل الدسم", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-milk-skim", name: "حليب قليل الدسم", price_modifier: 0, is_default: false, is_available: true },
            { id: "opt-milk-oat", name: "حليب شوفان عضوي", price_modifier: 750, is_default: false, is_available: true },
            { id: "opt-milk-almond", name: "حليب لوز", price_modifier: 750, is_default: false, is_available: true }
          ]
        },
        {
          id: "optg-extras-1",
          name: "إضافات اختيارية",
          selection_type: "multiple",
          is_required: false,
          min_selections: 0,
          max_selections: 3,
          options: [
            { id: "opt-ext-shot", name: "شوت إسبريسو إضافي", price_modifier: 1000, is_default: false, is_available: true },
            { id: "opt-ext-caramel", name: "سيرب كراميل مملح", price_modifier: 500, is_default: false, is_available: true },
            { id: "opt-ext-whip", name: "كريمة مخفوقة فاخرة", price_modifier: 500, is_default: false, is_available: true }
          ]
        }
      ]
    },
    {
      id: "prod-caffe-latte",
      category_id: "cat-hot",
      name: "كافيه لاتيه كلاسيك",
      description: "جرعة إسبريسو غنية ومستخلصة بعناية مع طبقة مخملية ناعمة من الحليب الطازج",
      price: 4500,
      image_url: "https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80",
      badge: "كلاسيك ☕",
      sort_order: 2,
      is_available: true,
      option_groups: [
        {
          id: "optg-size-latte",
          name: "الحجم",
          selection_type: "single",
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: "opt-sz-latte-reg", name: "وسط (Regular)", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-sz-latte-lrg", name: "كبير (Large)", price_modifier: 750, is_default: false, is_available: true }
          ]
        },
        {
          id: "optg-milk-latte",
          name: "نوع الحليب",
          selection_type: "single",
          is_required: false,
          min_selections: 0,
          max_selections: 1,
          options: [
            { id: "opt-m-whole", name: "حليب طازج كامل", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-m-oat", name: "حليب شوفان", price_modifier: 750, is_default: false, is_available: true }
          ]
        }
      ]
    },
    {
      id: "prod-americano",
      category_id: "cat-hot",
      name: "أمريكانو كلاسيك",
      description: "جرعتان من الإسبريسو الفاخر المخفف بالماء الساخن لنكهة قهوة سوداء نقية وواضحة",
      price: 3500,
      image_url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
      badge: "نكهة نقية",
      sort_order: 3,
      is_available: true,
      option_groups: [
        {
          id: "optg-size-amr",
          name: "الحجم",
          selection_type: "single",
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: "opt-amr-reg", name: "وسط (12 oz)", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-amr-lrg", name: "كبير (16 oz)", price_modifier: 500, is_default: false, is_available: true }
          ]
        }
      ]
    },
    {
      id: "prod-v60",
      category_id: "cat-hot",
      name: "قهوة مقطرة مختصة V60",
      description: "تقطير يدوي طازج بحبوب إثيوبية مجففة بنوتات التوت والياسمين وقوام ناعم",
      price: 6000,
      image_url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80",
      badge: "مختصة ⭐",
      sort_order: 4,
      is_available: true,
      option_groups: []
    },
    {
      id: "prod-iced-spanish",
      category_id: "cat-cold",
      name: "آيس سبانش لاتيه",
      description: "المشروب البارد الأكثر طلباً في بوكس كافي: إسبريسو منعش مع الحليب المحلى والثلج",
      price: 5500,
      image_url: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80",
      badge: "الأكثر طلباً 🧊",
      sort_order: 1,
      is_available: true,
      option_groups: [
        {
          id: "optg-size-ispan",
          name: "الحجم",
          selection_type: "single",
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: "opt-isp-reg", name: "وسط بارد", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-isp-lrg", name: "كبير بارد", price_modifier: 750, is_default: false, is_available: true }
          ]
        },
        {
          id: "optg-ext-ispan",
          name: "إضافات",
          selection_type: "multiple",
          is_required: false,
          min_selections: 0,
          max_selections: 2,
          options: [
            { id: "opt-isp-shot", name: "شوت إضافي", price_modifier: 1000, is_default: false, is_available: true },
            { id: "opt-isp-syrup", name: "سيرب بندق", price_modifier: 500, is_default: false, is_available: true }
          ]
        }
      ]
    },
    {
      id: "prod-coldbrew",
      category_id: "cat-cold",
      name: "كولد برو منقوع 18 ساعة",
      description: "قهوة مقطرة بالماء البارد ببطء شديد، ذات حموضة ناعمة ونكهة شوكولاتية عميقة",
      price: 6000,
      image_url: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=600&q=80",
      badge: "منقوع 18h ⏳",
      sort_order: 2,
      is_available: true,
      option_groups: []
    },
    {
      id: "prod-croissant",
      category_id: "cat-bakery",
      name: "كرواسون زبدة فرنسي فاخر",
      description: "مخبوز يومياً بطبقات مقرمشة وهشة وغني بالزبدة الطبيعية",
      price: 3000,
      image_url: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
      badge: "مخبوز اليوم 🥐",
      sort_order: 1,
      is_available: true,
      option_groups: [
        {
          id: "optg-heat-croissant",
          name: "درجة التسخين",
          selection_type: "single",
          is_required: false,
          min_selections: 0,
          max_selections: 1,
          options: [
            { id: "opt-cr-warm", name: "تسخين خفيف طازج", price_modifier: 0, is_default: true, is_available: true },
            { id: "opt-cr-plain", name: "بدون تسخين", price_modifier: 0, is_default: false, is_available: true }
          ]
        }
      ]
    },
    {
      id: "prod-cookie",
      category_id: "cat-bakery",
      name: "كوكيز الشوكولاتة البلجيكية",
      description: "كوكيز دافئ وطري ومحشو بقطع وفيرة من الشوكولاتة البلجيكية الداكنة",
      price: 2500,
      image_url: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80",
      badge: "بلجيكي فاخر 🍪",
      sort_order: 2,
      is_available: true,
      option_groups: []
    },
    {
      id: "prod-matcha-latte",
      category_id: "cat-refresh",
      name: "آيس ماتشا لاتيه ياباني",
      description: "شاي ماتشا أوكولوجي مطحون من أجود مزارع أوجي مع حليب الشوفان البارد",
      price: 6500,
      image_url: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80",
      badge: "ماتشا أوجي 🍵",
      sort_order: 1,
      is_available: true,
      option_groups: []
    }
  ]
};

const LIVE_ORDERS_STORAGE_KEY = "box_coffee_live_orders_v4";
const KITCHEN_SYNC_CHANNEL = "box_coffee_kitchen_sync";

// Clean legacy orders demo keys if present
try {
  ['box_coffee_live_orders_v1', 'box_coffee_live_orders_v2', 'box_coffee_live_orders_v3'].forEach(k => localStorage.removeItem(k));
} catch {}

export function getInitialSeedOrders() {
  return [];
}

export function resetDemoKitchenOrders() {
  const seeded = getInitialSeedOrders();
  saveDemoKitchenOrders(seeded, "orders_reset", {});
  return seeded;
}

export function getDemoKitchenOrders() {
  try {
    const raw = localStorage.getItem(LIVE_ORDERS_STORAGE_KEY);
    if (!raw) {
      const seeded = getInitialSeedOrders();
      localStorage.setItem(LIVE_ORDERS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getInitialSeedOrders();
  } catch (e) {
    return getInitialSeedOrders();
  }
}

export function saveDemoKitchenOrders(orders, eventType = "orders_updated", payload = {}) {
  try {
    localStorage.setItem(LIVE_ORDERS_STORAGE_KEY, JSON.stringify(orders));
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(KITCHEN_SYNC_CHANNEL);
      bc.postMessage({ type: eventType, timestamp: Date.now(), ...payload });
      bc.close();
    }
  } catch (e) {
    console.warn("Failed to save live orders:", e);
  }
}

export function simulateDemoOrder(params) {
  const existingOrders = getDemoKitchenOrders();
  const maxNum = existingOrders.reduce((max, o) => {
    const num = parseInt(String(o.order_code || "").replace(/[^0-9]/g, ""), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 103);

  const nextNum = maxNum + 1;
  const orderCode = `B-${nextNum}`;
  let total = 0;
  let itemsCount = 0;
  const detailedItems = [];

  for (const item of params.items) {
    const product = DEMO_MENU_DATA.products.find(p => p.id === item.product_id);
    if (!product) continue;
    let unitPrice = product.price;
    const optionNames = [];

    if (item.selected_option_ids && item.selected_option_ids.length > 0) {
      for (const optId of item.selected_option_ids) {
        if (product.option_groups) {
          for (const og of product.option_groups) {
            const found = og.options.find(o => o.id === optId);
            if (found) {
              unitPrice += (found.price_modifier || found.price_delta || 0);
              optionNames.push(found.name);
            }
          }
        }
      }
    }

    const qty = Math.max(1, Math.min(20, item.quantity || 1));
    total += unitPrice * qty;
    itemsCount += qty;

    detailedItems.push({
      id: `item-${nextNum}-${detailedItems.length + 1}`,
      name: product.name,
      quantity: qty,
      unit_price: unitPrice,
      note: item.note || "",
      options: optionNames.length > 0 ? optionNames : ["تحضير قياسي"]
    });
  }

  const nowIso = new Date().toISOString();
  const newOrder = {
    success: true,
    id: `ord-live-${nextNum}`,
    order_code: orderCode,
    total: total,
    currency_code: DEMO_MENU_DATA.restaurant.currency_code,
    created_at: nowIso,
    updated_at: nowIso,
    items_count: itemsCount,
    vehicle_note: params.vehicle_note || "سيارة في المسار 1",
    order_note: params.order_note || "",
    service_point_label: DEMO_MENU_DATA.service_point.label,
    branch_name: DEMO_MENU_DATA.branch.name,
    tracking_token: `demo-track-${nextNum}`,
    status: "new",
    items: detailedItems
  };

  existingOrders.unshift(newOrder);
  saveDemoKitchenOrders(existingOrders, "new_order", { order: newOrder });

  return newOrder;
}

export function updateDemoKitchenOrderStatus(orderCode, newStatus) {
  const orders = getDemoKitchenOrders();
  const target = orders.find(o => o.order_code === orderCode);
  if (!target) return { success: false };

  target.status = newStatus;
  target.updated_at = new Date().toISOString();
  saveDemoKitchenOrders(orders, "status_changed", {
    order_code: orderCode,
    status: newStatus,
    tracking_token: target.tracking_token
  });

  return {
    success: true,
    order_code: target.order_code,
    status: target.status,
    updated_at: target.updated_at
  };
}

export function simulateGetOrderStatus(trackingToken) {
  const orders = getDemoKitchenOrders();
  const found = orders.find(o => o.tracking_token === trackingToken || o.order_code === trackingToken);
  const statusLabels = {
    new: "جديد — بانتظار بدء التحضير",
    preparing: "قيد التحضير في المطبخ 🔥",
    ready: "جاهز للتسليم في المسار ✓",
    delivered: "تم التسليم بالهناء والعافية",
    cancelled: "تم إلغاء الطلب"
  };

  if (found) {
    return {
      success: true,
      order_code: found.order_code,
      status: found.status,
      status_label: statusLabels[found.status] || found.status,
      total: found.total,
      currency_code: found.currency_code || DEMO_MENU_DATA.restaurant.currency_code,
      updated_at: found.updated_at
    };
  }

  return {
    success: true,
    order_code: "B-104",
    status: "preparing",
    status_label: "قيد التحضير في المطبخ 🔥",
    total: 5000,
    currency_code: DEMO_MENU_DATA.restaurant.currency_code,
    updated_at: new Date().toISOString()
  };
}

// ============================================================================
// Live Menu & Product Store for Main Admin (/admin) <-> Customer Menu (/menu)
// ============================================================================
const LIVE_MENU_STORAGE_KEY = "box_coffee_live_menu_v4";

// Clean legacy menu demo keys if present
try {
  ['box_coffee_live_menu_v1', 'box_coffee_live_menu_v2', 'box_coffee_live_menu_v3'].forEach(k => localStorage.removeItem(k));
} catch {}

function createEmptyMenuData() {
  return {
    restaurant: { name: "بوكس كافي", currency_code: "IQD" },
    branch: { name: "", slug: "" },
    service_point: { label: "", kind: "order_lane" },
    categories: [],
    products: []
  };
}

export function getLiveMenuData() {
  try {
    const raw = localStorage.getItem(LIVE_MENU_STORAGE_KEY);
    if (!raw) return createEmptyMenuData();
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.categories)) {
      return parsed;
    }
    return createEmptyMenuData();
  } catch (e) {
    return createEmptyMenuData();
  }
}

export function saveLiveMenuData(menuData, eventType = "menu_updated") {
  try {
    localStorage.setItem(LIVE_MENU_STORAGE_KEY, JSON.stringify(menuData));
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(KITCHEN_SYNC_CHANNEL);
      bc.postMessage({ type: eventType, timestamp: Date.now() });
      bc.close();
    }
  } catch (e) {
    console.warn("Failed to save live menu data:", e);
  }
}

export function resetLiveMenuData() {
  const empty = createEmptyMenuData();
  saveLiveMenuData(empty, "menu_updated");
  return empty;
}

export function toggleLiveProductAvailability(productId) {
  const menu = getLiveMenuData();
  const prod = menu.products.find(p => p.id === productId);
  if (!prod) return null;
  prod.is_available = !prod.is_available;
  saveLiveMenuData(menu, "menu_updated");
  return prod;
}

export function upsertLiveProduct(productPayload) {
  const menu = getLiveMenuData();
  const isEdit = Boolean(productPayload.id) && menu.products.some(p => p.id === productPayload.id);

  if (isEdit) {
    const idx = menu.products.findIndex(p => p.id === productPayload.id);
    menu.products[idx] = {
      ...menu.products[idx],
      name: productPayload.name,
      description: productPayload.description || "",
      category_id: productPayload.category_id,
      price: Number(productPayload.price) || 0,
      badge: productPayload.badge || "",
      image_url: productPayload.image_url || "",
      is_available: productPayload.is_available !== undefined ? Boolean(productPayload.is_available) : true
    };
  } else {
    const newId = `prod-custom-${Date.now()}`;
    menu.products.unshift({
      id: newId,
      category_id: productPayload.category_id || "",
      name: productPayload.name || "",
      description: productPayload.description || "",
      price: Number(productPayload.price) || 0,
      image_url: productPayload.image_url || "",
      badge: productPayload.badge || "",
      sort_order: 0,
      is_available: productPayload.is_available !== undefined ? Boolean(productPayload.is_available) : true,
      option_groups: []
    });
  }

  saveLiveMenuData(menu, "menu_updated");
  return menu;
}

export function deleteLiveProduct(productId) {
  const menu = getLiveMenuData();
  menu.products = menu.products.filter(p => p.id !== productId);
  saveLiveMenuData(menu, "menu_updated");
  return menu;
}

export function upsertLiveCategory(categoryPayload) {
  const menu = getLiveMenuData();
  if (categoryPayload.id && menu.categories.some(c => c.id === categoryPayload.id)) {
    const cat = menu.categories.find(c => c.id === categoryPayload.id);
    cat.name = categoryPayload.name;
  } else {
    menu.categories.push({
      id: `cat-custom-${Date.now()}`,
      name: categoryPayload.name,
      description: "",
      sort_order: menu.categories.length + 1
    });
  }
  saveLiveMenuData(menu, "menu_updated");
  return menu;
}

// ============================================================================
// Daily Expenses Store for Main Admin ERP
// ============================================================================
const EXPENSES_STORAGE_KEY = "box_cofe_daily_expenses_v4";

// Clean legacy staff (insecure local accounts/PINs) & expenses demo keys if present.
// Staff accounts are never stored in the browser; see supabase/functions/admin-manage-staff.
try {
  [
    'box_cofe_staff_accounts',
    'box_cofe_staff_accounts_v1',
    'box_cofe_staff_accounts_v2',
    'box_cofe_staff_accounts_v3',
    'box_cofe_staff_accounts_v4',
    'box_cofe_daily_expenses_v1',
    'box_cofe_daily_expenses_v2',
    'box_cofe_daily_expenses_v3'
  ].forEach(k => localStorage.removeItem(k));
} catch {}

const DEFAULT_DAILY_EXPENSES = [];

export function getDailyExpenses() {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(DEFAULT_DAILY_EXPENSES));
      return DEFAULT_DAILY_EXPENSES;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_DAILY_EXPENSES;
  }
}

export function addDailyExpense(payload) {
  const list = getDailyExpenses();
  list.unshift({
    id: `exp-${Date.now()}`,
    title: payload.title,
    amount: Number(payload.amount) || 0,
    category: payload.category || "تشغيل يومي",
    time: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
  });
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deleteDailyExpense(expId) {
  const list = getDailyExpenses().filter(e => e.id !== expId);
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(list));
  return list;
}
