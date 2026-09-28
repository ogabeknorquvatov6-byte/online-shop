/*
# CRITICAL FIX: profile role / is_active privilege escalation

## Muammo
`profile_update_own` policy faqat `id = auth.uid()` ni tekshiradi — qaysi
ustunlar o'zgarayotganini emas. Demak har qanday login qilgan foydalanuvchi
brauzer konsolidan yoki tarmoq so'rovini o'zgartirib to'g'ridan-to'g'ri:

  supabase.from('profiles').update({ role: 'admin' }).eq('id', MY_ID)

deb yuborishi mumkin edi va bu ISHLAB TURARDI — chunki policy buni
taqiqlamagan. Bu o'zini admin qilib olish (privilege escalation).

Bundan tashqari, admin panelidagi "Bloklash / Faollashtirish" tugmasi
boshqa foydalanuvchining `is_active` ustunini o'zgartirmoqchi bo'ladi,
lekin profiles jadvalida buning uchun admin UPDATE policy umuman yo'q edi —
demak bu funksiya sukut bo'yicha ishlamas edi (0 qator yangilanardi).

## Yechim
1. Trigger (`protect_profile_privileged_fields`) — `role` va `is_active`
   ustunlarini FAQAT admin o'zgartira olishi mumkin. Oddiy foydalanuvchi
   o'z profilini yangilaganda (ism/telefon) bu ustunlar avtomatik eskicha
   qiymatiga qaytariladi — policy qanday yozilishidan qat'iy nazar.
2. Yangi `admin_update_profiles` policy — admin boshqa foydalanuvchilarning
   qatorini (masalan bloklash uchun) yangilay olishi uchun.
*/

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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

-- Admin: boshqa foydalanuvchilar qatorini yangilay olishi kerak
-- (masalan Bloklash/Faollashtirish, yoki qo'lda rol berish).
drop policy if exists admin_update_profiles on public.profiles;
create policy admin_update_profiles on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
