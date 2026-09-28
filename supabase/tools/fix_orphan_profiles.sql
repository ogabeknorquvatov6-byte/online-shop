/*
================================================================
  YETIM FOYDALANUVCHILARNI TIKLASH (sababini ko'rsatgan holda)
================================================================

Holat: `auth.users` da foydalanuvchi bor, `public.profiles` da esa
uning qatori yo'q. Bunday odam saytga kira oladi, lekin profil
yo'qligi uchun hech narsa ishlamaydi va uni admin ham qilib bo'lmaydi.

Nega sabab ko'rinmayapti?
`handle_new_user` triggeri (20260904) ATAYLAB har qanday xatoni
yutadi — ro'yxatdan o'tishni to'sib qo'ymasligi uchun. Xato faqat
Postgres loglariga WARNING bo'lib tushadi.

Bu skript o'sha insert'ni QO'LDA, exception-handlersiz bajaradi —
shuning uchun asl xato ekranda ko'rinadi.
================================================================
*/


-- ================================================================
-- 1 · KIM YETIM QOLGAN?
-- ================================================================
select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'login'        as login_metadata,
  u.raw_user_meta_data ->> 'phone'        as phone_metadata,
  u.raw_user_meta_data ->> 'display_name' as name_metadata
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;


-- ================================================================
-- 2 · TIKLASH — xato bo'lsa SABABI EKRANDA CHIQADI
-- ================================================================
/*
 Muvaffaqiyatli bo'lsa: "OK yaratildi" xabarlarini ko'rasiz.
 Xato bo'lsa: skript to'xtaydi va ANIQ sababni yozadi, masalan
   - duplicate key value violates unique constraint "profiles_login_unique_idx"
     → login band (pastdagi 3-blok buni o'zi hal qiladi)
   - null value in column "..." violates not-null constraint
     → ustunda default yo'q
   - column "..." does not exist
     → migratsiya ishga tushmagan
*/
do $$
declare
  r record;
  v_meta jsonb;
  v_login text;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    order by u.created_at
  loop
    v_meta  := coalesce(r.meta, '{}'::jsonb);
    v_login := nullif(trim(v_meta ->> 'login'), '');

    raise notice 'Urinish: id=%  login=%  email=%', r.id, coalesce(v_login, '—'), coalesce(r.email, '—');

    insert into public.profiles (id, display_name, phone, login)
    values (
      r.id,
      coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_login, split_part(coalesce(r.email, ''), '@', 1), ''),
      coalesce(nullif(trim(v_meta ->> 'phone'), ''), ''),
      v_login
    );

    raise notice '  OK yaratildi.';
  end loop;

  raise notice 'Tugadi.';
end $$;


-- ================================================================
-- 3 · AGAR 2-BLOK "duplicate key ... profiles_login_unique_idx"
--     BERSA — SHU BLOKNI ISHLATING
-- ================================================================
/*
 Sabab: tanlangan login allaqachon band (masalan 20260901 backfill'i
 mavjud profilga `login = telefon` yozgan, yoki ikki kishi bir xil
 login tanlagan).

 Bu blok band bo'lmagan variant topib beradi (alibek → alibek1 → ...)
 va OXIRIDA har bir foydalanuvchining YAKUNIY loginini ko'rsatadi —
 uni egasiga aytish kerak, chunki u saytga aynan shu login bilan
 kiradi.
*/
do $$
declare
  r record;
  v_meta jsonb;
  v_base text;
  v_login text;
  i integer;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    order by u.created_at
  loop
    v_meta := coalesce(r.meta, '{}'::jsonb);
    v_base := lower(coalesce(
      nullif(trim(v_meta ->> 'login'), ''),
      nullif(split_part(coalesce(r.email, ''), '@', 1), ''),
      'user'
    ));

    v_login := v_base;
    i := 0;
    while exists (select 1 from public.profiles where lower(login) = v_login) and i < 100 loop
      i := i + 1;
      v_login := v_base || i::text;
    end loop;

    insert into public.profiles (id, display_name, phone, login)
    values (
      r.id,
      coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_login, ''),
      coalesce(nullif(trim(v_meta ->> 'phone'), ''), ''),
      v_login
    )
    on conflict (id) do nothing;

    if v_login <> v_base then
      raise notice 'DIQQAT: "%" band edi. Yakuniy login: "%"  (egasiga ayting!)', v_base, v_login;
    else
      raise notice 'OK: login "%"', v_login;
    end if;
  end loop;
end $$;


-- ================================================================
-- 4 · TEKSHIRISH — 0 bo'lishi kerak
-- ================================================================
select count(*) as hali_yetim
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;


-- Barcha profillar (login ustuni bilan):
select login, phone, display_name, role, is_active, created_at
from public.profiles
order by created_at desc;


-- ================================================================
-- 5 · O'ZINGIZNI ADMIN QILISH
-- ================================================================
do $$
declare
  v_login text := 'BU_YERGA_LOGININGIZNI_YOZING';   -- <<< 4-blok natijasidan ko'chiring
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(login) = lower(v_login);
  if v_id is null then
    raise exception 'Login "%" topilmadi.', v_login;
  end if;

  update public.profiles set role = 'admin', is_active = true where id = v_id;

  -- Himoya triggeri rolni qaytarib qo'ygan bo'lsa — shu yerda bilinadi.
  if (select role from public.profiles where id = v_id) <> 'admin' then
    raise exception
      'Rol saqlanmadi — protect_profile_privileged_fields triggeri qaytarib qo‘ydi. '
      '20260903000000_fix_role_change_from_sql.sql migratsiyasini ishga tushiring.';
  end if;

  raise notice 'OK: "%" endi admin.', v_login;
end $$;
