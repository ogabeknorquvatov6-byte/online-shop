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
