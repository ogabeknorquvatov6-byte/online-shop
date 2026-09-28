import { describe, expect, it } from 'vitest';
import { escapeLike, splitHighlight, buildFlatItems, itemHref, type SearchProductRow } from '../search';

const product = (over: Partial<SearchProductRow> = {}): SearchProductRow => ({
  id: 'p1', name: 'iPhone 15', slug: 'iphone-15', price: 100, discount_price: null, image_url: null, ...over,
});

describe('escapeLike', () => {
  it('LIKE joker belgilarini zararsizlantiradi', () => {
    // `%` ekranlanmasa "50%" so'rovi butun katalogga mos kelib, tasodifiy
    // natijalar chiqarardi. `_` esa istalgan bitta belgiga mos keladi.
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c\\d')).toBe('c\\\\d');
  });

  it('oddiy matnga tegmaydi', () => {
    expect(escapeLike('iPhone 15 Pro')).toBe('iPhone 15 Pro');
  });
});

describe('splitHighlight', () => {
  it('mos kelgan qismni ajratadi', () => {
    expect(splitHighlight('iPhone 15 Pro', 'phone')).toEqual([
      { text: 'i', match: false },
      { text: 'Phone', match: true },
      { text: ' 15 Pro', match: false },
    ]);
  });

  it('registrga bog‘liq emas, lekin ASL yozuvni saqlaydi', () => {
    // Ajratilgan bo'lak foydalanuvchi yozgani emas, MAHSULOT nomidagi
    // matn bo'lishi kerak — aks holda karta nomi buzilib ko'rinardi.
    const parts = splitHighlight('SAMSUNG Galaxy', 'samsung');
    expect(parts[0]).toEqual({ text: 'SAMSUNG', match: true });
  });

  it('boshida yoki oxirida mos kelganda bo‘sh bo‘lak qo‘shmaydi', () => {
    expect(splitHighlight('Pro', 'Pro')).toEqual([{ text: 'Pro', match: true }]);
  });

  it('mos kelmasa butun matnni qaytaradi', () => {
    expect(splitHighlight('iPhone', 'xyz')).toEqual([{ text: 'iPhone', match: false }]);
    expect(splitHighlight('iPhone', '   ')).toEqual([{ text: 'iPhone', match: false }]);
  });
});

describe('buildFlatItems', () => {
  it('klaviatura navigatsiyasi uchun yagona tartib beradi', () => {
    // Tartib UI'dagi tartib bilan bir xil bo'lishi SHART: kategoriyalar →
    // brendlar → mahsulotlar. Aks holda ↓ tugmasi ko'rinmaydigan
    // elementga "sakrab" ketardi.
    const items = buildFlatItems(
      [{ id: 'c1', name: 'Telefonlar', slug: 'telefonlar' }],
      ['Apple'],
      [product()]
    );
    expect(items.map((i) => i.kind)).toEqual(['category', 'brand', 'product']);
  });

  it('bo‘sh natijada bo‘sh ro‘yxat', () => {
    expect(buildFlatItems([], [], [])).toEqual([]);
  });
});

describe('itemHref', () => {
  it('har bir tur o‘z marshrutiga olib boradi', () => {
    expect(itemHref({ kind: 'category', data: { id: 'c', name: 'T', slug: 'telefonlar' } })).toBe('/category/telefonlar');
    expect(itemHref({ kind: 'product', data: product() })).toBe('/product/iphone-15');
  });

  it('brend nomini manzil uchun kodlaydi', () => {
    // Bo'shliq yoki `&` bo'lgan brend nomi kodlanmasa, so'rov parametri
    // buzilib, filtr umuman qo'llanmasdi.
    expect(itemHref({ kind: 'brand', data: 'Xiaomi & Co' })).toBe('/catalog?brand=Xiaomi%20%26%20Co');
  });
});
