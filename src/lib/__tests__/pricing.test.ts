import { describe, expect, it } from 'vitest';
import { discountPercent, formatPrice, formatPriceShort, hasSellablePrice } from '../types';
import { adaptProduct, type ProductRow } from '../adapters';
import { cartItemKey, maxQuantityFor, unitPrice, MAX_QTY_PER_ITEM } from '../cartUtils';
import { stockState } from '../productUtils';
import { quoteDelivery, isTashkent } from '../delivery';
import { normalizePhone } from '../phone';
import type { Product, Settings } from '../types';

/*
 * Pul bilan bog'liq har bir hisob-kitob shu yerda qulflanadi.
 *
 * Bu funksiyalar mijoz ekranida ko'rsatiladigan narxni belgilaydi. Ular
 * jimgina buzilsa (masalan chegirma foizi noto'g'ri yaxlitlansa), xato
 * hech qanday xato xabari bermaydi — shunchaki noto'g'ri narx ko'rsatiladi.
 */

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', name: 'Mahsulot', slug: 'mahsulot', description: null,
    price: 100_000, old_price: null, brand: null, category_id: null, sku: null,
    stock: 10, sales_count: 0, rating: 0, reviews_count: 0, is_new: false,
    status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('hasSellablePrice', () => {
  it('faqat musbat va chekli son sotuvga yaroqli', () => {
    expect(hasSellablePrice(1)).toBe(true);
    expect(hasSellablePrice(0)).toBe(false);
    expect(hasSellablePrice(-5)).toBe(false);
    expect(hasSellablePrice(null)).toBe(false);
    expect(hasSellablePrice(undefined)).toBe(false);
    expect(hasSellablePrice(Number.NaN)).toBe(false);
    expect(hasSellablePrice(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('formatPrice', () => {
  it('so‘m bilan formatlaydi', () => {
    expect(formatPrice(1_250_000)).toContain('so‘m');
    expect(formatPrice(1_250_000).replace(/\s/g, ' ')).toMatch(/1 250 000/);
  });

  it('narxi yo‘q mahsulotni "bepul" deb ko‘rsatmaydi', () => {
    // "0 so'm" mijozni chalg'itadi — u mahsulotni bepul deb tushunadi.
    expect(formatPrice(0)).toBe('Narxi kelishiladi');
    expect(formatPrice(-100)).toBe('Narxi kelishiladi');
  });

  it('noma’lum qiymatda bo‘sh satr qaytaradi', () => {
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
    expect(formatPrice(Number.NaN)).toBe('');
  });

  it('tiyinlarni yaxlitlaydi', () => {
    expect(formatPriceShort(99_999.6).replace(/\s/g, ' ')).toBe('100 000');
  });
});

describe('discountPercent', () => {
  it('oddiy chegirmani hisoblaydi', () => {
    expect(discountPercent(80_000, 100_000)).toBe(20);
    expect(discountPercent(75_000, 100_000)).toBe(25);
  });

  it('eski narx katta bo‘lmasa chegirma yo‘q', () => {
    expect(discountPercent(100_000, 100_000)).toBeNull();
    expect(discountPercent(120_000, 100_000)).toBeNull();
    expect(discountPercent(100_000, null)).toBeNull();
  });

  it('bazadagi buzuq qiymatda nishoncha chiqarmaydi', () => {
    // Narxi 0 bo'lgan mahsulot ilgari kartada "−100%" degan ishonchsiz
    // nishoncha chiqarardi.
    expect(discountPercent(0, 100_000)).toBeNull();
    expect(discountPercent(-10, 100_000)).toBeNull();
  });

  it('foizni 1..99 oralig‘iga cheklaydi', () => {
    expect(discountPercent(1, 1_000_000)).toBe(99);
    // 0.4% — yaxlitlanganda 0 bo'ladi, ya'ni "chegirma bor" deyish yolg'on.
    expect(discountPercent(99_600, 100_000)).toBeNull();
  });
});

/* ── Mahsulot moslashuvi: qaysi narx g'olib bo'ladi ──────────────────── */

function makeRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1', name: 'Mahsulot', slug: 'mahsulot', description: '',
    price: 100_000, discount_price: null, brand: 'Brend', category_id: null,
    sku: 'SKU', stock: 10, sales_count: 0, rating: 0, reviews_count: 0,
    is_active: true, created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('adaptProduct — narx tanlash', () => {
  it('chegirmasiz mahsulotda eski narx bo‘lmaydi', () => {
    const p = adaptProduct(makeRow());
    expect(p.price).toBe(100_000);
    expect(p.old_price).toBeNull();
  });

  it('discount_price ni qo‘llaydi', () => {
    const p = adaptProduct(makeRow({ discount_price: 80_000 }));
    expect(p.price).toBe(80_000);
    expect(p.old_price).toBe(100_000);
  });

  it('aksiya foizini qo‘llaydi', () => {
    const p = adaptProduct(makeRow(), 30);
    expect(p.price).toBe(70_000);
    expect(p.old_price).toBe(100_000);
  });

  it('ikkita chegirma bo‘lsa mijoz uchun ARZONROG‘I tanlanadi', () => {
    // 20% aksiya = 80 000, qat'iy chegirma narxi = 75 000 → 75 000.
    const cheaperFixed = adaptProduct(makeRow({ discount_price: 75_000 }), 20);
    expect(cheaperFixed.price).toBe(75_000);

    // 40% aksiya = 60 000, qat'iy chegirma narxi = 75 000 → 60 000.
    const cheaperPromo = adaptProduct(makeRow({ discount_price: 75_000 }), 40);
    expect(cheaperPromo.price).toBe(60_000);
  });

  it('bo‘sh yoki manfiy discount_price e’tiborga olinmaydi', () => {
    expect(adaptProduct(makeRow({ discount_price: 0 })).price).toBe(100_000);
    expect(adaptProduct(makeRow({ discount_price: -5 })).price).toBe(100_000);
  });

  it('asosiy rasm har doim birinchi bo‘ladi', () => {
    // Katalog kartochkasi, savat va buyurtma tarixi ro'yxatning [0]
    // elementini oladi — tartib buzilsa mijoz boshqa rasmni ko'radi.
    const p = adaptProduct(
      makeRow({
        product_images: [
          { id: 'b', product_id: 'p1', image_url: '/b.jpg', sort_order: 0, is_primary: false },
          { id: 'a', product_id: 'p1', image_url: '/a.jpg', sort_order: 5, is_primary: true },
        ],
      })
    );
    expect(p.product_images?.[0].image_url).toBe('/a.jpg');
  });

  it('is_primary yo‘q bo‘lsa sort_order bo‘yicha tartiblanadi', () => {
    const p = adaptProduct(
      makeRow({
        product_images: [
          { id: 'b', product_id: 'p1', image_url: '/b.jpg', sort_order: 2 },
          { id: 'a', product_id: 'p1', image_url: '/a.jpg', sort_order: 1 },
        ],
      })
    );
    expect(p.product_images?.map((i) => i.image_url)).toEqual(['/a.jpg', '/b.jpg']);
  });
});

/* ── Savat ──────────────────────────────────────────────────────────── */

describe('cartItemKey', () => {
  it('bir xil mahsulotning turli variantlari alohida pozitsiya', () => {
    const product = makeProduct();
    expect(cartItemKey({ product, variantId: 'v1' })).not.toBe(cartItemKey({ product, variantId: 'v2' }));
  });

  it('variant ID matnli nomdan ustun', () => {
    // Admin variant nomini o'zgartirsa savatdagi pozitsiya "adashib"
    // ketmasligi kerak.
    const product = makeProduct();
    expect(cartItemKey({ product, variant: 'Qora', variantId: 'v1' })).toBe(
      cartItemKey({ product, variant: 'Qop-qora', variantId: 'v1' })
    );
  });

  it('variantsiz mahsulot barqaror kalitga ega', () => {
    const product = makeProduct();
    expect(cartItemKey({ product })).toBe(cartItemKey({ product }));
  });
});

describe('maxQuantityFor', () => {
  it('mahsulot qoldig‘i bilan cheklaydi', () => {
    expect(maxQuantityFor(makeProduct({ stock: 3 }))).toBe(3);
  });

  it('server chegarasidan oshmaydi', () => {
    // `create_order` serverda 50 dona chegarasini qo'yadi — UI undan
    // oshiq miqdorni taklif qilsa, buyurtma serverda rad etilardi.
    expect(maxQuantityFor(makeProduct({ stock: 9999 }))).toBe(MAX_QTY_PER_ITEM);
  });

  it('variantning o‘z ombori ustun', () => {
    const product = makeProduct({
      stock: 100,
      product_variants: [
        { id: 'v1', product_id: 'p1', type: 'color', value: 'Qora', sort_order: 0, stock: 2 },
      ],
    });
    expect(maxQuantityFor(product, 'v1')).toBe(2);
  });

  it('variant ombori NULL bo‘lsa mahsulot qoldig‘i olinadi', () => {
    const product = makeProduct({
      stock: 7,
      product_variants: [
        { id: 'v1', product_id: 'p1', type: 'color', value: 'Qora', sort_order: 0, stock: null },
      ],
    });
    expect(maxQuantityFor(product, 'v1')).toBe(7);
  });

  it('tugagan mahsulotda ham kamida 1 qaytaradi', () => {
    // Miqdor tanlagich 0 dan 0 gacha bo'lgan oraliqqa tushib qolmasligi
    // kerak — "tugagan" holati alohida ko'rsatiladi.
    expect(maxQuantityFor(makeProduct({ stock: 0 }))).toBe(1);
  });
});

describe('unitPrice', () => {
  it('variant narx farqini qo‘shadi', () => {
    const product = makeProduct({
      price: 100_000,
      product_variants: [
        { id: 'v1', product_id: 'p1', type: 'storage', value: '512GB', sort_order: 0, price_adjustment: 50_000 },
      ],
    });
    expect(unitPrice({ product, variantId: 'v1' })).toBe(150_000);
  });

  it('manfiy farq narxni nolgacha tushiradi, undan pastga emas', () => {
    const product = makeProduct({
      price: 10_000,
      product_variants: [
        { id: 'v1', product_id: 'p1', type: 'x', value: 'y', sort_order: 0, price_adjustment: -50_000 },
      ],
    });
    expect(unitPrice({ product, variantId: 'v1' })).toBe(0);
  });

  it('noma’lum variant ID narxni o‘zgartirmaydi', () => {
    expect(unitPrice({ product: makeProduct(), variantId: 'yoq' })).toBe(100_000);
  });
});

describe('stockState', () => {
  it('chegaralar barcha ekranlarda bir xil', () => {
    expect(stockState(0)).toBe('out');
    expect(stockState(-3)).toBe('out');
    expect(stockState(1)).toBe('low');
    expect(stockState(5)).toBe('low');
    expect(stockState(6)).toBe('in');
  });
});

/* ── Yetkazib berish ─────────────────────────────────────────────────── */

const settings: Settings = {
  id: 1, store_name: 'OpenShop', logo_url: null, phone: null, email: null, address: null,
  delivery_fee_tashkent: 25_000, delivery_fee_republic: 45_000, free_delivery_threshold: 1_000_000,
  instagram_url: null, telegram_url: null, facebook_url: null, youtube_url: null,
  updated_at: '2026-01-01T00:00:00Z',
};

describe('isTashkent', () => {
  it('ikkala yozilishni ham taniydi', () => {
    expect(isTashkent('Toshkent')).toBe(true);
    expect(isTashkent('toshkent shahri')).toBe(true);
    expect(isTashkent('Tashkent')).toBe(true);
    expect(isTashkent('Samarqand')).toBe(false);
    expect(isTashkent(null)).toBe(false);
  });
});

describe('quoteDelivery', () => {
  it('shaharga qarab tarif tanlaydi', () => {
    expect(quoteDelivery(settings, 100_000, 'Toshkent').fee).toBe(25_000);
    expect(quoteDelivery(settings, 100_000, 'Samarqand').fee).toBe(45_000);
  });

  it('chegaradan oshsa bepul bo‘ladi', () => {
    const quote = quoteDelivery(settings, 1_000_000, 'Samarqand');
    expect(quote.isFree).toBe(true);
    expect(quote.fee).toBe(0);
    expect(quote.remainingForFree).toBe(0);
  });

  it('bepulgacha qolgan summani to‘g‘ri hisoblaydi', () => {
    expect(quoteDelivery(settings, 600_000, 'Toshkent').remainingForFree).toBe(400_000);
  });

  it('chegara 0 bo‘lsa bepul yetkazish aksiyasi yo‘q', () => {
    const noFree = { ...settings, free_delivery_threshold: 0 };
    const quote = quoteDelivery(noFree, 10_000_000, 'Toshkent');
    expect(quote.isFree).toBe(false);
    expect(quote.fee).toBe(25_000);
    expect(quote.remainingForFree).toBe(0);
  });

  it('sozlamalar yuklanmagan bo‘lsa zaxira tarif ishlatiladi', () => {
    // Checkout sozlamalar kelishini kutmaydi — narx doim ko'rsatilishi kerak.
    const quote = quoteDelivery(null, 0, 'Toshkent');
    expect(quote.fee).toBe(30_000);
    expect(quote.freeThreshold).toBe(500_000);
  });

  it('shahar ko‘rsatilmasa Toshkent tarifi olinadi', () => {
    expect(quoteDelivery(settings, 0).fee).toBe(25_000);
  });
});

describe('normalizePhone', () => {
  it('formatlash belgilarini olib tashlaydi', () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('998901234567');
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
    expect(normalizePhone('')).toBe('');
  });
});
