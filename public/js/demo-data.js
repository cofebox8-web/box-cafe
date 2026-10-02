// BOX COFE — Demo Data Purged
// Production reads live data exclusively from Supabase.
// No hardcoded sample products, test categories, or mock orders.

export const DEMO_MENU_DATA = {
  restaurant: {
    id: "rest-001",
    name: "بوكس كافي",
    currency_code: "IQD"
  },
  branch: {
    name: "الموقع الرئيسي",
    slug: "main",
    is_active: true
  },
  categories: [],
  products: []
};
