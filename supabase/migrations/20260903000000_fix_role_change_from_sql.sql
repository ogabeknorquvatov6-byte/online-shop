/*
# Rolni o'zgartirish: SQL Editor va service_role uchun ishlaydigan qilish

## Muammo
`protect_profile_privileged_fields` triggeri (20260823000000) `role` va
`is_active` ustunlarini himoyalaydi. Uning sharti quyidagicha edi:

    if not public.is_admin() then
      new.role := old.role;
      new.is_active := old.is_active;
    end if;

`is_admin()` esa `auth.uid()` ga tayanadi. Supabase SQL Editor'da,
migratsiyalarda va service_role orqali `auth.uid()` NULL bo'ladi —
demak `is_admin()` false qaytaradi va trigger rolni ESKI qiymatiga
qaytarib qo'yadi.

Natijada:

    update public.profiles set role = 'admin' where id = '…';

so'rovi XATOSIZ bajariladi ("UPDATE 1" deb yozadi), lekin rol
o'zgarmaydi. Bu eng yomon turdagi xato — hech qanday belgi bermaydi.
Birinchi adminni yaratish uchun triggerni qo'lda o'chirib-yoqishga
to'g'ri kelardi, bu esa xavfsizlik uchun xavfli odat.

## Yechim
Trigger endi so'rov QAYERDAN kelganini aniq ajratadi:

  - `authenticated` / `anon` (ya'ni PostgREST orqali, brauzerdan) →
    faqat admin o'zgartira oladi. Himoya avvalgidek kuchda: oddiy
    foydalanuvchi konsoldan o'zini admin qila olmaydi.

  - `service_role` (Edge Function, bot) va bevosita SQL ulanish
    (SQL Editor, migratsiya, psql) → ruxsat. Bu joylarga kirish
    huquqi bor odam allaqachon bazaning to'liq egasi, unga
    qo'shimcha to'siq qo'yishning ma'nosi yo'q.

Ya'ni himoya kuchi kamaymaydi — u faqat to'g'ri joyga yo'naltiriladi.
*/

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text;
  v_role text := '';
begin
  /*
   * `request.jwt.claims` ni PostgREST har bir so'rovda o'rnatadi.
   * Bevosita SQL ulanishda u umuman bo'lmaydi.
   *
   * Parsing xatosi butun profil yangilanishini bloklab qo'ymasligi
   * uchun exception ushlanadi — bunday holatda eng ehtiyotkor yo'l
   * tanlanadi (himoya YOQILGAN deb hisoblanadi).
   */
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      v_role := coalesce(v_claims::jsonb ->> 'role', '');
    end if;
  exception when others then
    v_role := 'authenticated';
  end;

  -- Brauzerdan kelgan so'rov: faqat admin privilegiyali ustunlarga tega oladi.
  if v_role in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileged_fields();

/*
# Qulaylik: login yoki telefon bo'yicha admin qilish

`id` ni qo'lda topib o'tirmaslik uchun. Faqat bevosita SQL ulanish va
service_role chaqira oladi (`authenticated` uchun EXECUTE berilmagan) —
demak brauzerdan foydalanib bo'lmaydi.

Ishlatish:
    select public.set_user_role('alibek', 'admin');
    select public.set_user_role('998901234567', 'customer');

Qaytaradi: o'zgartirilgan foydalanuvchi ma'lumoti yoki xato.
*/
create or replace function public.set_user_role(p_identifier text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_needle text := lower(trim(p_identifier));
  v_digits text := regexp_replace(p_identifier, '\D', '', 'g');
  v_result jsonb;
begin
  if p_role not in ('admin', 'customer') then
    raise exception 'INVALID_ROLE: faqat admin yoki customer';
  end if;

  /*
   * DIQQAT: telefon bo'yicha solishtirish faqat kiritilgan matnda
   * yetarlicha raqam bo'lsa bajariladi. Aks holda "alibek" kabi matn
   * uchun `v_digits` BO'SH SATR bo'lib qolar va `p.phone = ''` sharti
   * telefoni ko'rsatilmagan TASODIFIY foydalanuvchini topib berardi —
   * ya'ni noto'g'ri odam admin bo'lib qolishi mumkin edi.
   */
  select p.id into v_id
  from public.profiles p
  where lower(coalesce(p.login, '')) = v_needle
     or (length(v_digits) >= 9 and p.phone = v_digits)
     or lower(coalesce(p.display_name, '')) = v_needle
  limit 1;

  if v_id is null then
    -- Email bo'yicha ham qidiramiz (Google orqali kirganlar uchun).
    select u.id into v_id from auth.users u where lower(u.email) = v_needle limit 1;
  end if;

  if v_id is null then
    raise exception 'USER_NOT_FOUND: "%" bo‘yicha foydalanuvchi topilmadi', p_identifier;
  end if;

  update public.profiles
  set role = p_role, is_active = true
  where id = v_id;

  select jsonb_build_object(
    'id', p.id,
    'login', p.login,
    'phone', p.phone,
    'display_name', p.display_name,
    'role', p.role,
    'is_active', p.is_active
  ) into v_result
  from public.profiles p where p.id = v_id;

  return v_result;
end;
$$;

revoke all on function public.set_user_role(text, text) from public;
revoke all on function public.set_user_role(text, text) from anon, authenticated;
grant execute on function public.set_user_role(text, text) to service_role;
