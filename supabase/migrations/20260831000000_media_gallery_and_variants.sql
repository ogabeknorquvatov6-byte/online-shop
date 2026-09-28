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
