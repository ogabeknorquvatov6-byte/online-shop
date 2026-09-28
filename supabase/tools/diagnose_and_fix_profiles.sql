/*
================================================================
  TASHXIS VA TUZATISH: profil yaratilmayapti + admin qilish
================================================================

Bu MIGRATSIYA EMAS — Supabase SQL Editor'da qo'lda ishga tushiriladigan
skript. Uni bo'lak-bo'lak (1 → 5) bajaring va har bosqich natijasiga
qarang.

Muammo: Telegram bot orqali ro'yxatdan o'tish ishlaydi, lekin
`public.profiles` da qator paydo bo'lmaydi — natijada foydalanuvchini
admin qilib bo'lmaydi.
================================================================
*/


-- ================================================================
-- 1-BOSQICH · TASHXIS (hech narsani o'zgartirmaydi)
-- ================================================================
-- Bu so'rovni bajaring va NATIJANI o'qing.

select
  -- Trigger umuman bormi? `false` bo'lsa — asosiy sabab shu.
  exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ) as trigger_bor,

  -- Trigger funksiyasi bormi?
  exists (select 1 from pg_proc where proname = 'handle_new_user') as funksiya_bor,

  -- 20260903 migratsiyasi (rolni SQL'dan o'zgartirish) ishga tushganmi?
  exists (select 1 from pg_proc where proname = 'set_user_role') as rol_migratsiya_bor,

  -- 20260904 migratsiyasi ishga tushganmi?
  exists (select 1 from pg_proc where proname = 'repair_missing_profiles') as tuzatish_migratsiya_bor,

  -- Profilsiz ("yetim") foydalanuvchilar soni.
  (select count(*) from auth.users u
   left join public.profiles p on p.id = u.id
   where p.id is null) as profilsiz_foydalanuvchilar;


-- Profilsiz foydalanuvchilarni ko'rish (kim ekanini bilish uchun):
select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'login' as login_metadata,
  u.raw_user_meta_data ->> 'phone' as phone_metadata
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;


-- ================================================================
-- 2-BOSQICH · TRIGGERNI TIKLASH
-- ================================================================
/*
 Agar 1-bosqichda `trigger_bor = false` bo'lsa — sabab shu.

 `auth.users` jadvali `supabase_auth_admin` ga tegishli, shuning uchun
 trigger yaratish huquq talab qiladi. Quyidagi blok xatoni ushlaydi va
 aniq tushuntirish beradi (skript to'xtab qolmaydi).
*/
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    begin
      execute $ddl$
        create trigger on_auth_user_created
          after insert on auth.users
          for each row execute function public.handle_new_user()
      $ddl$;
      raise notice 'OK: on_auth_user_created triggeri tiklandi.';
    exception when insufficient_privilege then
      raise notice 'XATO: auth.users ga trigger yaratishga huquq yo‘q.';
      raise notice 'Yechim: Supabase Dashboard -> Database -> Triggers bo‘limidan';
      raise notice 'qo‘lda yarating (auth.users, AFTER INSERT, handle_new_user),';
      raise notice 'yoki 4-bosqichdagi zaxira usulni ishlating.';
    end;
  else
    raise notice 'Trigger allaqachon mavjud — 3-bosqichga o‘ting.';
  end if;
end $$;


-- ================================================================
-- 3-BOSQICH · MAVJUD "YETIM" FOYDALANUVCHILARGA PROFIL YARATISH
-- ================================================================
/*
 Trigger tiklangan bo'lsa ham, U PAYTGACHA yaratilgan foydalanuvchilarda
 profil yo'q. Ular shu yerda tiklanadi.

 `repair_missing_profiles()` mavjud bo'lsa o'shani ishlatamiz, aks holda
 bevosita INSERT bilan tiklaymiz — ikkala holatda ham ishlaydi.
*/
do $$
declare
  v_count integer := 0;
  r record;
  v_login text;
  v_meta jsonb;
begin
  if exists (select 1 from pg_proc where proname = 'repair_missing_profiles') then
    perform public.repair_missing_profiles();
    raise notice 'repair_missing_profiles() bajarildi.';
  else
    -- Zaxira usul: funksiyasiz ham tiklaymiz.
    for r in
      select u.id, u.email, u.raw_user_meta_data as meta
      from auth.users u
      left join public.profiles p on p.id = u.id
      where p.id is null
    loop
      v_meta := coalesce(r.meta, '{}'::jsonb);
      v_login := coalesce(
        nullif(trim(v_meta ->> 'login'), ''),
        nullif(split_part(coalesce(r.email, ''), '@', 1), '')
      );

      -- Login band bo'lsa raqamli qo'shimcha qo'shamiz.
      if v_login is not null then
        while exists (select 1 from public.profiles where lower(login) = lower(v_login)) loop
          v_login := v_login || floor(random() * 10)::text;
        end loop;
      end if;

      insert into public.profiles (id, display_name, phone, login)
      values (
        r.id,
        coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_login, ''),
        coalesce(nullif(trim(v_meta ->> 'phone'), ''), ''),
        v_login
      )
      on conflict (id) do nothing;

      v_count := v_count + 1;
    end loop;
    raise notice 'Zaxira usul bilan % ta profil yaratildi.', v_count;
  end if;
end $$;


-- Tekshirish: endi profilsiz foydalanuvchi qolmagan bo'lishi kerak.
select count(*) as hali_profilsiz
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;


-- ================================================================
-- 4-BOSQICH · O'ZINGIZNI ADMIN QILISH
-- ================================================================

-- 4a) Avval loginingizni toping (eng yangi hisoblar tepada):
select login, phone, display_name, role, is_active, created_at
from public.profiles
order by created_at desc
limit 10;


-- 4b) Loginni yozib, admin qiling.
--     `set_user_role` mavjud bo'lmasa ham ishlaydigan universal variant:
do $$
declare
  v_login text := 'BU_YERGA_LOGININGIZNI_YOZING';   -- <<< O'ZGARTIRING
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(login) = lower(v_login);

  if v_id is null then
    raise exception 'Login "%" topilmadi. 4a natijasidan aniq qiymatni ko‘chiring.', v_login;
  end if;

  update public.profiles
  set role = 'admin', is_active = true
  where id = v_id;

  -- Trigger rolni qaytarib qo'ygan bo'lsa (20260903 migratsiyasi
  -- ishga tushmagan bo'lsa) shu yerda bilib olamiz.
  if (select role from public.profiles where id = v_id) <> 'admin' then
    raise exception
      'Rol saqlanmadi: protect_profile_privileged_fields triggeri uni qaytarib qo‘ydi. '
      '20260903000000_fix_role_change_from_sql.sql migratsiyasini ishga tushiring.';
  end if;

  raise notice 'OK: "%" endi admin.', v_login;
end $$;


-- 4c) Tasdiqlash:
select login, display_name, role, is_active
from public.profiles
where role = 'admin';


-- ================================================================
-- 5-BOSQICH · TRIGGER ISHLAYOTGANINI TEKSHIRISH
-- ================================================================
/*
 Botda YANGI hisob oching, so'ng shuni bajaring — natija 0 bo'lishi kerak.
 Agar 0 dan katta bo'lsa, trigger hamon ishlamayapti: 2-bosqichdagi
 xabarni o'qing va Dashboard orqali qo'lda yarating.
*/
select count(*) as yangi_profilsizlar
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.created_at > now() - interval '10 minutes';
