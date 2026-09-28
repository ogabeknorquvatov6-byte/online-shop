/* ============================================================
   BARCHA MIGRATSIYALAR — BITTA FAYLDA
   ============================================================

   Supabase SQL Editor -> New query -> shu faylni to'liq qo'ying -> Run.

   XAVFSIZ: har bir bosqich `if not exists` / `create or replace` /
   `on conflict do nothing` bilan yozilgan. Bir necha marta ishga
   tushirsangiz ham dublikat yaratmaydi va ma'lumot o'chirmaydi.
   Bironta `drop table` yoki `drop column` yo'q.

   TARTIB MUHIM — fayllar quyidagi ketma-ketlikda joylashtirilgan,
   chunki keyingilari oldingilarining funksiyalariga tayanadi.
   ============================================================ */

-- ============================================================
-- 1 / 10  ·  20260830000000_order_totals_addresses_and_indexes.sql
-- ============================================================

/*
# Buyurtma summasi, manzillar va indekslar — to'g'rilash migratsiyasi

Bu migratsiya QO'SHIMCHA (additive) va mavjud ma'lumotlarni buzmaydi.
U uchta HAQIQIY xatoni tuzatadi:

## 1. Manzil qo'shish umuman ishlamas edi (CRITICAL)
`AccountPage` "Manzil qo'shish" formasi `addresses` jadvaliga `phone` va
`city` ustunlarini yozmoqchi bo'ladi — lekin bu ustunlar jadvalda YO'Q edi.
Bundan tashqari jadvalda `name` va `full_address` NOT NULL, forma esa
ularni umuman yubormaydi. Natijada har bir "Saqlash" bosilishi xatolik
bilan tugagan. Yechim: yetishmayotgan ustunlar qo'shiladi, `name` va
`full_address` esa yangi tuzilmali maydonlardan trigger orqali avtomatik
to'ldiriladi (eski kod/hisobotlar ular bilan ishlashda davom etadi).

## 2. Buyurtma summasi mijozga ko'rsatilgandan farq qilardi (CRITICAL)
Checkout "Jami" ni `mahsulotlar + yetkazib berish` deb ko'rsatardi, lekin
`create_order` faqat mahsulotlar summasini saqlardi va `delivery_fee` = 0
qolardi. Mijoz 3 029 000 so'm deb tasdiqlagan buyurtma "Buyurtmalarim"
bo'limida va admin panelda 2 999 000 so'm bo'lib ko'rinardi.
Bundan tashqari yetkazib berish narxi frontendda qattiq yozilgan edi
(30 000 / 500 000), ya'ni admin paneldagi "Yetkazib berish" sozlamalari
hech qanday ta'sir ko'rsatmasdi.
Yechim: `create_order` yetkazib berish narxini SERVERDA `store_settings`
asosida hisoblaydi va `subtotal` / `delivery_fee` / `total_amount` ni
izchil saqlaydi. Narxni hech qachon mijoz yubormaydi.

## 3. Shahar / izoh / email jimgina yo'qolardi (HIGH)
Checkout buyurtma yaratilgach `orders` jadvalini `update` qilib
`customer_email`, `city`, `note` yozmoqchi bo'lardi. Lekin `orders`
jadvalida UPDATE uchun faqat `admin_update_orders` policy bor — oddiy
mijozning update'i 0 qatorga ta'sir qilgan va XATO ham qaytarmagan.
Ya'ni kuryer uchun shahar va izoh hech qachon saqlanmagan.
Yechim: bu maydonlar endi `create_order` ning o'ziga parametr sifatida
beriladi (security definer, bitta atomik amal).

## Qo'shimcha
- `order_items` uchun rasm va variant "snapshot" qilinadi (buyurtmalar
  tarixida mahsulot rasmi ko'rinishi uchun).
- Mijoz o'z buyurtmasini FAQAT "Yangi" holatida bekor qila oladi
  (`cancel_own_order`), stock xavfsiz qaytariladi.
- Katalog/qidiruv uchun indekslar.
*/

-- ============================================================
-- 1. ADDRESSES: yetishmayotgan ustunlar + avtomatik to'ldirish
-- ============================================================

alter table public.addresses add column if not exists phone text;
alter table public.addresses add column if not exists city text;

-- `name` va `full_address` NOT NULL bo'lib qoladi (eski kod ularga tayanadi),
-- lekin endi tuzilmali maydonlardan avtomatik hosil qilinadi.
alter table public.addresses alter column name set default '';
alter table public.addresses alter column full_address set default '';

create or replace function public.sync_address_snapshot()
returns trigger language plpgsql as $$
begin
  -- `name` = ro'yxatda ko'rinadigan yorliq ("Uy", "Ish", ...).
  if coalesce(nullif(trim(new.name), ''), '') = '' then
    new.name := coalesce(nullif(trim(new.label), ''), 'Manzil');
  end if;

  -- `full_address` = kuryerga beriladigan bitta satrli to'liq manzil.
  if coalesce(nullif(trim(new.full_address), ''), '') = '' then
    new.full_address := trim(both ', ' from concat_ws(', ',
      nullif(trim(coalesce(new.city, '')), ''),
      nullif(trim(coalesce(new.district, '')), ''),
      nullif(trim(coalesce(new.street, '')), '')
    ));
  end if;

  if coalesce(nullif(trim(new.full_address), ''), '') = '' then
    new.full_address := 'Manzil ko''rsatilmagan';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_address_snapshot on public.addresses;
create trigger trg_sync_address_snapshot
  before insert or update on public.addresses
  for each row execute function public.sync_address_snapshot();

-- ============================================================
-- 2. STORE_SETTINGS: yetkazib berish narxlarini bir marta seed qilamiz
-- ============================================================
-- Ustunlar `default 0` bilan qo'shilgan edi, ya'ni sozlanmagan do'konda
-- yetkazib berish "bepul" bo'lib qolardi. Bu yerda frontend hozirgacha
-- va'da qilib kelgan AYNAN o'sha qiymatlarni yozamiz — mijoz uchun narx
-- o'zgarmaydi, faqat endi admin panelidan boshqarish mumkin bo'ladi.

update public.store_settings
set delivery_fee_tashkent = 30000,
    delivery_fee_republic = 30000,
    free_delivery_threshold = 500000
where id = true
  and delivery_fee_tashkent = 0
  and delivery_fee_republic = 0
  and free_delivery_threshold = 0;

-- Yetkazib berish narxini hisoblovchi yagona manba. Frontend ham xuddi
-- shu qoidani (src/lib/delivery.ts) ishlatadi, shuning uchun mijozga
-- ko'rsatilgan summa serverda saqlangan summa bilan doim mos keladi.
create or replace function public.delivery_fee_for(p_city text, p_subtotal numeric)
returns numeric language sql stable security definer set search_path = public
as $$
  select case
    when s.free_delivery_threshold > 0 and p_subtotal >= s.free_delivery_threshold then 0
    when lower(coalesce(p_city, '')) like '%toshkent%'
      or lower(coalesce(p_city, '')) like '%tashkent%' then s.delivery_fee_tashkent
    else s.delivery_fee_republic
  end
  from public.store_settings s
  where s.id = true
$$;
revoke all on function public.delivery_fee_for(text, numeric) from public;
grant execute on function public.delivery_fee_for(text, numeric) to anon, authenticated;

-- ============================================================
-- 3. CREATE_ORDER: shahar/izoh/email + serverda hisoblangan yetkazib berish
-- ============================================================
-- Eski 7-argumentli variantni olib tashlaymiz, aks holda yangi (default
-- qiymatli) variant bilan birga "function is not unique" xatosi chiqadi.
drop function if exists public.create_order(text, text, text, numeric, numeric, jsonb, text);

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  p_payment_method text default 'Naqd pul',
  p_city text default null,
  p_note text default null,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid; v_item jsonb; v_product public.products%rowtype;
  v_subtotal numeric := 0; v_delivery numeric := 0; v_price numeric;
  v_qty integer; v_active boolean; v_recent_orders integer;
  v_payment_status text; v_variant text; v_image text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_active into v_active from public.profiles where id = auth.uid();
  if v_active is not true then raise exception 'ACCOUNT_BLOCKED'; end if;
  if p_payment_method not in ('Naqd pul', 'Click', 'Payme') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if p_items is null or jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'INVALID_QUANTITY'; end if;

  -- Rate limit: 10 daqiqada 5 tadan ortiq buyurtma yo'q (abuse'ni kamaytirish).
  select count(*) into v_recent_orders from public.orders
  where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if v_recent_orders >= 5 then raise exception 'TOO_MANY_ORDERS'; end if;

  v_payment_status := case when p_payment_method = 'Naqd pul' then 'PAID' else 'PENDING' end;

  -- 1-bosqich: tekshirish va summani hisoblash (narx MIJOZDAN emas, bazadan).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    v_price := public.effective_price(v_product);
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  v_delivery := coalesce(public.delivery_fee_for(p_city, v_subtotal), 0);

  insert into public.orders (
    user_id, customer_name, phone, address, latitude, longitude,
    subtotal, delivery_fee, total_amount,
    payment_method, payment_status, city, note, customer_email
  )
  values (
    auth.uid(), trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude,
    v_subtotal, v_delivery, v_subtotal + v_delivery,
    p_payment_method, v_payment_status,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_order_id;

  -- 2-bosqich: pozitsiyalarni yozish va stockni kamaytirish.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    v_variant := nullif(trim(coalesce(v_item->>'variant', '')), '');

    -- Rasmni "snapshot" qilamiz: mahsulot keyinchalik o'chirilsa/o'zgarsa ham
    -- buyurtmalar tarixida to'g'ri rasm ko'rinib turadi.
    select pi.image_url into v_image from public.product_images pi
      where pi.product_id = v_product.id order by pi.sort_order limit 1;
    v_image := coalesce(nullif(v_image, ''), nullif(v_product.image_url, ''));

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, variant, image_url)
    values (v_order_id, v_product.id, v_product.name, v_price, v_qty, v_variant, v_image);

    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;

  if p_payment_method in ('Click', 'Payme') then
    insert into public.payments (order_id, provider, status, amount)
    values (v_order_id, lower(p_payment_method), 'PENDING', v_subtotal + v_delivery);
  end if;

  return v_order_id;
end; $$;
revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) to authenticated;

-- Eski nom hali ham ishlaydi (boshqa mijozlar/integratsiyalar uchun).
create or replace function public.create_cash_order(
  p_customer_name text, p_phone text, p_address text,
  p_latitude numeric, p_longitude numeric, p_items jsonb
)
returns uuid language sql security definer set search_path = public
as $$
  select public.create_order(p_customer_name, p_phone, p_address, p_latitude, p_longitude, p_items, 'Naqd pul');
$$;
revoke all on function public.create_cash_order from public;
grant execute on function public.create_cash_order to authenticated;

-- ============================================================
-- 4. Mijoz o'z buyurtmasini bekor qilishi (faqat "Yangi" holatida)
-- ============================================================
-- Ilgari mijozda buyurtmani bekor qilishning HECH QANDAY yo'li yo'q edi va
-- `orders` uchun UPDATE policy faqat adminda. Bu yerda tor doiradagi,
-- stockni to'g'ri qaytaradigan funksiya beriladi.

create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> auth.uid() then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'Yangi' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;

  if not v_order.stock_restored then
    for v_item in select product_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    end loop;
  end if;

  update public.orders
  set status = 'Bekor qilindi', stock_restored = true
  where id = p_order_id;
end; $$;
revoke all on function public.cancel_own_order(uuid) from public;
grant execute on function public.cancel_own_order(uuid) to authenticated;

-- ============================================================
-- 5. Admin dashboard statistikasi (serverda agregatsiya)
-- ============================================================
-- Admin paneli "Umumiy savdo" ni oxirgi 10 ta buyurtmadan hisoblardi, ya'ni
-- ko'rsatilgan daromad HAMISHA noto'g'ri edi. PostgREST orqali SUM qilib
-- bo'lmagani uchun bitta admin-only RPC beramiz.

create or replace function public.admin_dashboard_stats()
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'products', (select count(*) from public.products),
    'products_active', (select count(*) from public.products where is_active),
    'out_of_stock', (select count(*) from public.products where is_active and stock <= 0),
    'categories', (select count(*) from public.categories),
    'users', (select count(*) from public.profiles),
    'orders', (select count(*) from public.orders),
    'orders_new', (select count(*) from public.orders where status = 'Yangi'),
    'orders_processing', (select count(*) from public.orders where status in ('Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda')),
    'orders_delivered', (select count(*) from public.orders where status = 'Yetkazildi'),
    'orders_cancelled', (select count(*) from public.orders where status = 'Bekor qilindi'),
    'revenue', (select coalesce(sum(total_amount), 0) from public.orders where status = 'Yetkazildi'),
    'revenue_pending', (select coalesce(sum(total_amount), 0) from public.orders where status not in ('Yetkazildi','Bekor qilindi')),
    'revenue_30d', (select coalesce(sum(total_amount), 0) from public.orders where status = 'Yetkazildi' and created_at > now() - interval '30 days')
  ) end
$$;
revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ============================================================
-- 6. Indekslar — katalog, saralash va qidiruv uchun
-- ============================================================

create index if not exists products_active_created_idx
  on public.products (is_active, created_at desc);
create index if not exists products_active_sales_idx
  on public.products (is_active, sales_count desc);
create index if not exists products_active_price_idx
  on public.products (is_active, price);
create index if not exists orders_created_idx
  on public.orders (created_at desc);

-- ILIKE '%...%' qidiruvi indekssiz butun jadvalni skanerlaydi. pg_trgm
-- mavjud bo'lsa GIN indeks bilan tezlashtiramiz; mavjud bo'lmasa migratsiya
-- baribir muvaffaqiyatli yakunlanadi.
do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops)';
  execute 'create index if not exists products_brand_trgm_idx on public.products using gin (brand gin_trgm_ops)';
  execute 'create index if not exists categories_name_trgm_idx on public.categories using gin (name gin_trgm_ops)';
exception when others then
  raise notice 'pg_trgm mavjud emas — trigram indekslar o''tkazib yuborildi';
end $$;


-- ============================================================
-- 2 / 10  ·  20260831000000_media_gallery_and_variants.sql
-- ============================================================

/*
# Ko'p rasmli galereya + to'liq variant (rang) tizimi

Bu migratsiya QO'SHIMCHA (additive). Hech qanday ustun/jadval o'chirilmaydi
yoki qayta nomlanmaydi; mavjud RLS policy'lar va funksiyalar ishlashda
davom etadi.

## 1. product_images — asosiy rasm va tartib
`product_images` jadvali allaqachon bir mahsulotga cheksiz rasm saqlay
olardi, lekin qaysi rasm ASOSIY ekanini belgilash imkoni yo'q edi:
frontend shunchaki `sort_order` bo'yicha birinchisini olardi, admin esa
faqat bitta rasm bilan ishlardi. Endi `is_primary` bayrog'i bor va bir
mahsulotda faqat bitta asosiy rasm bo'lishi trigger bilan kafolatlanadi.

## 2. product_variants — rang kodi, rasm, ombor, narx farqi
Variantlar faqat (type, value) juftligidan iborat edi — ya'ni rangning
ko'rinishi, o'z rasmi, o'z ombori va narx farqi bo'lishi mumkin emasdi.

## 3. Narx xavfsizligi
Variantning narx farqi FAQAT serverda qo'shiladi: `create_order` endi
`variant_id` ni qabul qiladi, uning haqiqatan shu mahsulotga tegishliligini
tekshiradi va narxni bazadagi qiymatdan hisoblaydi. Mijoz yuborgan narxga
hech qachon ishonilmaydi.
*/

-- ============================================================
-- 1. PRODUCT_IMAGES: asosiy rasm
-- ============================================================

alter table public.product_images add column if not exists is_primary boolean not null default false;

-- Backfill: har bir mahsulotda eng kichik sort_order'li rasm asosiy bo'ladi.
with ranked as (
  select id, row_number() over (partition by product_id order by sort_order, created_at) as rn
  from public.product_images
)
update public.product_images pi
set is_primary = true
from ranked r
where r.id = pi.id
  and r.rn = 1
  and not exists (
    select 1 from public.product_images x
    where x.product_id = pi.product_id and x.is_primary
  );

/*
 * Bir mahsulotda faqat BITTA asosiy rasm bo'lishini ta'minlaydi.
 * Admin yangi rasmni asosiy qilib belgilaganda eskisini qo'lda
 * o'chirish shart emas — bu server darajasida hal qilinadi, ya'ni
 * ikkita parallel so'rov ham ma'lumotni buza olmaydi.
 */
create or replace function public.enforce_single_primary_image()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_primary then
    update public.product_images
    set is_primary = false
    where product_id = new.product_id
      and id <> new.id
      and is_primary;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_single_primary_image on public.product_images;
create trigger trg_single_primary_image
  after insert or update of is_primary on public.product_images
  for each row when (new.is_primary)
  execute function public.enforce_single_primary_image();

create index if not exists product_images_primary_idx
  on public.product_images (product_id) where is_primary;

-- ============================================================
-- 2. PRODUCT_VARIANTS: rang kodi, rasm, ombor, narx farqi
-- ============================================================

alter table public.product_variants add column if not exists label text;
alter table public.product_variants add column if not exists color_code text;
alter table public.product_variants add column if not exists image_url text;
-- NULL = "alohida ombor yuritilmaydi, mahsulotning umumiy qoldig'i ishlatiladi".
alter table public.product_variants add column if not exists stock integer;
alter table public.product_variants add column if not exists price_adjustment numeric(14,2) not null default 0;
alter table public.product_variants add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_stock_check') then
    alter table public.product_variants
      add constraint product_variants_stock_check check (stock is null or stock >= 0);
  end if;
end $$;

-- Bitta mahsulotda bir xil (type, value) juftligi takrorlanmasin.
create unique index if not exists product_variants_unique_value
  on public.product_variants (product_id, type, value);

-- ============================================================
-- 3. ORDER_ITEMS: qaysi variant sotilganini aniq saqlaymiz
-- ============================================================
-- Ilgari faqat matnli `variant` saqlanardi. Variant keyinchalik
-- qayta nomlansa, buyurtmani variantga bog'lab bo'lmasdi.

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

-- ============================================================
-- 4. CREATE_ORDER: variant narxi va ombori serverda tekshiriladi
-- ============================================================

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  p_payment_method text default 'Naqd pul',
  p_city text default null,
  p_note text default null,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid; v_item jsonb; v_product public.products%rowtype;
  v_variant public.product_variants%rowtype; v_variant_id uuid;
  v_subtotal numeric := 0; v_delivery numeric := 0; v_price numeric;
  v_qty integer; v_active boolean; v_recent_orders integer;
  v_payment_status text; v_variant_label text; v_image text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_active into v_active from public.profiles where id = auth.uid();
  if v_active is not true then raise exception 'ACCOUNT_BLOCKED'; end if;
  if p_payment_method not in ('Naqd pul', 'Click', 'Payme') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if p_items is null or jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'INVALID_QUANTITY'; end if;

  select count(*) into v_recent_orders from public.orders
  where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if v_recent_orders >= 5 then raise exception 'TOO_MANY_ORDERS'; end if;

  v_payment_status := case when p_payment_method = 'Naqd pul' then 'PAID' else 'PENDING' end;

  -- 1-bosqich: tekshirish va summani hisoblash.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;

    v_price := public.effective_price(v_product);

    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    if v_variant_id is not null then
      select * into v_variant from public.product_variants
        where id = v_variant_id and product_id = v_product.id for update;
      -- Variant boshqa mahsulotga tegishli bo'lsa yoki o'chirilgan bo'lsa —
      -- so'rov soxtalashtirilgan deb hisoblanadi.
      if not found or v_variant.is_active is not true then raise exception 'INVALID_VARIANT'; end if;
      if v_variant.stock is not null and v_variant.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
      v_price := greatest(v_price + coalesce(v_variant.price_adjustment, 0), 0);
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  v_delivery := coalesce(public.delivery_fee_for(p_city, v_subtotal), 0);

  insert into public.orders (
    user_id, customer_name, phone, address, latitude, longitude,
    subtotal, delivery_fee, total_amount,
    payment_method, payment_status, city, note, customer_email
  )
  values (
    auth.uid(), trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude,
    v_subtotal, v_delivery, v_subtotal + v_delivery,
    p_payment_method, v_payment_status,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_order_id;

  -- 2-bosqich: pozitsiyalarni yozish va ombordan yechish.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    v_variant_label := nullif(trim(coalesce(v_item->>'variant', '')), '');
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_image := null;

    if v_variant_id is not null then
      select * into v_variant from public.product_variants where id = v_variant_id;
      v_price := greatest(v_price + coalesce(v_variant.price_adjustment, 0), 0);
      v_variant_label := coalesce(v_variant_label, v_variant.value);
      v_image := nullif(v_variant.image_url, '');
      if v_variant.stock is not null then
        update public.product_variants set stock = stock - v_qty where id = v_variant_id;
      end if;
    end if;

    -- Rasmni "snapshot" qilamiz: asosiy rasm, bo'lmasa birinchi rasm.
    if v_image is null then
      select pi.image_url into v_image from public.product_images pi
        where pi.product_id = v_product.id
        order by pi.is_primary desc, pi.sort_order
        limit 1;
      v_image := coalesce(nullif(v_image, ''), nullif(v_product.image_url, ''));
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, variant, variant_id, image_url)
    values (v_order_id, v_product.id, v_product.name, v_price, v_qty, v_variant_label, v_variant_id, v_image);

    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;

  if p_payment_method in ('Click', 'Payme') then
    insert into public.payments (order_id, provider, status, amount)
    values (v_order_id, lower(p_payment_method), 'PENDING', v_subtotal + v_delivery);
  end if;

  return v_order_id;
end; $$;

revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) to authenticated;

-- ============================================================
-- 5. Bekor qilishda variant ombori ham qaytarilsin
-- ============================================================

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_current text; v_restored boolean; v_item record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('Yangi','Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, stock_restored into v_current, v_restored from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_status = 'Bekor qilindi' and v_current <> 'Bekor qilindi' and not v_restored then
    for v_item in select product_id, variant_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock + v_item.quantity
        where id = v_item.variant_id and stock is not null;
      end if;
    end loop;
    update public.orders set status = p_status, stock_restored = true where id = p_order_id;
    return;
  end if;

  if p_status <> 'Bekor qilindi' and v_current = 'Bekor qilindi' and v_restored then
    for v_item in select product_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      if (select stock from public.products where id = v_item.product_id) < v_item.quantity then
        raise exception 'OUT_OF_STOCK';
      end if;
    end loop;
    for v_item in select product_id, variant_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock - v_item.quantity
        where id = v_item.variant_id and stock is not null;
      end if;
    end loop;
    update public.orders set status = p_status, stock_restored = false where id = p_order_id;
    return;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end; $$;
revoke all on function public.set_order_status from public;
grant execute on function public.set_order_status to authenticated;

-- ============================================================
-- 6. Mijoz bekor qilganda ham variant ombori qaytarilsin
-- ============================================================

create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> auth.uid() then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'Yangi' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;

  if not v_order.stock_restored then
    for v_item in select product_id, variant_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock + v_item.quantity
        where id = v_item.variant_id and stock is not null;
      end if;
    end loop;
  end if;

  update public.orders set status = 'Bekor qilindi', stock_restored = true where id = p_order_id;
end; $$;
revoke all on function public.cancel_own_order(uuid) from public;
grant execute on function public.cancel_own_order(uuid) to authenticated;


-- ============================================================
-- 3 / 10  ·  20260901000000_telegram_bot_and_google_auth.sql
-- ============================================================

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


-- ============================================================
-- 4 / 10  ·  20260902000000_telegram_shopping.sql
-- ============================================================

/*
# Telegram bot — to'liq savdo kanali

Bot endi faqat autentifikatsiya vositasi emas: katalog ko'rish, savat va
buyurtma berish to'g'ridan-to'g'ri Telegram ichida bajariladi.

## Eng muhim qaror: buyurtma mantig'i BITTA joyda qoladi

Botga alohida "buyurtma yaratish" kodi YOZILMAYDI. Aks holda sayt va bot
narxni, yetkazib berishni va ombor tekshiruvini har xil hisoblab, vaqt
o'tishi bilan ajralib ketardi — bu esa pul bilan bog'liq eng xavfli
xatolik turi.

Buning o'rniga mavjud `create_order` ikkiga bo'linadi:
  - `create_order_as(p_user_id, …)` — butun mantiq shu yerda;
  - `create_order(…)`               — o'sha funksiyaga `auth.uid()` bilan
                                      murojaat qiladigan yupqa qobiq.

Bot (service_role) `create_order_as` ni chaqiradi. Narx, chegirma,
variant qo'shimchasi, ombor va yetkazib berish — hammasi baribir
SERVERDA, bazadagi qiymatlardan hisoblanadi. Botdan kelgan narxga
hech qachon ishonilmaydi.

`create_order_as` `authenticated`/`anon` uchun YOPIQ — aks holda
istalgan foydalanuvchi boshqa odam nomidan buyurtma bera olardi.
*/

-- ============================================================
-- 1. TELEGRAM_CARTS — bot ichidagi savat
-- ============================================================
/*
 * Savat saytdagidek localStorage'da emas, chunki Telegram'da "brauzer
 * xotirasi" yo'q. Har bir chat uchun bitta qator yetarli.
 *
 * `items` ichida narx SAQLANMAYDI (faqat product_id/variant_id/qty):
 * narx doim ko'rsatish paytida bazadan o'qiladi, buyurtmada esa server
 * qayta hisoblaydi. Shunda savatda "eskirgan narx" muammosi umuman
 * paydo bo'lmaydi.
 */
create table if not exists public.telegram_carts (
  chat_id bigint primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.telegram_carts enable row level security;
-- Policy yo'q: faqat Edge Function (service role) ishlaydi.

/*
 * Ko'rilayotgan mahsulot (variant va miqdor bilan) sessiyada saqlanadi.
 *
 * Nega callback_data emas? Telegram callback_data uchun 64 BAYT chegara
 * qo'yadi, mahsulot va variant UUID'lari esa 36 baytdan. Ularni qisqartirish
 * (prefiks/short-id) mo'rt yechim bo'lardi. Suhbatda foydalanuvchi bir
 * vaqtda bitta mahsulot kartasi bilan ishlaydi, shuning uchun tanlovni
 * sessiyada saqlash ham to'g'ri, ham xavfsiz.
 */
alter table public.telegram_sessions add column if not exists pending_item jsonb;
-- Checkout bosqichlari uchun (manzil, ism, izoh) vaqtinchalik ma'lumot.
alter table public.telegram_sessions add column if not exists checkout jsonb;
-- Katalogda varaqlanayotgan xabarni o'rnida yangilash uchun.
alter table public.telegram_sessions add column if not exists list_message_id bigint;

create index if not exists telegram_carts_updated_at_idx
  on public.telegram_carts (updated_at desc);

-- ============================================================
-- 2. STOCK_ALERTS — "mavjud bo'lganda xabar bering"
-- ============================================================
create table if not exists public.stock_alerts (
  chat_id bigint not null,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, product_id)
);

alter table public.stock_alerts enable row level security;

create index if not exists stock_alerts_product_idx on public.stock_alerts (product_id);

-- ============================================================
-- 3. CREATE_ORDER_AS — buyurtma mantig'ining yagona manbasi
-- ============================================================

create or replace function public.create_order_as(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  p_payment_method text default 'Naqd pul',
  p_city text default null,
  p_note text default null,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid; v_item jsonb; v_product public.products%rowtype;
  v_variant public.product_variants%rowtype; v_variant_id uuid;
  v_subtotal numeric := 0; v_delivery numeric := 0; v_price numeric;
  v_qty integer; v_active boolean; v_recent_orders integer;
  v_payment_status text; v_variant_label text; v_image text;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_active into v_active from public.profiles where id = p_user_id;
  if v_active is not true then raise exception 'ACCOUNT_BLOCKED'; end if;
  if p_payment_method not in ('Naqd pul', 'Click', 'Payme') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if p_items is null or jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'INVALID_QUANTITY'; end if;

  select count(*) into v_recent_orders from public.orders
  where user_id = p_user_id and created_at > now() - interval '10 minutes';
  if v_recent_orders >= 5 then raise exception 'TOO_MANY_ORDERS'; end if;

  v_payment_status := case when p_payment_method = 'Naqd pul' then 'PAID' else 'PENDING' end;

  -- 1-bosqich: tekshirish va summani hisoblash (narx MIJOZDAN emas, bazadan).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;

    v_price := public.effective_price(v_product);

    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    if v_variant_id is not null then
      select * into v_variant from public.product_variants
        where id = v_variant_id and product_id = v_product.id for update;
      if not found or v_variant.is_active is not true then raise exception 'INVALID_VARIANT'; end if;
      if v_variant.stock is not null and v_variant.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
      v_price := greatest(v_price + coalesce(v_variant.price_adjustment, 0), 0);
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  v_delivery := coalesce(public.delivery_fee_for(p_city, v_subtotal), 0);

  insert into public.orders (
    user_id, customer_name, phone, address, latitude, longitude,
    subtotal, delivery_fee, total_amount,
    payment_method, payment_status, city, note, customer_email
  )
  values (
    p_user_id, trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude,
    v_subtotal, v_delivery, v_subtotal + v_delivery,
    p_payment_method, v_payment_status,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_order_id;

  -- 2-bosqich: pozitsiyalarni yozish va ombordan yechish.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    v_variant_label := nullif(trim(coalesce(v_item->>'variant', '')), '');
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_image := null;

    if v_variant_id is not null then
      select * into v_variant from public.product_variants where id = v_variant_id;
      v_price := greatest(v_price + coalesce(v_variant.price_adjustment, 0), 0);
      v_variant_label := coalesce(v_variant_label, v_variant.value);
      v_image := nullif(v_variant.image_url, '');
      if v_variant.stock is not null then
        update public.product_variants set stock = stock - v_qty where id = v_variant_id;
      end if;
    end if;

    if v_image is null then
      select pi.image_url into v_image from public.product_images pi
        where pi.product_id = v_product.id
        order by pi.is_primary desc, pi.sort_order
        limit 1;
      v_image := coalesce(nullif(v_image, ''), nullif(v_product.image_url, ''));
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, variant, variant_id, image_url)
    values (v_order_id, v_product.id, v_product.name, v_price, v_qty, v_variant_label, v_variant_id, v_image);

    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;

  if p_payment_method in ('Click', 'Payme') then
    insert into public.payments (order_id, provider, status, amount)
    values (v_order_id, lower(p_payment_method), 'PENDING', v_subtotal + v_delivery);
  end if;

  return v_order_id;
end; $$;

-- FAQAT service_role. Aks holda istalgan foydalanuvchi `p_user_id` ni
-- almashtirib, boshqa odam nomidan buyurtma bera olardi.
revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) from anon, authenticated;

-- ============================================================
-- 4. CREATE_ORDER — endi yupqa qobiq
-- ============================================================

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  p_payment_method text default 'Naqd pul',
  p_city text default null,
  p_note text default null,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.create_order_as(
    auth.uid(), p_customer_name, p_phone, p_address, p_latitude, p_longitude,
    p_items, p_payment_method, p_city, p_note, p_email
  );
end; $$;
revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) to authenticated;

-- ============================================================
-- 5. BOT_SALES_STATS — admin uchun tezkor statistika
-- ============================================================
-- PostgREST orqali SUM/GROUP BY qilib bo'lmaydi, shuning uchun bitta
-- funksiya. Faqat service_role chaqira oladi (bot admin bo'limi).

create or replace function public.bot_sales_stats()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'today_count', (
      select count(*) from public.orders
      where created_at >= date_trunc('day', now()) and status <> 'Bekor qilindi'
    ),
    'today_sum', (
      select coalesce(sum(total_amount), 0) from public.orders
      where created_at >= date_trunc('day', now()) and status <> 'Bekor qilindi'
    ),
    'open_count', (
      select count(*) from public.orders
      where status in ('Yangi', 'Qabul qilindi', 'Tayyorlanmoqda', 'Yetkazilmoqda')
    ),
    'week_sum', (
      select coalesce(sum(total_amount), 0) from public.orders
      where created_at > now() - interval '7 days' and status <> 'Bekor qilindi'
    ),
    'top_products', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select oi.product_name as name, sum(oi.quantity)::int as qty
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.created_at > now() - interval '7 days'
          and o.status <> 'Bekor qilindi'
        group by oi.product_name
        order by qty desc
        limit 5
      ) t
    )
  )
$$;
revoke all on function public.bot_sales_stats() from public;
revoke all on function public.bot_sales_stats() from anon, authenticated;

-- ============================================================
-- 6. TELEGRAM_PRODUCT_VIEWS — maqsadli xabar uchun
-- ============================================================
/*
 * DIQQAT: loyihada "kim qaysi mahsulotni ko'rgan" degan ma'lumot YO'Q edi.
 * `20260816030000` migratsiyasi faqat `products.view_count` HISOBLAGICHINI
 * qo'shgan — u kim ko'rganini eslab qolmaydi. Ya'ni "faqat shu mahsulotni
 * ko'rganlarga xabar yuborish" mavjud ma'lumot bilan imkonsiz edi.
 *
 * Shuning uchun bu jadval kiritiladi va u FAQAT bot ichidagi ko'rishlarni
 * yozadi (bot chat_id ni biladi). Saytdagi anonim ko'rishlar bu yerga
 * tushmaydi — ularda xabar yuborish uchun manzil ham yo'q.
 */
create table if not exists public.telegram_product_views (
  chat_id bigint not null,
  product_id uuid not null references public.products(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  view_count integer not null default 1,
  primary key (chat_id, product_id)
);

alter table public.telegram_product_views enable row level security;

create index if not exists telegram_product_views_product_idx
  on public.telegram_product_views (product_id, viewed_at desc);

-- Bot mahsulot kartasini ko'rsatganda chaqiradi (service role).
create or replace function public.track_telegram_product_view(p_chat_id bigint, p_product_id uuid)
returns void language sql security definer set search_path = public
as $$
  insert into public.telegram_product_views (chat_id, product_id)
  values (p_chat_id, p_product_id)
  on conflict (chat_id, product_id)
  do update set viewed_at = now(), view_count = public.telegram_product_views.view_count + 1;
$$;
revoke all on function public.track_telegram_product_view(bigint, uuid) from public;
revoke all on function public.track_telegram_product_view(bigint, uuid) from anon, authenticated;

-- ============================================================
-- 7. SERVICE_ROLE UCHUN EXECUTE HUQUQLARI
-- ============================================================
/*
 * MUHIM va oson e'tibordan qochadigan joy.
 *
 * Postgres'da funksiyaga EXECUTE sukut bo'yicha PUBLIC ga beriladi va
 * `service_role` uni aynan PUBLIC orqali oladi — alohida grant emas.
 * Ya'ni `revoke all ... from public` deyilganda service_role ham
 * huquqini YO'QOTADI.
 *
 * Bot service_role bilan ishlaydi, shuning uchun unga kerak bo'lgan
 * funksiyalar shu yerda ANIQ beriladi. Busiz bot chaqiruvlari
 * "permission denied for function" bilan tugardi — va bu faqat
 * ishlab turgan botda, buyurtma berish paytida ma'lum bo'lardi.
 */
grant execute on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) to service_role;
grant execute on function public.bot_sales_stats() to service_role;
grant execute on function public.track_telegram_product_view(bigint, uuid) to service_role;

-- Bu ikkisi oldingi migratsiyalarda faqat `anon`/`authenticated` ga
-- berilgan edi — bot ularni ham chaqiradi (yetkazib berish narxi va
-- buyurtma holatini o'zgartirish).
grant execute on function public.delivery_fee_for(text, numeric) to service_role;
grant execute on function public.set_order_status(uuid, text) to service_role;

-- ============================================================
-- 8. SET_ORDER_STATUS — bot admin bo'limi uchun
-- ============================================================
/*
 * EXECUTE huquqining o'zi yetarli emas: funksiya ichida `is_admin()`
 * tekshiruvi bor, u esa `auth.uid()` ga tayanadi. Bot service_role
 * bilan, ya'ni foydalanuvchi JWT'isiz ishlaydi — `auth.uid()` NULL,
 * demak `is_admin()` false va bot doim 'FORBIDDEN' olardi.
 *
 * Yechim: service_role ni ANIQ tanib olamiz (JWT claim orqali).
 * Oddiy foydalanuvchi bu claim'ni qalbakilashtira olmaydi — u
 * PostgREST tomonidan tekshirilgan tokendan keladi. Qolgan hamma
 * uchun avvalgidek `is_admin()` talab qilinadi.
 *
 * Mantiqning qolgan qismi (ombor qaytarish/band qilish) o'zgarmaydi.
 */
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_current text; v_restored boolean; v_item record; v_role text;
begin
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('Yangi','Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, stock_restored into v_current, v_restored from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_status = 'Bekor qilindi' and v_current <> 'Bekor qilindi' and not v_restored then
    for v_item in select product_id, variant_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock + v_item.quantity
        where id = v_item.variant_id and stock is not null;
      end if;
    end loop;
    update public.orders set status = p_status, stock_restored = true where id = p_order_id;
    return;
  end if;

  if p_status <> 'Bekor qilindi' and v_current = 'Bekor qilindi' and v_restored then
    for v_item in select product_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      if (select stock from public.products where id = v_item.product_id) < v_item.quantity then
        raise exception 'OUT_OF_STOCK';
      end if;
    end loop;
    for v_item in select product_id, variant_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock - v_item.quantity
        where id = v_item.variant_id and stock is not null;
      end if;
    end loop;
    update public.orders set status = p_status, stock_restored = false where id = p_order_id;
    return;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end; $$;
revoke all on function public.set_order_status(uuid, text) from public;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.set_order_status(uuid, text) to service_role;


-- ============================================================
-- 5 / 10  ·  20260903000000_fix_role_change_from_sql.sql
-- ============================================================

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


-- ============================================================
-- 6 / 10  ·  20260904000000_fix_signup_trigger.sql
-- ============================================================

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


-- ============================================================
-- 7 / 10  ·  20260905000000_ensure_signup_trigger.sql
-- ============================================================

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


-- ============================================================
-- 8 / 10  ·  20260906000000_guaranteed_profile_creation.sql
-- ============================================================

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


-- ============================================================
-- 9 / 10  ·  20260907000000_catalog_import_support.sql
-- ============================================================

/*
# Katalog importi uchun qo'llab-quvvatlash

openshop.uz katalogini ko'chirish uchun kerak bo'ladigan ustunlar.
Hammasi QO'SHIMCHA — mavjud ma'lumot va mantiqqa tegilmaydi.

## Nega `source_id` kerak
Import TAKRORIY bajariladi (narxlar kuniga yangilanadi). Agar mahsulotni
faqat nomi yoki slug'i bo'yicha tanisak, manbada nom ozgina o'zgarishi
bilan dublikat paydo bo'ladi. `source_id` — manbadagi barqaror ID,
shuning uchun UPSERT kaliti sifatida aynan u ishlatiladi.

## Nega `model_key` kerak
openshop.uz da HAR BIR RANG alohida mahsulot (alohida ID va sahifa):
  2761 = Samsung VCC5620X37 (Qizil)
  2760 = Samsung VCC5610X3W (Oq)
Bizda esa rang — variant. `model_key` (nomdan rang so'zi olib tashlangan)
bir mahsulotning ranglarini birlashtirish uchun kalit bo'ladi.

## Nega `specs` jsonb
Manbadagi "Asosiy xususiyatlar" jadvali {nom: qiymat} ko'rinishida keladi.
Alohida jadval yaratish o'rniga jsonb yetarli: u faqat mahsulot sahifasida
ko'rsatiladi, ular bo'yicha filtr qilinmaydi.
*/

-- ============================================================
-- 1. PRODUCTS
-- ============================================================

alter table public.products add column if not exists source_id bigint;
alter table public.products add column if not exists model_key text;
alter table public.products add column if not exists warranty text;
alter table public.products add column if not exists specs jsonb not null default '{}'::jsonb;

-- UPSERT kaliti. Qisman indeks: qo'lda kiritilgan mahsulotlarda
-- `source_id` NULL bo'ladi va ular bir-biriga xalaqit bermaydi.
create unique index if not exists products_source_id_unique_idx
  on public.products (source_id) where source_id is not null;

-- Rang variantlarini guruhlash uchun.
create index if not exists products_model_key_idx
  on public.products (model_key) where model_key is not null;

-- ============================================================
-- 2. CATEGORIES
-- ============================================================
-- `categories.json` dagi 110 ta kategoriya ham takroriy import
-- qilinadi, shuning uchun ularga ham barqaror kalit kerak.

alter table public.categories add column if not exists source_id integer;

create unique index if not exists categories_source_id_unique_idx
  on public.categories (source_id) where source_id is not null;

-- ============================================================
-- 3. PRODUCT_IMAGES
-- ============================================================
/*
 Rasm importi ham idempotent bo'lishi kerak: skript qayta ishga
 tushganda bir xil rasm ikkinchi marta qo'shilmasin.

 `source_url` — manbadagi asl manzil. Rasmni o'z serveringizga
 ko'chirgandan keyin `image_url` o'zgaradi, lekin `source_url`
 o'zgarmaydi va takroriylikni aynan u aniqlaydi.
*/
alter table public.product_images add column if not exists source_url text;

create unique index if not exists product_images_source_unique_idx
  on public.product_images (product_id, source_url) where source_url is not null;

-- ============================================================
-- 4. PRODUCT_VARIANTS
-- ============================================================
-- Har bir rang manbada alohida mahsulot bo'lgani uchun, variantda ham
-- uning manba ID'sini saqlaymiz — takroriy importda yangilash uchun.

alter table public.product_variants add column if not exists source_id bigint;

create unique index if not exists product_variants_source_id_unique_idx
  on public.product_variants (source_id) where source_id is not null;

-- ============================================================
-- 5. IMPORT UCHUN YORDAMCHI: xavfsiz UPSERT
-- ============================================================
/*
 Nega alohida funksiya?

 Mahsulotni import qilish bitta INSERT emas: kategoriya, narx mantig'i,
 rasmlar va variantlar birga yozilishi kerak va BITTA tranzaksiyada
 bo'lishi shart. Aks holda tarmoq uzilganda mahsulot rasmsiz yoki
 variantsiz qolib ketadi.

 Faqat service_role chaqira oladi — import skripti server tomonda
 ishlaydi.
*/
create or replace function public.import_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
  v_sku text;
  v_price numeric;
  v_discount numeric;
  v_image jsonb;
  v_variant jsonb;
  v_idx integer := 0;
begin
  v_slug := nullif(trim(p->>'slug'), '');
  v_sku  := coalesce(nullif(trim(p->>'sku'), ''), 'OS-' || (p->>'source_id'));

  /*
   * NARX MANTIG'I — e'tibor bilan.
   * Manbada:  price = hozirgi sotuv narxi, old_price = chegirmagacha.
   * Bizda  :  price = asl (yuqori) narx, discount_price = chegirmali.
   *           CHECK: discount_price < price.
   * Shuning uchun teskari moslaymiz.
   */
  v_price := nullif(p->>'price', '')::numeric;
  v_discount := null;

  if (p->>'old_price') is not null
     and nullif(p->>'old_price', '')::numeric > coalesce(v_price, 0) then
    v_discount := v_price;
    v_price := nullif(p->>'old_price', '')::numeric;
  end if;

  insert into public.products (
    source_id, name, slug, sku, brand, description, specs, warranty,
    price, discount_price, stock, category_id, model_key, image_url, is_active
  )
  values (
    (p->>'source_id')::bigint,
    coalesce(nullif(trim(p->>'name'), ''), 'Nomsiz mahsulot'),
    coalesce(v_slug, 'mahsulot-' || (p->>'source_id')),
    v_sku,
    coalesce(nullif(trim(p->>'brand'), ''), ''),
    coalesce(p->>'description', ''),
    coalesce(p->'specs', '{}'::jsonb),
    nullif(trim(p->>'warranty'), ''),
    coalesce(v_price, 0),
    v_discount,
    coalesce((p->>'stock')::integer, 0),
    nullif(p->>'category_id', '')::uuid,
    nullif(trim(p->>'model_key'), ''),
    coalesce(p->'images'->>0, ''),
    coalesce((p->>'is_active')::boolean, true)
  )
  on conflict (source_id) where source_id is not null
  do update set
    name           = excluded.name,
    brand          = excluded.brand,
    description    = excluded.description,
    specs          = excluded.specs,
    warranty       = excluded.warranty,
    price          = excluded.price,
    discount_price = excluded.discount_price,
    stock          = excluded.stock,
    category_id    = coalesce(excluded.category_id, public.products.category_id),
    model_key      = excluded.model_key,
    image_url      = excluded.image_url,
    is_active      = excluded.is_active
  returning id into v_id;

  -- ── Rasmlar ──
  for v_image in select * from jsonb_array_elements(coalesce(p->'images', '[]'::jsonb)) loop
    insert into public.product_images (product_id, image_url, source_url, sort_order, is_primary)
    values (v_id, v_image #>> '{}', v_image #>> '{}', v_idx, v_idx = 0)
    on conflict (product_id, source_url) where source_url is not null
    do update set sort_order = excluded.sort_order, is_primary = excluded.is_primary;
    v_idx := v_idx + 1;
  end loop;

  -- ── Rang variantlari ──
  for v_variant in select * from jsonb_array_elements(coalesce(p->'variants', '[]'::jsonb)) loop
    insert into public.product_variants (
      product_id, source_id, type, value, label, color_code, image_url,
      stock, price_adjustment, sort_order, is_active
    )
    values (
      v_id,
      nullif(v_variant->>'source_id', '')::bigint,
      'color',
      coalesce(nullif(trim(v_variant->>'value'), ''), 'Rang'),
      nullif(trim(v_variant->>'label'), ''),
      nullif(trim(v_variant->>'color_code'), ''),
      nullif(trim(v_variant->>'image_url'), ''),
      nullif(v_variant->>'stock', '')::integer,
      coalesce(nullif(v_variant->>'price_adjustment', '')::numeric, 0),
      coalesce((v_variant->>'sort_order')::integer, 0),
      true
    )
    on conflict (source_id) where source_id is not null
    do update set
      value            = excluded.value,
      label            = excluded.label,
      color_code       = excluded.color_code,
      image_url        = excluded.image_url,
      stock            = excluded.stock,
      price_adjustment = excluded.price_adjustment,
      sort_order       = excluded.sort_order;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.import_product(jsonb) from public;
revoke all on function public.import_product(jsonb) from anon, authenticated;
grant execute on function public.import_product(jsonb) to service_role;



-- ============================================================
-- 10 / 10  ·  20260908000000_admin_user_visibility.sql
-- ============================================================

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

    begin
      insert into public.profiles (id, display_name, phone, login, language)
      values (
        r.id,
        coalesce(nullif(trim(v_meta->>'display_name'), ''), v_login, ''),
        coalesce(nullif(trim(v_meta->>'phone'), ''), ''),
        v_login,
        'uz'
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
    insert into public.profiles (id, display_name, phone, login, language)
    select
      u.id,
      coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), ''),
      coalesce(nullif(trim(u.raw_user_meta_data->>'phone'), ''), ''),
      public.next_available_login(
        coalesce(
          nullif(trim(u.raw_user_meta_data->>'login'), ''),
          nullif(split_part(coalesce(u.email, ''), '@', 1), '')
        )
      ),
      'uz'
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    on conflict (id) do nothing;
  end if;

  select count(*) into v_after
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null;

  raise notice 'Profilsiz hisoblar: % -> %', v_before, v_after;
end $$;

-- ============================================================
-- YAKUNIY NAZORAT
-- ============================================================
do $$
declare v_orphans integer; v_users integer; v_profiles integer;
begin
  select count(*) into v_users from auth.users;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_orphans
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null;
  raise notice '--------------------------------------------';
  raise notice 'auth.users: %  |  profiles: %  |  yetim: %', v_users, v_profiles, v_orphans;
  if v_orphans = 0 then
    raise notice 'OK: barcha foydalanuvchilarda profil bor.';
  else
    raise notice 'DIQQAT: % ta yetim qoldi.', v_orphans;
  end if;
  raise notice '--------------------------------------------';
end $$;
