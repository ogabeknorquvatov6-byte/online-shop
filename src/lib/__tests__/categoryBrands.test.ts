import { describe, it, expect } from 'vitest';
import { countBrands } from '../categoryBrands';

/*
 * Katalog navigatsiyasining oxirgi bosqichi brendlarni SON bilan
 * koʻrsatadi («Apple 3»). Bu son foydalanuvchiga vaʼda: bosgandan keyin
 * shuncha mahsulot chiqishi kerak.
 *
 * Shuning uchun hisoblash aynan shu yerda — soʻrovdan ajratilgan, sof
 * funksiyada — sinaladi. Xato son "yoʻq mahsulot" ni koʻrsatib qoʻyadi
 * va bu oʻylab topilgan maʼlumotdan farq qilmaydi.
 */

describe('countBrands', () => {
  it("boʻsh roʻyxatdan boʻsh natija", () => {
    expect(countBrands([])).toEqual([]);
  });

  it('har bir brend uchun haqiqiy sonni qaytaradi', () => {
    const out = countBrands(['Apple', 'Apple', 'Xiaomi']);
    expect(out).toEqual([
      { name: 'Apple', count: 2 },
      { name: 'Xiaomi', count: 1 },
    ]);
  });

  /*
   * ENG MUHIM HOLAT. `products.brand` — erkin matn, yaʼni bazada
   * "Apple" va "apple" yonma-yon turishi mumkin. Ular ikki alohida
   * brend boʻlib chiqsa, roʻyxat ikki marta "Apple" koʻrsatadi va har
   * biri sonni YARIM koʻrsatadi.
   */
  it('registr dublikatlarini bitta brendga birlashtiradi', () => {
    const out = countBrands(['Apple', 'apple', 'APPLE']);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });

  it("atrofdagi boʻshliq alohida brend yaratmaydi", () => {
    const out = countBrands(['  Apple  ', 'Apple']);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
  });

  it("boʻsh va faqat boʻshliqdan iborat qiymatlar tashlab yuboriladi", () => {
    expect(countBrands(['', '   ', 'JBL'])).toEqual([{ name: 'JBL', count: 1 }]);
  });

  /* Koʻp mahsulotli brend yuqorida — foydalanuvchi izlaydigan narsa. */
  it('son boʻyicha kamayish tartibida saralaydi', () => {
    const out = countBrands(['Honor', 'Apple', 'Apple', 'Apple', 'Xiaomi', 'Xiaomi']);
    expect(out.map((b) => b.name)).toEqual(['Apple', 'Xiaomi', 'Honor']);
  });

  it('son teng boʻlsa alifbo tartibi qoʻllanadi', () => {
    const out = countBrands(['Xiaomi', 'Apple', 'Honor']);
    expect(out.map((b) => b.name)).toEqual(['Apple', 'Honor', 'Xiaomi']);
  });

  /*
   * Sonlar yigʻindisi kiruvchi roʻyxat uzunligiga TENG boʻlishi kerak:
   * yaʼni birorta mahsulot yoʻqolmaydi va ikki marta hisoblanmaydi.
   */
  it('sonlar yigʻindisi mahsulotlar sonini saqlaydi', () => {
    const raw = ['Apple', 'apple', 'Xiaomi', 'Honor', 'honor', 'Honor'];
    const out = countBrands(raw);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(raw.length);
  });
});
