import type { CartItem, Product } from './types';

/*
 * Savat bilan bog'liq sof funksiyalar (React'ga bog'liq emas).
 * Provider `cart.tsx` da qoladi, hisob-kitob esa shu yerda — shunda
 * ularni komponentsiz ham (masalan testda) ishlatish mumkin.
 */

/** `create_order` serverda har bir pozitsiya uchun 50 dona chegarasini qo'yadi. */
export const MAX_QTY_PER_ITEM = 50;

/**
 * Savat pozitsiyasining yagona kaliti.
 *
 * Ilgari pozitsiyalar `(productId, variant-matni)` juftligi bo'yicha
 * farqlanardi. Endi variantning ID'si ham bor va aynan u ustunlik qiladi:
 * admin variant nomini o'zgartirsa ham savatdagi pozitsiya "adashib"
 * ketmaydi va ikkita bir xil nomli variant chalkashmaydi.
 */
export function cartItemKey(item: Pick<CartItem, 'product' | 'variant' | 'variantId'>): string {
  return `${item.product.id}::${item.variantId ?? item.variant ?? ''}`;
}

function findVariant(product: Product, variantId?: string) {
  if (!variantId) return undefined;
  return product.product_variants?.find((v) => v.id === variantId);
}

/**
 * Bir pozitsiya uchun ruxsat etilgan maksimal miqdor.
 * Variantda alohida ombor yuritilsa (stock != null) — o'sha qoldiq,
 * aks holda mahsulotning umumiy qoldig'i.
 */
export function maxQuantityFor(product: Product, variantId?: string): number {
  const variant = findVariant(product, variantId);
  const available = variant?.stock != null ? variant.stock : product.stock || 0;
  return Math.max(1, Math.min(MAX_QTY_PER_ITEM, available));
}

/**
 * Pozitsiyaning dona narxi: mahsulot narxi + variantning narx farqi.
 * Bu FAQAT ko'rsatish uchun — yakuniy summa har doim serverda
 * (`create_order`) qayta hisoblanadi.
 */
export function unitPrice(item: Pick<CartItem, 'product' | 'variantId'>): number {
  const variant = findVariant(item.product, item.variantId);
  return Math.max(0, item.product.price + (variant?.price_adjustment ?? 0));
}

/*
 * ── Saqlangan savatni tozalash ──────────────────────────────────────
 *
 * `localStorage` — ISHONCHSIZ MANBA. Uning ichidagi ma'lumotni:
 *   — foydalanuvchi DevTools'da qo'lda tahrirlashi mumkin;
 *   — ilovaning eski versiyasi boshqa shaklda yozgan bo'lishi mumkin;
 *   — brauzer kengaytmasi buzgan bo'lishi mumkin;
 *   — yozish yarim yo'lda uzilib qolgan bo'lishi mumkin.
 *
 * Ilgari tekshiruv `Number.isFinite(i.quantity)` bilan cheklangan edi.
 * Bu `-5`, `0`, `1.5` va `1e9` ni ham O'TKAZIB YUBORARDI, `product.price`
 * esa umuman tekshirilmasdi. Natijada savatda manfiy summa yoki
 * "NaN so'm" ko'rinishi mumkin edi — server bunday buyurtmani rad
 * etadi, lekin foydalanuvchi shu paytgacha buzilgan interfeys bilan
 * ishlab, do'konga ishonchini yo'qotgan bo'lardi.
 *
 * Alohida SOF funksiya sifatida ajratilgan — React'siz test qilinadi.
 */

/** Savatda saqlanishi mumkin bo'lgan maksimal pozitsiya soni. */
export const MAX_CART_LINES = 50;

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Xom (JSON.parse qilingan) qiymatdan faqat ishonchli pozitsiyalarni
 * qaytaradi. Yaroqsizlari JIM ravishda tashlanadi — savatni butunlay
 * bo'shatib yuborgandan ko'ra, buzuq qatorni olib tashlash yaxshiroq.
 */
export function sanitizeStoredCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  const out: CartItem[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (out.length >= MAX_CART_LINES) break;
    if (!entry || typeof entry !== 'object') continue;

    const item = entry as Partial<CartItem>;
    const product = item.product;
    if (!product || typeof product !== 'object') continue;
    if (typeof product.id !== 'string' || product.id === '') continue;
    if (typeof product.name !== 'string') continue;
    // Narx son bo'lishi SHART: aks holda oraliq summa `NaN` bo'lib,
    // butun savat "NaN so'm" ko'rsatardi.
    if (!isNonNegativeNumber(product.price)) continue;

    // Miqdor: BUTUN, musbat va chegara ichida.
    const qty = item.quantity;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue;

    const variant = typeof item.variant === 'string' ? item.variant : undefined;
    const variantId = typeof item.variantId === 'string' ? item.variantId : undefined;

    const safe: CartItem = {
      product: {
        ...product,
        // Qoldiq va massivlar ham buzilgan bo'lishi mumkin.
        stock: isNonNegativeNumber(product.stock) ? product.stock : 0,
        product_variants: Array.isArray(product.product_variants) ? product.product_variants : [],
        product_images: Array.isArray(product.product_images) ? product.product_images : [],
      } as CartItem['product'],
      quantity: Math.min(qty, MAX_QTY_PER_ITEM),
      variant,
      variantId,
    };

    // Bir xil pozitsiya ikki marta yozilgan bo'lsa — birinchisini olamiz.
    const key = cartItemKey(safe);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(safe);
  }

  return out;
}
