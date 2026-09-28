/*
# Ro'yxatdan o'tish triggerini xavfsiz kafolatlash

## Muammo
`20260904000000` migratsiyasida trigger quyidagicha yangilangan edi:

    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created ...

Bu XAVFLI naqsh. `auth.users` jadvali `supabase_auth_admin` ga tegishli.
Agar `drop` bajarilib, `create` huquq yetishmasligidan xato bersa —
trigger BUTUNLAY YO'QOLADI. Natijada:

  • ro'yxatdan o'tish xatosiz ishlaydi (trigger yo'q — xato ham yo'q),
  • lekin `public.profiles` da qator umuman yaratilmaydi,
  • foydalanuvchi saytga kira oladi-yu, hech narsa ishlamaydi,
  • uni admin qilib ham bo'lmaydi (profil yo'q).

Aynan shu holat kuzatildi.

## Yechim
Trigger endi FAQAT mavjud bo'lmasa yaratiladi — hech qachon oldindan
o'chirilmaydi. Funksiyani yangilash uchun `drop trigger` umuman shart
emas: `create or replace function` triggerni buzmasdan yangi tanani
o'rnatadi, chunki trigger funksiyaga NOM bo'yicha bog'langan.

Huquq yetishmasa — migratsiya yiqilmaydi, aniq NOTICE beradi.
*/

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise notice 'on_auth_user_created triggeri mavjud — o‘zgartirilmadi.';
    return;
  end if;

  begin
    execute $ddl$
      create trigger on_auth_user_created
        after insert on auth.users
        for each row execute function public.handle_new_user()
    $ddl$;
    raise notice 'on_auth_user_created triggeri yaratildi.';
  exception
    when insufficient_privilege then
      raise notice '---------------------------------------------------------';
      raise notice 'DIQQAT: auth.users ga trigger yaratishga huquq yo‘q.';
      raise notice 'Supabase Dashboard -> Database -> Triggers bo‘limidan';
      raise notice 'qo‘lda yarating:';
      raise notice '  Jadval : auth.users';
      raise notice '  Hodisa : AFTER INSERT, FOR EACH ROW';
      raise notice '  Funksiya: public.handle_new_user()';
      raise notice 'Aks holda yangi foydalanuvchilarda profil yaratilmaydi.';
      raise notice '---------------------------------------------------------';
    when others then
      raise notice 'Triggerni yaratib bo‘lmadi (%): %', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================
-- Profilsiz qolgan foydalanuvchilarni tiklash
-- ============================================================
-- Trigger yo'q bo'lgan davrda ochilgan hisoblarda profil yo'q.
-- `repair_missing_profiles()` ularni topib yaratadi (20260904 da
-- e'lon qilingan). Funksiya bo'lmasa — jimgina o'tkazib yuboriladi.

do $$
declare
  v_fixed integer := 0;
begin
  if exists (select 1 from pg_proc where proname = 'repair_missing_profiles') then
    select count(*) into v_fixed from public.repair_missing_profiles();
    raise notice 'Tiklangan profillar: %', v_fixed;
  end if;
end $$;

-- ============================================================
-- Nazorat: profilsiz foydalanuvchi qolmaganini tekshirish
-- ============================================================
do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null;

  if v_orphans > 0 then
    raise notice 'DIQQAT: hali % ta foydalanuvchida profil yo‘q.', v_orphans;
    raise notice 'supabase/tools/diagnose_and_fix_profiles.sql skriptini ishlating.';
  else
    raise notice 'OK: barcha foydalanuvchilarda profil bor.';
  end if;
end $$;
