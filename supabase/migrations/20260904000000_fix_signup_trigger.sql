/*
# TUZATISH: "Database error creating new user"

## Muammo
Telegram botda ro'yxatdan o'tishda `auth.admin.createUser()` quyidagi
xatoni qaytaradi:

    Database error creating new user

Bu Supabase Auth'ning UMUMIY xabari: u `auth.users` ga INSERT paytida
ishga tushadigan har qanday trigger xatosini shu bitta matnga o'rab
yuboradi. Ya'ni asl sabab `public.handle_new_user()` ichida.

Eng ehtimolli sabab — `profiles_login_unique_idx` buzilishi:
20260901 migratsiyasidagi backfill mavjud profillarga `login = phone`
qiymatini yozadi. Agar bazada BIR XIL telefonli ikkita profil bo'lsa,
ikkalasi ham bir xil login oladi va unikal indeks buziladi. Bundan
tashqari yangi ro'yxatdan o'tuvchi tanlagan login shu backfill natijasida
band bo'lib qolgan bo'lishi ham mumkin.

## Asosiy tamoyil
**Auth triggeri hech qachon ro'yxatdan o'tishni to'sib qo'ymasligi kerak.**

Profil qatoridagi muammo — bu tuzatsa bo'ladigan kichik nuqson. Lekin
foydalanuvchi umuman hisob ocha olmasligi — bu biznesni to'xtatadi.
Shuning uchun trigger endi:
  1. login to'qnashuvini O'ZI hal qiladi (raqamli qo'shimcha bilan),
  2. har qanday kutilmagan xatoni ushlaydi va minimal profil yaratadi,
  3. hatto u ham ishlamasa — WARNING yozadi va foydalanuvchini
     yaratishga RUXSAT beradi (profil keyin tiklanadi).

## Bot tomoni
Trigger loginni o'zgartirgan bo'lishi mumkin, shuning uchun bot
foydalanuvchiga xabar berishdan oldin `profiles.login` ni qayta o'qiydi
va AYNAN saqlangan loginni ko'rsatadi (`index.ts` da tuzatildi).
*/

-- ============================================================
-- 1. Backfill natijasidagi takroriy loginlarni tozalash
-- ============================================================
/*
 * Agar 20260901 backfill'i bir xil telefonli bir necha profilga bir xil
 * login bergan bo'lsa (yoki indeks yaratilmay qolgan bo'lsa) — eng eski
 * profildan boshqasining login'ini bo'shatamiz. Aks holda unikal indeks
 * yaratilmaydi va har bir yangi ro'yxatdan o'tish xato beraveradi.
 */
with ranked as (
  select
    id,
    row_number() over (partition by lower(login) order by created_at, id) as rn
  from public.profiles
  where login is not null and login <> ''
)
update public.profiles p
set login = null
from ranked r
where r.id = p.id and r.rn > 1;

-- Indeks avval yaratilmay qolgan bo'lsa, endi yaratiladi.
create unique index if not exists profiles_login_unique_idx
  on public.profiles (lower(login)) where login is not null and login <> '';

-- ============================================================
-- 2. Bo'sh login uchun band bo'lmagan variant tanlash
-- ============================================================
create or replace function public.next_available_login(p_login text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text := lower(trim(coalesce(p_login, '')));
  v_try text;
  i integer := 0;
begin
  if v_base = '' then return null; end if;

  v_try := v_base;
  -- 50 ta urinish yetarlidan ham ortiq; cheksiz sikldan himoya.
  while i < 50 loop
    if not exists (
      select 1 from public.profiles where lower(login) = v_try
    ) then
      return v_try;
    end if;
    i := i + 1;
    v_try := v_base || i::text;
  end loop;

  -- Deyarli imkonsiz holat: tasodifiy qo'shimcha bilan qaytaramiz.
  return v_base || floor(random() * 100000)::text;
end;
$$;

-- ============================================================
-- 3. HANDLE_NEW_USER — ro'yxatdan o'tishni hech qachon to'smaydigan
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
  v_login text;
  v_avatar text;
  v_lang text;
begin
  begin
    -- ── Ismni uchta manbadan yig'amiz ──
    -- bot: display_name · Google: full_name / name
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

    v_avatar := coalesce(
      nullif(trim(v_meta->>'avatar_url'), ''),
      nullif(trim(v_meta->>'picture'), '')
    );

    -- Til faqat ruxsat etilgan qiymatlardan bo'lsin (CHECK cheklovi bor).
    v_lang := lower(coalesce(nullif(trim(v_meta->>'language'), ''), 'uz'));
    if v_lang not in ('uz', 'ru', 'en') then v_lang := 'uz'; end if;

    -- ── Login: band bo'lsa AVTOMATIK bo'sh variant tanlanadi ──
    -- Ilgari bu joyda unikal indeks buzilib, butun ro'yxatdan o'tish
    -- "Database error creating new user" bilan tugardi.
    v_login := public.next_available_login(nullif(trim(v_meta->>'login'), ''));

    insert into public.profiles (
      id, display_name, phone, first_name, last_name, avatar_url, login, language
    )
    values (
      new.id,
      coalesce(nullif(v_full, ''), v_login, split_part(coalesce(new.email, ''), '@', 1), ''),
      coalesce(nullif(trim(v_meta->>'phone'), ''), ''),
      v_first,
      v_last,
      v_avatar,
      v_login,
      v_lang
    )
    on conflict (id) do nothing;

  exception when others then
    /*
     * Kutilmagan xato (yangi cheklov, ustun o'zgarishi va h.k.).
     * Foydalanuvchini YO'QOTMAYMIZ: minimal profil bilan davom etamiz.
     */
    raise warning 'handle_new_user: birinchi urinish muvaffaqiyatsiz (%): %', sqlstate, sqlerrm;

    begin
      insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
    exception when others then
      -- Bu ham ishlamasa — profil keyinroq tiklanadi (repair_missing_profiles).
      raise warning 'handle_new_user: minimal profil ham yaratilmadi (%): %', sqlstate, sqlerrm;
    end;
  end;

  -- HAR DOIM muvaffaqiyat: auth.users qatori yaratilaveradi.
  return new;
end;
$$;

-- Trigger o'sha funksiyaga ishora qilishini kafolatlaymiz.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auth xizmati trigger funksiyasini chaqira olishi uchun.
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.next_available_login(text) to supabase_auth_admin;

-- ============================================================
-- 4. Profilsiz qolgan foydalanuvchilarni tiklash
-- ============================================================
/*
 * Agar trigger ilgari xato bergan bo'lsa, `auth.users` da profilsiz
 * qatorlar qolgan bo'lishi mumkin — bunday foydalanuvchi saytga kira
 * oladi-yu, lekin hech narsa ishlamaydi (profil yo'q).
 *
 * Ishlatish:  select * from public.repair_missing_profiles();
 */
create or replace function public.repair_missing_profiles()
returns table (user_id uuid, login text, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_login text;
  v_meta jsonb;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    v_meta := coalesce(r.raw_user_meta_data, '{}'::jsonb);
    v_login := public.next_available_login(
      coalesce(
        nullif(trim(v_meta->>'login'), ''),
        nullif(split_part(coalesce(r.email, ''), '@', 1), '')
      )
    );

    begin
      insert into public.profiles (id, display_name, phone, login, language)
      values (
        r.id,
        coalesce(nullif(trim(v_meta->>'display_name'), ''), v_login, ''),
        coalesce(nullif(trim(v_meta->>'phone'), ''), ''),
        v_login,
        'uz'
      );
      user_id := r.id; login := v_login; created := true;
    exception when others then
      user_id := r.id; login := v_login; created := false;
    end;

    return next;
  end loop;
end;
$$;

revoke all on function public.repair_missing_profiles() from public;
revoke all on function public.repair_missing_profiles() from anon, authenticated;
grant execute on function public.repair_missing_profiles() to service_role;

-- Darhol bir marta ishga tushiramiz — mavjud "yetim" foydalanuvchilar tiklansin.
select * from public.repair_missing_profiles();
