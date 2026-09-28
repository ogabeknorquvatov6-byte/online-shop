import type { CartItem } from './types';
import { cartItemKey } from './cartUtils';

/*
 * Checkout idempotentligi — mijoz tomoni.
 *
 * MUAMMO. "Buyurtma berish" tugmasi bosilgach soʻrov serverga ketadi.
 * Agar javob YOʻQOLSA (mobil tarmoq uzildi, taymaut, foydalanuvchi
 * sahifani yangiladi), mijoz buyurtma yaratilganini BILMAYDI. U qayta
 * bosadi — va ikkinchi buyurtma yaratiladi, ombor ikki marta kamayadi.
 *
 * UIʼdagi `submitting` bayrogʻi buni HAL QILMAYDI: u faqat bitta sahifa
 * koʻrinishi ichida yashaydi va sahifa yangilanishi bilan yoʻqoladi.
 *
 * YECHIM. Har bir checkout URINISHI uchun bitta UUID. U serverga
 * `p_checkout_request_id` sifatida boradi va u yerda UNIQUE ustunga
 * yoziladi. Takroriy soʻrov yangi buyurtma yaratmaydi — server mavjud
 * buyurtmaning IDʼsini qaytaradi.
 *
 * Kalit qachon YANGILANADI:
 *   — buyurtma muvaffaqiyatli yaratilgach (keyingi xarid — yangi urinish);
 *   — savat tarkibi oʻzgargach (bu allaqachon BOSHQA soʻrov).
 * Kalit qachon SAQLANADI:
 *   — xatolikdan keyingi qayta urinishda. Aynan shu holat uchun kerak:
 *     agar birinchi urinish aslida serverga yetib borgan boʻlsa,
 *     ikkinchisi dublikat emas, oʻsha buyurtmani qaytaradi.
 */

/**
 * UUID v4. `crypto.randomUUID` HTTPS/localhostʼdan tashqarida (masalan
 * ichki tarmoqdagi HTTP manzilda) mavjud boʻlmasligi mumkin, shuning
 * uchun zaxira yoʻl bor — kalit hech qachon "yaratilmay qolmasligi" kerak.
 */
export function newCheckoutRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122: versiya 4 va variant bitlari.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Savat tarkibining barqaror "barmoq izi".
 *
 * Tartibdan qatʼi nazar bir xil savat bir xil satr beradi — foydalanuvchi
 * mahsulotlarni oʻchirib qayta qoʻshsa ham, tarkib aynan oʻsha boʻlsa
 * idempotentlik kaliti bekorga yangilanmaydi.
 */
export function cartSignature(items: CartItem[]): string {
  return items
    .map((item) => `${cartItemKey(item)}x${item.quantity}`)
    .sort()
    .join('|');
}

/* ── Deploy nomuvofiqligidan himoya ──────────────────────────────────── */

/**
 * Xato "bunday funksiya topilmadi" degani boʻlsa — true.
 *
 * NEGA KERAK. PostgREST RPC chaqiruvini NOMLI argumentlar bilan quradi:
 *
 *     create_order(p_customer_name => $1, …, p_checkout_request_id => $11)
 *
 * Yaʼni ortiqcha nomli argument JIM OʻTKAZIB YUBORILMAYDI — mos keluvchi
 * overload topilmasa chaqiruv XATO bilan tugaydi (PostgREST `PGRST202`,
 * HTTP 404; baʼzi holatlarda Postgresʼning `42883` xatosi).
 *
 * Bu esa deploy tartibiga bogʻliq nomuvofiqlik oynasini ochadi: frontend
 * bazadan OLDIN chiqsa, `p_checkout_request_id` hali mavjud boʻlmaydi va
 * BUYURTMA BERISH BUTUNLAY ISHLAMAY QOLADI. Bunday nosozlikni oldindan
 * sezish qiyin — u faqat haqiqiy xaridorda koʻrinadi.
 *
 * Shuning uchun mijoz bir marta zaxira yoʻldan boradi: kalitsiz qayta
 * yuboradi. Idempotentlik yoʻqoladi (eski bazada u baribir yoʻq edi),
 * lekin xarid ishlaydi. Baza yangilangach zaxira yoʻl oʻz-oʻzidan
 * ishlatilmay qoladi.
 */
export function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    message.includes('schema cache') ||
    (message.includes('function') && message.includes('does not exist'))
  );
}
