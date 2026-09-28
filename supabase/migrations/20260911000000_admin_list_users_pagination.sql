/*
# `admin_list_users` — SERVER TOMONIDA sahifalash

## Muammo

`admin_list_users()` HAR BIR hisobni bitta so'rovda qaytaradi — chegara yo'q:

    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc;          -- limit YO'Q

Qidiruv va filtr esa brauzerda `Array.filter` bilan bajarilardi. 200 ta
foydalanuvchida bu sezilmaydi; 50 000 tada admin paneli ochilmay qoladi —
ya'ni bo'lim aynan biznes o'sganda ishlamay qoladi.

Bundan tashqari har bir qatorda `email`, `phone`, `login` bor: butun
mijozlar bazasi bitta javobda brauzerga tushadi. Bu shunchaki sekinlik
emas, ma'lumot ta'siri (exposure) nuqtai nazaridan ham keraksiz.

## Yechim

Yangi, PARAMETRLI overload. Eski `admin_list_users()` TEGILMAYDI.

### Nega eski imzo saqlanadi

Keshdagi eski frontend bundle hamon `rpc('admin_list_users')` ni
argumentsiz chaqiradi. Eskisini o'chirsak, PostgREST mos overload topa
olmay `PGRST202` qaytarardi va o'sha mijozlar uchun "Foydalanuvchilar"
bo'limi butunlay ishlamay qolardi ("expand and contract" naqshi).

### Nega yangi parametrlarda `default` YO'Q

`default` bo'lsa, ARGUMENTSIZ chaqiruv ikkala overload'ga ham mos kelib,
Postgres `42725 function is not unique` qaytarardi — ya'ni eski mijozlar
buzilardi. Standart qiymatsiz taqsimot aniq:

    0 ta nomli argument → faqat eski (chegarasiz) funksiya
    4 ta nomli argument → faqat yangi (sahifalangan) funksiya

(Bu — `create_order` migratsiyasida o'rganilgan darsning aynan o'zi.)

## Xavfsizlik — O'ZGARMAYDI

  — `security definer` + funksiya ichida `is_admin()` tekshiruvi saqlanadi;
  — `anon` uchun ANIQ `revoke` qilinadi (Supabase'ning standart huquqi
    `anon` ga TO'G'RIDAN-TO'G'RI beriladi, `revoke ... from public` uni
    olib tashlamaydi — 20260910000000 dagi dars);
  — yangi imtiyoz BERILMAYDI: faqat `authenticated` va `service_role`,
    ya'ni eski funksiya bilan bir xil.
*/

create or replace function public.admin_list_users(
  p_limit integer,
  p_offset integer,
  p_search text,
  p_filter text
)
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
  created_at timestamptz,
  /*
   * QO'SHIMCHA metadata ustunlari. Mavjud ustunlar va ularning ma'nosi
   * o'zgarmadi — faqat sahifalash uchun kerak bo'lganlari qo'shildi.
   */
  total_count bigint,
  orphan_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Mijoz yuborgan chegarani ISHONCHSIZ deb hisoblaymiz: 100 dan katta
  -- `p_limit` bilan sahifalashni chetlab o'tib bo'lmasin.
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_term   text    := nullif(trim(coalesce(p_search, '')), '');
  v_filter text    := coalesce(nullif(trim(coalesce(p_filter, '')), ''), 'all');
begin
  -- `security definer` — huquqni O'ZIMIZ tekshiramiz, aks holda istalgan
  -- foydalanuvchi butun mijozlar bazasini o'qib olardi.
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * `%` va `_` — ILIKE joker belgilari. Ularsiz "50%" deb qidirilganda
   * `%` istalgan matnga mos kelib, filtr amalda o'chib qolardi.
   */
  if v_term is not null then
    v_term := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  with matched as (
    select
      u.id,
      u.email::text                        as email,
      p.first_name,
      p.last_name,
      p.display_name,
      p.login,
      p.phone,
      coalesce(p.role, 'customer')::text   as role,
      coalesce(p.is_active, true)          as is_active,
      (p.id is not null)                   as has_profile,
      u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where
      (
        v_term is null
        or coalesce(p.first_name, '')   ilike '%' || v_term || '%'
        or coalesce(p.last_name, '')    ilike '%' || v_term || '%'
        or coalesce(p.display_name, '') ilike '%' || v_term || '%'
        or coalesce(p.login, '')        ilike '%' || v_term || '%'
        or coalesce(p.phone, '')        ilike '%' || v_term || '%'
        or coalesce(u.email::text, '')  ilike '%' || v_term || '%'
      )
      and (
        v_filter = 'all'
        or (v_filter = 'admin'     and coalesce(p.role, 'customer') = 'admin')
        or (v_filter = 'customer'  and coalesce(p.role, 'customer') = 'customer')
        or (v_filter = 'blocked'   and coalesce(p.is_active, true) = false)
        or (v_filter = 'noprofile' and p.id is null)
      )
  )
  select
    m.id, m.email, m.first_name, m.last_name, m.display_name, m.login,
    m.phone, m.role, m.is_active, m.has_profile, m.created_at,
    -- Filtrga mos JAMI yozuvlar soni — sahifalar sonini hisoblash uchun.
    count(*) over()                                     as total_count,
    /*
     * Profilsiz hisoblar soni — FILTRDAN QAT'IY NAZAR, butun baza bo'yicha.
     *
     * NEGA KERAK: UI'da "N ta hisobda profil yo'q" ogohlantirishi bor.
     * Ilgari u brauzerdagi to'liq ro'yxatdan hisoblanardi. Sahifalashdan
     * keyin bu son FAQAT joriy sahifani hisoblab, muammoni kam ko'rsatib
     * qo'yardi — ya'ni ogohlantirish jimgina yolg'on bo'lardi.
     */
    (select count(*) from auth.users au
      left join public.profiles ap on ap.id = au.id
      where ap.id is null)                              as orphan_count
  from matched m
  -- Barqaror tartib: bir xil `created_at` li hisoblar sahifalar orasida
  -- takrorlanib yoki yo'qolib qolmasligi uchun ikkilamchi kalit.
  order by m.created_at desc, m.id
  limit v_limit offset v_offset;
end;
$$;

-- Huquqlar ESKI funksiya bilan AYNAN bir xil — kengaytirilmaydi.
revoke all on function public.admin_list_users(integer, integer, text, text) from public;
revoke all on function public.admin_list_users(integer, integer, text, text) from anon;
grant execute on function public.admin_list_users(integer, integer, text, text) to authenticated;
grant execute on function public.admin_list_users(integer, integer, text, text) to service_role;

/*
 * Eski, argumentsiz imzoni ham `anon` dan aniq tortib olamiz.
 *
 * U 20260908000000 da `revoke ... from anon` bilan yaratilgan edi, lekin
 * takrorlash zararsiz va niyatni aniq qoldiradi (20260910000000 auditida
 * aynan shunday e'tibordan qochgan huquqlar topilgan edi).
 */
revoke all on function public.admin_list_users() from anon;
