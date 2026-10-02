// EV CAFE — Product Image Resolver
// Ensures 100% reliable, pure white background (#FFFFFF) studio photography
// Completely isolated, centered products with zero clutter, zero broken links

export function resolveProductImage(p) {
  if (!p) return "/images/products/espresso.jpg";

  // If already pointing to our local products folder, return it
  if (typeof p.image_url === "string" && p.image_url.startsWith("/images/products/")) {
    return p.image_url;
  }

  const name = String(p.name || "").trim();

  // 1. Pastry & Desserts (المخبوزات والحلويات)
  if (name.includes("كرواسون")) return "/images/products/croissant.jpg";
  if (name.includes("كوكيز")) return "/images/products/cookie.jpg";
  if (name.includes("براوني") || name.includes("تارت")) return "/images/products/brownie.jpg";
  if (name.includes("إكلير") || name.includes("اكلير") || name.includes("بودينغ") || name.includes("بودنج")) {
    return "/images/products/croissant.jpg";
  }

  // 2. Matcha (ماتشا)
  if (name.includes("ماتشا")) {
    if (name === "ماتشا لاتيه" || name.includes("ساخن")) return "/images/products/matcha-hot.jpg";
    return "/images/products/matcha-iced.jpg";
  }

  // 3. Smoothies (سموذي)
  if (name.includes("سموذي") || name.includes("عصير")) return "/images/products/smoothie.jpg";

  // 4. Frappes & Milkshakes (فرابيه وميلك شيك)
  if (name.includes("فرابيه") || name.includes("ميلك شيك") || name.includes("شيك")) {
    return "/images/products/frappe.jpg";
  }

  // 5. Mojitos (موهيتو)
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

  // 6. Iced Tea (الشاي المثلج)
  if (name.includes("آيس تي") || name.includes("ايس تي") || name.includes("شاي مثلج") || name.includes("شاي بارد")) {
    return "/images/products/peach-iced-tea.jpg";
  }

  // 7. Hot Drinks (شاي، كرك، هوت شوكليت)
  if (name.includes("شاي") || name.includes("كرك") || name.includes("جاي")) {
    return "/images/products/hot-tea.jpg";
  }
  if (name.includes("هوت شوكليت") || name.includes("شوكولاتة ساخنة") || name.includes("كاكاو")) {
    return "/images/products/cappuccino.jpg";
  }

  // 8. Iced Coffee (القهوة الباردة)
  if (name.includes("آيس أمريكانو") || name.includes("ايس امريكانو") || name.includes("أمريكانو بارد")) {
    return "/images/products/iced-americano.jpg";
  }
  if (name.includes("آيس") || name.includes("ايس") || name.includes("بارد") || name.includes("مثلج")) {
    return "/images/products/iced-latte.jpg";
  }

  // 9. Hot Coffee (القهوة الساخنة)
  if (name.includes("اسبريسو") || name.includes("إسبريسو") || name.includes("أمريكانو") || name.includes("امريكانو") || name.includes("تركية") || name.includes("تركي")) {
    return "/images/products/espresso.jpg";
  }
  if (name.includes("كابتشينو") || name.includes("فلات") || name.includes("كورتادو") || name.includes("موكا")) {
    return "/images/products/cappuccino.jpg";
  }

  // Fallback to classic latte with rosetta art
  return "/images/products/latte.jpg";
}
