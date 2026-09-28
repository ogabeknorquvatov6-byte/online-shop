/*
# Foydalanuvchilar admin panelida YO'QOLMASLIGI

## Muammo
Telegram orqali ro'yxatdan o'tgan foydalanuvchilar admin paneldagi
"Foydalanuvchilar" bo'limida ko'rinmayapti.

Sabab tuzilmaviy: admin paneli `public.profiles` jadvalini o'qiydi, lekin
hisobning O'ZI `auth.users` da yaratiladi. Profil esa trigger orqali
qo'shiladi. Trigger biror sababga ko'ra ishlamasa (huquq, cheklov,
o'chib qolgan trigger) — foydalanuvchi `auth.users` da BOR, `profiles`
da YO'Q. Admin uchun u umuman mavjud emasdek ko'rinadi.

Bu eng yomon turdagi nosozlik: hech qanday xato xabari yo'q, shunchaki
odam yo'qoladi. Admin muammo borligini ham bilmaydi.

## Yechim: haqiqat manbasini almashtiramiz
Admin paneli endi `profiles` emas, `auth.users LEFT JOIN profiles` ni
o'qiydi. Ya'ni ro'yxatda HAR BIR hisob ko'rinadi — profili bo'lmasa ham,
"profil yo'q" belgisi bilan. Admin muammoni KO'RADI va bir bosishda
tuzata oladi.

Trigger baribir 1-himoya bo'lib qoladi; bu esa uning ustidan nazorat.
*/

-- ============================================================
-- 1. ADMIN_LIST_USERS — barcha hisoblar, profilsizlari bilan birga
-- ============================================================
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  display_name text,
  login text,
  phone text,
  role text,
  is_active boolean,
  has_profile boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- `security definer` bo'lgani uchun huquqni O'ZIMIZ tekshiramiz,
  -- aks holda istalgan foydalanuvchi hammaning ro'yxatini olardi.
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.display_name,
    p.login,
    p.phone,
    -- Profil yo'q bo'lsa ham qator qaytadi; UI buni "profil yo'q" deb
    -- ko'rsatadi va tiklash tugmasini beradi.
    coalesce(p.role, 'customer')::text,
    coalesce(p.is_active, true),
    (p.id is not null) as has_profile,
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_users() to service_role;

-- ============================================================
-- 2. REPAIR_MISSING_PROFILES — admin ham chaqira olsin
-- ============================================================
/*
 Ilgari faqat `service_role` chaqira olardi, ya'ni tuzatish uchun
 SQL Editor'ga kirish kerak edi. Endi admin buni panelning o'zidan
 bajaradi. Huquq funksiya ichida tekshiriladi.
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
  v_phone text;
  v_meta jsonb;
  v_role text := '';
  v_claims text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      v_role := coalesce(v_claims::jsonb ->> 'role', '');
    end if;
  exception when others then
    v_role := 'authenticated';
  end;

  -- service_role (bot/skript) yoki admin. Boshqasi uchun yopiq.
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  for r in
    select u.id, u.email, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    order by u.created_at
  loop
    v_meta := coalesce(r.meta, '{}'::jsonb);
    v_login := public.next_available_login(
      coalesce(
        nullif(trim(v_meta->>'login'), ''),
        nullif(split_part(coalesce(r.email, ''), '@', 1), '')
      )
    );

    /*
     * TELEFON BAND BO'LSA — BO'SH QOLDIRAMIZ.
     *
     * `login` uchun to'qnashuvni `next_available_login()` hal qiladi,
     * TELEFON uchun esa hech qanday shunday yordamchi YO'Q. Natijada
     * yetim hisobning metadata'sidagi raqam boshqa profilga tegishli
     * bo'lsa, INSERT `profiles_phone_unique_idx` ni buzardi.
     *
     * Nega aynan bo'sh satr:
     *   — ustun `not null default ''`, ya'ni '' — shu sxemadagi
     *     "telefon ko'rsatilmagan" degan kanonik qiymat;
     *   — loyihadagi barcha yagonalik indekslari qisman (`partial`) va
     *     bo'sh qiymatni chetlab o'tadi (qarang: profiles_login_unique_idx
     *     `where login is not null and login <> ''`), shuning uchun
     *     bo'sh telefonlar bir-biriga xalaqit bermaydi;
     *   — mavjud profil va uning raqami TEGILMAY qoladi.
     *
     * Muqobil yo'llar rad etildi: qatorni o'tkazib yuborish yetim
     * hisobni yana ko'rinmas qilib qoldiradi (aynan shu migratsiya
     * tuzatmoqchi bo'lgan nosozlik), soxta noyob raqam yozish esa
     * haqiqiy mijoz ma'lumotini buzadi.
     */
    v_phone := nullif(trim(v_meta->>'phone'), '');
    if v_phone is not null and exists (
      select 1 from public.profiles ex where ex.phone = v_phone
    ) then
      v_phone := null;
    end if;

    begin
      -- `role` ANIQ — yuqoridagi izohga qarang. Bu funksiyani admin
      -- panelidan chaqirish ham hech qachon yangi admin yaratmasligi kerak.
      insert into public.profiles (id, display_name, phone, login, language, role)
      values (
        r.id,
        coalesce(nullif(trim(v_meta->>'display_name'), ''), v_login, ''),
        coalesce(v_phone, ''),
        v_login,
        'uz',
        'customer'
      )
      on conflict (id) do nothing;
      user_id := r.id; login := v_login; created := true;
    exception when others then
      raise warning 'repair_missing_profiles % : %', r.id, sqlerrm;
      user_id := r.id; login := v_login; created := false;
    end;

    return next;
  end loop;
end;
$$;

revoke all on function public.repair_missing_profiles() from public;
revoke all on function public.repair_missing_profiles() from anon;
grant execute on function public.repair_missing_profiles() to authenticated;
grant execute on function public.repair_missing_profiles() to service_role;

-- ============================================================
-- 3. Hozirdagi yetimlarni darhol tiklaymiz
-- ============================================================
do $$
declare v_before integer; v_after integer;
begin
  select count(*) into v_before
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null;

  if v_before > 0 then
    -- `security definer` + migratsiya konteksti: is_admin() false bo'lsa ham
    -- to'g'ridan-to'g'ri INSERT qilamiz (bu yerda RLS ta'sir qilmaydi).
    /*
     * `role` ANIQ ko'rsatiladi — ustun DEFAULT iga TAYANMAYMIZ.
     *
     * Ilgari bu INSERT `role` ni umuman ko'rsatmasdi va qiymat ustun
     * standartidan olinardi. Produksiyada standart repozitoriydagidan
     * FARQ QILDI va tiklangan har bir profil `role = 'admin'` bilan
     * yaratilishga urindi — ya'ni profili yo'qolgan HAR BIR hisob
     * administratorga aylanardi.
     *
     * Buni faqat `profiles_role_check` cheklovi to'xtatib qoldi
     * (23514). Ya'ni migratsiya "xato bergani" aslida omad emas —
     * cheklov jimgina imtiyoz oshishining oldini oldi.
     *
     * Yetim profilni tiklash HAR DOIM oddiy mijoz yaratishi kerak.
     * Admin huquqi faqat `set_user_role()` orqali, ataylab beriladi.
     */
    /*
     * TELEFON YAGONALIGI — ikki xil to'qnashuv hisobga olinadi.
     *
     * Produksiyada `profiles_phone_unique_idx` bor. Yetim hisobning
     * metadata'sidagi raqam:
     *   (1) allaqachon MAVJUD profilga tegishli bo'lishi mumkin;
     *   (2) shu partiyadagi BOSHQA yetim hisobda ham uchrashi mumkin.
     *
     * Ikkinchisi ayniqsa e'tibordan qochadi: `not exists` faqat
     * oldindan mavjud qatorlarni ko'radi, bitta `INSERT ... SELECT`
     * ichidagi ikkita bir xil raqam bir-birini "ko'rmaydi" va indeks
     * baribir buzilardi. Shuning uchun `row_number()` bilan har bir
     * raqamdan faqat BITTASI saqlanadi.
     *
     * Band bo'lgan raqam BO'SH satrga aylantiriladi (`''`) — sxemadagi
     * kanonik "telefon yo'q" qiymati. Mavjud profil va uning raqami
     * hech qanday holatda o'zgartirilmaydi.
     */
    with orphan as (
      select
        u.id,
        coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), '') as display_name,
        nullif(trim(u.raw_user_meta_data->>'phone'), '')                     as phone_raw,
        public.next_available_login(
          coalesce(
            nullif(trim(u.raw_user_meta_data->>'login'), ''),
            nullif(split_part(coalesce(u.email, ''), '@', 1), '')
          )
        ) as login
      from auth.users u
      left join public.profiles p on p.id = u.id
      where p.id is null
    ),
    resolved as (
      select
        o.id,
        o.display_name,
        o.login,
        case
          when o.phone_raw is null then ''
          -- (1) raqam allaqachon mavjud profilga tegishli
          when exists (select 1 from public.profiles ex where ex.phone = o.phone_raw) then ''
          -- (2) shu partiyada bir xil raqam takrorlangan — faqat birinchisi oladi
          when row_number() over (partition by o.phone_raw order by o.id) > 1 then ''
          else o.phone_raw
        end as phone
      from orphan o
    )
    insert into public.profiles (id, display_name, phone, login, language, role)
    select r.id, r.display_name, r.phone, r.login, 'uz', 'customer'
    from resolved r
    on conflict (id) do nothing;
  end if;

  select count(*) into v_after
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null;

  raise notice 'Profilsiz hisoblar: % -> %', v_before, v_after;
end $$;
