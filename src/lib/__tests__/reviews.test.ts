import { describe, expect, it } from 'vitest';
import { socialProof, summarizeReviews } from '../productUtils';
import { formatCount } from '../types';
import type { ProductReview } from '../types';

/*
 * Sharhlar va ijtimoiy isbotning QOIDALARI shu yerda qulflanadi.
 *
 * Ikkalasi ham jimgina buziladigan turdagi mantiq: ostona noto'g'ri
 * bo'lsa yoki o'rtacha boshqacha yaxlitlansa, hech qanday xato
 * chiqmaydi — mijoz shunchaki noto'g'ri raqamni ko'radi va unga
 * ishonadi.
 */

function makeReview(rating: number, overrides: Partial<ProductReview> = {}): ProductReview {
  return {
    id: 'r1',
    product_id: 'p1',
    user_id: 'u1',
    rating,
    body: 'Yetarlicha uzun sharh matni.',
    author_name: '',
    verified_purchase: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('socialProof', () => {
  it('10 tadan kam sotuvda HECH NARSA koʻrsatmaydi', () => {
    // "3 marta sotib olingan" ijtimoiy isbot bermaydi — u aksincha,
    // mahsulot sotilmayotganini e'lon qiladi.
    expect(socialProof(0)).toBeNull();
    expect(socialProof(1)).toBeNull();
    expect(socialProof(9)).toBeNull();
  });

  it('aynan 10 tadan boshlab koʻrsatiladi', () => {
    expect(socialProof(10)).toBe('10 marta sotib olingan');
  });

  it('katta sonda ming ajratuvchi qoʻyiladi', () => {
    // Ajratuvchi belgisi muhitga bog'liq (NBSP), shuning uchun uni
    // qat'iy yozmasdan `formatCount` bilan solishtiramiz.
    expect(socialProof(1234)).toBe(`${formatCount(1234)} marta sotib olingan`);
    expect(formatCount(1234).replace(/\s/g, ' ')).toBe('1 234');
  });

  it('yaroqsiz qiymatlarda yiqilmaydi', () => {
    expect(socialProof(null)).toBeNull();
    expect(socialProof(undefined)).toBeNull();
    expect(socialProof(Number.NaN)).toBeNull();
    expect(socialProof(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('summarizeReviews', () => {
  it('sharh yoʻq boʻlsa nol qaytaradi', () => {
    expect(summarizeReviews([])).toEqual({ rating: 0, count: 0 });
  });

  it('oʻrtachani BIR kasr xonagacha yaxlitlaydi', () => {
    /*
     * `products.rating` ustuni `numeric(2,1)` — bazadagi trigger ham
     * aynan shunday yaxlitlaydi. Agar bu yerda boshqacha yaxlitlansa,
     * sharh yuborilgan lahzada ekrandagi raqam sakrab, keyin sahifa
     * yangilanganda yana o'zgarardi.
     */
    // 5 + 4 + 4 = 13 / 3 = 4.333… → 4.3
    expect(summarizeReviews([makeReview(5), makeReview(4), makeReview(4)])).toEqual({ rating: 4.3, count: 3 });
    // 5 + 4 = 9 / 2 = 4.5 — aniq qiymat, yaxlitlash o'zgartirmaydi
    expect(summarizeReviews([makeReview(5), makeReview(4)])).toEqual({ rating: 4.5, count: 2 });
    // 2 + 3 + 3 = 8 / 3 = 2.666… → 2.7 (yuqoriga)
    expect(summarizeReviews([makeReview(2), makeReview(3), makeReview(3)])).toEqual({ rating: 2.7, count: 3 });
  });

  it('bitta sharhda oʻsha bahoning oʻzi chiqadi', () => {
    expect(summarizeReviews([makeReview(1)])).toEqual({ rating: 1, count: 1 });
    expect(summarizeReviews([makeReview(5)])).toEqual({ rating: 5, count: 1 });
  });

  it('sanoq koʻrinayotgan sharhlar soniga teng', () => {
    const list = [makeReview(5), makeReview(5), makeReview(5), makeReview(5)];
    expect(summarizeReviews(list).count).toBe(list.length);
  });
});
