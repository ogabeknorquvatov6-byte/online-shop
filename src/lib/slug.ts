import { stripApostrophes } from './search';

/*
 * Slug — manzil satridagi nom (`/category/telefonlar`).
 *
 * ── NEGA ALOHIDA FAYL ───────────────────────────────────────────────
 *
 * Bu funksiya IKKI NUSXADA yashardi: `admin/Categories.tsx` va
 * `admin/Products.tsx`. Ikkalasi bir xil yozilgandi, lekin bu shunchaki
 * vaqt masalasi edi — nusxalar bir kun ajralib ketadi va oʻshanda bitta
 * nom kategoriya sifatida bir xil, mahsulot sifatida boshqacha slug
 * olardi.
 *
 * Aynan shunday boʻlishiga bir bahya qolgandi: ilova matnlari ʻ (U+02BB)
 * ga oʻtkazilganda ikkala nusxa ham eskicha `[’'`]` ni bilar, ʻ va ʼ ni
 * esa bilmasdi. Endi tuzatish bitta joyda.
 *
 * ── APOSTROF OʻCHIRILADI, TIREGA AYLANMAYDI ─────────────────────────
 *
 * `Qoʻshimcha` → `qoshimcha`, `qo-shimcha` EMAS.
 *
 * Sabab: apostrof soʻzni BOʻLMAYDI, u soʻz ichidagi tovush belgisi.
 * Tirega aylantirilsa manzil ikki soʻzdan iboratdek koʻrinardi
 * (`/category/qo-shimcha`) va odam uni ogʻzaki aytolmasdi. Shu sababli
 * u avval oʻchiriladi, tire esa faqat HAQIQIY ajratuvchilardan
 * (boʻshliq, tinish belgisi) hosil boʻladi.
 */
export function slugify(value: string): string {
  return stripApostrophes(value.toLowerCase().trim())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
