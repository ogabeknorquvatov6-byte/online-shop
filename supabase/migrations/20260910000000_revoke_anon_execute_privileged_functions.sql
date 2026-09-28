/*
# P2 — imtiyozli funksiyalardan `anon` EXECUTE huquqini olib tashlash

## Muammo

Supabase har bir loyihada quyidagi standart huquqni o'rnatadi:

    alter default privileges in schema public
      grant all on functions to postgres, anon, authenticated, service_role;

Ya'ni funksiya YARATILGAN ZAHOTI `anon` roliga EXECUTE TO'G'RIDAN-TO'G'RI
beriladi. Eski migratsiyalar esa faqat:

    revoke all on function public.<fn>(...) from public;

deb yozgan. `PUBLIC` va `anon` — BOSHQA-BOSHQA grantee'lar. `FROM PUBLIC`
degan revoke `anon` ga berilgan to'g'ridan-to'g'ri huquqni OLIB TASHLAMAYDI.

Natijada quyidagi olti funksiyada `anon` da EXECUTE saqlanib qolgan edi.

Buni `order_integrity_test.sql` ning 10-bo'limi aniqladi: anonim chaqiruv
kutilgan `42501 permission denied` o'rniga `P0001 AUTH_REQUIRED` qaytardi —
ya'ni chaqiruv funksiya TANASIGA yetib borgan.

## Bu ZAIFLIK EMAS — bu himoya QATLAMINING yo'qolishi

Oltala funksiya ham ichkarida himoyalangan va anonim foydalanuvchi
hech qanday amalni BAJARA OLMAGAN:

  create_order / create_cash_order / cancel_own_order
        → `if auth.uid() is null then raise 'AUTH_REQUIRED'`
  set_order_status
        → `if v_role <> 'service_role' and not is_admin() then raise 'FORBIDDEN'`
  admin_dashboard_stats
        → `case when not is_admin() then null` (ma'lumot QAYTARMAYDI)

Ya'ni ma'lumot sizib chiqmagan, ruxsatsiz yozuv bo'lmagan. Lekin
arxitektura IKKI qatlamli himoyani nazarda tutgan, amalda esa BITTA
ishlagan. Kelajakda kimdir ichki tekshiruvni o'zgartirsa, ikkinchi
to'siq bo'lmay qolardi. Bu migratsiya o'sha birinchi qatlamni tiklaydi.

## Nima QILINMAYDI

  — Standart huquqlar (`alter default privileges`) O'ZGARTIRILMAYDI.
    Ular butun loyihaga ta'sir qiladi; alohida qaror talab etadi.
  — `next_available_login()` ga TEGILMAYDI (alohida ko'rib chiqiladi).
  — OMMAVIY katalog funksiyalariga TEGILMAYDI — ular `anon` uchun
    ATAYLAB ochiq va sayt ularsiz ishlamaydi:
        active_promotion_discounts()   — bosh sahifadagi chegirmalar
        best_selling_products()        — "xit sotuvlar" bo'limi
        delivery_fee_for(text,numeric) — kirishdan oldin yetkazish narxi
        increment_product_view(uuid)   — mahsulot sahifasi ko'rishlari
  — Hech qanday funksiya qayta yaratilmaydi, imzo o'zgarmaydi,
    sxema tegilmaydi.

## Xavfsizligi

Bu migratsiya FAQAT huquq OLIB TASHLAYDI. U hech kimga yangi ruxsat
bermaydi, shuning uchun allaqachon ruxsat etilgan oqimni BUZA OLMAYDI:

  — Checkout: `CheckoutPage.tsx` `create_order` ni faqat foydalanuvchi
    tizimga kirgandan keyin chaqiradi (JWT roli `authenticated`).
  — Admin: `set_order_status`, `admin_dashboard_stats` — `authenticated`
    + `is_admin()`.
  — Telegram bot: `service_role` bilan ishlaydi.
*/

-- ============================================================
-- Buyurtma yaratish (ikkala overload)
-- ============================================================
revoke execute on function
  public.create_order(text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text)
  from anon;

revoke execute on function
  public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text)
  from anon;

-- Eski, `create_order` ga yo'naltiruvchi qobiq.
revoke execute on function
  public.create_cash_order(text, text, text, numeric, numeric, jsonb)
  from anon;

-- ============================================================
-- Buyurtmani o'zgartirish
-- ============================================================
revoke execute on function
  public.cancel_own_order(uuid)
  from anon;

revoke execute on function
  public.set_order_status(uuid, text)
  from anon;

-- ============================================================
-- Admin statistikasi
-- ============================================================
revoke execute on function
  public.admin_dashboard_stats()
  from anon;

-- ============================================================
-- TEKSHIRUV: kerakli rollar huquqni YO'QOTMAGANIGA ishonch hosil qilamiz
-- ============================================================
/*
 * Huquq bilan ishlaydigan migratsiya ORTIQCHA olib tashlab qo'ysa, buni
 * darhol sezish qiyin: sayt faqat HAQIQIY foydalanuvchida buziladi.
 * Shuning uchun natija shu yerda, migratsiyaning o'zida tekshiriladi —
 * biror narsa noto'g'ri bo'lsa migratsiya QO'LLANMAYDI (tranzaksiya
 * orqaga qaytadi), ya'ni buzuq holat umuman yuzaga kelmaydi.
 */
do $$
declare
  v_fn text;
  v_authenticated text[] := array[
    'public.create_order(text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text)',
    'public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text)',
    'public.create_cash_order(text, text, text, numeric, numeric, jsonb)',
    'public.cancel_own_order(uuid)',
    'public.set_order_status(uuid, text)',
    'public.admin_dashboard_stats()'
  ];
  v_public_catalog text[] := array[
    'public.active_promotion_discounts()',
    'public.best_selling_products()',
    'public.delivery_fee_for(text, numeric)',
    'public.increment_product_view(uuid)'
  ];
begin
  -- 1. `anon` endi imtiyozli funksiyalarni chaqira olmaydi.
  foreach v_fn in array v_authenticated loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'HARDENING FAILED: anon hamon EXECUTE huquqiga ega: %', v_fn;
    end if;
  end loop;

  -- 2. `authenticated` huquqini SAQLAB QOLDI — aks holda checkout va
  --    admin paneli ishlamay qolardi.
  foreach v_fn in array v_authenticated loop
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'HARDENING FAILED: authenticated EXECUTE huquqini yo''qotdi: %', v_fn;
    end if;
  end loop;

  -- 3. `service_role` `set_order_status` ni chaqira oladi (Telegram bot).
  if not has_function_privilege('service_role', 'public.set_order_status(uuid, text)', 'EXECUTE') then
    raise exception 'HARDENING FAILED: service_role set_order_status huquqini yo''qotdi';
  end if;

  -- 4. OMMAVIY katalog `anon` uchun OCHIQ qoldi.
  foreach v_fn in array v_public_catalog loop
    if not has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'HARDENING FAILED: ommaviy katalog funksiyasi yopilib qoldi: %', v_fn;
    end if;
  end loop;

  raise notice 'anon EXECUTE hardening: 6 ta funksiya yopildi, 4 ta ommaviy funksiya ochiq qoldi';
end $$;
