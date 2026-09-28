/*
============================================================================
 BUYURTMA YAXLITLIGI — INTEGRATSIYA TESTLARI
============================================================================

 HOLATI: YOZILGAN, LEKIN HALI ISHGA TUSHIRILMAGAN.
 Ularni yozgan muhitda Docker ham, psql ham, mahalliy Postgres ham yo'q edi,
 produksiya bazasi esa test maydoni EMAS. Shuning uchun bu fayl "o'tdi" deb
 belgilanmagan — uni siz ishga tushirasiz.

 QANDAY ISHGA TUSHIRILADI (produksiyada EMAS):

     supabase start                 # mahalliy Postgres (Docker kerak)
     supabase db reset              # barcha migratsiyalarni toza qo'llaydi
     psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
          -v ON_ERROR_STOP=1 -f supabase/tests/order_integrity_test.sql

 Har bir tekshiruv muvaffaqiyatsiz bo'lsa `raise exception` bilan to'xtaydi,
 ya'ni skript jim turib "o'tdi" deb ko'rsata olmaydi. Oxirida "ALL TESTS
 PASSED" chiqsa — hammasi o'tgan.

 Skript o'zidan keyin TOZALAYDI: barcha ma'lumot bitta tranzaksiyada
 yaratiladi va oxirida `rollback` qilinadi.
============================================================================
*/

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Yordamchi: tekshiruv
-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAILED: %', p_label;
  end if;
  raise notice '  ok — %', p_label;
end; $$;

create or replace function pg_temp.assert_raises(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'FAILED: % — kutilgan "%", olindi "%"', p_label, p_expected, sqlerrm;
    end if;
    raise notice '  ok — % (% qaytardi)', p_label, p_expected;
    return;
  end;
  raise exception 'FAILED: % — xato KUTILGAN edi ("%"), lekin muvaffaqiyatli tugadi', p_label, p_expected;
end; $$;

/*
 * SQLSTATE bo'yicha tekshiruv — xato MATNI bo'yicha emas.
 *
 * NEGA KERAK. Ruxsat rad etilishi ikki xil ko'rinishda keladi:
 *   — "permission denied for function …"                (GRANT qatlami)
 *   — "new row violates row-level security policy …"    (RLS qatlami)
 * Ikkalasining ham SQLSTATE'i bir xil: 42501 (insufficient_privilege).
 *
 * Matn bo'yicha solishtirish ikki sababdan mo'rt: server locale'iga
 * bog'liq va Postgres versiyalari orasida o'zgarishi mumkin. SQLSTATE esa
 * standart bilan qat'iy belgilangan.
 */
create or replace function pg_temp.assert_sqlstate(p_sql text, p_state text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'FAILED: % — kutilgan SQLSTATE %, olindi % (%)',
        p_label, p_state, sqlstate, sqlerrm;
    end if;
    raise notice '  ok — % (SQLSTATE %)', p_label, p_state;
    return;
  end;
  raise exception 'FAILED: % — xato KUTILGAN edi (SQLSTATE %), lekin muvaffaqiyatli tugadi',
    p_label, p_state;
end; $$;

/*
 * Amalni bajarishga URINADI va xatoni yutadi.
 *
 * Xavfsizlik kafolatini "xato chiqdimi" bilan emas, AMALDAN KEYINGI
 * HOLAT bilan tekshirish kerak bo'lgan joylar uchun: ba'zi himoyalar
 * xato bermaydi (trigger jimgina tiklaydi), ba'zilari esa 0 qator
 * o'zgartiradi. Ikkalasida ham muhimi — natija o'zgarmagani.
 */
create or replace function pg_temp.try_silently(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
exception when others then
  null;
end; $$;

-- ---------------------------------------------------------------------------
-- Sxema shartnomasi
-- ---------------------------------------------------------------------------
/*
 * NEGA BU ENG BOSHIDA TURADI.
 *
 * Birinchi ishga tushirishda test 89-qatorda quyidagi xato bilan yiqilgan edi:
 *
 *     ERROR: column "is_admin" of relation "profiles" does not exist
 *
 * Sabab: test `profiles.is_admin` USTUNI bor deb hisoblagan edi. Aslida
 * bunday ustun HECH QACHON bo'lmagan — admin roli `profiles.role` da
 * saqlanadi (`check (role in ('customer','admin'))`), `is_admin` esa
 * faqat FUNKSIYA: `public.is_admin()`.
 *
 * Chalkashlik manbai: frontend'dagi `Profile.is_admin` maydoni bazadan
 * emas, `src/lib/auth.tsx` da `row.role === 'admin'` dan HOSIL QILINADI.
 * Ya'ni TypeScript shakli bilan SQL sxemasi ataylab har xil.
 *
 * Shu tekshiruv sxema kutilganidan farq qilsa, xatoni seed ichidagi
 * tushunarsiz "column does not exist" o'rniga ANIQ xabar bilan beradi.
 */
do $$
begin
  perform pg_temp.assert(
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles'
              and column_name = 'role'),
    'profiles.role mavjud — admin roli AYNAN shu ustunda saqlanadi');

  perform pg_temp.assert(
    not exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'profiles'
                  and column_name = 'is_admin'),
    'profiles.is_admin USTUNI yo''q (bo''lishi ham kerak emas — is_admin() funksiya)');

  perform pg_temp.assert(
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'is_admin'),
    'public.is_admin() funksiyasi mavjud');
end $$;

-- ---------------------------------------------------------------------------
-- Test ma'lumotlari
-- ---------------------------------------------------------------------------
do $$
declare v_cat uuid; v_user uuid := '00000000-0000-4000-8000-000000000001';
begin
  -- auth.users ga to'g'ridan-to'g'ri yozamiz (mahalliy muhitda mumkin).
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, aud, role)
  values (v_user, 'test-customer@example.invalid', '', now(), now(), now(),
          '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- Trigger profil yaratmagan bo'lsa — qo'lda.
  -- `role` — admin huquqining YAGONA manbai (`is_admin` degan ustun yo'q).
  insert into public.profiles (id, role, is_active)
  values (v_user, 'customer', true)
  on conflict (id) do update
  set is_active = true, role = 'customer';

  insert into public.categories (id, name, slug, is_active, sort_order)
  values ('00000000-0000-4000-8000-0000000000c1', 'Test kategoriya', 'test-kategoriya', true, 0)
  returning id into v_cat;

  -- Qoldig'i ATAYLAB 5: yig'indi tekshiruvini sinash uchun.
  insert into public.products (id, category_id, name, slug, brand, description, price, stock, sku, is_active)
  values ('00000000-0000-4000-8000-0000000000a1', v_cat, 'Test telefon', 'test-telefon',
          'TestBrand', 'tavsif', 1000000, 5, 'SKU-1', true);

  insert into public.product_variants (id, product_id, type, value, sort_order, is_active, stock, price_adjustment)
  values
    ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'color', 'Qora', 0, true, null, 0),
    ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'color', 'Oq',   1, true, null, 50000);
end $$;

-- Foydalanuvchi sifatida ishlash uchun JWT claim'ini o'rnatamiz.
-- `create_order` `auth.uid()` ga tayanadi.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ===========================================================================
-- 0. OVERLOAD RUXSATI (imzolar to'qnashmasligi)
-- ===========================================================================
/*
 * NEGA ALOHIDA BO'LIM.
 *
 * Migratsiya ATAYLAB ikkita `create_order` va ikkita `create_order_as`
 * qoldiradi (eski moslik qobig'i + yangi, kalitli variant). Bu deploy
 * xavfsizligi uchun kerak, LEKIN ikkita xavf tug'diradi:
 *
 *   42P13 — standart qiymatlidan keyin standart qiymatsiz parametr.
 *           Aynan shu xato birinchi urinishda migratsiyani yiqitgan edi:
 *           `p_checkout_request_id` ro'yxat OXIRIDA turgan edi.
 *
 *   42725 — "function is not unique": chaqiruv ikkala overload'ga
 *           mos kelsa. Bu FAQAT ish vaqtida, haqiqiy xaridorda ko'rinardi.
 *
 * Quyidagi tekshiruvlar ikkalasini ham mashina darajasida qulflaydi.
 */
\echo '== 0. Overload ruxsati =='

do $$
declare v_count integer;
begin
  -- Ikkala overload ham MAVJUD bo'lishi kerak.
  select count(*) into v_count from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_order';
  perform pg_temp.assert(v_count = 2, 'create_order: aynan 2 ta overload (eski qobiq + yangi)');

  select count(*) into v_count from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_order_as';
  perform pg_temp.assert(v_count = 2, 'create_order_as: aynan 2 ta overload');

  -- Yangi imzoda kalit `jsonb` (p_items) dan KEYIN turishi shart:
  -- oxirida turgan holat 42P13 bilan yiqiladi.
  --
  -- MUHIM (2026-09-05 da tuzatilgan): `pg_get_function_identity_arguments()`
  -- har bir argument uchun NOM + TUR qaytaradi (masalan
  -- "p_customer_name text"), FAQAT TUR emas. Avvalgi versiya bu yerda
  -- faqat tur-ro'yxatini kutgan edi ("text, text, ...") va shu sababli
  -- OpenShop-Test'da signature HAQIQATDA to'g'ri bo'lsa ham test yiqilar
  -- edi (parametr nomlari solishtiruvga aralashib ketgani uchun).
  -- Tuzatish: `pg_proc.proargtypes` dan bevosita, NOMGA BOG'LIQ BO'LMAGAN
  -- tur-ro'yxatini chiqaramiz — parametr nomi keyin o'zgarsa ham test
  -- buzilmaydi, faqat tur va tartib tekshiriladi (asl niyat aynan shu edi).
  perform pg_temp.assert(
    (select string_agg(format_type(u.t, null), ', ' order by u.o)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            lateral unnest(p.proargtypes) with ordinality as u(t, o)
      where n.nspname='public' and p.proname='create_order' and p.pronargs = 11)
    = 'text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text',
    'create_order(11): p_checkout_request_id jsonb dan keyin, standart qiymatlilardan oldin (tur ketma-ketligi)');

  perform pg_temp.assert(
    (select string_agg(format_type(u.t, null), ', ' order by u.o)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            lateral unnest(p.proargtypes) with ordinality as u(t, o)
      where n.nspname='public' and p.proname='create_order_as' and p.pronargs = 12)
    = 'uuid, text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text',
    'create_order_as(12): kalit to''g''ri o''rinda (tur ketma-ketligi)');
end $$;

/*
 * ENG MUHIM TEKSHIRUV: 10 ta NOMLI argument bilan chaqiruv (ya'ni eski,
 * keshdagi frontend) NOANIQLIK bermasligi kerak. Agar `p_checkout_request_id`
 * ga `default null` berilsa, aynan shu chaqiruv `42725` bilan yiqiladi.
 */
do $$
declare v_order uuid;
begin
  v_order := public.create_order(
    p_customer_name  => 'Eski Mijoz',
    p_phone          => '+998901234567',
    p_address        => 'Toshkent, Test ko''chasi 1',
    p_latitude       => null,
    p_longitude      => null,
    p_items          => jsonb_build_array(jsonb_build_object(
                          'product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
    p_payment_method => 'Naqd pul',
    p_city           => 'Toshkent',
    p_note           => null,
    p_email          => null
  );
  perform pg_temp.assert(v_order is not null,
    '10 nomli argument (ESKI frontend) noaniqliksiz ishlaydi');

  -- Eski yo'l idempotentlik kalitisiz ishlaydi, lekin COD tuzatishi
  -- baribir qo'llanishi kerak — moslik qobig'i yangi mantiqni chaqiradi.
  perform pg_temp.assert(
    (select payment_status from public.orders where id = v_order) = 'COD_PENDING',
    'eski qobiq ham COD_PENDING yozadi (yangi mantiqqa yo''naltirilgan)');
  perform pg_temp.assert(
    (select checkout_request_id from public.orders where id = v_order) is null,
    'eski qobiq kalitsiz buyurtma yaratadi');
end $$;

-- 11 ta nomli argument (YANGI frontend) ham noaniqliksiz ishlashi kerak.
do $$
declare v_order uuid;
begin
  v_order := public.create_order(
    p_customer_name       => 'Yangi Mijoz',
    p_phone               => '+998901234567',
    p_address             => 'Toshkent, Test ko''chasi 1',
    p_latitude            => null,
    p_longitude           => null,
    p_items               => jsonb_build_array(jsonb_build_object(
                               'product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
    p_checkout_request_id => '00000000-0000-4000-8000-00000000e000'::uuid,
    p_payment_method      => 'Naqd pul',
    p_city                => 'Toshkent',
    p_note                => null,
    p_email               => null
  );
  perform pg_temp.assert(v_order is not null,
    '11 nomli argument (YANGI frontend) noaniqliksiz ishlaydi');
  perform pg_temp.assert(
    (select checkout_request_id from public.orders where id = v_order)
      = '00000000-0000-4000-8000-00000000e000'::uuid,
    'yangi yo''lda kalit saqlanadi');
end $$;

/*
 * 0-BO'LIMDAN KEYIN DUNYONI SEED HOLATIGA QAYTARAMIZ.
 *
 * Yuqoridagi ikki tekshiruv 2 dona mahsulot sotib oldi (5 → 3). Keyingi
 * bo'limlar esa qoldiq AYNAN 5 ekaniga tayanadi ("5 → 4", "yig'indi 6 > 5"
 * kabi aniq sonlar bilan). Tozalamasak, 0-bo'lim qo'shilgani uchun
 * ALOQASI YO'Q testlar yiqilardi va sabab tushunarsiz bo'lardi.
 *
 * RLS mijozga `orders` dan o'chirishga ruxsat bermaydi — shuning uchun
 * vaqtincha `postgres` roliga o'tamiz, keyin mijoz kontekstini tiklaymiz.
 */
set local role postgres;
do $$
begin
  delete from public.order_items where order_id in (
    select id from public.orders where customer_name in ('Eski Mijoz', 'Yangi Mijoz'));
  delete from public.orders where customer_name in ('Eski Mijoz', 'Yangi Mijoz');
  update public.products set stock = 5 where id = '00000000-0000-4000-8000-0000000000a1';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ===========================================================================
-- 1. IDEMPOTENTLIK
-- ===========================================================================
\echo '== 1. Idempotentlik =='

do $$
declare v_first uuid; v_second uuid; v_key uuid := '00000000-0000-4000-8000-00000000e001';
begin
  v_first := public.create_order(
    'Test Mijoz', '+998901234567', 'Toshkent, Test ko''chasi 1', null, null,
    jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-4000-8000-0000000000a1', 'quantity', 1)),
    v_key, 'Naqd pul', 'Toshkent', null, null
  );

  -- AYNAN SHU kalit bilan qayta yuborish (ikki marta bosish / tarmoq qayta urinishi)
  v_second := public.create_order(
    'Test Mijoz', '+998901234567', 'Toshkent, Test ko''chasi 1', null, null,
    jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-4000-8000-0000000000a1', 'quantity', 1)),
    v_key, 'Naqd pul', 'Toshkent', null, null
  );

  perform pg_temp.assert(v_first = v_second, 'takroriy so''rov AYNAN o''sha buyurtmani qaytaradi');
  perform pg_temp.assert(
    (select count(*) from public.orders where checkout_request_id = v_key) = 1,
    'ikkinchi buyurtma YARATILMAYDI'
  );
  perform pg_temp.assert(
    (select stock from public.products where id = '00000000-0000-4000-8000-0000000000a1') = 4,
    'ombor FAQAT BIR MARTA kamayadi (5 → 4)'
  );
end $$;

-- ===========================================================================
-- 2. COD TO'LOV HOLATI
-- ===========================================================================
\echo '== 2. COD to''lov hayot sikli =='

do $$
declare v_order uuid;
begin
  select id into v_order from public.orders where checkout_request_id = '00000000-0000-4000-8000-00000000e001';

  perform pg_temp.assert(
    (select payment_status from public.orders where id = v_order) = 'COD_PENDING',
    'naqd buyurtma PAID emas, COD_PENDING bilan boshlanadi'
  );
end $$;

-- ===========================================================================
-- 3. OMBOR: YIG'INDI BO'YICHA TEKSHIRUV (bir mahsulotning ikki varianti)
-- ===========================================================================
\echo '== 3. Ombor yig''indisi =='

-- Qoldiq hozir 4. Ikkita variant × 3 dona = 6 > 4 → OUT_OF_STOCK bo'lishi shart.
-- Ilgari har bir pozitsiya alohida tekshirilar (3 <= 4 ✓, 3 <= 4 ✓) va keyin
-- `products_stock_check` cheklovi buzilib, mijoz tushunarsiz baza xatosini
-- ko'rardi.
do $$
begin
  perform pg_temp.assert_raises($sql$
    select public.create_order(
      'Test Mijoz', '+998901234567', 'Toshkent, Test ko''chasi 1', null, null,
      jsonb_build_array(
        jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',3,
                           'variant_id','00000000-0000-4000-8000-0000000000b1'),
        jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',3,
                           'variant_id','00000000-0000-4000-8000-0000000000b2')
      ),
      '00000000-0000-4000-8000-00000000e002'::uuid, 'Naqd pul', 'Toshkent', null, null
    )
  $sql$, 'OUT_OF_STOCK', 'bir mahsulotning ikki varianti YIG''INDI bo''yicha tekshiriladi');

  perform pg_temp.assert(
    (select stock from public.products where id = '00000000-0000-4000-8000-0000000000a1') = 4,
    'muvaffaqiyatsiz buyurtma omborni o''zgartirmaydi'
  );
end $$;

-- ===========================================================================
-- 4. NARX SERVERDA HISOBLANADI
-- ===========================================================================
\echo '== 4. Narx manipulyatsiyasi =='

do $$
declare v_order uuid; v_total numeric;
begin
  -- Mijoz "narx" yuborishga urinadi — funksiya uni UMUMAN qabul qilmaydi.
  v_order := public.create_order(
    'Test Mijoz', '+998901234567', 'Toshkent, Test ko''chasi 1', null, null,
    jsonb_build_array(jsonb_build_object(
      'product_id','00000000-0000-4000-8000-0000000000a1','quantity',1,
      'variant_id','00000000-0000-4000-8000-0000000000b2',   -- +50 000
      'price', 1, 'unit_price', 1, 'total', 1                 -- e'tiborga OLINMAYDI
    )),
    '00000000-0000-4000-8000-00000000e003'::uuid, 'Naqd pul', 'Toshkent', null, null
  );

  select unit_price into v_total from public.order_items where order_id = v_order;
  perform pg_temp.assert(v_total = 1050000,
    'narx bazadan olinadi (1 000 000 + variant 50 000), mijozdan emas');
end $$;

-- ===========================================================================
-- 5. HOLATLAR MASHINASI
-- ===========================================================================
\echo '== 5. Holatlar mashinasi =='

set local role postgres;   -- admin amallari uchun
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare v_order uuid;
begin
  select id into v_order from public.orders where checkout_request_id = '00000000-0000-4000-8000-00000000e003';

  -- Yangi → Yetkazildi: bosqichlarni sakrab o'tish TAQIQLANADI.
  perform pg_temp.assert_raises(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'Yetkazildi'),
    'INVALID_TRANSITION', 'Yangi → Yetkazildi taqiqlanadi');

  -- To'g'ri zanjir
  perform public.set_order_status(v_order, 'Qabul qilindi');
  perform public.set_order_status(v_order, 'Tayyorlanmoqda');
  perform public.set_order_status(v_order, 'Yetkazilmoqda');
  perform public.set_order_status(v_order, 'Yetkazildi');
  perform pg_temp.assert(
    (select status from public.orders where id = v_order) = 'Yetkazildi',
    'to''g''ri zanjir bo''ylab o''tish ishlaydi');

  -- COD: yetkazilgach PAID bo'ladi
  perform pg_temp.assert(
    (select payment_status from public.orders where id = v_order) = 'PAID',
    'COD "Yetkazildi" da PAID ga o''tadi');

  -- Yetkazildi — yakuniy
  perform pg_temp.assert_raises(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'Yangi'),
    'INVALID_TRANSITION', 'Yetkazildi YAKUNIY (orqaga qaytmaydi)');
end $$;

-- ===========================================================================
-- 6. BEKOR QILISH: OMBOR ANIQ BIR MARTA QAYTADI
-- ===========================================================================
\echo '== 6. Bekor qilish va ombor =='

do $$
declare v_order uuid; v_stock_before integer; v_stock_after integer;
begin
  select id into v_order from public.orders where checkout_request_id = '00000000-0000-4000-8000-00000000e001';
  select stock into v_stock_before from public.products where id = '00000000-0000-4000-8000-0000000000a1';

  perform public.set_order_status(v_order, 'Bekor qilindi');
  select stock into v_stock_after from public.products where id = '00000000-0000-4000-8000-0000000000a1';
  perform pg_temp.assert(v_stock_after = v_stock_before + 1, 'bekor qilishda ombor qaytadi');

  -- IKKINCHI marta bekor qilish: bu XATO EMAS.
  --
  -- MUHIM (2026-09-05 da tuzatilgan): avvalgi versiya bu yerda
  -- INVALID_TRANSITION xato KUTAR edi. Bu app dizayniga zid ekan:
  -- `order_status_transition_allowed(p_from, p_to)` (20260909000000-
  -- migratsiya, 141-qator) ATAYLAB `p_from = p_to` holatini har doim
  -- ruxsat etilgan deb belgilaydi — izohida aynan shunday yozilgan:
  -- "o'zgarishsiz saqlash zararsiz". `set_order_status` esa xuddi shu
  -- holatda darhol `return` qiladi (178-qator), `stock_restored` bayrog'i
  -- esa (allaqachon bekor qilingan bo'lsa ham) omborni qayta oshirishga
  -- yo'l qo'ymaydi. Ya'ni takroriy bekor qilish — ATAYLAB, XAVFSIZ,
  -- IDEMPOTENT no-op (xuddi 7-bo'limdagi `cancel_own_order` kabi),
  -- xato emas. Avvalgi test bu qasddan qilingan dizaynni "nuqson" deb
  -- xato talqin qilgan edi — ilova kodida hech narsa noto'g'ri emas.
  perform public.set_order_status(v_order, 'Bekor qilindi');
  perform pg_temp.assert(
    (select status from public.orders where id = v_order) = 'Bekor qilindi',
    'takroriy bekor qilish xatosiz o''tadi (ataylab idempotent no-op)');

  perform pg_temp.assert(
    (select stock from public.products where id = '00000000-0000-4000-8000-0000000000a1') = v_stock_after,
    'ombor IKKI MARTA qaytmaydi');

  perform pg_temp.assert(
    (select payment_status from public.orders where id = v_order) = 'CANCELLED',
    'bekor qilingan COD buyurtma CANCELLED bo''ladi');
end $$;

-- ===========================================================================
-- 7. MIJOZNING O'Z BEKOR QILISHI
-- ===========================================================================
\echo '== 7. cancel_own_order =='

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare v_order uuid; v_stock integer;
begin
  v_order := public.create_order(
    'Test Mijoz', '+998901234567', 'Toshkent, Test ko''chasi 1', null, null,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
    '00000000-0000-4000-8000-00000000e004'::uuid, 'Naqd pul', 'Toshkent', null, null
  );
  select stock into v_stock from public.products where id = '00000000-0000-4000-8000-0000000000a1';

  perform public.cancel_own_order(v_order);
  perform pg_temp.assert(
    (select stock from public.products where id = '00000000-0000-4000-8000-0000000000a1') = v_stock + 1,
    'o''z buyurtmasini bekor qilganda ombor qaytadi');

  -- Takroriy chaqiruv — zararsiz (idempotent), ombor oshmaydi.
  perform public.cancel_own_order(v_order);
  perform pg_temp.assert(
    (select stock from public.products where id = '00000000-0000-4000-8000-0000000000a1') = v_stock + 1,
    'takroriy bekor qilish omborni IKKI MARTA oshirmaydi');
end $$;

-- ===========================================================================
-- 8. RLS / HUQUQ HUJUMLARI
-- ===========================================================================
\echo '== 8. RLS hujumlari =='

do $$
declare v_n integer;
begin
  /*
   * 8.1 IMTIYOZ OSHIRISH — himoya XATO BERMAYDI, jimgina TIKLAYDI.
   *
   * `protect_profile_privileged_fields` triggeri (20260903000000) admin
   * bo'lmagan so'rovda `new.role := old.role` deb eski qiymatni qaytaradi.
   * UPDATE muvaffaqiyatli tugaydi va HECH QANDAY xato chiqmaydi.
   *
   * Shuning uchun "exception kutish" NOTO'G'RI test bo'lardi — u himoya
   * mexanizmini emas, umuman boshqa narsani tekshirardi. To'g'ri tekshiruv:
   * amaldan KEYIN qiymat o'zgarmaganini isbotlash.
   *
   * (Avvalgi variant `assert_raises(..., '', ...)` ishlatgan edi. Bu
   * yashirin nuqsonli: `position('' in sqlerrm)` HAR DOIM 1 qaytaradi,
   * ya'ni `= 0` hech qachon rost bo'lmaydi va tekshiruv ISTALGAN xatoni
   * "o'tdi" deb qabul qilardi — jumladan biz izlayotgan xatoni ham.)
   */
  update public.profiles set role = 'admin' where id = auth.uid();

  perform pg_temp.assert(
    (select role from public.profiles where id = '00000000-0000-4000-8000-000000000001') = 'customer',
    'foydalanuvchi o''zini ADMIN qila olmaydi — role ''customer'' bo''lib qoladi');

  perform pg_temp.assert(not public.is_admin(),
    'is_admin() hamon false — huquq haqiqatan oshmadi');

  -- Trigger `is_active` ni ham himoya qiladi: uni ham tekshiramiz.
  update public.profiles set is_active = false where id = auth.uid();
  perform pg_temp.assert(
    (select is_active from public.profiles where id = '00000000-0000-4000-8000-000000000001') is true,
    'foydalanuvchi o''z is_active ustunini o''zgartira olmaydi');

  -- Rol berish funksiyasi brauzerdan (authenticated) chaqirib bo'lmaydi.
  perform pg_temp.assert_raises($sql$
    select public.set_user_role('test-customer@example.invalid', 'admin')
  $sql$, 'permission denied', 'set_user_role authenticated uchun YOPIQ');

  -- 8.2 Mahsulot narxini o'zgartira olmaydi.
  --
  -- MUHIM (2026-09-05 da tuzatilgan): avvalgi versiya `select count(*)
  -- from (update ... returning 1) t` shaklini ishlatgan edi. Bu SINTAKSIS
  -- XATOSI edi — PostgreSQL'da yalang'och UPDATE'ni FROM ichida quyi
  -- so'rov sifatida ishlatib bo'lmaydi ("syntax error at or near ."),
  -- bu haqiqiy TEST loyihasida ishga tushirilganda darhol yiqilgan edi.
  -- Tuzatish: ma'lumot-o'zgartiruvchi WITH (CTE) ni ALOHIDA, YUQORI
  -- DARAJADAGI bayonot sifatida ishlatib, natijani o'zgaruvchiga o'qiymiz
  -- ("WITH clause containing a data-modifying statement must be at the
  -- top level" — uni assert() ichiga ichma-ich joylab bo'lmaydi).
  with t as (
    update public.products set price = 1
    where id = '00000000-0000-4000-8000-0000000000a1' returning 1
  )
  select count(*) into v_n from t;
  perform pg_temp.assert(v_n = 0, 'mijoz mahsulot narxini o''zgartira olmaydi (0 qator)');

  -- 8.3 Buyurtma summasini o'zgartira olmaydi.
  with t as (
    update public.orders set total_amount = 1 where user_id = auth.uid() returning 1
  )
  select count(*) into v_n from t;
  perform pg_temp.assert(v_n = 0, 'mijoz buyurtma summasini o''zgartira olmaydi (0 qator)');

  -- 8.4 `create_order_as` bilan boshqa odam nomidan buyurtma bera olmaydi.
  perform pg_temp.assert_raises($sql$
    select public.create_order_as(
      '00000000-0000-4000-8000-0000000000ff'::uuid,
      'Boshqa', '+998900000000', 'Manzil 1', null, null,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      null::uuid, 'Naqd pul', 'Toshkent', null, null)
  $sql$, 'permission denied', 'create_order_as authenticated uchun YOPIQ');

  -- 8.5 Holatni o'zgartira olmaydi (admin emas).
  perform pg_temp.assert_raises($sql$
    select public.set_order_status(
      (select id from public.orders where user_id = auth.uid() limit 1), 'Yetkazildi')
  $sql$, 'FORBIDDEN', 'oddiy foydalanuvchi buyurtma holatini o''zgartira olmaydi');
end $$;

-- ===========================================================================
-- 9. BLOKLANGAN HISOB
-- ===========================================================================
\echo '== 9. Bloklangan hisob =='

-- Rolni DO blokidan TASHQARIDA almashtiramiz: blok ichida `set local role`
-- keyingi buyruqlarga kutilganidek ta'sir qilmasligi mumkin.
/*
 * DIQQAT: `set local role postgres` NING O'ZI YETARLI EMAS.
 *
 * `protect_profile_privileged_fields` triggeri Postgres ROLINI emas,
 * `request.jwt.claims` dagi rolni o'qiydi:
 *
 *     if v_role in ('authenticated','anon') and not public.is_admin() then
 *       new.is_active := old.is_active;   -- jimgina tiklanadi
 *
 * Yuqorida (7-bo'limda) claims `"role":"authenticated"` qilib qo'yilgan.
 * Uni tozalamasdan turib `is_active = false` yozsak, trigger uni DARHOL
 * `true` ga qaytarardi — hisob BLOKLANMAY qolar va 9-bo'lim
 * "ACCOUNT_BLOCKED kutilgan edi" deb, sababi umuman boshqa joyda bo'lgan
 * holda yiqilardi.
 */
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000001';

-- Blok haqiqatan qo'llanganini TASDIQLAYMIZ — aks holda quyidagi test
-- noto'g'ri sababdan yiqilardi.
do $$
begin
  perform pg_temp.assert(
    (select is_active from public.profiles where id = '00000000-0000-4000-8000-000000000001') is false,
    'hisob haqiqatan bloklandi (service_role claims bilan)');
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  perform pg_temp.assert_raises($sql$
    select public.create_order(
      'Test Mijoz', '+998901234567', 'Toshkent, Test 1', null, null,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      '00000000-0000-4000-8000-00000000e009'::uuid, 'Naqd pul', 'Toshkent', null, null)
  $sql$, 'ACCOUNT_BLOCKED', 'bloklangan hisob buyurtma bera olmaydi');
end $$;

-- ===========================================================================
-- 10. ANONIM (TIZIMGA KIRMAGAN) FOYDALANUVCHI
-- ===========================================================================
/*
 * ARXITEKTURA — HIMOYA IKKI QATLAMLI, VA BIRINCHISI GRANT.
 *
 * Ko'pchilik `create_order` anonim so'rovda `AUTH_REQUIRED` qaytaradi deb
 * o'ylaydi. Bu NOTO'G'RI: anonim chaqiruv funksiya TANASIGA umuman
 * yetib bormaydi.
 *
 *   1-qatlam (GRANT):  revoke execute … from anon;
 *                      grant  execute … to authenticated;
 *                      → `anon` da EXECUTE yo'q → 42501 permission denied
 *
 *   2-qatlam (tana):   if auth.uid() is null then raise 'AUTH_REQUIRED'
 *                      → faqat rol `authenticated` bo'lib, `sub` claim
 *                        yo'q bo'lganda ishlaydi (11-bo'limga qarang)
 *
 * NEGA AYNAN `from anon`, `from public` EMAS — QIMMATGA TUSHGAN DARS.
 *
 * Bu bo'lim birinchi ishga tushirilganda 42501 o'rniga P0001
 * (AUTH_REQUIRED) qaytardi, ya'ni anonim chaqiruv funksiya tanasiga
 * YETIB BORGAN edi. Sabab: Supabase har bir loyihada
 *
 *     alter default privileges in schema public
 *       grant all on functions to postgres, anon, authenticated, service_role;
 *
 * o'rnatadi — ya'ni `anon` EXECUTE ni TO'G'RIDAN-TO'G'RI oladi.
 * `revoke … from public` esa BOSHQA grantee'ni (PUBLIC) olib tashlaydi va
 * `anon` dagi to'g'ridan-to'g'ri huquqqa TEGMAYDI.
 *
 * Buni `20260910000000_revoke_anon_execute_privileged_functions.sql`
 * tuzatdi: u aynan `from anon` deb yozadi. Test O'ZGARTIRILMADI — u
 * boshidanoq to'g'ri kutgan edi, sxema esa unga mos kelmagan edi.
 *
 * DIQQAT: bu testni "AUTH_REQUIRED kutamiz" deb yozib, keyin uni
 * o'tkazish uchun `anon` ga EXECUTE berish — HAQIQIY XAVFSIZLIK
 * REGRESSIYASI bo'lardi. Shuning uchun bu yerda AYNAN 1-qatlam
 * tekshiriladi.
 */
\echo '== 10. Anonim foydalanuvchi =='

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  -- 10.1 Buyurtma yarata olmaydi (GRANT qatlami).
  perform pg_temp.assert_sqlstate($sql$
    select public.create_order(
      'Anon Hujum', '+998900000000', 'Manzil 1', null, null,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      null::uuid, 'Naqd pul', 'Toshkent', null, null)
  $sql$, '42501', 'anonim create_order chaqira OLMAYDI');

  -- 10.2 Boshqa odam nomidan ham yarata olmaydi.
  perform pg_temp.assert_sqlstate($sql$
    select public.create_order_as(
      '00000000-0000-4000-8000-000000000001'::uuid,
      'Anon Hujum', '+998900000000', 'Manzil 1', null, null,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      null::uuid, 'Naqd pul', 'Toshkent', null, null)
  $sql$, '42501', 'anonim create_order_as chaqira OLMAYDI');

  -- 10.4 Admin RPC — yopiq.
  perform pg_temp.assert_sqlstate($sql$
    select public.set_order_status('00000000-0000-4000-8000-00000000f001'::uuid, 'Yetkazildi')
  $sql$, '42501', 'anonim set_order_status chaqira OLMAYDI');

  -- 10.5 Rol berish funksiyasi — yopiq.
  perform pg_temp.assert_sqlstate($sql$
    select public.set_user_role('test-customer@example.invalid', 'admin')
  $sql$, '42501', 'anonim set_user_role chaqira OLMAYDI');

  /*
   * 10.3 / 10.6 — URINISHLAR. Xato chiqishi ham, 0 qator o'zgarishi ham
   * mumkin (jadval huquqi yo'qligiga yoki RLS'ga qarab). Ikkalasi ham
   * qabul qilinadi — HAQIQIY kafolat "natija o'zgarmadi" bo'lib, u
   * quyida `postgres` roli ostida tekshiriladi (pastdagi izohga qarang).
   */
  perform pg_temp.try_silently($sql$
    insert into public.orders (user_id, customer_name, phone, address, total_amount)
    values (null, 'ANON_HUJUM_MARKER', '+998900000000', 'Manzil', 1)
  $sql$);

  perform pg_temp.try_silently($sql$
    update public.products set price = 1 where id = '00000000-0000-4000-8000-0000000000a1'
  $sql$);

  -- 10.7 Boshqalarning buyurtmalarini KO'RA olmaydi.
  perform pg_temp.assert(
    (select count(*) from public.orders) = 0,
    'anonim foydalanuvchiga birorta buyurtma ko''rinmaydi');

  -- 10.8 Lekin OMMAVIY katalog ochiq qolishi kerak.
  -- Busiz test "anon hech narsa qila olmaydi" degan ma'nosiz holatni
  -- ham "o'tdi" deb ko'rsatardi.
  perform pg_temp.assert(
    (select count(*) from public.products where is_active) > 0,
    'anonim foydalanuvchi FAOL katalogni ko''ra oladi (ommaviy do''kon)');
end $$;

/*
 * NATIJANI `postgres` ROLI OSTIDA TEKSHIRAMIZ.
 *
 * MUHIM va e'tibordan qochishi oson: yuqoridagi tekshiruvni `anon`
 * ostida bajarib bo'lmaydi. RLS `anon` ga qatorlarni KO'RSATMAYDI, ya'ni
 * yozuv HAQIQATAN kirib qolgan bo'lsa ham `select … = 0` deb "o'tdi"
 * ko'rsatardi — bu soxta ishonch bo'lardi.
 */
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
begin
  perform pg_temp.assert(
    not exists (select 1 from public.orders where customer_name = 'ANON_HUJUM_MARKER'),
    'anonim INSERT bazaga TUSHMAGAN (postgres roli ostida tekshirildi)');

  perform pg_temp.assert(
    (select price from public.products where id = '00000000-0000-4000-8000-0000000000a1') = 1000000,
    'anonim foydalanuvchi mahsulot narxini o''zgartira olmadi');
end $$;

-- ===========================================================================
-- 11. AUTHENTICATED ROL, LEKIN `sub` CLAIM YO'Q  → 2-qatlam
-- ===========================================================================
/*
 * Bu 10-bo'limdan BOSHQA holat va boshqa himoya qatlamini tekshiradi.
 *
 * Rol `authenticated` — ya'ni GRANT qatlamidan O'TADI. Lekin JWT'da
 * `sub` yo'q, demak `auth.uid()` NULL. Aynan shu yerda funksiya
 * tanasidagi ikkinchi qatlam ishlashi kerak:
 *
 *     if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 *
 * Amalda bu buzuq/eskirgan tokenga mos keladi: PostgREST rolni beradi,
 * lekin foydalanuvchi identifikatori yo'q. Bunday so'rov hech qachon
 * "egasi yo'q" buyurtma yaratmasligi kerak.
 */
\echo '== 11. Authenticated, lekin sub claim yo''q =='

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';

do $$
begin
  perform pg_temp.assert(auth.uid() is null, 'auth.uid() NULL (sub claim yo''q)');

  perform pg_temp.assert_raises($sql$
    select public.create_order(
      'Subsiz', '+998900000000', 'Manzil 1', null, null,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      null::uuid, 'Naqd pul', 'Toshkent', null, null)
  $sql$, 'AUTH_REQUIRED', 'sub claim''siz chaqiruv AUTH_REQUIRED beradi');

  -- Eski (10 argumentli) moslik qobig'i ham xuddi shunday himoyalangan.
  perform pg_temp.assert_raises($sql$
    select public.create_order(
      p_customer_name => 'Subsiz',
      p_phone         => '+998900000000',
      p_address       => 'Manzil 1',
      p_latitude      => null,
      p_longitude     => null,
      p_items         => jsonb_build_array(jsonb_build_object(
                           'product_id','00000000-0000-4000-8000-0000000000a1','quantity',1)),
      p_payment_method=> 'Naqd pul',
      p_city          => 'Toshkent',
      p_note          => null,
      p_email         => null)
  $sql$, 'AUTH_REQUIRED', 'eski moslik qobig''i ham AUTH_REQUIRED beradi');
end $$;

-- ===========================================================================
-- 12. ADMIN_LIST_USERS — sahifalash va huquq
-- ===========================================================================
/*
 * Bu bo'lim `20260911000000_admin_list_users_pagination.sql` ni tekshiradi.
 *
 * Nima sinaladi:
 *   a) 1-sahifa;
 *   b) keyingi sahifa (yozuvlar TAKRORLANMAYDI va YO'QOLMAYDI);
 *   c) `total_count` filtrga mos JAMI sonni beradi;
 *   d) qidiruv/filtr + sahifalash birgalikda;
 *   e) admin bo'lmagan foydalanuvchi uchun YOPIQ.
 */
\echo '== 12. admin_list_users sahifalash =='

-- Sinov uchun bir nechta hisob. `auth.users` ga yozamiz, chunki funksiya
-- aynan shu jadvaldan o'qiydi (profilsiz hisoblar ham ko'rinishi kerak).
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare i integer;
begin
  for i in 1..7 loop
    insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data,
                            raw_user_meta_data, aud, role)
    values (
      ('00000000-0000-4000-8000-0000000009' || lpad(i::text, 2, '0'))::uuid,
      'pagetest' || i || '@example.invalid', '', now(),
      -- Har biriga har xil `created_at` — tartib aniq bo'lsin.
      now() - (i || ' minutes')::interval, now(),
      '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
    on conflict (id) do nothing;

    insert into public.profiles (id, role, is_active, first_name)
    values (
      ('00000000-0000-4000-8000-0000000009' || lpad(i::text, 2, '0'))::uuid,
      'customer', true, 'Sahifa' || i)
    on conflict (id) do update set first_name = excluded.first_name;
  end loop;
end $$;

-- Sinov foydalanuvchisini ADMIN qilamiz (faqat shu tranzaksiya ichida).
update public.profiles set role = 'admin'
  where id = '00000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_page1 uuid[]; v_page2 uuid[]; v_total bigint; v_rows integer;
begin
  perform pg_temp.assert(public.is_admin(), 'sinov foydalanuvchisi admin bo''ldi');

  -- (a) 1-sahifa: aynan 3 ta yozuv.
  select array_agg(t.id order by t.created_at desc), max(t.total_count), count(*)
    into v_page1, v_total, v_rows
    from public.admin_list_users(3, 0, null, 'all') t;
  perform pg_temp.assert(v_rows = 3, '1-sahifada AYNAN 3 ta yozuv (p_limit hurmat qilinadi)');

  -- (c) `total_count` — sahifadagi emas, JAMI son.
  perform pg_temp.assert(v_total > 3, 'total_count sahifa hajmidan katta (jami son qaytadi)');
  perform pg_temp.assert(
    v_total = (select count(*) from auth.users),
    'filtrsiz total_count barcha hisoblarga teng');

  -- (b) 2-sahifa: boshqa yozuvlar, kesishmasdan.
  select array_agg(t.id order by t.created_at desc), count(*)
    into v_page2, v_rows
    from public.admin_list_users(3, 3, null, 'all') t;
  perform pg_temp.assert(v_rows = 3, '2-sahifada ham 3 ta yozuv');
  perform pg_temp.assert(
    not (v_page1 && v_page2),
    'sahifalar KESISHMAYDI — yozuv takrorlanmaydi');

  -- (d) Qidiruv + sahifalash.
  select count(*), max(t.total_count) into v_rows, v_total
    from public.admin_list_users(100, 0, 'Sahifa', 'all') t;
  perform pg_temp.assert(v_rows = 7, 'qidiruv 7 ta sinov hisobini topadi');
  perform pg_temp.assert(v_total = 7, 'qidiruvda total_count ham filtrlangan');

  -- Qidiruv + CHEGARA birgalikda ishlaydi.
  select count(*), max(t.total_count) into v_rows, v_total
    from public.admin_list_users(2, 0, 'Sahifa', 'all') t;
  perform pg_temp.assert(v_rows = 2, 'qidiruv natijasi ham sahifalanadi');
  perform pg_temp.assert(v_total = 7, 'sahifalangan qidiruvda total_count TO''LIQ qoladi');

  -- Filtr: faqat adminlar.
  select count(*) into v_rows from public.admin_list_users(100, 0, null, 'admin') t;
  perform pg_temp.assert(v_rows >= 1, 'admin filtri ishlaydi');

  -- Mijoz yuborgan haddan tashqari katta `p_limit` cheklanadi.
  select count(*) into v_rows from public.admin_list_users(1000000, 0, null, 'all') t;
  perform pg_temp.assert(v_rows <= 100, 'p_limit 100 dan oshmaydi (sahifalashni chetlab bo''lmaydi)');

  -- Eski, argumentsiz imzo hamon ishlaydi (keshdagi mijozlar uchun).
  perform pg_temp.assert(
    (select count(*) from public.admin_list_users()) > 0,
    'eski argumentsiz imzo ishlashda davom etadi');
end $$;

-- (e) Admin BO'LMAGAN foydalanuvchi uchun yopiq.
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';
update public.profiles set role = 'customer'
  where id = '00000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  perform pg_temp.assert(not public.is_admin(), 'foydalanuvchi endi admin emas');

  perform pg_temp.assert_raises($sql$
    select * from public.admin_list_users(25, 0, null, 'all')
  $sql$, 'FORBIDDEN', 'admin bo''lmagan foydalanuvchi sahifalangan ro''yxatni OLA OLMAYDI');

  perform pg_temp.assert_raises($sql$
    select * from public.admin_list_users()
  $sql$, 'FORBIDDEN', 'eski imzo ham admin bo''lmaganlar uchun yopiq');
end $$;

-- Anonim uchun ham yopiq (GRANT qatlami).
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform pg_temp.assert_sqlstate($sql$
    select * from public.admin_list_users(25, 0, null, 'all')
  $sql$, '42501', 'anonim sahifalangan admin_list_users ni chaqira OLMAYDI');
end $$;

\echo ''
\echo '=========================================='
\echo ' ALL TESTS PASSED'
\echo '=========================================='

-- Hech narsa saqlanmaydi.
rollback;
