/*
# KAFOLAT: har bir foydalanuvchida profil bo'ladi

## Muammo
Profil yaratish bitta nuqtaga — `handle_new_user` triggeriga bog'liq edi.
20260904 da men uni "xato tashlamaydigan" qilgandim, natijada nosozlik
YASHIRINDI: ro'yxatdan o'tish ishlaydi, lekin `profiles` da qator
paydo bo'lmaydi. Foydalanuvchi bazada "ko'rinmay" qoladi va uni admin
ham qilib bo'lmaydi.

Asosiy kamchilik — triggerdagi INSERT bitta katta amal edi: unda
ism, telefon, avatar VA `login` birga yozilardi. `login` unikal
indeksga ega, ya'ni bitta to'qnashuv BUTUN profilni yo'q qilardi.

## Yechim: uch qavatli kafolat

  1-qavat — trigger endi UCH MUSTAQIL bosqichdan iborat:
      a) minimal qator (faqat `id`) — hech qanday cheklovga tegmaydi,
         demak amalda hech qachon yiqilmaydi;
      b) ma'lumotlar bilan to'ldirish;
      c) `login` ni alohida yozish (band bo'lsa avtomatik variant).
     Har bosqich alohida himoyalangan: (b) yoki (c) yiqilsa ham
     PROFIL QATORI JOYIDA QOLADI va jadvalda ko'rinadi.

  2-qavat — `ensure_profile()`: istalgan paytda chaqirilsa, profil
     yo'q bo'lsa yaratadi. Bot uni har bir ro'yxatdan o'tishdan keyin
     chaqiradi, ya'ni trigger umuman ishlamasa ham natija bir xil.

  3-qavat — sayt o'zini o'zi tiklaydi: kirgan foydalanuvchida profil
     topilmasa, u o'zi uchun qator yaratadi (`profile_insert_own`).
     Bu ayniqsa Google orqali kirganlar uchun muhim.

Uch qavatning har biri mustaqil — birortasi ishlasa yetarli.
*/

-- ============================================================
-- 1. HANDLE_NEW_USER — bosqichma-bosqich, yiqilmaydigan
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full text;
  v_first text;
  v_last text;
  v_lang text;
begin
  ------------------------------------------------------------------
  -- (a) MINIMAL QATOR. Bu yerda hech qanday unikal/NOT NULL cheklov
  --     buzilmaydi: barcha ustunlarda default bor. Ya'ni profil
  --     qatori deyarli har qanday sharoitda yaratiladi.
  ------------------------------------------------------------------
  begin
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user(a): minimal profil yaratilmadi (%): %', sqlstate, sqlerrm;
    return new; -- ro'yxatdan o'tishni to'smaymiz
  end;

  ------------------------------------------------------------------
  -- (b) MA'LUMOTLAR. Yiqilsa ham (a) dagi qator joyida qoladi.
  ------------------------------------------------------------------
  begin
    v_full := coalesce(
      nullif(trim(v_meta->>'display_name'), ''),
      nullif(trim(v_meta->>'full_name'), ''),
      nullif(trim(v_meta->>'name'), ''),
      ''
    );
    v_first := coalesce(
      nullif(trim(v_meta->>'first_name'), ''),
      nullif(split_part(v_full, ' ', 1), ''),
      ''
    );
    v_last := coalesce(
      nullif(trim(v_meta->>'last_name'), ''),
      nullif(trim(substring(v_full from length(split_part(v_full, ' ', 1)) + 2)), ''),
      ''
    );
    v_lang := lower(coalesce(nullif(trim(v_meta->>'language'), ''), 'uz'));
    if v_lang not in ('uz', 'ru', 'en') then v_lang := 'uz'; end if;

    update public.profiles
    set display_name = coalesce(nullif(v_full, ''), split_part(coalesce(new.email, ''), '@', 1), display_name),
        phone        = coalesce(nullif(trim(v_meta->>'phone'), ''), phone),
        first_name   = coalesce(nullif(v_first, ''), first_name),
        last_name    = coalesce(nullif(v_last, ''), last_name),
        avatar_url   = coalesce(nullif(trim(v_meta->>'avatar_url'), ''), nullif(trim(v_meta->>'picture'), ''), avatar_url),
        language     = v_lang
    where id = new.id;
  exception when others then
    raise warning 'handle_new_user(b): profilni to‘ldirib bo‘lmadi (%): %', sqlstate, sqlerrm;
  end;

  ------------------------------------------------------------------
  -- (c) LOGIN — ALOHIDA. Unikal indeks buzilsa faqat shu bosqich
  --     yiqiladi, profilning o'ziga ta'sir qilmaydi.
  ------------------------------------------------------------------
  begin
    update public.profiles
    set login = public.next_available_login(nullif(trim(v_meta->>'login'), ''))
    where id = new.id and (login is null or login = '');
  exception when others then
    raise warning 'handle_new_user(c): loginni yozib bo‘lmadi (%): %', sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ============================================================
-- 2. ENSURE_PROFILE — 2-qavat (bot chaqiradi)
-- ============================================================
/*
 Idempotent: bir necha marta chaqirilsa ham xavfsiz.
 Yakuniy qatorni qaytaradi — bot foydalanuvchiga AYNAN saqlangan
 loginni ko'rsatishi uchun (trigger uni o'zgartirgan bo'lishi mumkin).
*/
create or replace function public.ensure_profile(
  p_user_id uuid,
  p_login text default null,
  p_phone text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'USER_ID_REQUIRED';
  end if;

  insert into public.profiles (id) values (p_user_id) on conflict (id) do nothing;

  update public.profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), nullif(display_name, ''), nullif(trim(p_login), ''), ''),
      phone        = coalesce(nullif(trim(p_phone), ''), phone)
  where id = p_user_id;

  -- Login faqat hali yo'q bo'lsa yoziladi (mavjudini bosib ketmaymiz).
  begin
    update public.profiles
    set login = public.next_available_login(nullif(trim(p_login), ''))
    where id = p_user_id and (login is null or login = '');
  exception when others then
    raise warning 'ensure_profile: login yozilmadi (%): %', sqlstate, sqlerrm;
  end;

  select jsonb_build_object(
    'id', id, 'login', login, 'phone', phone,
    'display_name', display_name, 'role', role, 'is_active', is_active
  ) into v_result
  from public.profiles where id = p_user_id;

  return v_result;
end;
$$;

revoke all on function public.ensure_profile(uuid, text, text, text) from public;
revoke all on function public.ensure_profile(uuid, text, text, text) from anon;
-- Foydalanuvchi FAQAT o'zi uchun chaqira olishi tekshiriladi (pastda).
grant execute on function public.ensure_profile(uuid, text, text, text) to service_role;

-- ============================================================
-- 3. 3-qavat: sayt o'zini o'zi tiklaydi
-- ============================================================
/*
 Kirgan foydalanuvchida profil topilmasa, u O'ZI uchun qator yarata
 olishi kerak. `with check (id = auth.uid())` — boshqa birovning
 qatorini yarata olmaydi.
*/
drop policy if exists profile_insert_own on public.profiles;
create policy profile_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

/*
 XAVFSIZLIK: INSERT ham himoyalanishi shart!

 `protect_profile_privileged_fields` faqat BEFORE UPDATE edi. Yuqoridagi
 yangi INSERT policy'si bilan birga bu teshik ochib qo'yardi:
 foydalanuvchi o'z qatorini `role = 'admin'` bilan YARATIB olishi
 mumkin bo'lardi. Shuning uchun INSERT uchun ham majburlash qo'shiladi.
*/
create or replace function public.force_default_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text;
  v_role text := '';
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      v_role := coalesce(v_claims::jsonb ->> 'role', '');
    end if;
  exception when others then
    v_role := 'authenticated';
  end;

  -- Brauzerdan kelgan INSERT hech qachon imtiyoz bera olmaydi.
  if v_role in ('authenticated', 'anon') then
    new.role := 'customer';
    new.is_active := true;
  end if;

  return new;
end;
$$;

drop trigger if exists force_default_profile_privileges on public.profiles;
create trigger force_default_profile_privileges
  before insert on public.profiles
  for each row
  execute function public.force_default_profile_privileges();

-- ============================================================
-- 4. Mavjud yetimlarni tiklash
-- ============================================================
do $$
declare
  r record;
  v_meta jsonb;
  v_login text;
  v_fixed integer := 0;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    order by u.created_at
  loop
    v_meta := coalesce(r.meta, '{}'::jsonb);
    v_login := coalesce(
      nullif(trim(v_meta ->> 'login'), ''),
      nullif(split_part(coalesce(r.email, ''), '@', 1), '')
    );

    begin
      perform public.ensure_profile(
        r.id,
        v_login,
        nullif(trim(v_meta ->> 'phone'), ''),
        nullif(trim(v_meta ->> 'display_name'), '')
      );
      v_fixed := v_fixed + 1;
    exception when others then
      raise warning 'Tiklab bo‘lmadi % : %', r.id, sqlerrm;
    end;
  end loop;

  raise notice 'Tiklangan profillar: %', v_fixed;
end $$;

-- ============================================================
-- 5. Nazorat
-- ============================================================
do $$
declare v_orphans integer; v_users integer; v_profiles integer;
begin
  select count(*) into v_users from auth.users;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_orphans
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null;

  raise notice 'auth.users: %  |  profiles: %  |  yetim: %', v_users, v_profiles, v_orphans;

  if v_orphans = 0 then
    raise notice 'OK: barcha foydalanuvchilarda profil bor.';
  else
    raise notice 'DIQQAT: % ta yetim qoldi — WARNING xabarlarini o‘qing.', v_orphans;
  end if;
end $$;
