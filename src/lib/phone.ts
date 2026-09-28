/**
 * Telefon raqamini faqat raqamlar ketma-ketligiga keltiradi.
 * Formani tekshirishda va bazaga yozishda ishlatiladi.
 *
 * Eslatma: raqamdan ichki auth-email yasash `lib/login.ts` ga ko'chirildi —
 * kirish identifikatori endi telefon emas, Telegram botda tanlangan LOGIN.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}
