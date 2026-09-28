/*
# Telegram bot orqali ro'yxatdan o'tish + Google OAuth

Saytda o'z-o'zidan email/parol bilan ro'yxatdan o'tish OLIB TASHLANADI.
Endi hisob yaratishning ikkita yo'li bor:

  1. **Telegram bot** — foydalanuvchi bot bilan suhbatda tilni tanlaydi,
     telefon raqamini ulashadi, o'ziga LOGIN o'ylab topadi va parol
     qo'yadi. Bot service_role kaliti bilan `auth.users` yozuvini
     yaratadi (email sifatida `<login>@telegram.local` ishlatiladi —
     bu foydalanuvchiga hech qachon ko'rsatilmaydi, u faqat ichki
     identifikator). Saytga kirishda login + parol yetarli.

  2. **Google OAuth** — bir bosishda. Supabase provayderi hisobni
     o'zi yaratadi, profil esa quyidagi `handle_new_user` triggeri
     orqali Google metadata'sidan (ism, avatar) to'ldiriladi.

Nega saytda ro'yxatdan o'tish yo'q?
Telefon raqami tasdiqlanmagan holda ro'yxatdan o'tish soxta hisoblar va
"tashlab ketilgan" buyurtmalarni keltirib chiqaradi. Telegram bot orqali
raqam Telegram tomonidan TASDIQLANGAN holda keladi — ya'ni har bir hisob
ortida haqiqiy, bog'lanish mumkin bo'lgan odam turadi. Bu kuryer va
operator uchun ham muhim.

Migratsiya QO'SHIMCHA (additive): mavjud hisoblar ishlashda davom etadi.
*/

-- ============================================================
-- 1. PROFILES: login, til, telegram chat bog'lanishi
-- ============================================================

alter table public.profiles add column if not exists login text;
alter table public.profiles add column if not exists language text not null default 'uz';
alter table public.profiles add column if not exists telegram_chat_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table public.profiles
      add constraint profiles_language_check check (language in ('uz', 'ru', 'en'));
  end if;
end $$;

-- Login butun do'kon bo'yicha yagona bo'lishi shart (registrsiz solishtiriladi).
create unique index if not exists profiles_login_unique_idx
  on public.profiles (lower(login)) where login is not null and login <> '';

-- Bitta Telegram akkaunt — bitta hisob.
create unique index if not exists profiles_telegram_chat_id_unique_idx
  on public.profiles (telegram_chat_id) where telegram_chat_id is not null;

create index if not exists profiles_phone_idx
  on public.profiles (phone) where phone <> '';

/*
 * Backfill: eskidan mavjud hisoblar telefon raqami orqali yaratilgan va
 * ularning ichki emaili `<raqam>@telegram.local`. Ya'ni ular uchun
 * "login" — bu telefon raqamining o'zi. Shu qiymatni yozib qo'yamiz,
 * aks holda eski foydalanuvchilar yangi login formasida o'z login'ini
 * topa olmay qolardi.
 */
update public.profiles
set login = phone
where login is null
  and phone is not null
  and phone <> ''
  and not exists (
    select 1 from public.profiles p2
    where p2.id <> public.profiles.id and lower(p2.login) = lower(public.profiles.phone)
  );

-- ============================================================
-- 2. TELEGRAM_SESSIONS: ko'p bosqichli bot suhbati holati
-- ============================================================

alter table public.telegram_sessions add column if not exists language text;
alter table public.telegram_sessions add column if not exists pending_login text;
alter table public.telegram_sessions add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.telegram_sessions add column if not exists fail_count integer not null default 0;
-- Admin bot ichida e'lon (broadcast) yozayotganda vaqtinchalik saqlash joyi.
alter table public.telegram_sessions add column if not exists draft_text text;
alter table public.telegram_sessions add column if not exists draft_photo text;
alter table public.telegram_sessions add column if not exists draft_buttons jsonb;

create index if not exists telegram_sessions_user_id_idx on public.telegram_sessions (user_id);

alter table public.telegram_login_tokens add column if not exists login text;

-- ============================================================
-- 3. ADMIN_REQUESTS: "parolni unutdim" kabi murojaatlar
-- ============================================================
-- Faqat Edge Function (service role) yozadi/o'qiydi. RLS yoqilgan va
-- hech qanday policy yo'q — demak anon/authenticated uchun yopiq.

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  phone text,
  login text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at timestamptz not null default now()
);
alter table public.admin_requests enable row level security;

create index if not exists admin_requests_status_idx
  on public.admin_requests (status, created_at desc);

-- ============================================================
-- 4. HANDLE_NEW_USER: bot va Google metadata'sini birga qo'llab-quvvatlash
-- ============================================================
/*
 * Uchta manbadan keladigan metadata bir xil profilga aylantiriladi:
 *   - Telegram bot : display_name, phone, login, language
 *   - Google OAuth : full_name / name, avatar_url / picture, email
 *   - eski hisoblar: first_name, last_name
 *
 * Ism/familiya alohida berilmagan bo'lsa, to'liq ismdan ajratiladi —
 * shunda profil sahifasi va checkout avtomatik to'ldirilishi ishlaydi.
 */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full text;
  v_first text;
  v_last text;
  v_login text;
  v_avatar text;
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

  v_login := nullif(trim(v_meta->>'login'), '');

  v_avatar := coalesce(
    nullif(trim(v_meta->>'avatar_url'), ''),
    nullif(trim(v_meta->>'picture'), '')
  );

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
    coalesce(nullif(trim(v_meta->>'language'), ''), 'uz')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

/*
 * Eslatma: "bu login mavjud emas" va "parol noto'g'ri" ni AJRATIB
 * ko'rsatadigan yordamchi funksiya ataylab qo'shilmadi. Bunday funksiya
 * begona odamga loginlarni birma-bir tekshirib chiqish (user enumeration)
 * imkonini berardi. Sayt ikkala holatda ham bitta umumiy xabar beradi:
 * «Login yoki parol noto'g'ri».
 */
