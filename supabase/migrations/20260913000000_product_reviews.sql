/*
# Mijoz sharhlari — haqiqiy matn, haqiqiy reyting

Shu paytgacha `products.rating` va `products.reviews_count` ustunlari BOR
edi (20260825000000, 1-bo'lim), lekin ularni HECH NARSA to'ldirmasdi:
trigger yo'q, admin panelida maydon yo'q, frontend ularni faqat O'QIYDI
(`adapters.ts`). Amalda bazadagi har bir mahsulotda `rating = 0` va
`reviews_count = 0` turardi — ya'ni kartochkalardagi yulduzcha bloki
hech qachon chizilmasdi.

Bu migratsiya sharhning O'ZINI saqlaydigan jadval qo'shadi va o'sha ikki
ustunni o'sha jadvaldan AVTOMATIK hisoblanadigan qiladi.

## Mavjud mexanizm bilan TO'QNASHUVI YO'Q

  • `sales_count` — 20260825000000 dagi `trg_bump_sales_count` orqali
    `order_items` insert'ida oshadi. TEGILMAYDI.
  • `rating` / `reviews_count` — hech qanday mexanizm yo'q edi, shuning
    uchun bu yerdagi trigger hech nimani ALMASHTIRMAYDI, bo'shliqni
    to'ldiradi.

## Nega qiymatlar bazada hisoblanadi, frontendda emas

O'rtacha reytingni mijoz tomonida hisoblash uchun har bir kartochka
o'zining barcha sharhlarini yuklab olishi kerak bo'lardi — katalogda 40 ta
kartochka uchun bu 40 ta qo'shimcha so'rov. Bazadagi trigger esa qiymatni
sharh yozilgan paytda BIR MARTA hisoblaydi va u har doim to'g'ri bo'ladi:
uni chetlab o'tadigan yo'l yo'q.

## Ism va "xarid tasdiqlangan" NEGA nusxa (snapshot) sifatida saqlanadi

`profiles` jadvalida SELECT policy'si `id = auth.uid() or is_admin()`
(20260814090344). Ya'ni oddiy xaridor BOSHQA foydalanuvchining ismini
o'qiy olmaydi — sharhlar ro'yxatida join qilinsa, mualliflar nomi bo'sh
qaytardi. Xuddi shu sabab `verified_purchase` uchun ham: begona
foydalanuvchining buyurtmalarini ko'rib bo'lmaydi.

Shuning uchun ikkala qiymat yozish paytida SERVER tomonida hisoblanib,
qatorning o'ziga yoziladi. Bu loyihada yangi naqsh EMAS: `order_items`
dagi `product_name` va `image_url` ham aynan shunday nusxa.

MIJOZ YUBORGAN QIYMAT E'TIBORGA OLINMAYDI — trigger uni har safar qayta
yozadi, ya'ni o'zini boshqa nom bilan ko'rsatib bo'lmaydi.
*/

-- ============ 1. Jadval ============

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  /*
   * 10 belgilik pastki chegara — "zo'r", "+" kabi mazmunsiz qatorlar
   * reytingga ta'sir qilmasligi uchun. `trim` bilan: faqat bo'shliqdan
   * iborat matn o'tmaydi.
   */
  body text not null check (length(trim(body)) >= 10),
  /* Server to'ldiradi (4-bo'lim). Mijoz yozganini trigger qayta yozadi. */
  author_name text not null default '',
  verified_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /*
   * BITTA FOYDALANUVCHI — BITTA SHARH.
   *
   * Frontend "yuborish" tugmasi aslida UPSERT qiladi: foydalanuvchi
   * qayta yozsa eski sharhi yangilanadi. Shu cheklov bo'lmasa, bitta
   * odam bitta mahsulotni cheksiz marta baholab, o'rtacha reytingni
   * xohlagan tomonga surib yuborardi.
   */
  constraint product_reviews_one_per_user unique (product_id, user_id)
);

/* Ro'yxat so'rovi: "shu mahsulotning sharhlari, eng yangisi birinchi". */
create index if not exists product_reviews_product_idx
  on public.product_reviews (product_id, created_at desc);

-- ============ 2. RLS ============
/*
 * O'qish HAMMAGA ochiq (do'kon oldi sahifasi, mehmon ham ko'radi), lekin
 * nofaol mahsulotning sharhlari ko'rinmaydi — `product_images` va
 * `product_variants` dagi bilan AYNI shart (20260825000000, 8-bo'lim).
 *
 * Yozish faqat o'ziniki: `auth.uid() = user_id`. Admin uchun alohida
 * policy ATAYLAB yo'q — moderatsiya keyingi vazifa va uni hozir yarim
 * holatda qo'shish noto'g'ri bo'lardi.
 */

alter table public.product_reviews enable row level security;

drop policy if exists public_read_product_reviews on public.product_reviews;
create policy public_read_product_reviews on public.product_reviews
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_id and (p.is_active = true or public.is_admin())
  ));

drop policy if exists own_insert_product_reviews on public.product_reviews;
create policy own_insert_product_reviews on public.product_reviews
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists own_update_product_reviews on public.product_reviews;
create policy own_update_product_reviews on public.product_reviews
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_delete_product_reviews on public.product_reviews;
create policy own_delete_product_reviews on public.product_reviews
  for delete to authenticated
  using (auth.uid() = user_id);

-- ============ 3. rating / reviews_count ni qayta hisoblash ============
/*
 * `security definer` SHART: `products` jadvalida faqat
 * `admin_update_products` policy'si bor (20260814090344), ya'ni oddiy
 * xaridor u yerga yoza olmaydi. Trigger esa xaridor nomidan ishlaydi.
 * Ayni yondashuv `bump_sales_count` da allaqachon qo'llangan.
 *
 * `rating` ustuni `numeric(2,1)` — shuning uchun o'rtacha ATAYLAB bir
 * kasr xonagacha yaxlitlanadi. Aks holda baza yaxlitlashni o'zi qilardi
 * va natija bu yerda ko'rinmasdi.
 */

create or replace function public.refresh_product_rating(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_product_id is null then return; end if;
  update public.products p
  set
    rating = coalesce(
      (select round(avg(r.rating)::numeric, 1) from public.product_reviews r
       where r.product_id = p_product_id),
      0
    ),
    reviews_count = (
      select count(*) from public.product_reviews r where r.product_id = p_product_id
    )
  where p.id = p_product_id;
end;
$$;

create or replace function public.product_reviews_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /*
   * Har bir amal ALOHIDA tarmoqda — `old` va `new` bitta shartda
   * aralashtirilmaydi.
   *
   * Sabab: INSERT'da `old` umuman tayinlanmagan va unga murojaat qilish
   * xato beradi. `tg_op = 'INSERT' or new.product_id is distinct from
   * old.product_id` kabi yozuv xavfsizdek ko'rinadi, lekin SQL'da
   * `or`/`and` ning qisqa tutashuvi (short-circuit) KAFOLATLANMAGAN —
   * ifoda to'liq hisoblanishi va INSERT'da yiqilishi mumkin.
   *
   * Mahsulot almashtirilsa (amalda bo'lmasligi kerak, lekin sxema buni
   * taqiqlamaydi) IKKALA mahsulot ham qayta hisoblanadi — aks holda
   * eskisida sharh soni oshgancha qolib ketardi.
   */
  if tg_op = 'INSERT' then
    perform public.refresh_product_rating(new.product_id);
  elsif tg_op = 'DELETE' then
    perform public.refresh_product_rating(old.product_id);
  else
    perform public.refresh_product_rating(old.product_id);
    if new.product_id is distinct from old.product_id then
      perform public.refresh_product_rating(new.product_id);
    end if;
  end if;
  return null; -- AFTER trigger: qaytariladigan qiymat ishlatilmaydi
end;
$$;

drop trigger if exists trg_product_reviews_recalc on public.product_reviews;
create trigger trg_product_reviews_recalc
  after insert or update or delete on public.product_reviews
  for each row execute function public.product_reviews_recalc();

-- ============ 4. Muallif ismi va xarid tasdig'i (server to'ldiradi) ============

create or replace function public.product_reviews_fill_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /*
   * Mijoz yuborgan `author_name` / `verified_purchase` HAR SAFAR qayta
   * yoziladi — ya'ni ularni soxtalashtirib bo'lmaydi. Ism bo'sh bo'lsa
   * bo'sh qoladi; ko'rinadigan matnni ("Mijoz") frontend hal qiladi,
   * chunki bu tarjima masalasi, ma'lumot emas.
   */
  new.author_name := coalesce(
    nullif(trim((select pr.first_name from public.profiles pr where pr.id = new.user_id)), ''),
    ''
  );

  new.verified_purchase := exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = new.user_id
      and oi.product_id = new.product_id
  );

  /*
   * `updated_at` faqat MAZMUN o'zgarganda yangilanadi — quyidagi
   * 5-bo'limdagi tizim yangilanishi (`verified_purchase` ni yoqish)
   * "foydalanuvchi sharhini tahrirladi" degan yolg'on iz qoldirmasligi
   * kerak.
   *
   * Ichma-ich `if` — yuqoridagi bilan bir xil sabab: `old` ga faqat
   * UPDATE tarmog'ida tegiladi, bitta shartda aralashtirilmaydi.
   */
  if tg_op = 'UPDATE' then
    if new.rating is distinct from old.rating or new.body is distinct from old.body then
      new.updated_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_product_reviews_fill_meta on public.product_reviews;
create trigger trg_product_reviews_fill_meta
  before insert or update on public.product_reviews
  for each row execute function public.product_reviews_fill_meta();

-- ============ 5. Keyin sotib olingan bo'lsa — nishon o'zi paydo bo'ladi ============
/*
 * 4-bo'limdagi tekshiruv sharh YOZILGAN paytdagi holatni oladi. Odam
 * avval fikr bildirib, keyin sotib olishi mumkin — o'shanda nishon
 * abadiy yo'q bo'lib qolardi va ma'lumot noto'g'ri bo'lardi.
 *
 * Shuning uchun `order_items` ga yangi qator tushganda o'sha xaridorning
 * o'sha mahsulotga yozgan sharhi (bo'lsa) tasdiqlanadi. Qo'shimcha
 * so'rov yo'q — trigger allaqachon shu jadvalda ishlaydigan
 * `bump_sales_count` bilan yonma-yon turadi.
 */

create or replace function public.mark_reviews_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is null then return new; end if;

  update public.product_reviews r
  set verified_purchase = true
  from public.orders o
  where o.id = new.order_id
    and r.product_id = new.product_id
    and r.user_id = o.user_id
    and r.verified_purchase = false;

  return new;
end;
$$;

drop trigger if exists trg_mark_reviews_verified on public.order_items;
create trigger trg_mark_reviews_verified
  after insert on public.order_items
  for each row execute function public.mark_reviews_verified();

-- ============ 6. Mavjud qiymatlarni moslashtirish ============
/*
 * Jadval bo'sh bo'lgani uchun bu barcha mahsulotlarda `rating = 0` va
 * `reviews_count = 0` degani — ya'ni hozirgi holat bilan bir xil.
 * Baribir bajariladi: agar ustunlarga qachondir qo'lda qiymat yozilgan
 * bo'lsa, u shu yerda haqiqatga keltiriladi va bundan keyin yagona
 * manba — `product_reviews` jadvali bo'ladi.
 */
do $$
declare v_id uuid;
begin
  for v_id in select id from public.products loop
    perform public.refresh_product_rating(v_id);
  end loop;
end $$;
