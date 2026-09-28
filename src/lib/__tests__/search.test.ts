import { describe, expect, it } from 'vitest';
import {
  escapeLike, splitHighlight, buildFlatItems, itemHref, likePattern, normalizeApostrophes,
  type SearchProductRow,
} from '../search';

const product = (over: Partial<SearchProductRow> = {}): SearchProductRow => ({
  id: 'p1', name: 'iPhone 15', slug: 'iphone-15', price: 100, discount_price: null, image_url: null, ...over,
});

describe('escapeLike', () => {
  it('LIKE joker belgilarini zararsizlantiradi', () => {
    // `%` ekranlanmasa "50%" soʻrovi butun katalogga mos kelib, tasodifiy
    // natijalar chiqarardi. `_` esa istalgan bitta belgiga mos keladi.
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c\\d')).toBe('c\\\\d');
  });

  it('oddiy matnga tegmaydi', () => {
    expect(escapeLike('iPhone 15 Pro')).toBe('iPhone 15 Pro');
  });
});

/*
 * ── APOSTROF: MIJOZ QANDAY YOZSA HAM TOPSIN ─────────────────────────
 *
 * Bazadagi nom toʻgʻri belgi bilan yozilgan (U+02BB), lekin klaviaturada
 * u yoʻq — mijoz tekis apostrof (U+0027) bosadi. Bu testlar aynan shu
 * moslikni qulflaydi: ular buzilsa, doʻkonda mahsulot BOR, lekin uni
 * qidiruv orqali topib boʻlmaydi va bu hech qanday xato xabari bermaydi.
 *
 * Izohda ham belgilar nomi bilan atalgan, jonli belgi bilan emas —
 * yuqoridagi kodmod ularni ham tenglashtirib, izohni yolgʻon
 * qilib qoʻyardi.
 */
describe('apostrof normalizatsiyasi', () => {
  /*
   * Belgilar ATAYLAB kod nuqtasidan yasaladi, jonli belgi bilan
   * yozilmaydi.
   *
   * Sabab amaliy: shu bosqichda butun `src/` boʻylab apostroflarni
   * toʻgʻrilaydigan kodmod ishlatildi va u AVVAL shu roʻyxatni ham
   * "toʻgʻrilab" qoʻydi — oltita har xil variant bitta belgiga aylandi
   * va test jimgina maʼnosini yoʻqotdi (`size === 1` oʻz-oʻzidan
   * bajariladigan shartga aylandi).
   *
   * Manba fayl endi bu joyda toʻliq ASCII, yaʼni biror matn
   * almashtirgich (kodmod, "smart quotes", tahrirlovchi avtotuzatishi)
   * uni koʻrmaydi ham, buza olmaydi ham.
   */
  const ch = (code: number) => String.fromCharCode(code);
  const U0027 = ch(0x27); // '  tekis apostrof (klaviaturada shu tugma)
  const U2018 = ch(0x2018); // ‘  chap burma
  const U2019 = ch(0x2019); // ’  oʻng burma (Word avtomatik qoʻyadi)
  const U02BB = ch(0x02bb); // ʻ  oʻzbek oʻ/gʻ belgisi — TOʻGʻRI variant
  const U02BC = ch(0x02bc); // ʼ  tutuq belgisi
  const U0060 = ch(0x60); // `  backtick

  const ALL = [U0027, U2018, U2019, U02BB, U02BC, U0060];
  const word = (ch: string) => `qo${ch}shimcha`;

  it('barcha variantlarni bitta belgiga keltiradi', () => {
    const normalized = new Set(ALL.map((ch) => normalizeApostrophes(word(ch))));
    expect(normalized.size).toBe(1);
    // Roʻyxat haqiqatan har xil boʻlsin — yuqoridagi kodmod hodisasi
    // qaytalanmasligi uchun buni ham tekshiramiz.
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it('uzunlikni saqlaydi — ajratib koʻrsatish surilib ketmasligi uchun', () => {
    for (const ch of ALL) {
      expect(normalizeApostrophes(word(ch))).toHaveLength(word(ch).length);
    }
  });

  it('LIKE naqshida apostrof `_` jokeriga aylanadi', () => {
    // `_` = "aynan bitta istalgan belgi", yaʼni naqsh bazadagi HAR QANDAY
    // apostrof variantiga mos keladi. Solishtirish Postgresʼda boʻlgani
    // uchun boshqa yoʻl yoʻq: ustun qiymatini mijoz normallashtira olmaydi.
    for (const ch of ALL) {
      expect(likePattern(word(ch))).toBe('%qo_shimcha%');
    }
  });

  it('mijoz yozgan haqiqiy `_` joker boʻlib ketmaydi', () => {
    // Tartib tekshiruvi: avval `escapeLike`, keyin apostrof → `_`.
    // Teskari tartibda oʻz jokerimiz qochirilib, naqsh ishlamasdi.
    expect(likePattern(`a_b${U0027}c`)).toBe('%a\\_b_c%');
    expect(likePattern('50%')).toBe('%50\\%%');
  });

  it('bazada ʻ, soʻrovda tekis apostrof — ajratib koʻrsatish ishlaydi', () => {
    expect(splitHighlight(`Qo${U02BB}shimcha batareya`, `qo${U0027}shimcha`)).toEqual([
      { text: `Qo${U02BB}shimcha`, match: true },
      { text: ' batareya', match: false },
    ]);
  });

  it('teskari yoʻnalish ham: bazada tekis apostrof, soʻrovda ʻ', () => {
    expect(splitHighlight(`Qo${U0027}shimcha batareya`, `qo${U02BB}shimcha`)).toEqual([
      { text: `Qo${U0027}shimcha`, match: true },
      { text: ' batareya', match: false },
    ]);
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

  it('registrga bogʻliq emas, lekin ASL yozuvni saqlaydi', () => {
    // Ajratilgan boʻlak foydalanuvchi yozgani emas, MAHSULOT nomidagi
    // matn boʻlishi kerak — aks holda karta nomi buzilib koʻrinardi.
    const parts = splitHighlight('SAMSUNG Galaxy', 'samsung');
    expect(parts[0]).toEqual({ text: 'SAMSUNG', match: true });
  });

  it('boshida yoki oxirida mos kelganda boʻsh boʻlak qoʻshmaydi', () => {
    expect(splitHighlight('Pro', 'Pro')).toEqual([{ text: 'Pro', match: true }]);
  });

  it('mos kelmasa butun matnni qaytaradi', () => {
    expect(splitHighlight('iPhone', 'xyz')).toEqual([{ text: 'iPhone', match: false }]);
    expect(splitHighlight('iPhone', '   ')).toEqual([{ text: 'iPhone', match: false }]);
  });
});

describe('buildFlatItems', () => {
  it('klaviatura navigatsiyasi uchun yagona tartib beradi', () => {
    // Tartib UIʼdagi tartib bilan bir xil boʻlishi SHART: kategoriyalar →
    // brendlar → mahsulotlar. Aks holda ↓ tugmasi koʻrinmaydigan
    // elementga "sakrab" ketardi.
    const items = buildFlatItems(
      [{ id: 'c1', name: 'Telefonlar', slug: 'telefonlar' }],
      ['Apple'],
      [product()]
    );
    expect(items.map((i) => i.kind)).toEqual(['category', 'brand', 'product']);
  });

  it('boʻsh natijada boʻsh roʻyxat', () => {
    expect(buildFlatItems([], [], [])).toEqual([]);
  });
});

describe('itemHref', () => {
  it('har bir tur oʻz marshrutiga olib boradi', () => {
    expect(itemHref({ kind: 'category', data: { id: 'c', name: 'T', slug: 'telefonlar' } })).toBe('/category/telefonlar');
    expect(itemHref({ kind: 'product', data: product() })).toBe('/product/iphone-15');
  });

  it('brend nomini manzil uchun kodlaydi', () => {
    // Boʻshliq yoki `&` boʻlgan brend nomi kodlanmasa, soʻrov parametri
    // buzilib, filtr umuman qoʻllanmasdi.
    expect(itemHref({ kind: 'brand', data: 'Xiaomi & Co' })).toBe('/catalog?brand=Xiaomi%20%26%20Co');
  });
});
