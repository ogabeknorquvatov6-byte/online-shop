import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Edge Function'lar uchun XAVFSIZLIK REGRESSIYA testi.
 *
 * Bu testlar HAQIQIY fayllarni o'qiydi — mantiqning nusxasini emas.
 * Deno funksiyalarini vitest ichida ishga tushirib bo'lmaydi (`Deno.serve`,
 * `Deno.env` yo'q), lekin ularning eng muhim xususiyatini — sirni
 * tekshirishning FAIL-CLOSED bo'lishini — manba matnidan tekshirish
 * mumkin va bu aynan qaytib kelishi eng oson xato.
 *
 * Nima uchun bu shunchalik muhim:
 * eski kod `if (WEBHOOK_SECRET) { ...tekshirish... }` ko'rinishida edi.
 * Sir o'rnatilmagan bo'lsa tekshiruv BUTUNLAY o'chib qolardi va funksiya
 * URL'ini bilgan har kim botni service_role huquqlari bilan boshqara
 * olardi. Bu xatoni qaytadan kiritish juda oson, ko'zga esa tashlanmaydi.
 */

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

/**
 * Izohlarni olib tashlaydi.
 *
 * Busiz test KODNI emas, PROZANI tekshiradi: eski xatoni tushuntirib
 * yozilgan izoh (`Ilgari "if (WEBHOOK_SECRET) {…}" edi`) taqiqlangan
 * naqshga mos kelib, tuzatilgan fayl ham "xavfli" deb belgilanardi.
 * Aynan shu holat birinchi ishga tushirishda yuz berdi.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function entrypoints(): { name: string; source: string; code: string }[] {
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => !name.startsWith('_') && statSync(join(FUNCTIONS_DIR, name)).isDirectory())
    .map((name) => {
      const source = readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');
      return { name, source, code: stripComments(source) };
    });
}

const FUNCTIONS = entrypoints();

describe('Edge Function webhook xavfsizligi', () => {
  it('kamida uchta funksiya topildi', () => {
    // Test o'z-o'zini tekshiradi: papka nomi o'zgarsa yoki fayl
    // ko'chirilsa, quyidagi testlar "hech narsa tekshirmay" o'tib
    // ketmasligi kerak.
    expect(FUNCTIONS.length).toBeGreaterThanOrEqual(3);
    expect(FUNCTIONS.map((f) => f.name)).toContain('telegram-bot');
  });

  for (const { name, code } of FUNCTIONS) {
    describe(name, () => {
      const usesSecret = /WEBHOOK_SECRET/.test(code);

      it('sir bilan himoyalangan', () => {
        expect(usesSecret, `${name} hech qanday webhook sirini tekshirmaydi`).toBe(true);
      });

      it('FAIL-OPEN naqshi yoʻq', () => {
        /*
         * Taqiqlangan naqsh: sir MAVJUD bo'lgandagina tekshirish.
         *   if (WEBHOOK_SECRET) { ... }
         *   if (WEBHOOK_SECRET && header !== WEBHOOK_SECRET) { ... }
         * Ikkalasi ham sir yo'q bo'lganda so'rovni O'TKAZIB YUBORADI.
         */
        const failOpen = /if\s*\(\s*[A-Z_]*WEBHOOK_SECRET\s*(\)|&&)/.test(code);
        expect(failOpen, `${name} da fail-open sir tekshiruvi bor`).toBe(false);
      });

      it('sir yoʻq boʻlsa soʻrovni RAD ETADI', () => {
        // `if (!SECRET) return ...` — konfiguratsiya xatosi.
        const failClosed = /if\s*\(\s*!\s*[A-Z_]*WEBHOOK_SECRET\s*\)/.test(code);
        expect(failClosed, `${name} sir yoʻqligini tekshirmaydi`).toBe(true);
      });

      it('mos kelmagan sirda 403 qaytaradi', () => {
        expect(/status:\s*403/.test(code), `${name} da 403 javobi yoʻq`).toBe(true);
      });

      it('doimiy vaqtli taqqoslash ishlatadi', () => {
        expect(/secretsMatch\s*\(/.test(code), `${name} sirni oddiy !== bilan solishtiradi`).toBe(true);
      });
    });
  }
});

describe('Sirlar logʻga tushmaydi', () => {
  for (const { name, code } of FUNCTIONS) {
    it(`${name} sir qiymatini chop etmaydi`, () => {
      /*
       * `console.log(SERVICE_KEY)` yoki `console.error(BOT_TOKEN)` kabi
       * chaqiruvlar sirni log oqimiga chiqaradi — Supabase log'lari esa
       * loyihaga kirish huquqi bor har kimga ko'rinadi.
       *
       * Sir NOMINI matnda eslatish (masalan "SECRET is not configured")
       * xavfsiz; taqiqlanadigani — o'zgaruvchining QIYMATINI uzatish.
       */
      const leaks = [...code.matchAll(/console\.(log|error|warn|info)\(([^)]*)\)/g)]
        .map((m) => m[2])
        .filter((args) =>
          /(^|[^'"\w])(SERVICE_KEY|BOT_TOKEN|WEBHOOK_SECRET|ORDER_WEBHOOK_SECRET|ANON_KEY)([^'"\w]|$)/.test(args)
        );
      expect(leaks, `${name}: ${leaks.join(' | ')}`).toEqual([]);
    });

    it(`${name} Authorization sarlavhasini chop etmaydi`, () => {
      const leaks = [...code.matchAll(/console\.\w+\([^)]*\)/g)]
        .map((m) => m[0])
        .filter((call) => /authorization|apikey/i.test(call));
      expect(leaks).toEqual([]);
    });
  }
});
