import type { CartItem, Product } from './types';

/*
 * Savat bilan bogʻliq sof funksiyalar (Reactʼga bogʻliq emas).
 * Provider `cart.tsx` da qoladi, hisob-kitob esa shu yerda — shunda
 * ularni komponentsiz ham (masalan testda) ishlatish mumkin.
 */

/** `create_order` serverda har bir pozitsiya uchun 50 dona chegarasini qoʻyadi. */
export const MAX_QTY_PER_ITEM = 50;

/**
 * Savat pozitsiyasining yagona kaliti.
 *
 * Ilgari pozitsiyalar `(productId, variant-matni)` juftligi boʻyicha
 * farqlanardi. Endi variantning IDʼsi ham bor va aynan u ustunlik qiladi:
 * admin variant nomini oʻzgartirsa ham savatdagi pozitsiya "adashib"
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
 * Variantda alohida ombor yuritilsa (stock != null) — oʻsha qoldiq,
 * aks holda mahsulotning umumiy qoldigʻi.
 */
export function maxQuantityFor(product: Product, variantId?: string): number {
  const variant = findVariant(product, variantId);
  const available = variant?.stock != null ? variant.stock : product.stock || 0;
  return Math.max(1, Math.min(MAX_QTY_PER_ITEM, available));
}

/**
 * Pozitsiyaning dona narxi: mahsulot narxi + variantning narx farqi.
 * Bu FAQAT koʻrsatish uchun — yakuniy summa har doim serverda
 * (`create_order`) qayta hisoblanadi.
 */
export function unitPrice(item: Pick<CartItem, 'product' | 'variantId'>): number {
  const variant = findVariant(item.product, item.variantId);
  return Math.max(0, item.product.price + (variant?.price_adjustment ?? 0));
}

/*
 * ── Saqlangan savatni tozalash ──────────────────────────────────────
 *
 * `localStorage` — ISHONCHSIZ MANBA. Uning ichidagi maʼlumotni:
 *   — foydalanuvchi DevToolsʼda qoʻlda tahrirlashi mumkin;
 *   — ilovaning eski versiyasi boshqa shaklda yozgan boʻlishi mumkin;
 *   — brauzer kengaytmasi buzgan boʻlishi mumkin;
 *   — yozish yarim yoʻlda uzilib qolgan boʻlishi mumkin.
 *
 * Ilgari tekshiruv `Number.isFinite(i.quantity)` bilan cheklangan edi.
 * Bu `-5`, `0`, `1.5` va `1e9` ni ham OʻTKAZIB YUBORARDI, `product.price`
 * esa umuman tekshirilmasdi. Natijada savatda manfiy summa yoki
 * "NaN soʻm" koʻrinishi mumkin edi — server bunday buyurtmani rad
 * etadi, lekin foydalanuvchi shu paytgacha buzilgan interfeys bilan
 * ishlab, doʻkonga ishonchini yoʻqotgan boʻlardi.
 *
 * Alohida SOF funksiya sifatida ajratilgan — Reactʼsiz test qilinadi.
 */

/** Savatda saqlanishi mumkin boʻlgan maksimal pozitsiya soni. */
export const MAX_CART_LINES = 50;

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Xom (JSON.parse qilingan) qiymatdan faqat ishonchli pozitsiyalarni
 * qaytaradi. Yaroqsizlari JIM ravishda tashlanadi — savatni butunlay
 * boʻshatib yuborgandan koʻra, buzuq qatorni olib tashlash yaxshiroq.
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
    // Narx son boʻlishi SHART: aks holda oraliq summa `NaN` boʻlib,
    // butun savat "NaN soʻm" koʻrsatardi.
    if (!isNonNegativeNumber(product.price)) continue;

    // Miqdor: BUTUN, musbat va chegara ichida.
    const qty = item.quantity;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue;

    const variant = typeof item.variant === 'string' ? item.variant : undefined;
    const variantId = typeof item.variantId === 'string' ? item.variantId : undefined;

    const safe: CartItem = {
      product: {
        ...product,
        // Qoldiq va massivlar ham buzilgan boʻlishi mumkin.
        stock: isNonNegativeNumber(product.stock) ? product.stock : 0,
        product_variants: Array.isArray(product.product_variants) ? product.product_variants : [],
        product_images: Array.isArray(product.product_images) ? product.product_images : [],
      } as CartItem['product'],
      quantity: Math.min(qty, MAX_QTY_PER_ITEM),
      variant,
      variantId,
    };

    // Bir xil pozitsiya ikki marta yozilgan boʻlsa — birinchisini olamiz.
    const key = cartItemKey(safe);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(safe);
  }

  return out;
}
