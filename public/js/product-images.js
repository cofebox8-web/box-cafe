// EV CAFE — product image resolver
// Database catalog URLs are authoritative; local defaults cover legacy items.

export function resolveProductImage(p) {
  if (!p) return "/images/products/espresso.jpg";

  // A product-specific URL saved by the admin/catalog is authoritative.
  // Do not replace it with a category heuristic: variants such as strawberry,
  // mango, pistachio, and caramel must keep their own product image.
  if (typeof p.image_url === "string" && p.image_url.trim()) {
    return p.image_url.trim();
  }

  // If already pointing to an existing local product image, check if we have a better distinct one
  const name = String(p.name || "").trim();

  // 1. Pastry & Desserts (المخبوزات والحلويات — صور مخصصة لكل صنف بدون تكرار)
  if (name.includes("كرواسون جبن") || name.includes("جبن")) return "/images/products/croissant-cheese.jpg";
  if (name.includes("كرواسون شوكولاتة") || name.includes("نوتيلا كرواسون")) return "/images/products/croissant-chocolate.jpg";
  if (name.includes("كرواسون")) return "/images/products/croissant-plain.jpg";
  if (name.includes("كوكيز")) return "/images/products/cookie.jpg";
  if (name.includes("براوني")) return "/images/products/brownie.jpg";
  if (name.includes("إكلير") || name.includes("اكلير")) return "/images/products/eclair.jpg";
  if (name.includes("تارت شوكولاتة")) return "/images/products/tart-chocolate.jpg";
  if (name.includes("تارت كراميل") || name.includes("بيكان") || name.includes("تارت")) return "/images/products/tart-pecan.jpg";
  if (name.includes("بودينغ") || name.includes("بودنج") || name.includes("موز")) return "/images/products/banana-pudding.jpg";

  // 2. Hot Coffee (القهوة الساخنة — تنويع بصري كامل بدون تكرار الكوب)
  if (name.includes("دبل اسبريسو")) return "/images/products/double-espresso.jpg";
  if (name.includes("أمريكانو") || name.includes("امريكانو")) return "/images/products/americano.jpg";
  if (name.includes("تركية") || name.includes("تركي")) return "/images/products/turkish-coffee.jpg";
  if (name.includes("فلات وايت") || name.includes("فلات")) return "/images/products/flat-white.jpg";
  if (name.includes("كابتشينو") || name.includes("كورتادو")) return "/images/products/cappuccino.jpg";
  if (name.includes("اسبريسو") || name.includes("إسبريسو")) return "/images/products/espresso.jpg";
  if (name.includes("لاتيه") || name.includes("موكا")) return "/images/products/latte.jpg";

  // 3. Hot Drinks (المشروبات الساخنة)
  if (name.includes("هوت شوكليت") || name.includes("شوكولاتة ساخنة") || name.includes("كاكاو")) {
    return "/images/products/hot-chocolate.jpg";
  }
  if (name.includes("شاي") || name.includes("كرك") || name.includes("جاي")) {
    return "/images/products/hot-tea.jpg";
  }

  // 4. Iced Coffee (القهوة الباردة)
  if (name.includes("آيس أمريكانو") || name.includes("ايس امريكانو")) return "/images/products/iced-americano.jpg";
  if (name.includes("آيس") || name.includes("ايس") || name.includes("بارد")) return "/images/products/iced-latte.jpg";

  // 5. Matcha (ماتشا)
  if (name.includes("ماتشا")) {
    if (name === "ماتشا لاتيه" || name.includes("ساخن")) return "/images/products/matcha-hot.jpg";
    return "/images/products/matcha-iced.jpg";
  }

  // 6. Mojitos (موهيتو)
  if (name.includes("موهيتو")) {
    if (name.includes("بلو")) return "/images/products/blue-mojito.jpg";
    if (
      name.includes("فراولة") ||
      name.includes("باشن") ||
      name.includes("مانجا") ||
      name.includes("مانجو") ||
      name.includes("خوخ") ||
      name.includes("روز") ||
      name.includes("توت")
    ) {
      return "/images/products/strawberry-mojito.jpg";
    }
    return "/images/products/classic-mojito.jpg";
  }

  // 7. Iced Tea (الشاي المثلج)
  if (name.includes("آيس تي") || name.includes("ايس تي") || name.includes("شاي مثلج")) {
    return "/images/products/peach-iced-tea.jpg";
  }

  // 8. Frappes & Milkshakes (فرابيه وميلك شيك)
  if (name.includes("فرابيه") || name.includes("ميلك شيك") || name.includes("شيك")) {
    return "/images/products/frappe.jpg";
  }

  // 9. Smoothies (سموذي)
  if (name.includes("سموذي")) return "/images/products/smoothie.jpg";

  return "/images/products/espresso.jpg";
}
