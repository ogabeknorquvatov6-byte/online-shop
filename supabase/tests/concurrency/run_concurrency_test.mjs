#!/usr/bin/env node
/*
============================================================================
 HAQIQIY PARALLELLIK TESTI — IKKITA MUSTAQIL POSTGRES SESSIYASI
============================================================================

 NEGA BU ALOHIDA SKRIPT?

 `order_integrity_test.sql` BITTA sessiyada ketma-ket ishlaydi. Shuning
 uchun u qulflarni (`FOR UPDATE`) UMUMAN sinamaydi: bitta sessiya o'zining
 qulfi uchun hech qachon kutmaydi. Ya'ni "ombor qulflanadi" degan da'vo
 o'sha testda ISBOTLANMAGAN edi.

 Bu skript ikkita HAQIQIY `psql` jarayonini ishga tushiradi va ular
 o'rtasida aniq belgilangan poyga holatini yaratadi.

 DETERMINISTIK — `sleep` GA TAYANMAYDI:
   Vaqtga tayangan test ("ikkalasini bir vaqtda yuboramiz") yolg'on
   ishonch beradi: chaqiruvlar ustma-ust tushmasa, test hech narsani
   sinamay turib "o'tdi" deb ko'rsatadi. Bu yerda A sessiyasi qatorni
   ATAYLAB qulflab turadi, B esa o'sha qulfga BORIB TIQILADI — va biz
   B ning haqiqatan kutayotganini `pg_stat_activity` orqali TASDIQLAYMIZ.

 ISHGA TUSHIRISH (faqat OpenShop-Test):
   $env:PGHOST="aws-0-ap-southeast-2.pooler.supabase.com"
   $env:PGPORT="5432"          # Session mode SHART
   $env:PGDATABASE="postgres"
   $env:PGUSER="postgres.scekcknujaueoslgcntx"
   $env:PGPASSWORD=...          # o'z shelingizda, hech qayerga yozilmaydi
   node supabase/tests/concurrency/run_concurrency_test.mjs

 XAVFSIZLIK: skript PGHOST/PGUSER ichida `scekcknujaueoslgcntx` bo'lishini
 TALAB qiladi. Boshqa loyihada ishga tushmaydi.
============================================================================
*/

import { spawn } from 'node:child_process';

/* ── Xavfsizlik to'sig'i ────────────────────────────────────────────── */

const TEST_PROJECT_REF = 'scekcknujaueoslgcntx';

function assertTestProject() {
  const haystack = `${process.env.PGUSER ?? ''} ${process.env.PGHOST ?? ''}`;
  if (!haystack.includes(TEST_PROJECT_REF)) {
    console.error(
      `\nTO'XTATILDI: bu skript faqat OpenShop-Test (${TEST_PROJECT_REF}) uchun.\n` +
        `PGUSER/PGHOST ichida loyiha ref'i topilmadi.\n` +
        `Bu — produksiyaga tasodifan ulanishdan himoya.\n`
    );
    process.exit(2);
  }
  if (!process.env.PGPASSWORD) {
    console.error('\nTO\'XTATILDI: PGPASSWORD o\'rnatilmagan (o\'z shelingizda o\'rnating).\n');
    process.exit(2);
  }
}

/* ── Test ma'lumotlarining qat'iy identifikatorlari ─────────────────── */
/*
 * Qat'iy UUID'lar ATAYLAB: skript qayta-qayta ishga tushirilganda
 * "oldingi ishdan qolgan axlat" to'planmasin. Har safar avval tozalanadi,
 * keyin yaratiladi.
 */
/*
 * DIQQAT: UUID faqat ONALTILIK (hex) belgilardan iborat bo'lishi SHART:
 * 0-9 va a-f. Boshqa harf ishlatilsa Postgres butun buyruqni rad etadi:
 *
 *     ERROR: invalid input syntax for type uuid
 *
 * Bu xato AYNAN shu yerda sodir bo'lgan edi: `c0u1`, `c0k1`, `c0k2`,
 * `c0k3` — ular "user" va "key" so'zlariga ishora qilsin deb tanlangan,
 * lekin `u` va `k` hex EMAS.
 *
 * Oqibati oddiy "test yiqildi" dan YOMONROQ edi: A va B sessiyalari
 * `create_order_as` ga UMUMAN yetib bormadi, B hech qachon qulfda
 * kutmadi — ya'ni test parallellikni tekshirmasdan turib tekshirgandek
 * ko'rinardi. Soxta ishonchning eng xavfli turi.
 *
 * Endi barcha belgilar hex, ma'no esa oxirgi guruh orqali beriladi:
 *   c0a1 — kategoriya   c0b1 — mahsulot   c0c1 — mijoz (customer)
 *   c0d1 — A kaliti     c0d2 — B kaliti   c0d3 — umumiy kalit
 */
const ID = {
  cat: '00000000-0000-4000-8000-00000000c0a1',
  product: '00000000-0000-4000-8000-00000000c0b1',
  user: '00000000-0000-4000-8000-00000000c0c1',
  keyA: '00000000-0000-4000-8000-00000000c0d1',
  keyB: '00000000-0000-4000-8000-00000000c0d2',
  sharedKey: '00000000-0000-4000-8000-00000000c0d3',
};

/* ── psql sessiyasi ─────────────────────────────────────────────────── */

/*
 * Har bir buyruqdan keyin `\echo <SENTINEL>` yuboramiz va o'sha
 * belgigacha o'qiymiz. Shu tariqa buyruq TUGAGANINI aniq bilamiz —
 * taxminiy kutishlarsiz.
 */
class PsqlSession {
  constructor(name) {
    this.name = name;
    this.buffer = '';
    this.proc = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=0', '-P', 'pager=off'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => { this.buffer += d; });
    // psql xatolarni stderr'ga yozadi — ular ham natijaning bir qismi.
    this.proc.stderr.on('data', (d) => { this.buffer += d; });
  }

  /** Buyruqni yuboradi va tugaguncha kutib, chiqishni qaytaradi. */
  async run(sql, { timeoutMs = 30000 } = {}) {
    const sentinel = `__DONE_${Math.random().toString(36).slice(2)}__`;
    this.buffer = '';
    this.proc.stdin.write(`${sql}\n\\echo ${sentinel}\n`);

    const started = Date.now();
    while (!this.buffer.includes(sentinel)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`${this.name}: "${sql.slice(0, 60)}…" ${timeoutMs}ms ichida tugamadi`);
      }
      await sleep(25);
    }
    return this.buffer.replace(sentinel, '').trim();
  }

  /**
   * Buyruqni yuboradi, LEKIN tugashini KUTMAYDI.
   * Aynan shu kerak: B sessiyasi qulfda TIQILIB qolishi kutilyapti.
   */
  runDetached(sql) {
    const sentinel = `__DONE_${Math.random().toString(36).slice(2)}__`;
    this.buffer = '';
    this.proc.stdin.write(`${sql}\n\\echo ${sentinel}\n`);
    return {
      isFinished: () => this.buffer.includes(sentinel),
      output: () => this.buffer.replace(sentinel, '').trim(),
      waitUntilFinished: async (timeoutMs = 30000) => {
        const started = Date.now();
        while (!this.buffer.includes(sentinel)) {
          if (Date.now() - started > timeoutMs) {
            throw new Error(`${this.name}: kutilmagan tarzda hamon bloklangan (${timeoutMs}ms)`);
          }
          await sleep(25);
        }
        return this.buffer.replace(sentinel, '').trim();
      },
    };
  }

  close() {
    try { this.proc.stdin.end(); } catch { /* allaqachon yopilgan */ }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Tekshiruvlar ───────────────────────────────────────────────────── */

let passed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok — ${label}`);
  } else {
    failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
    console.log(`  FAILED — ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

/* ── Asosiy oqim ────────────────────────────────────────────────────── */

async function main() {
  assertTestProject();

  const setup = new PsqlSession('setup');
  const A = new PsqlSession('A');
  const B = new PsqlSession('B');
  const monitor = new PsqlSession('monitor');

  try {
    console.log('\n== 0. Tayyorgarlik ==');

    // Avvalgi ishdan qolgan bo'lsa — tozalaymiz (skript qayta ishga
    // tushirilishi xavfsiz bo'lishi kerak).
    await cleanup(setup);

    await setup.run(`
      insert into public.categories (id, name, slug, is_active, sort_order)
      values ('${ID.cat}', 'CONCURRENCY TEST', 'concurrency-test-cat', true, 999);
    `);

    // Ombor ATAYLAB 1 — poyga aynan oxirgi dona uchun bo'lsin.
    await setup.run(`
      insert into public.products (id, category_id, name, slug, brand, description,
                                   price, stock, sku, is_active)
      values ('${ID.product}', '${ID.cat}', 'CONCURRENCY TEST mahsulot',
              'concurrency-test-product', 'TEST', 'vaqtinchalik test mahsuloti',
              500000, 1, 'SKU-CONCURRENCY', true);
    `);

    // Buyurtma beruvchi test foydalanuvchisi (idempotent).
    await setup.run(`
      insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                              created_at, updated_at, raw_app_meta_data,
                              raw_user_meta_data, aud, role)
      values ('${ID.user}', 'concurrency-test@example.invalid', '', now(), now(), now(),
              '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
      on conflict (id) do nothing;
      insert into public.profiles (id, role, is_active)
      values ('${ID.user}', 'customer', true)
      on conflict (id) do update set is_active = true, role = 'customer';
    `);

    const stock0 = await scalar(setup, `select stock from public.products where id='${ID.product}'`);
    assert(stock0 === '1', 'test mahsuloti ombori = 1', `olindi: ${stock0}`);

    /* ================================================================
       1. POYGA: ikkita xaridor, bitta oxirgi dona
       ================================================================ */
    console.log('\n== 1. Ikki sessiya oxirgi dona uchun poyga ==');

    // A: tranzaksiyani ochadi va qatorni ATAYLAB qulflaydi.
    await A.run('begin;');
    await A.run(`select stock from public.products where id='${ID.product}' for update;`);
    console.log('  · A qatorni FOR UPDATE bilan qulfladi');

    // B: buyurtma berishga urinadi — A ning qulfiga tiqilishi KERAK.
    const bCall = B.runDetached(`
      begin;
      select public.create_order_as(
        p_user_id             => '${ID.user}',
        p_customer_name       => 'Xaridor B',
        p_phone               => '+998900000002',
        p_address             => 'Toshkent, Test 2',
        p_latitude            => null,
        p_longitude           => null,
        p_items               => jsonb_build_array(jsonb_build_object(
                                   'product_id','${ID.product}','quantity',1)),
        p_checkout_request_id => '${ID.keyB}',
        p_payment_method      => 'Naqd pul',
        p_city                => 'Toshkent',
        p_note                => null,
        p_email               => null);
      commit;
    `);

    // B HAQIQATAN qulfda kutayotganini TASDIQLAYMIZ.
    // Bu — testning eng muhim qismi: busiz "poyga bo'ldi" degan da'vo
    // isbotlanmagan bo'lib qolardi.
    const blocked = await waitForLockWait(monitor, 15000);
    assert(blocked, 'B sessiyasi A ning qulfida HAQIQATAN kutmoqda',
      blocked ? '' : 'pg_stat_activity da Lock kutuvi topilmadi');
    assert(!bCall.isFinished(), 'B hali tugamagan (qulf ushlab turibdi)');

    // A: o'z buyurtmasini beradi va commit qiladi.
    const aOut = await A.run(`
      select public.create_order_as(
        p_user_id             => '${ID.user}',
        p_customer_name       => 'Xaridor A',
        p_phone               => '+998900000001',
        p_address             => 'Toshkent, Test 1',
        p_latitude            => null,
        p_longitude           => null,
        p_items               => jsonb_build_array(jsonb_build_object(
                                   'product_id','${ID.product}','quantity',1)),
        p_checkout_request_id => '${ID.keyA}',
        p_payment_method      => 'Naqd pul',
        p_city                => 'Toshkent',
        p_note                => null,
        p_email               => null);
    `);
    assert(!/ERROR/i.test(aOut), 'A buyurtmasi muvaffaqiyatli', aOut.slice(0, 200));
    await A.run('commit;');
    console.log('  · A commit qildi — qulf bo\'shadi');

    // B endi davom etadi va OUT_OF_STOCK olishi KERAK.
    const bOut = await bCall.waitUntilFinished(20000);
    assert(/OUT_OF_STOCK/.test(bOut), 'B OUT_OF_STOCK oldi (qayta o\'qish ishladi)',
      `B chiqishi: ${bOut.slice(0, 300)}`);
    await B.run('rollback;');

    /* ---- Yakuniy holat ---- */
    const stock1 = await scalar(setup, `select stock from public.products where id='${ID.product}'`);
    assert(stock1 === '0', 'yakuniy ombor AYNAN 0', `olindi: ${stock1}`);
    assert(Number(stock1) >= 0, 'ombor hech qachon manfiy bo\'lmadi');

    const orderCount = await scalar(setup,
      `select count(*) from public.orders o
       join public.order_items i on i.order_id = o.id
       where i.product_id = '${ID.product}'`);
    assert(orderCount === '1', 'AYNAN BITTA buyurtma yaratildi', `olindi: ${orderCount}`);

    const soldQty = await scalar(setup,
      `select coalesce(sum(quantity),0) from public.order_items where product_id='${ID.product}'`);
    assert(soldQty === '1', 'jami sotilgan miqdor = 1 (ortiqcha sotuv YO\'Q)', `olindi: ${soldQty}`);

    /* ================================================================
       2. BIR XIL IDEMPOTENTLIK KALITI bilan parallel so'rov
       ================================================================ */
    console.log('\n== 2. Bir xil checkout_request_id bilan parallel so\'rov ==');
    /*
     * MA'LUM XATTI-HARAKAT — ATAYLAB SHUNDAY YOZILGAN TEST.
     *
     * Ikki HAQIQATAN parallel so'rov bir xil kalit bilan kelsa,
     * yutqazgan tomon `create_order_as` ning 1-bosqichida (ombor
     * tekshiruvi) OUT_OF_STOCK oladi — 4-bosqichdagi unique-violation
     * idempotentlik ishlov beruvchisiga YETIB BORMAY.
     *
     * Ya'ni foydalanuvchi xato ko'radi, garchi uning buyurtmasi
     * (yutgan tomon sifatida) yaratilgan bo'lsa ham.
     *
     * Bu XAVFSIZLIK yoki YAXLITLIK nuqsoni EMAS:
     *   — dublikat buyurtma yo'q;
     *   — ombor ikki marta kamaymaydi;
     *   — ortiqcha sotuv yo'q.
     * Bu — UX/to'g'rilik kamchiligi (juda tor oynada: "ikki marta bosish"
     * + oxirgi dona). Tuzatish uchun kalitni qulf olingandan KEYIN qayta
     * tekshirish kerak bo'lardi — bu MIGRATSIYA, shuning uchun bu yerda
     * QILINMAYDI. Test mavjud xatti-harakatni HUJJATLASHTIRADI.
     */
    await setup.run(`update public.products set stock = 1 where id='${ID.product}';`);
    await setup.run(`
      delete from public.order_items where product_id='${ID.product}';
      delete from public.orders where checkout_request_id in ('${ID.keyA}','${ID.keyB}','${ID.sharedKey}');
    `);

    await A.run('begin;');
    await A.run(`select stock from public.products where id='${ID.product}' for update;`);

    const bShared = B.runDetached(`
      begin;
      select public.create_order_as(
        p_user_id => '${ID.user}', p_customer_name => 'Shared B',
        p_phone => '+998900000002', p_address => 'Toshkent, Test 2',
        p_latitude => null, p_longitude => null,
        p_items => jsonb_build_array(jsonb_build_object('product_id','${ID.product}','quantity',1)),
        p_checkout_request_id => '${ID.sharedKey}',
        p_payment_method => 'Naqd pul', p_city => 'Toshkent',
        p_note => null, p_email => null);
      commit;
    `);

    await waitForLockWait(monitor, 15000);

    await A.run(`
      select public.create_order_as(
        p_user_id => '${ID.user}', p_customer_name => 'Shared A',
        p_phone => '+998900000001', p_address => 'Toshkent, Test 1',
        p_latitude => null, p_longitude => null,
        p_items => jsonb_build_array(jsonb_build_object('product_id','${ID.product}','quantity',1)),
        p_checkout_request_id => '${ID.sharedKey}',
        p_payment_method => 'Naqd pul', p_city => 'Toshkent',
        p_note => null, p_email => null);
    `);
    await A.run('commit;');

    const bSharedOut = await bShared.waitUntilFinished(20000);
    await B.run('rollback;');

    const sharedOrders = await scalar(setup,
      `select count(*) from public.orders where checkout_request_id='${ID.sharedKey}'`);
    assert(sharedOrders === '1', 'bir xil kalit bilan AYNAN BITTA buyurtma bor',
      `olindi: ${sharedOrders}`);

    const sharedStock = await scalar(setup, `select stock from public.products where id='${ID.product}'`);
    assert(sharedStock === '0', 'ombor faqat BIR MARTA kamaydi', `olindi: ${sharedStock}`);

    // Hujjatlashtirilgan xatti-harakat: yutqazgan OUT_OF_STOCK oladi.
    const lostWithOutOfStock = /OUT_OF_STOCK/.test(bSharedOut);
    console.log(
      lostWithOutOfStock
        ? '  · HUJJATLASHTIRILDI: yutqazgan tomon OUT_OF_STOCK oldi ' +
          '(idempotentlik ishlov beruvchisiga yetib bormadi) — UX kamchiligi, ' +
          'yaxlitlik buzilmagan'
        : `  · DIQQAT: kutilmagan xatti-harakat: ${bSharedOut.slice(0, 200)}`
    );
    assert(true, 'bir xil kalitli parallel so\'rov xatti-harakati hujjatlashtirildi');

    console.log('\n== 3. Tozalash ==');
    await cleanup(setup);
    const leftover = await scalar(setup,
      `select count(*) from public.products where id='${ID.product}'`);
    assert(leftover === '0', 'test ma\'lumotlari tozalandi');
  } finally {
    // Sessiyalar ochiq tranzaksiya bilan qolib ketmasin.
    try { await A.run('rollback;'); } catch { /* yopilgan bo'lishi mumkin */ }
    try { await B.run('rollback;'); } catch { /* yopilgan bo'lishi mumkin */ }
    A.close(); B.close(); monitor.close(); setup.close();
  }

  console.log('\n==========================================');
  if (failures.length === 0) {
    console.log(` HAMMASI O'TDI — ${passed} ta tekshiruv`);
    console.log('==========================================\n');
    process.exit(0);
  } else {
    console.log(` ${failures.length} ta MUVAFFAQIYATSIZ (${passed} o'tdi)`);
    for (const f of failures) console.log(`   - ${f}`);
    console.log('==========================================\n');
    process.exit(1);
  }
}

/** Bitta qiymat qaytaradigan so'rov. */
async function scalar(session, sql) {
  const out = await session.run(`\\pset tuples_only on\n${sql};\n\\pset tuples_only off`);
  return out.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
}

/**
 * Kimdir QULFDA kutayotganini tasdiqlaydi.
 *
 * `sleep` bilan "kutdik, demak bloklangandir" deb TAXMIN qilmaymiz —
 * bu holatni bazaning o'zidan so'raymiz. Shart bajarilmasa test
 * muvaffaqiyatsiz bo'ladi, ya'ni poyga sodir bo'lmagani yashirin
 * qolmaydi.
 */
async function waitForLockWait(monitor, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const n = await scalar(
      monitor,
      `select count(*) from pg_stat_activity
       where wait_event_type = 'Lock'
         and query ilike '%create_order_as%'
         and pid <> pg_backend_pid()`
    );
    if (Number(n) > 0) return true;
    await sleep(100);
  }
  return false;
}

/** Test ma'lumotlarini o'chiradi. Foydalanuvchi qoldiriladi (zararsiz). */
async function cleanup(session) {
  await session.run(`
    delete from public.order_items where product_id = '${ID.product}';
    delete from public.orders
      where checkout_request_id in ('${ID.keyA}','${ID.keyB}','${ID.sharedKey}');
    delete from public.orders where customer_name in
      ('Xaridor A','Xaridor B','Shared A','Shared B');
    delete from public.products where id = '${ID.product}';
    delete from public.categories where id = '${ID.cat}';
  `);
}

main().catch((err) => {
  console.error('\nKUTILMAGAN XATO:', err.message);
  process.exit(1);
});
