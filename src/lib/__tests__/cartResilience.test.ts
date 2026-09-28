import { describe, expect, it } from 'vitest';
import { sanitizeStoredCart, cartItemKey, MAX_CART_LINES, MAX_QTY_PER_ITEM } from '../cartUtils';
import { cartSignature, newCheckoutRequestId } from '../idempotency';
import type { CartItem, Product } from '../types';

/*
 * Savat `localStorage` dan o'qiladi — ya'ni ISHONCHSIZ manbadan.
 * Bu yerdagi har bir holat haqiqatda uchraydi: eski versiya yozgan
 * boshqa shakl, DevTools'da qo'lda tahrirlash, yarim yozilgan JSON.
 */

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', name: 'Mahsulot', slug: 'm', description: null, price: 100_000,
  old_price: null, brand: null, category_id: null, sku: null, stock: 10,
  sales_count: 0, rating: 0, reviews_count: 0, is_new: false, status: 'active',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const line = (over: Partial<CartItem> = {}): CartItem => ({ product: product(), quantity: 1, ...over });

describe('sanitizeStoredCart — shakl', () => {
  it('massiv bo‘lmagan qiymatda bo‘sh savat', () => {
    expect(sanitizeStoredCart(null)).toEqual([]);
    expect(sanitizeStoredCart(undefined)).toEqual([]);
    expect(sanitizeStoredCart('[]')).toEqual([]);
    expect(sanitizeStoredCart({ items: [] })).toEqual([]);
    expect(sanitizeStoredCart(42)).toEqual([]);
  });

  it('to‘g‘ri pozitsiyani saqlaydi', () => {
    const result = sanitizeStoredCart([line()]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1);
    expect(result[0].product.id).toBe('p1');
  });

  it('null/primitiv yozuvlarni tashlaydi', () => {
    expect(sanitizeStoredCart([null, 'x', 5, [], line()])).toHaveLength(1);
  });

  it('mahsulotsiz yoki id‘siz yozuvni tashlaydi', () => {
    expect(sanitizeStoredCart([{ quantity: 1 }])).toEqual([]);
    expect(sanitizeStoredCart([{ product: {}, quantity: 1 }])).toEqual([]);
    expect(sanitizeStoredCart([{ product: { id: '' }, quantity: 1 }])).toEqual([]);
  });
});

describe('sanitizeStoredCart — miqdor', () => {
  it('manfiy va nol miqdorni tashlaydi', () => {
    // Ilgari `Number.isFinite` tekshiruvi bularni O'TKAZIB YUBORARDI va
    // savat manfiy summa ko'rsatardi.
    expect(sanitizeStoredCart([line({ quantity: -5 })])).toEqual([]);
    expect(sanitizeStoredCart([line({ quantity: 0 })])).toEqual([]);
  });

  it('kasr miqdorni tashlaydi', () => {
    expect(sanitizeStoredCart([line({ quantity: 1.5 })])).toEqual([]);
  });

  it('NaN va Infinity ni tashlaydi', () => {
    expect(sanitizeStoredCart([line({ quantity: Number.NaN })])).toEqual([]);
    expect(sanitizeStoredCart([line({ quantity: Number.POSITIVE_INFINITY })])).toEqual([]);
  });

  it('haddan tashqari katta miqdorni server chegarasiga qisadi', () => {
    // Server `create_order` da 50 dona chegarasi bor — UI undan oshiq
    // miqdorni ko'rsatsa, buyurtma serverda rad etilardi.
    const result = sanitizeStoredCart([line({ quantity: 1_000_000 })]);
    expect(result[0].quantity).toBe(MAX_QTY_PER_ITEM);
  });

  it('miqdor son bo‘lmasa tashlaydi', () => {
    expect(sanitizeStoredCart([{ product: product(), quantity: '3' }])).toEqual([]);
  });
});

describe('sanitizeStoredCart — narx va qoldiq', () => {
  it('narx son bo‘lmasa pozitsiyani tashlaydi', () => {
    // Aks holda oraliq summa `NaN` bo'lib, savatda "NaN so'm" chiqardi.
    expect(sanitizeStoredCart([line({ product: product({ price: 'abc' as unknown as number }) })])).toEqual([]);
    expect(sanitizeStoredCart([line({ product: product({ price: Number.NaN }) })])).toEqual([]);
    expect(sanitizeStoredCart([line({ product: product({ price: -10 }) })])).toEqual([]);
  });

  it('buzuq qoldiqni 0 ga keltiradi (pozitsiyani o‘chirmaydi)', () => {
    const result = sanitizeStoredCart([line({ product: product({ stock: 'ko‘p' as unknown as number }) })]);
    expect(result).toHaveLength(1);
    expect(result[0].product.stock).toBe(0);
  });

  it('massiv bo‘lishi kerak bo‘lgan maydonlarni to‘g‘rilaydi', () => {
    const result = sanitizeStoredCart([
      line({ product: product({ product_variants: 'yo‘q' as unknown as [] }) }),
    ]);
    expect(Array.isArray(result[0].product.product_variants)).toBe(true);
  });
});

describe('sanitizeStoredCart — chegaralar', () => {
  it('savat hajmini cheklaydi', () => {
    // Buzuq yozuv minglab pozitsiya bo'lsa, ularning har biri uchun
    // render qilish brauzerni qotirib qo'yardi.
    const many = Array.from({ length: 500 }, (_, i) => line({ product: product({ id: `p${i}` }) }));
    expect(sanitizeStoredCart(many)).toHaveLength(MAX_CART_LINES);
  });

  it('takrorlangan pozitsiyani bir marta oladi', () => {
    const dup = [line({ variantId: 'v1' }), line({ variantId: 'v1' })];
    expect(sanitizeStoredCart(dup)).toHaveLength(1);
  });

  it('turli variantlar alohida pozitsiya bo‘lib qoladi', () => {
    const two = [line({ variantId: 'v1' }), line({ variantId: 'v2' })];
    expect(sanitizeStoredCart(two)).toHaveLength(2);
  });

  it('variant maydonlari satr bo‘lmasa e’tiborsiz qoldiriladi', () => {
    const result = sanitizeStoredCart([
      { product: product(), quantity: 1, variant: 123, variantId: {} },
    ]);
    expect(result[0].variant).toBeUndefined();
    expect(result[0].variantId).toBeUndefined();
  });
});

/* ── Checkout idempotentligi ─────────────────────────────────────── */

describe('newCheckoutRequestId', () => {
  it('to‘g‘ri shakldagi UUID v4 qaytaradi', () => {
    const id = newCheckoutRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('har safar boshqa qiymat beradi', () => {
    const ids = new Set(Array.from({ length: 200 }, newCheckoutRequestId));
    expect(ids.size).toBe(200);
  });
});

describe('cartSignature', () => {
  it('bir xil savat uchun bir xil imzo (tartibdan qat’i nazar)', () => {
    // Foydalanuvchi mahsulotni o'chirib qayta qo'shsa, tarkib o'sha
    // bo'lsa idempotentlik kaliti BEKORGA yangilanmasligi kerak.
    const a = [line({ product: product({ id: 'a' }) }), line({ product: product({ id: 'b' }) })];
    const b = [line({ product: product({ id: 'b' }) }), line({ product: product({ id: 'a' }) })];
    expect(cartSignature(a)).toBe(cartSignature(b));
  });

  it('miqdor o‘zgarsa imzo o‘zgaradi', () => {
    expect(cartSignature([line({ quantity: 1 })])).not.toBe(cartSignature([line({ quantity: 2 })]));
  });

  it('variant o‘zgarsa imzo o‘zgaradi', () => {
    expect(cartSignature([line({ variantId: 'v1' })])).not.toBe(cartSignature([line({ variantId: 'v2' })]));
  });

  it('bo‘sh savat barqaror imzo beradi', () => {
    expect(cartSignature([])).toBe('');
  });

  it('imzo savat kaliti bilan mos', () => {
    const items = [line({ variantId: 'v1' })];
    expect(cartSignature(items)).toContain(cartItemKey(items[0]));
  });
});
