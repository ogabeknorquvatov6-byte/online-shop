import { describe, it, expect } from 'vitest';
import {
  canonicalBrand,
  matchExistingBrand,
  normalizeBrandInput,
  suggestBrands,
  dedupeBrands,
  isNewBrand,
} from '../brands';

/*
 * Brend erkin matn ustuni (`products.brand`), shuning uchun registr
 * dublikatlari ("Apple" / "apple" / "APPLE") juda oson paydo boʻladi va
 * katalogdagi brend filtrida bitta brend bir necha marta koʻrinadi.
 *
 * Bu testlar aynan shu holatni qoʻriqlaydi — hamda MAVJUD maʼlumot
 * jimgina oʻzgartirilmasligini.
 */

const EXISTING = ['Apple', 'Samsung', 'Xiaomi', 'Honor', 'JBL', 'Dyson'];

describe('canonicalBrand', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(canonicalBrand('  ApPlE ')).toBe('apple');
    expect(canonicalBrand('APPLE')).toBe(canonicalBrand('apple'));
  });

  it('returns an empty key for blank input', () => {
    expect(canonicalBrand('   ')).toBe('');
  });
});

describe('matchExistingBrand', () => {
  it('matches regardless of case', () => {
    expect(matchExistingBrand('apple', EXISTING)).toBe('Apple');
    expect(matchExistingBrand('APPLE', EXISTING)).toBe('Apple');
    expect(matchExistingBrand('ApPlE', EXISTING)).toBe('Apple');
  });

  it('tolerates stray whitespace', () => {
    expect(matchExistingBrand('  samsung  ', EXISTING)).toBe('Samsung');
  });

  it('returns null for a genuinely new brand', () => {
    expect(matchExistingBrand('OnePlus', EXISTING)).toBeNull();
  });

  it('returns null for blank input', () => {
    expect(matchExistingBrand('   ', EXISTING)).toBeNull();
  });
});

describe('normalizeBrandInput', () => {
  /*
   * Asosiy maqsad: yangi mahsulot "apple" bilan saqlansa ham, bazada
   * allaqachon bor "Apple" yozilishi ishlatilsin — aks holda filtrda
   * ikkita alohida brend paydo boʻladi.
   */
  it('snaps a case variant onto the spelling already in the database', () => {
    expect(normalizeBrandInput('apple', EXISTING)).toBe('Apple');
    expect(normalizeBrandInput('SAMSUNG', EXISTING)).toBe('Samsung');
  });

  it('keeps a new brand exactly as the admin typed it', () => {
    // Yangi brendning yozilishini biz "toʻgʻrilamaymiz".
    expect(normalizeBrandInput('OnePlus', EXISTING)).toBe('OnePlus');
    expect(normalizeBrandInput('realme', EXISTING)).toBe('realme');
  });

  it('trims but does not otherwise rewrite', () => {
    expect(normalizeBrandInput('  OnePlus  ', EXISTING)).toBe('OnePlus');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeBrandInput('   ', EXISTING)).toBe('');
  });
});

describe('suggestBrands', () => {
  it('ranks prefix matches above substring matches', () => {
    const hits = suggestBrands('a', ['Samsung', 'Apple'], 6);
    expect(hits[0]).toBe('Apple'); // boshlanishi mos
  });

  it('is case-insensitive', () => {
    expect(suggestBrands('AP', EXISTING)).toContain('Apple');
    expect(suggestBrands('ap', EXISTING)).toContain('Apple');
  });

  it('returns the whole list when input is empty', () => {
    expect(suggestBrands('', EXISTING).length).toBeGreaterThan(0);
  });

  it('respects the limit', () => {
    expect(suggestBrands('', EXISTING, 2)).toHaveLength(2);
  });

  it('returns nothing for an unmatched query', () => {
    expect(suggestBrands('zzzz', EXISTING)).toEqual([]);
  });
});

describe('dedupeBrands', () => {
  it('collapses case variants into one entry', () => {
    const out = dedupeBrands(['Apple', 'apple', 'APPLE', 'Samsung']);
    expect(out).toHaveLength(2);
    expect(out).toContain('Samsung');
  });

  it('keeps the most frequently used spelling', () => {
    // "Apple" ikki marta, "apple" bir marta → "Apple" qoladi.
    expect(dedupeBrands(['apple', 'Apple', 'Apple'])).toEqual(['Apple']);
  });

  it('drops blank values', () => {
    expect(dedupeBrands(['Apple', '', '   '])).toEqual(['Apple']);
  });

  it('is stable and alphabetically sorted', () => {
    expect(dedupeBrands(['Xiaomi', 'Apple', 'JBL'])).toEqual(['Apple', 'JBL', 'Xiaomi']);
  });
});

describe('isNewBrand', () => {
  it('is false for an existing brand in any casing', () => {
    expect(isNewBrand('apple', EXISTING)).toBe(false);
    expect(isNewBrand('Apple', EXISTING)).toBe(false);
  });

  it('is true only for a genuinely unseen brand', () => {
    expect(isNewBrand('OnePlus', EXISTING)).toBe(true);
  });

  it('is false for blank input (nothing to add)', () => {
    expect(isNewBrand('  ', EXISTING)).toBe(false);
  });
});
