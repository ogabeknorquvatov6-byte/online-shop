import { describe, expect, it } from 'vitest';
import { ADMIN_PAGE_SIZE, pageCount, pageRange, pageSummary } from '../adminPagination';
import { sanitizeOrFilterTerm, escapeLike } from '../search';

describe('pageRange', () => {
  it('birinchi sahifa 0 dan boshlanadi', () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 });
  });

  it('keyingi sahifalar uzluksiz davom etadi', () => {
    // Oraliqlar orasida bo'shliq yoki ustma-ustlik bo'lsa, yozuvlar
    // sahifalar orasida yo'qolib yoki takrorlanib qolardi.
    expect(pageRange(2, 25)).toEqual({ from: 25, to: 49 });
    expect(pageRange(3, 25)).toEqual({ from: 50, to: 74 });
  });

  it('yaroqsiz sahifa raqamini 1 ga keltiradi', () => {
    // Manzildan yoki buzuq holatdan `0`/`-3`/`NaN` kelib qolsa,
    // `range(-75, -51)` Supabase'da xato beradi.
    expect(pageRange(0, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(-3, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(Number.NaN, 25)).toEqual({ from: 0, to: 24 });
  });

  it('kasr sahifani butunga keltiradi', () => {
    expect(pageRange(2.7, 25)).toEqual({ from: 25, to: 49 });
  });

  it('standart o‘lcham bilan ishlaydi', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: ADMIN_PAGE_SIZE - 1 });
  });
});

describe('pageCount', () => {
  it('to‘liq bo‘lmagan oxirgi sahifani hisobga oladi', () => {
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(137, 25)).toBe(6);
  });

  it('bo‘sh ro‘yxatda ham 1 sahifa', () => {
    // 0 qaytarsa "1 / 0" degan bema'ni matn chiqardi.
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(-5, 25)).toBe(1);
    expect(pageCount(Number.NaN, 25)).toBe(1);
  });
});

describe('pageSummary', () => {
  it('joriy oraliqni ko‘rsatadi', () => {
    expect(pageSummary(1, 137, 25, 25)).toBe('1–25 / 137');
    expect(pageSummary(2, 137, 25, 25)).toBe('26–50 / 137');
  });

  it('oxirgi to‘liq bo‘lmagan sahifada haqiqiy sonni ko‘rsatadi', () => {
    expect(pageSummary(6, 137, 12, 25)).toBe('126–137 / 137');
  });

  it('bo‘sh ro‘yxatda oraliq ko‘rsatmaydi', () => {
    expect(pageSummary(1, 0, 0, 25)).toBe('0');
  });
});

describe('sanitizeOrFilterTerm — PostgREST filtr in’yeksiyasi', () => {
  /*
   * `.or('name.ilike.%TERM%,sku.ilike.%TERM%')` da vergul shartlarni
   * AJRATADI, qavslar esa GURUHLAYDI. Foydalanuvchi kiritgan matnga
   * shu belgilar tushsa, filtr butunlay boshqa ma'no oladi.
   */
  it('vergulni olib tashlaydi', () => {
    expect(sanitizeOrFilterTerm('a,b')).not.toContain(',');
  });

  it('qavslarni olib tashlaydi', () => {
    const result = sanitizeOrFilterTerm('x(y)z');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
  });

  it('nuqtani olib tashlaydi', () => {
    // `ustun.operator.qiymat` uchligida nuqta ajratuvchi.
    expect(sanitizeOrFilterTerm('a.ilike.b')).not.toContain('.');
  });

  it('qo‘shtirnoqlarni olib tashlaydi', () => {
    expect(sanitizeOrFilterTerm(`a"b'c`)).not.toMatch(/["']/);
  });

  it('haqiqiy hujum satrini zararsizlantiradi', () => {
    // Maqsad: filtrdan chiqib, o'z shartini qo'shish.
    const attack = 'x,is_active.eq.false,name.ilike.%';
    const safe = sanitizeOrFilterTerm(attack);
    expect(safe).not.toContain(',');
    expect(safe).not.toContain('.');
  });

  it('LIKE joker belgilarini qochiradi', () => {
    // `%` qochirilmasa "50%" so'rovi butun jadvalga mos kelardi.
    expect(sanitizeOrFilterTerm('50%')).toBe(escapeLike('50%'));
    expect(sanitizeOrFilterTerm('a_b')).toContain('\\_');
  });

  it('oddiy qidiruvni buzmaydi', () => {
    expect(sanitizeOrFilterTerm('iPhone 15 Pro')).toBe('iPhone 15 Pro');
    expect(sanitizeOrFilterTerm('  Samsung  ')).toBe('Samsung');
  });

  it('faqat belgilardan iborat so‘rov bo‘sh bo‘ladi', () => {
    // Bo'sh natija — chaqiruvchi filtrni umuman qo'llamaydi.
    expect(sanitizeOrFilterTerm(',,,')).toBe('');
    expect(sanitizeOrFilterTerm('()')).toBe('');
  });
});
