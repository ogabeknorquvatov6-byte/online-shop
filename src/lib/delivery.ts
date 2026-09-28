import type { Settings } from './types';

/*
 * Yetkazib berish narxi — mijozga koʻrsatiladigan YAGONA hisob-kitob joyi.
 *
 * Ilgari savat, savat sahifasi va checkout narxni alohida-alohida
 * `subtotal > 500000 ? 0 : 30000` deb qattiq yozib qoʻygan edi, admin
 * panelidagi "Yetkazib berish" sozlamalari esa hech qayerda ishlatilmasdi.
 * Endi manba `store_settings` — va aynan shu qoida serverda ham
 * (`public.delivery_fee_for`) takrorlanadi, shuning uchun checkoutda
 * koʻrsatilgan "Jami" bazada saqlangan summa bilan doim bir xil boʻladi.
 */

/** Sozlamalar hali yuklanmagan boʻlsa ishlatiladigan zaxira qiymatlar. */
const FALLBACK = {
  tashkent: 30000,
  republic: 30000,
  freeThreshold: 500000,
};

export function isTashkent(city: string | null | undefined): boolean {
  const c = (city ?? '').toLowerCase();
  return c.includes('toshkent') || c.includes('tashkent');
}

export type DeliveryQuote = {
  /** Soʻmda yetkazib berish narxi (0 = bepul). */
  fee: number;
  /** Bepul yetkazib berishgacha qolgan summa; 0 boʻlsa allaqachon bepul. */
  remainingForFree: number;
  /** Bepul yetkazib berish chegarasi (0 = bunday aksiya yoʻq). */
  freeThreshold: number;
  isFree: boolean;
};

export function quoteDelivery(
  settings: Settings | null,
  subtotal: number,
  city?: string | null
): DeliveryQuote {
  const tashkent = settings?.delivery_fee_tashkent ?? FALLBACK.tashkent;
  const republic = settings?.delivery_fee_republic ?? FALLBACK.republic;
  const freeThreshold = settings?.free_delivery_threshold ?? FALLBACK.freeThreshold;

  const base = isTashkent(city ?? 'Toshkent') ? tashkent : republic;
  const isFree = freeThreshold > 0 && subtotal >= freeThreshold;

  return {
    fee: isFree ? 0 : base,
    isFree,
    freeThreshold,
    remainingForFree: isFree || freeThreshold <= 0 ? 0 : Math.max(0, freeThreshold - subtotal),
  };
}
