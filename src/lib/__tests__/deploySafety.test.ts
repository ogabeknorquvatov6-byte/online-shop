import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cartSignature, isMissingFunctionError, newCheckoutRequestId } from '../idempotency';
import type { CartItem, Product } from '../types';

/*
 * DEPLOY XAVFSIZLIGI regressiya testi.
 *
 * Kelib chiqishi: `create_order` RPCʼsiga yangi `p_checkout_request_id`
 * argumenti qoʻshildi. Bunda oson qilinadigan, lekin QIMMAT xato bor —
 * frontend va bazani bir-biriga bogʻlab qoʻyish.
 *
 * PostgREST RPC chaqiruvini NOMLI argumentlar bilan quradi:
 *     create_order(p_customer_name => $1, …, p_checkout_request_id => $11)
 * Ortiqcha nomli argument JIM OʻTKAZIB YUBORILMAYDI — mos overload
 * topilmasa chaqiruv xato bilan tugaydi. Yaʼni:
 *
 *   yangi frontend + eski baza → buyurtma berish BUTUNLAY ishlamaydi
 *   eski frontend + yangi baza → xuddi shu (agar eski imzo oʻchirilsa)
 *
 * Quyidagi testlar shu ikki oynani ham yopiq ushlab turadi. Ular
 * HAQIQIY fayllarni oʻqiydi — mantiq nusxasini emas.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260909000000_order_integrity_hardening.sql'),
  'utf8'
);
const CHECKOUT = readFileSync(join(process.cwd(), 'src', 'lib', 'CheckoutPage.tsx'), 'utf8');

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

const SQL = stripSqlComments(MIGRATION);

describe('migratsiya: eski RPC imzolari saqlanadi', () => {
  it('eski `create_order` imzosi OʻCHIRILMAYDI', () => {
    /*
     * `drop function ... create_order(text, …, text)` eski, keshdagi
     * frontend uchun buyurtma berishni butunlay oʻchirib qoʻyardi.
     * Eskini olib tashlash — keyingi ("contract") migratsiyaning ishi.
     */
    expect(SQL).not.toMatch(/drop\s+function[^;]*create_order\s*\(/i);
    expect(SQL).not.toMatch(/drop\s+function[^;]*create_order_as\s*\(/i);
  });

  it('eski 10 argumentli `create_order` moslik qobigʻi sifatida qayta yaratiladi', () => {
    const shim = SQL.match(
      /create\s+or\s+replace\s+function\s+public\.create_order\s*\(([^)]*)\)/gi
    );
    expect(shim, 'create_order overloadlari topilmadi').toBeTruthy();
    // Kamida ikkita overload: eski (kalitsiz) va yangi (kalitli).
    expect(shim!.length).toBeGreaterThanOrEqual(2);

    const withKey = shim!.filter((s) => s.includes('p_checkout_request_id'));
    const withoutKey = shim!.filter((s) => !s.includes('p_checkout_request_id'));
    expect(withKey.length, 'kalitli overload yoʻq').toBeGreaterThanOrEqual(1);
    expect(withoutKey.length, 'kalitsiz (eski) overload yoʻq').toBeGreaterThanOrEqual(1);
  });
});

describe('migratsiya: overload noaniqligi boʻlmasligi kerak', () => {
  it('`p_checkout_request_id` DEFAULT qiymatsiz eʼlon qilinadi', () => {
    /*
     * Bu eng nozik joy. Agar parametr `uuid default null` boʻlsa, 10 ta
     * nomli argument bilan kelgan chaqiruv IKKALA overloadʼga ham mos
     * kelardi va Postgres `42725 function is not unique` xatosini
     * qaytarardi — yaʼni eski mijozlar uchun buyurtma berish ishlamay
     * qolardi. `default` boʻlmasa taqsimot aniq: 10 ta argument → eski
     * qobiq, 11 ta argument → yangi funksiya.
     */
    expect(SQL).not.toMatch(/p_checkout_request_id\s+uuid\s+default/i);
    expect(SQL).toMatch(/p_checkout_request_id\s+uuid\s*[\n,)]/i);
  });

  it('moslik qobiqlari NULL ni aniq turlashtiradi', () => {
    // Turlashtirilmagan `null` overload tanlashda noaniqlik keltirib
    // chiqarishi mumkin — `null::uuid` buni istisno qiladi.
    expect(SQL).toMatch(/null::uuid/);
  });
});

describe('migratsiya: PostgreSQL parametr tartibi qoidasi (42P13)', () => {
  /*
   * HAQIQIY NOSOZLIKDAN KELIB CHIQQAN TEST.
   *
   * Birinchi urinishda migratsiya PRODUKSIYAGA CHIQMASDAN OLDIN
   * quyidagi xato bilan yiqilgan edi:
   *
   *   ERROR: input parameters after one with a default value
   *          must also have defaults        (SQLSTATE 42P13)
   *
   * Sababi: `p_checkout_request_id uuid` (standart qiymatsiz) standart
   * qiymatli `p_payment_method`/`p_city`/… dan KEYIN turgan edi.
   *
   * Bu xatoni faqat haqiqiy Postgres ushlay oladi — bizda esa u yoʻq.
   * Shuning uchun qoidani matn darajasida tekshiramiz: bu arzon,
   * aniq va aynan shu sinfdagi xatoning qaytishiga yoʻl qoʻymaydi.
   */
  function paramLists(sql: string): { name: string; params: string[] }[] {
    const re = /create\s+or\s+replace\s+function\s+(public\.\w+)\s*\(([^)]*)\)/gi;
    const out: { name: string; params: string[] }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const params = m[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      out.push({ name: m[1], params });
    }
    return out;
  }

  it('standart qiymatli parametrdan keyin standart qiymatsiz parametr KELMAYDI', () => {
    const fns = paramLists(SQL);
    expect(fns.length, 'migratsiyada funksiya topilmadi').toBeGreaterThan(0);

    for (const fn of fns) {
      let seenDefault = false;
      for (const param of fn.params) {
        const hasDefault = /\bdefault\b/i.test(param);
        if (hasDefault) {
          seenDefault = true;
          continue;
        }
        expect(
          seenDefault,
          `${fn.name}: «${param}» standart qiymatli parametrdan keyin turibdi — Postgres buni 42P13 bilan rad etadi`
        ).toBe(false);
      }
    }
  });

  it('kalitli overloadlarda `p_checkout_request_id` `p_items` dan keyin turadi', () => {
    // Tartib tasodifiy emas: u oxirgi MAJBURIY parametr boʻlishi kerak —
    // standart qiymatlilardan oldin (42P13) va `default`siz (42725).
    const fns = paramLists(SQL).filter((f) =>
      f.params.some((p) => p.startsWith('p_checkout_request_id'))
    );
    expect(fns.length, 'kalitli overload topilmadi').toBeGreaterThanOrEqual(2);

    for (const fn of fns) {
      const itemsIdx = fn.params.findIndex((p) => p.startsWith('p_items'));
      const keyIdx = fn.params.findIndex((p) => p.startsWith('p_checkout_request_id'));
      expect(itemsIdx, `${fn.name}: p_items topilmadi`).toBeGreaterThanOrEqual(0);
      expect(keyIdx, `${fn.name}: kalit p_items dan keyin turishi kerak`).toBe(itemsIdx + 1);
    }
  });

  it('moslik qobiqlari yangi funksiyani NOMLI argumentlar bilan chaqiradi', () => {
    /*
     * Parametr tartibi oʻzgargani uchun POZITSIYALI chaqiruv endi
     * xavfli: 8-oʻringa `p_payment_method` ('Naqd pul' matni) tushib,
     * `uuid` parametriga urinib koʻrilardi. Nomli chaqiruv bu sinfdagi
     * xatoni butunlay yoʻq qiladi.
     */
    const calls = SQL.match(/return\s+public\.create_order_as\s*\(([\s\S]*?)\);/gi) ?? [];
    expect(calls.length, 'create_order_as chaqiruvlari topilmadi').toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call, 'chaqiruv nomli argumentlarsiz').toMatch(/p_checkout_request_id\s*=>/);
      expect(call).toMatch(/p_items\s*=>/);
    }
  });
});

describe('frontend: eski bazada ham buyurtma ishlaydi', () => {
  it('“funksiya topilmadi” xatosida kalitsiz qayta uriniladi', () => {
    expect(CHECKOUT).toMatch(/isMissingFunctionError/);
    expect(CHECKOUT).toMatch(/supportsIdempotencyKey/);
  });

  it('zaxira yoʻl kalitsiz argumentlar bilan chaqiradi', () => {
    // Qayta urinish AYNAN kalitsiz boʻlishi kerak, aks holda u ham
    // xuddi shu xato bilan tugaydi.
    expect(CHECKOUT).toMatch(/supabase\.rpc\('create_order',\s*baseArgs\)/);
  });
});

describe('isMissingFunctionError', () => {
  it('PostgREST va Postgres kodlarini taniydi', () => {
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
  });

  it('xabar matni boʻyicha ham taniydi', () => {
    expect(
      isMissingFunctionError({
        message: 'Could not find the function public.create_order(...) in the schema cache',
      })
    ).toBe(true);
    expect(isMissingFunctionError({ message: 'function public.create_order(...) does not exist' })).toBe(true);
  });

  it('ISH MANTIGʻI xatolarini zaxira yoʻlga chiqarmaydi', () => {
    /*
     * Eng muhim salbiy holat. `OUT_OF_STOCK` ni "funksiya yoʻq" deb
     * oʻqisak, ilova kalitsiz QAYTA yuborardi — yaʼni idempotentlikni
     * oʻzi buzib, dublikat buyurtma yaratish ehtimolini tugʻdirardi.
     */
    expect(isMissingFunctionError({ message: 'OUT_OF_STOCK' })).toBe(false);
    expect(isMissingFunctionError({ message: 'AUTH_REQUIRED' })).toBe(false);
    expect(isMissingFunctionError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
    expect(isMissingFunctionError({})).toBe(false);
  });
});

describe('newCheckoutRequestId', () => {
  it('haqiqiy UUID v4 shaklini beradi', () => {
    const id = newCheckoutRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('har safar boshqacha boʻladi', () => {
    const ids = new Set(Array.from({ length: 200 }, newCheckoutRequestId));
    expect(ids.size).toBe(200);
  });
});

/* ── cartSignature ──────────────────────────────────────────────────── */

function product(id: string): Product {
  return {
    id, name: 'M', slug: 'm', description: null, price: 1000, old_price: null, brand: null,
    category_id: null, sku: null, stock: 10, sales_count: 0, rating: 0, reviews_count: 0,
    is_new: false, status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01',
  };
}

describe('cartSignature', () => {
  it('tartibga bogʻliq emas', () => {
    const a: CartItem[] = [
      { product: product('p1'), quantity: 1 },
      { product: product('p2'), quantity: 2 },
    ];
    const b: CartItem[] = [
      { product: product('p2'), quantity: 2 },
      { product: product('p1'), quantity: 1 },
    ];
    // Foydalanuvchi mahsulotni oʻchirib qayta qoʻshsa tarkib oʻzgarmaydi —
    // idempotentlik kaliti ham bekorga yangilanmasligi kerak.
    expect(cartSignature(a)).toBe(cartSignature(b));
  });

  it('miqdor oʻzgarsa boshqa imzo beradi', () => {
    const one: CartItem[] = [{ product: product('p1'), quantity: 1 }];
    const two: CartItem[] = [{ product: product('p1'), quantity: 2 }];
    expect(cartSignature(one)).not.toBe(cartSignature(two));
  });

  it('variant oʻzgarsa boshqa imzo beradi', () => {
    const black: CartItem[] = [{ product: product('p1'), quantity: 1, variantId: 'v-black' }];
    const white: CartItem[] = [{ product: product('p1'), quantity: 1, variantId: 'v-white' }];
    expect(cartSignature(black)).not.toBe(cartSignature(white));
  });

  it('boʻsh savat boʻsh imzo beradi', () => {
    expect(cartSignature([])).toBe('');
  });
});
