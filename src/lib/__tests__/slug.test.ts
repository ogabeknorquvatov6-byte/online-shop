import { describe, expect, it } from 'vitest';
import { slugify } from '../slug';

/*
 * Slug generatori — admin YANGI kategoriya/mahsulot nomidan manzil
 * yasaydi. Bazadagi mavjud slugʻlarga tegilmaydi: bu funksiya faqat
 * yozish paytida chaqiriladi.
 *
 * Belgilar kod nuqtasidan yasaladi, jonli belgi bilan emas — `search.test.ts`
 * dagi bilan bir xil sabab: ommaviy apostrof kodmodi ularni tenglashtirib,
 * testni jimgina maʼnosiz qilib qoʻyishi mumkin.
 */
const ch = (code: number) => String.fromCharCode(code);
const U0027 = ch(0x27); // '  tekis apostrof
const U2018 = ch(0x2018); // ‘  chap burma
const U2019 = ch(0x2019); // ’  oʻng burma
const U02BB = ch(0x02bb); // ʻ  oʻzbek oʻ/gʻ belgisi
const U02BC = ch(0x02bc); // ʼ  tutuq belgisi
const U0060 = ch(0x60); // `  backtick

describe('slugify', () => {
  it('apostrofni OʻCHIRADI, tirega aylantirmaydi', () => {
    // Aynan shu nuqson uchun tuzatildi: ilova matnlari ʻ (U+02BB) ga
    // oʻtgandan keyin generator uni tanimay, `qo-shimcha` yasardi.
    expect(slugify(`Qo${U02BB}shimcha`)).toBe('qoshimcha');
    expect(slugify(`Ta${U02BC}mir`)).toBe('tamir');
  });

  it('apostrofning BARCHA variantlari bir xil natija beradi', () => {
    // Bitta nom qaysi klaviaturada yozilganiga qarab turli slug olmasin.
    const slugs = new Set(
      [U0027, U2018, U2019, U02BB, U02BC, U0060].map((a) => slugify(`Qo${a}shimcha batareya`))
    );
    expect(slugs).toEqual(new Set(['qoshimcha-batareya']));
  });

  it('haqiqiy ajratuvchilar tire boʻladi', () => {
    expect(slugify('iPhone 15 Pro Max')).toBe('iphone-15-pro-max');
    expect(slugify('Telefon, planshet va soat')).toBe('telefon-planshet-va-soat');
  });

  it('chetdagi tirelarni qoldirmaydi', () => {
    expect(slugify('  — Noutbuklar —  ')).toBe('noutbuklar');
    expect(slugify('!!!')).toBe('');
  });

  it('registrdan qatʼi nazar bir xil', () => {
    expect(slugify(`QO${U02BB}SHIMCHA`)).toBe(slugify(`qo${U02BB}shimcha`));
  });

  it('oʻzbekcha nomlarda kutilgan natija', () => {
    expect(slugify(`G${U02BB}isht va mato`)).toBe('gisht-va-mato');
    expect(slugify(`Yangi yil sovg${U02BB}alari`)).toBe('yangi-yil-sovgalari');
  });
});
