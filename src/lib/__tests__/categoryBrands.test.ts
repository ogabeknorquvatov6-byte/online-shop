import { describe, it, expect } from 'vitest';
import { countBrands } from '../categoryBrands';

/*
 * Katalog navigatsiyasining oxirgi bosqichi brendlarni SON bilan
 * ko'rsatadi («Apple 3»). Bu son foydalanuvchiga va'da: bosgandan keyin
 * shuncha mahsulot chiqishi kerak.
 *
 * Shuning uchun hisoblash aynan shu yerda — so'rovdan ajratilgan, sof
 * funksiyada — sinaladi. Xato son "yo'q mahsulot" ni ko'rsatib qo'yadi
 * va bu o'ylab topilgan ma'lumotdan farq qilmaydi.
 */

describe('countBrands', () => {
  it("bo'sh ro'yxatdan bo'sh natija", () => {
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
   * ENG MUHIM HOLAT. `products.brand` — erkin matn, ya'ni bazada
   * "Apple" va "apple" yonma-yon turishi mumkin. Ular ikki alohida
   * brend bo'lib chiqsa, ro'yxat ikki marta "Apple" ko'rsatadi va har
   * biri sonni YARIM ko'rsatadi.
   */
  it('registr dublikatlarini bitta brendga birlashtiradi', () => {
    const out = countBrands(['Apple', 'apple', 'APPLE']);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });

  it("atrofdagi bo'shliq alohida brend yaratmaydi", () => {
    const out = countBrands(['  Apple  ', 'Apple']);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
  });

  it("bo'sh va faqat bo'shliqdan iborat qiymatlar tashlab yuboriladi", () => {
    expect(countBrands(['', '   ', 'JBL'])).toEqual([{ name: 'JBL', count: 1 }]);
  });

  /* Ko'p mahsulotli brend yuqorida — foydalanuvchi izlaydigan narsa. */
  it('son bo‘yicha kamayish tartibida saralaydi', () => {
    const out = countBrands(['Honor', 'Apple', 'Apple', 'Apple', 'Xiaomi', 'Xiaomi']);
    expect(out.map((b) => b.name)).toEqual(['Apple', 'Xiaomi', 'Honor']);
  });

  it('son teng bo‘lsa alifbo tartibi qo‘llanadi', () => {
    const out = countBrands(['Xiaomi', 'Apple', 'Honor']);
    expect(out.map((b) => b.name)).toEqual(['Apple', 'Honor', 'Xiaomi']);
  });

  /*
   * Sonlar yig'indisi kiruvchi ro'yxat uzunligiga TENG bo'lishi kerak:
   * ya'ni birorta mahsulot yo'qolmaydi va ikki marta hisoblanmaydi.
   */
  it('sonlar yig‘indisi mahsulotlar sonini saqlaydi', () => {
    const raw = ['Apple', 'apple', 'Xiaomi', 'Honor', 'honor', 'Honor'];
    const out = countBrands(raw);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(raw.length);
  });
});
