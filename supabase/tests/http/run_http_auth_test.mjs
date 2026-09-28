#!/usr/bin/env node
/*
============================================================================
 HAQIQIY HTTP / PostgREST / Supabase Auth TESTI
============================================================================

 NEGA KERAK.

 `order_integrity_test.sql` PostgREST'ni TAQLID qiladi:
     set local role authenticated;
     set local request.jwt.claims = '{"sub":"…","role":"authenticated"}';

 Bu foydali, lekin u quyidagilarni CHETLAB O'TADI:
   — Supabase Auth (GoTrue) va haqiqiy JWT chiqarish;
   — JWT imzosini tekshirish;
   — PostgREST'ning rol tanlashi va GRANT'larni qo'llashi;
   — PostgREST'ning nomli argumentlar bilan overload tanlashi;
   — HTTP xato kodlari va tarmoq qatlami.

 Ya'ni "RLS ishlaydi" degan da'vo faqat SQL darajasida isbotlangan edi.
 Bu skript AYNAN ilova foydalanadigan yo'lni sinaydi:

     brauzer → Supabase Auth → JWT → PostgREST → RLS/RPC → PostgreSQL

 ISHGA TUSHIRISH:
   1. `.env.test.local` faylini `.env.test.example` asosida to'ldiring
      (u `.gitignore` da `.env.*` bilan allaqachon chetlab o'tilgan).
   2. npm run test:http

 XAVFSIZLIK: TEST_SUPABASE_URL ichida `scekcknujaueoslgcntx` bo'lmasa
 skript ishga tushmaydi. Hech qanday sir CHOP ETILMAYDI.
============================================================================
*/

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'scekcknujaueoslgcntx';

/* ── Sozlamalarni yuklash ───────────────────────────────────────────── */

/*
 * `.env.test.local` ni O'ZIMIZ o'qiymiz: loyihada dotenv yo'q va faqat
 * shu bitta fayl uchun yangi bog'liqlik qo'shish ortiqcha bo'lardi.
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile('.env.test.local');

const CFG = {
  url: process.env.TEST_SUPABASE_URL ?? '',
  anonKey: process.env.TEST_SUPABASE_ANON_KEY ?? '',
  customer: { email: process.env.TEST_CUSTOMER_EMAIL, password: process.env.TEST_CUSTOMER_PASSWORD },
  admin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD },
  blocked: { email: process.env.TEST_BLOCKED_EMAIL, password: process.env.TEST_BLOCKED_PASSWORD },
};

function preflight() {
  if (!CFG.url.includes(TEST_PROJECT_REF)) {
    console.error(
      `\nTO'XTATILDI: TEST_SUPABASE_URL ichida "${TEST_PROJECT_REF}" yo'q.\n` +
        `Bu skript FAQAT OpenShop-Test uchun. Produksiyaga ulanish bloklandi.\n`
    );
    process.exit(2);
  }
  // Sirlar hech qachon chop etilmaydi — faqat MAVJUDLIGI tekshiriladi.
  const missing = [];
  if (!CFG.anonKey) missing.push('TEST_SUPABASE_ANON_KEY');
  for (const [name, who] of [['CUSTOMER', CFG.customer], ['ADMIN', CFG.admin], ['BLOCKED', CFG.blocked]]) {
    if (!who.email || !who.password) missing.push(`TEST_${name}_EMAIL / TEST_${name}_PASSWORD`);
  }
  if (missing.length) {
    console.error('\nTO\'XTATILDI: quyidagi sozlamalar yetishmaydi:\n');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      '\nUlarni `.env.test.local` ga yozing (namuna: `.env.test.example`).\n' +
        'Test foydalanuvchilarini OpenShop-Test Dashboard → Authentication → Users\n' +
        'bo\'limida QO\'LDA yarating. Skript auth foydalanuvchi YARATMAYDI.\n'
    );
    process.exit(2);
  }
}

/* ── Tekshiruvlar ───────────────────────────────────────────────────── */

let passed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) { passed++; console.log(`  ok — ${label}`); }
  else { failures.push(label); console.log(`  FAILED — ${label}${detail ? `\n      ${detail}` : ''}`); }
}

const anonClient = () =>
  createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn({ email, password }, label) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // Parol CHOP ETILMAYDI — faqat xato matni.
    throw new Error(`${label} sifatida kirib bo'lmadi: ${error.message}`);
  }
  return { client, userId: data.user.id };
}

/* ── Asosiy oqim ────────────────────────────────────────────────────── */

const RUN = Date.now().toString(36);            // har ishga tushirish uchun noyob
const marker = `HTTPTEST_${RUN}`;
let createdOrderIds = [];

async function main() {
  preflight();
  console.log(`\nOpenShop-Test HTTP testi — belgi: ${marker}\n`);

  /* ---- A. ANONIM ------------------------------------------------- */
  console.log('== A. Anonim so\'rov ==');
  {
    const anon = anonClient();
    const { error } = await anon.rpc('create_order', {
      p_customer_name: `${marker} Anon`,
      p_phone: '+998900000000',
      p_address: 'Toshkent, Test 1',
      p_latitude: null,
      p_longitude: null,
      p_items: [{ product_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      p_checkout_request_id: crypto.randomUUID(),
      p_payment_method: 'Naqd pul',
      p_city: 'Toshkent',
      p_note: null,
      p_email: null,
    });
    /*
     * AYNAN 42501 (insufficient_privilege) KUTILADI — shunchaki "xato
     * bo'ldi" emas.
     *
     * NEGA MUHIM. `!!error` tekshiruvi HAR QANDAY nosozlikda o'tib
     * ketardi: noto'g'ri anon kalit, tarmoq uzilishi, mahsulot topilmadi,
     * hatto `AUTH_REQUIRED` ham. Ya'ni GRANT qatlami butunlay ochilib
     * ketsa ham test yashil qolishi mumkin edi.
     *
     * 42501 aynan `revoke execute … from anon` ishlayotganini bildiradi
     * (20260910000000 migratsiyasi). Agar bu yerda `P0001` ko'rinsa —
     * demak anon funksiya TANASIGA yetib boryapti, ya'ni GRANT qatlami
     * yana ochilib qolgan.
     */
    const code = error?.code ?? '';
    const isPermissionDenied = code === '42501' || /permission denied/i.test(error?.message ?? '');
    assert(
      isPermissionDenied,
      'anonim create_order 42501 (permission denied) bilan RAD ETILDI',
      error
        ? `kutilgan 42501, olindi ${code || 'kodsiz'}: ${error.message}`
        : 'xato KUTILGAN edi, lekin chaqiruv muvaffaqiyatli tugadi'
    );
    if (error) console.log(`      (kod: ${code || 'n/a'})`);
  }

  /* ---- B. TIZIMGA KIRGAN MIJOZ ----------------------------------- */
  console.log('\n== B. Tizimga kirgan mijoz ==');
  const { client: customer, userId: customerId } = await signIn(CFG.customer, 'mijoz');

  /*
   * MAHSULOT TANLASH — AKSIYASIZ va ANIQ (deterministik).
   *
   * MUAMMO. Narx tekshiruvi mahsulot narxini `discount_price ?? price`
   * deb hisoblardi. Lekin serverda narx `public.effective_price()` orqali
   * chiqadi:
   *
   *     least( coalesce(discount_price, price),
   *            price * (1 - max(faol aksiya foizi)/100) )
   *
   * Ya'ni FAOL AKSIYAdagi mahsulot uchun server narxi kutilganidan PAST
   * bo'ladi va tekshiruv "narx bazadan olinmadi" deb yiqilardi — aslida
   * baza mutlaqo to'g'ri ishlagan holda. Bu — noto'g'ri sababga
   * ko'rsatadigan test, ya'ni eng chalg'ituvchi turdagi nosozlik.
   *
   * YECHIM: aksiyaga bog'langan mahsulotlarni umuman chetlab o'tamiz.
   * Faol aksiyalarning sana oynasini PostgREST'da aniq filtrlash noqulay
   * (`ends_at is null or ends_at >= now()`), shuning uchun ATAYLAB
   * ehtiyotkor yo'l tanlandi: `is_active` aksiyaga bog'langan HAR QANDAY
   * mahsulot chetlanadi. Bu kerakligidan kengroq to'plam — lekin test
   * uchun bu xavfsiz tomonga og'ish.
   *
   * `.order('id')` — takroriy ishga tushirishda AYNAN o'sha mahsulot
   * tanlansin: tartibsiz `.limit(1)` natijani har safar o'zgartirib,
   * nosozliklarni "goh bor, goh yo'q" qilib qo'yardi.
   */
  const { data: promoLinks, error: promoErr } = await customer
    .from('promotion_products')
    .select('product_id, promotions!inner(is_active)')
    .eq('promotions.is_active', true);

  if (promoErr) {
    console.log(`  · aksiya ro'yxatini o'qib bo'lmadi (${promoErr.message}) — ehtiyot uchun to'xtaymiz`);
  }
  const promotedIds = new Set((promoLinks ?? []).map((r) => r.product_id));
  console.log(`  · faol aksiyadagi mahsulotlar chetlandi: ${promotedIds.size} ta`);

  const { data: candidates, error: prodErr } = await customer
    .from('products')
    .select('id, name, price, discount_price, stock')
    .eq('is_active', true)
    .gt('stock', 0)
    .order('id', { ascending: true })
    .limit(100);

  const product = (candidates ?? []).find((p) => !promotedIds.has(p.id));

  if (prodErr || !product) {
    console.log('  O\'TKAZIB YUBORILDI — aksiyasiz, omborda mavjud mahsulot topilmadi');
    assert(
      false,
      'B: narx tekshiruvi uchun aksiyasiz mahsulot topilmadi',
      prodErr?.message ?? `${candidates?.length ?? 0} nomzoddan hammasi aksiyada yoki katalog bo'sh`
    );
  } else {
    console.log(`  · tanlangan mahsulot: ${product.name}`);
    const stockBefore = product.stock;

    const { data: orderId, error } = await customer.rpc('create_order', {
      p_customer_name: `${marker} Mijoz`,
      p_phone: '+998901234567',
      p_address: 'Toshkent, Test ko\'chasi 1',
      p_latitude: null,
      p_longitude: null,
      // `price` ATAYLAB yuboriladi — server uni E'TIBORSIZ qoldirishi kerak.
      p_items: [{ product_id: product.id, quantity: 1, price: 1, unit_price: 1 }],
      p_checkout_request_id: crypto.randomUUID(),
      p_payment_method: 'Naqd pul',
      p_city: 'Toshkent',
      p_note: marker,
      p_email: null,
    });

    assert(!error && !!orderId, 'mijoz buyurtma yarata oldi', error?.message);

    if (orderId) {
      createdOrderIds.push(orderId);

      const { data: items } = await customer
        .from('order_items').select('unit_price, quantity').eq('order_id', orderId);
      /*
       * Bu hisob FAQAT aksiyasiz mahsulot uchun to'g'ri — mahsulot
       * yuqorida aynan shu shart bilan tanlangan. Aks holda server
       * `effective_price()` orqali aksiya foizini ham hisobga olar va
       * kutilgan qiymat noto'g'ri bo'lib qolardi.
       */
      const expected = product.discount_price && product.discount_price > 0
        ? product.discount_price : product.price;

      assert(
        items?.[0] && Number(items[0].unit_price) === Number(expected),
        'narx BAZADAN olindi, mijoz yuborgan "price: 1" e\'tiborsiz qoldirildi',
        `kutilgan ${expected}, olindi ${items?.[0]?.unit_price}`
      );

      const { data: after } = await customer
        .from('products').select('stock').eq('id', product.id).single();
      assert(
        after && after.stock === stockBefore - 1,
        'ombor AYNAN 1 taga kamaydi',
        `oldin ${stockBefore}, keyin ${after?.stock}`
      );

      const { data: order } = await customer
        .from('orders').select('payment_status').eq('id', orderId).single();
      assert(order?.payment_status === 'COD_PENDING',
        'naqd buyurtma COD_PENDING (PAID emas)', `olindi: ${order?.payment_status}`);
    }
  }

  /* ---- C. IMTIYOZ OSHIRISHGA URINISH ----------------------------- */
  console.log('\n== C. Mijoz imtiyozini oshirishga urinadi ==');
  {
    // So'rov HTTP darajasida muvaffaqiyatli bo'lishi MUMKIN — muhimi natija.
    await customer.from('profiles').update({ role: 'admin' }).eq('id', customerId);
    const { data: prof } = await customer
      .from('profiles').select('role').eq('id', customerId).single();
    assert(prof?.role === 'customer',
      'HTTP orqali ham o\'zini admin qila olmadi (trigger tikladi)',
      `olindi: ${prof?.role}`);
  }

  /* ---- D. MIJOZ ADMIN RPC'sini CHAQIRADI ------------------------- */
  console.log('\n== D. Mijoz admin RPC chaqiradi ==');
  if (createdOrderIds.length) {
    const { error } = await customer.rpc('set_order_status', {
      p_order_id: createdOrderIds[0], p_status: 'Yetkazildi',
    });
    assert(error && /FORBIDDEN/.test(error.message),
      'mijoz set_order_status chaqira olmadi (FORBIDDEN)',
      error ? error.message : 'xato KUTILGAN edi');
  } else {
    assert(false, 'D: sinash uchun buyurtma yo\'q (B bosqichi muvaffaqiyatsiz)');
  }

  /* ---- E. ADMIN --------------------------------------------------- */
  console.log('\n== E. Admin ==');
  const { client: admin } = await signIn(CFG.admin, 'admin');
  if (createdOrderIds.length) {
    const { error } = await admin.rpc('set_order_status', {
      p_order_id: createdOrderIds[0], p_status: 'Qabul qilindi',
    });
    assert(!error, 'admin buyurtma holatini o\'zgartira oldi', error?.message);

    // Holatlar mashinasi HTTP orqali ham amal qiladi.
    const { error: skipErr } = await admin.rpc('set_order_status', {
      p_order_id: createdOrderIds[0], p_status: 'Yetkazildi',
    });
    assert(skipErr && /INVALID_TRANSITION/.test(skipErr.message),
      'bosqichni sakrab o\'tish HTTP orqali ham taqiqlanadi',
      skipErr ? skipErr.message : 'xato KUTILGAN edi');
  }

  /* ---- F. BLOKLANGAN MIJOZ --------------------------------------- */
  console.log('\n== F. Bloklangan mijoz ==');
  {
    const { client: blocked } = await signIn(CFG.blocked, 'bloklangan mijoz');
    const { error } = await blocked.rpc('create_order', {
      p_customer_name: `${marker} Bloklangan`,
      p_phone: '+998900000000',
      p_address: 'Toshkent, Test 1',
      p_latitude: null,
      p_longitude: null,
      p_items: [{ product_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      p_checkout_request_id: crypto.randomUUID(),
      p_payment_method: 'Naqd pul',
      p_city: 'Toshkent',
      p_note: null,
      p_email: null,
    });
    assert(error && /ACCOUNT_BLOCKED/.test(error.message),
      'bloklangan hisob buyurtma bera olmadi (ACCOUNT_BLOCKED)',
      error ? error.message : 'xato KUTILGAN edi');
  }

  /* ---- Tozalash --------------------------------------------------- */
  console.log('\n== Tozalash ==');
  /*
   * HTTP testini SQL to'plamidagidek `rollback` bilan o'rab bo'lmaydi —
   * har bir so'rov o'z tranzaksiyasida COMMIT bo'ladi. Shuning uchun
   * yaratilgan qatorlar aniq belgilanadi va bu yerda bekor qilinadi.
   *
   * Buyurtmani O'CHIRA olmaymiz (mijozda DELETE huquqi yo'q — bu to'g'ri).
   * Buning o'rniga uni BEKOR QILAMIZ: ombor qaytadi va ma'lumot
   * "test" sifatida ko'rinib turadi.
   */
  for (const id of createdOrderIds) {
    const { error } = await admin.rpc('set_order_status', { p_order_id: id, p_status: 'Bekor qilindi' });
    console.log(error ? `  · ${id} bekor qilinmadi: ${error.message}` : `  · ${id} bekor qilindi (ombor qaytdi)`);
  }
  console.log(`  · Test qatorlari "${marker}" belgisi bilan topiladi`);

  /* ---- Natija ----------------------------------------------------- */
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

main().catch((err) => {
  console.error('\nKUTILMAGAN XATO:', err.message);
  process.exit(1);
});
