import { describe, it, expect } from 'vitest';
import { formatOrderDate } from '../types';

/*
 * Bu funksiya FAQAT bitta sabab uchun bor: brauzerda `uz-UZ` lokalida
 * oʻzbek oy nomlari YOʻQ.
 *
 * Oʻlchangan: `toLocaleDateString('uz-UZ', { month: 'long' })`
 * 2026-09-21 uchun «2026 M09 21» qaytaradi — yaʼni ICU "M09" degan
 * texnik belgiga tushib qoladi. Buyurtma kartalarida bu
 * «2026 M09 21 23:44» boʻlib chiqardi.
 *
 * Shuning uchun testlar aynan shu holatni qoʻriqlaydi: kimdir
 * "soddalashtiraman" deb `toLocaleDateString` ga qaytarsa, shu yerda
 * darhol yiqiladi.
 */

describe('formatOrderDate', () => {
  it('oʻzbekcha oy nomini yozadi, "M09" emas', () => {
    const out = formatOrderDate('2026-09-21T23:44:00');
    expect(out).toContain('sentabr');
    expect(out).not.toMatch(/M\d\d/);
  });

  it('kun, oy, yil va vaqtni toʻliq beradi', () => {
    expect(formatOrderDate('2026-09-21T23:44:00')).toBe('21-sentabr, 2026 · 23:44');
  });

  it('vaqtsiz variant', () => {
    expect(formatOrderDate('2026-01-05T08:03:00', false)).toBe('5-yanvar, 2026');
  });

  it('soat va daqiqa ikki xonali boʻladi', () => {
    // «8:3» emas, «08:03» — chek va kartochkada ustun boʻlib tekis turadi.
    expect(formatOrderDate('2026-01-05T08:03:00')).toBe('5-yanvar, 2026 · 08:03');
  });

  it('har bir oy uchun nom bor', () => {
    const names = Array.from({ length: 12 }, (_, m) =>
      formatOrderDate(new Date(2026, m, 15).toISOString(), false)
    );
    // Birortasi ham "undefined" yoki texnik belgi boʻlmasin.
    for (const n of names) {
      expect(n).not.toContain('undefined');
      expect(n).not.toMatch(/M\d\d/);
    }
    expect(new Set(names).size).toBe(12);
  });

  /*
   * Yaroqsiz sana EKRANGA CHIQMAYDI. `new Date('salom')` →
   * «Invalid Date» boʻlib chiqardi va u buyurtma kartochkasida
   * turgan boʻlardi.
   */
  it('yaroqsiz yoki boʻsh sanada boʻsh satr', () => {
    expect(formatOrderDate('salom')).toBe('');
    expect(formatOrderDate('')).toBe('');
    expect(formatOrderDate(null)).toBe('');
    expect(formatOrderDate(undefined)).toBe('');
  });
});
