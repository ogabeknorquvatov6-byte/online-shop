/*
 * BREND — MAHSULOT XUSUSIYATI, KATEGORIYA EMAS.
 *
 * Bazada alohida `brands` jadvali YO'Q: brend faqat `products.brand`
 * ustunida matn sifatida saqlanadi. Shu sababli mavjud brendlar ro'yxati
 * mahsulotlardan olinadi va bu yerda hech qanday yangi "brend tizimi"
 * yaratilmaydi — faqat mavjud ma'lumot ustida ishlanadi.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────
 *
 * Brend erkin matn bo'lgani uchun bir xil brend turli xil yozilishi
 * mumkin: "Apple", "apple", "APPLE", " Apple ". Katalogdagi brend
 * filtri ularni ALOHIDA variantlar deb ko'rsatadi va foydalanuvchi
 * bitta brendni to'rt marta ko'radi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────
 *
 * Yangi qiymat kiritilganda u mavjud brendlar bilan REGISTRGA
 * BOG'LIQ BO'LMAGAN holda solishtiriladi. Moslik topilsa — bazada
 * allaqachon ishlatilayotgan YOZILISH qaytariladi.
 *
 * MUHIM: bu faqat YANGI kiritishlarga taalluqli. Mavjud yozuvlar
 * jimgina qayta yozilmaydi — ommaviy o'zgartirish alohida, ataylab
 * qilinadigan ish bo'lishi kerak.
 */

/** Solishtirish uchun yagona shakl. Ko'rsatish uchun ISHLATILMAYDI. */
export function canonicalBrand(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Kiritilgan matnga mos MAVJUD brendni topadi (registrga qaramay).
 * Topilmasa `null`.
 */
export function matchExistingBrand(input: string, existing: readonly string[]): string | null {
  const key = canonicalBrand(input);
  if (!key) return null;
  return existing.find((b) => canonicalBrand(b) === key) ?? null;
}

/**
 * Saqlashdan oldingi yakuniy qiymat.
 *
 * Mavjud brend bilan mos kelsa — o'sha brendning bazadagi yozilishi
 * qaytariladi ("apple" → "Apple"). Aks holda kiritilgan matn faqat
 * chetki bo'shliqlardan tozalanadi: yangi brendning yozilishini
 * admin o'zi hal qiladi, biz uni "to'g'rilamaymiz".
 */
export function normalizeBrandInput(input: string, existing: readonly string[]): string {
  return matchExistingBrand(input, existing) ?? input.trim();
}

/**
 * Kiritilayotgan matn bo'yicha takliflar.
 *
 * Avval BOSHLANISHI mos kelganlar, keyin ichida uchraganlar — shunda
 * "Ap" yozilganda "Apple" birinchi chiqadi.
 */
export function suggestBrands(
  input: string,
  existing: readonly string[],
  limit = 6
): string[] {
  const key = canonicalBrand(input);
  const unique = dedupeBrands(existing);
  if (!key) return unique.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const b of unique) {
    const c = canonicalBrand(b);
    if (c.startsWith(key)) starts.push(b);
    else if (c.includes(key)) contains.push(b);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Ro'yxatdagi registr dublikatlarini yig'ib, har bir brenddan bittasini
 * qoldiradi. Qaysi biri qoladi — eng ko'p uchragani; teng bo'lsa
 * alifbo tartibida birinchisi. Shunda ro'yxat barqaror bo'ladi.
 */
export function dedupeBrands(list: readonly string[]): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of list) {
    const value = raw.trim();
    if (!value) continue;
    const key = canonicalBrand(value);
    const variants = groups.get(key) ?? new Map<string, number>();
    variants.set(value, (variants.get(value) ?? 0) + 1);
    groups.set(key, variants);
  }
  const out: string[] = [];
  for (const variants of groups.values()) {
    let best = '';
    let bestCount = -1;
    for (const [value, n] of [...variants.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (n > bestCount) {
        best = value;
        bestCount = n;
      }
    }
    out.push(best);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Kiritilgan qiymat YANGI brendmi (ya'ni ro'yxatda yo'qmi)?
 * Formada «+ "X" qo'shish» ni ko'rsatish uchun.
 */
export function isNewBrand(input: string, existing: readonly string[]): boolean {
  return canonicalBrand(input).length > 0 && matchExistingBrand(input, existing) === null;
}
