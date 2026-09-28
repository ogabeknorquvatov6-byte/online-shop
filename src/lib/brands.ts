/*
 * BREND — MAHSULOT XUSUSIYATI, KATEGORIYA EMAS.
 *
 * Bazada alohida `brands` jadvali YOʻQ: brend faqat `products.brand`
 * ustunida matn sifatida saqlanadi. Shu sababli mavjud brendlar roʻyxati
 * mahsulotlardan olinadi va bu yerda hech qanday yangi "brend tizimi"
 * yaratilmaydi — faqat mavjud maʼlumot ustida ishlanadi.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────
 *
 * Brend erkin matn boʻlgani uchun bir xil brend turli xil yozilishi
 * mumkin: "Apple", "apple", "APPLE", " Apple ". Katalogdagi brend
 * filtri ularni ALOHIDA variantlar deb koʻrsatadi va foydalanuvchi
 * bitta brendni toʻrt marta koʻradi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────
 *
 * Yangi qiymat kiritilganda u mavjud brendlar bilan REGISTRGA
 * BOGʻLIQ BOʻLMAGAN holda solishtiriladi. Moslik topilsa — bazada
 * allaqachon ishlatilayotgan YOZILISH qaytariladi.
 *
 * MUHIM: bu faqat YANGI kiritishlarga taalluqli. Mavjud yozuvlar
 * jimgina qayta yozilmaydi — ommaviy oʻzgartirish alohida, ataylab
 * qilinadigan ish boʻlishi kerak.
 */

/** Solishtirish uchun yagona shakl. Koʻrsatish uchun ISHLATILMAYDI. */
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
 * Mavjud brend bilan mos kelsa — oʻsha brendning bazadagi yozilishi
 * qaytariladi ("apple" → "Apple"). Aks holda kiritilgan matn faqat
 * chetki boʻshliqlardan tozalanadi: yangi brendning yozilishini
 * admin oʻzi hal qiladi, biz uni "toʻgʻrilamaymiz".
 */
export function normalizeBrandInput(input: string, existing: readonly string[]): string {
  return matchExistingBrand(input, existing) ?? input.trim();
}

/**
 * Kiritilayotgan matn boʻyicha takliflar.
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
 * Roʻyxatdagi registr dublikatlarini yigʻib, har bir brenddan bittasini
 * qoldiradi. Qaysi biri qoladi — eng koʻp uchragani; teng boʻlsa
 * alifbo tartibida birinchisi. Shunda roʻyxat barqaror boʻladi.
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
 * Kiritilgan qiymat YANGI brendmi (yaʼni roʻyxatda yoʻqmi)?
 * Formada «+ "X" qoʻshish» ni koʻrsatish uchun.
 */
export function isNewBrand(input: string, existing: readonly string[]): boolean {
  return canonicalBrand(input).length > 0 && matchExistingBrand(input, existing) === null;
}
