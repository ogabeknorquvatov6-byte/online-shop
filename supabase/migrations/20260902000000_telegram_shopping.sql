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
