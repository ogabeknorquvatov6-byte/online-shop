import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * `admin_list_users` SAHIFALASHI — statik shartnoma testlari.
 *
 * NEGA SHUNDAY. Haqiqiy sahifalashni faqat ishlayotgan Postgres tekshira
 * oladi (bu `supabase/tests/` dagi SQL to'plamining ishi). Lekin bu
 * o'zgarishning eng xavfli tomonlari MATNDAN ham ko'rinadi va ular
 * jimgina qaytib kelishi mumkin:
 *
 *   — chegarasiz ro'yxatga qaytish (`limit` yo'qolishi);
 *   — `anon` ga huquq berilib qolishi;
 *   — `is_admin()` tekshiruvining tushib qolishi;
 *   — eski imzoning o'chirilishi (keshdagi mijozlar buziladi);
 *   — yangi parametrlarga `default` qo'shilishi (42725 noaniqlik).
 *
 * Bu testlar arzon va aynan shu regressiyalarni ushlaydi.
 */

const MIGRATION = readFileSync(
  'supabase/migrations/20260911000000_admin_list_users_pagination.sql',
  'utf8'
);
const USERS_TSX = readFileSync('src/lib/admin/Users.tsx', 'utf8');

/** SQL izohlarini olib tashlaydi — izohdagi matn dalil bo'lib qolmasin. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}
const SQL = stripSqlComments(MIGRATION);

describe('migratsiya: roʻyxat endi chegarasiz emas', () => {
  it('`limit` va `offset` qoʻllanadi', () => {
    expect(SQL).toMatch(/limit\s+v_limit\s+offset\s+v_offset/i);
  });

  it('mijoz yuborgan `p_limit` yuqoridan cheklanadi', () => {
    /*
     * Busiz admin (yoki uning brauzerini boshqargan kod) `p_limit`
     * ga 1 000 000 yuborib sahifalashni butunlay chetlab o'tardi —
     * ya'ni tuzatish faqat ko'rinishda qolardi.
     */
    expect(SQL).toMatch(/least\s*\(\s*greatest\s*\(\s*coalesce\s*\(\s*p_limit/i);
    expect(SQL).toMatch(/least\s*\(\s*greatest\s*\(\s*coalesce\s*\(\s*p_limit\s*,\s*\d+\s*\)\s*,\s*\d+\s*\)\s*,\s*100\s*\)/i);
  });

  it('manfiy `p_offset` 0 ga keltiriladi', () => {
    expect(SQL).toMatch(/greatest\s*\(\s*coalesce\s*\(\s*p_offset\s*,\s*0\s*\)\s*,\s*0\s*\)/i);
  });

  it('jami son qaytariladi (sahifalar sonini hisoblash uchun)', () => {
    expect(SQL).toMatch(/count\s*\(\s*\*\s*\)\s*over\s*\(\s*\)\s+as\s+total_count/i);
  });

  it('barqaror tartib — sahifalar orasida yozuv yoʻqolmasin', () => {
    // Faqat `created_at` bo'yicha tartiblash bir xil vaqtli yozuvlarni
    // sahifalar orasida takrorlab yoki yo'qotib yuborardi.
    expect(SQL).toMatch(/order\s+by\s+m\.created_at\s+desc\s*,\s*m\.id/i);
  });
});

describe('migratsiya: xavfsizlik kengaytirilmagan', () => {
  it('`is_admin()` tekshiruvi saqlanadi', () => {
    expect(SQL).toMatch(/if\s+not\s+public\.is_admin\(\)\s+then/i);
    expect(SQL).toMatch(/raise\s+exception\s+'FORBIDDEN'/i);
  });

  it('`security definer` saqlanadi', () => {
    expect(SQL).toMatch(/security\s+definer/i);
  });

  it('`anon` dan EXECUTE ANIQ tortib olinadi', () => {
    /*
     * Supabase standart huquqi `anon` ga TO'G'RIDAN-TO'G'RI beriladi,
     * `revoke ... from public` esa uni olib tashlamaydi
     * (20260910000000 auditidagi dars).
     */
    expect(SQL).toMatch(/revoke\s+all\s+on\s+function\s+public\.admin_list_users\s*\([^)]*\)\s+from\s+anon/i);
  });

  it('`anon` ga hech qanday GRANT berilmaydi', () => {
    const grants = SQL.match(/grant\s+execute\s+on\s+function[^;]*;/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g, `anon ga huquq berilgan: ${g}`).not.toMatch(/\bto\b[^;]*\banon\b/i);
    }
  });

  it('faqat `authenticated` va `service_role` ga beriladi — eskisi bilan bir xil', () => {
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.admin_list_users\s*\([^)]*\)\s+to\s+authenticated/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.admin_list_users\s*\([^)]*\)\s+to\s+service_role/i);
  });
});

describe('migratsiya: deploy xavfsizligi', () => {
  it('eski (argumentsiz) imzo OʻCHIRILMAYDI', () => {
    // Keshdagi eski bundle `rpc('admin_list_users')` ni argumentsiz
    // chaqiradi. Eskisini o'chirsak, ular uchun bo'lim PGRST202 bilan
    // butunlay ishlamay qolardi.
    expect(SQL).not.toMatch(/drop\s+function[^;]*admin_list_users/i);
  });

  it('yangi parametrlarda `default` YOʻQ (42725 noaniqligining oldini oladi)', () => {
    /*
     * `default` bo'lsa, ARGUMENTSIZ chaqiruv ikkala overload'ga ham mos
     * kelib, Postgres "function is not unique" xatosini qaytarardi.
     */
    const header = SQL.match(
      /create\s+or\s+replace\s+function\s+public\.admin_list_users\s*\(([^)]*)\)/i
    );
    expect(header, 'yangi imzo topilmadi').toBeTruthy();
    expect(header![1]).toMatch(/p_limit/i);
    expect(header![1]).not.toMatch(/\bdefault\b/i);
  });

  it('standart qiymatli parametrdan keyin standart qiymatsiz kelmaydi (42P13)', () => {
    const header = SQL.match(
      /create\s+or\s+replace\s+function\s+public\.admin_list_users\s*\(([^)]*)\)/i
    );
    const params = header![1].split(',').map((p) => p.trim()).filter(Boolean);
    let seenDefault = false;
    for (const p of params) {
      if (/\bdefault\b/i.test(p)) { seenDefault = true; continue; }
      expect(seenDefault, `«${p}» standart qiymatlidan keyin turibdi`).toBe(false);
    }
  });
});

describe('frontend: toʻliq roʻyxat xotirada deb hisoblanmaydi', () => {
  it('RPC sahifalash parametrlari bilan chaqiriladi', () => {
    expect(USERS_TSX).toMatch(/p_limit:\s*ADMIN_PAGE_SIZE/);
    expect(USERS_TSX).toMatch(/p_offset:\s*from/);
    expect(USERS_TSX).toMatch(/p_search:/);
    expect(USERS_TSX).toMatch(/p_filter:\s*roleFilter/);
  });

  it('mijoz tomonida qayta filtrlash YOʻQ', () => {
    /*
     * Brauzerda faqat bitta sahifa bor. Uni yana filtrlash boshqa
     * sahifalardagi mos foydalanuvchilarni JIMGINA yashirardi.
     */
    expect(USERS_TSX).not.toMatch(/users\.filter\s*\(/);
    expect(USERS_TSX).not.toMatch(/\bfiltered\b/);
  });

  it('sahifalagich va oraliq koʻrsatkichi bor', () => {
    expect(USERS_TSX).toMatch(/<AdminPager/);
    expect(USERS_TSX).toMatch(/pageSummary\(page,\s*total,\s*users\.length\)/);
  });

  it('qidiruv/filtr oʻzgarganda sahifa 1 ga qaytadi', () => {
    expect(USERS_TSX).toMatch(/setPage\(1\)/);
    expect(USERS_TSX).toMatch(/\[debouncedSearch,\s*roleFilter\]/);
  });

  it('profilsiz hisoblar soni SERVERDAN olinadi', () => {
    /*
     * Ilgari bu son brauzerdagi to'liq ro'yxatdan hisoblanardi.
     * Sahifalashdan keyin u faqat joriy sahifani sanab, ogohlantirishni
     * jimgina kam ko'rsatib qo'yardi.
     */
    expect(USERS_TSX).toMatch(/orphan_count/);
    expect(USERS_TSX).toMatch(/setOrphanCount/);
    expect(USERS_TSX).not.toMatch(/users\.filter\(\(u\)\s*=>\s*!u\.has_profile\)/);
  });
});
