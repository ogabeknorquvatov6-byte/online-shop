/*
# Dizayn moslashuvi — faqat qo'shimcha (additive) o'zgarishlar

Bu migratsiya ESKI (production) sxemani BUZMAYDI. U faqat yangi dizayn
komponentlari talab qiladigan qo'shimcha ustun/jadvallarni qo'shadi va
mavjud qatorlarni xavfsiz standart qiymatlar bilan to'ldiradi (backfill).
Hech qanday ustun/jadval o'chirilmaydi yoki qayta nomlanmaydi — mavjud
RLS policy'lar, funksiyalar va frontend chaqiruvlari ishlashda davom etadi.

1. products
   - product_images: ko'p rasmli galereya (mavjud image_url dan backfill)
   - product_variants: variant tanlash (bo'sh boshlanadi, admin to'ldiradi)
   - sales_count, rating, reviews_count: dizaynda ko'rsatiladigan maydonlar

2. categories: description, sort_order

3. orders: order_number (avtomatik generatsiya), subtotal, delivery_fee,
   customer_email, city, note — mavjud total_amount/address o'zgarmaydi

4. order_items: variant, image_url (snapshot)

5. profiles: first_name, last_name (display_name'dan backfill), avatar_url
   (role/is_active ustunlari va ularni himoyalovchi trigger TEGILMAYDI)

6. addresses: label, recipient_name, district, street, zip, is_default

7. store_settings: email, delivery_fee_tashkent/republic,
   free_delivery_threshold, instagram/telegram/facebook/youtube_url

8. Xavfsizlik: yangi jadvallarga (product_images, product_variants) production
   bilan bir xil naqshda RLS yoqiladi — ochiq o'qish, faqat admin yozadi.
*/

-- ============ 1. PRODUCTS: galereya, variantlar, ko'rsatkichlar ============

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id, sort_order);

-- Mavjud mahsulotlarning image_url'ini galereyaning 1-rasmi sifatida ko'chiramiz.
insert into public.product_images (product_id, image_url, sort_order)
select p.id, p.image_url, 0
from public.products p
where p.image_url is not null and p.image_url <> ''
  and not exists (select 1 from public.product_images pi where pi.product_id = p.id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id, sort_order);

alter table public.products add column if not exists sales_count integer not null default 0;
alter table public.products add column if not exists rating numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5);
alter table public.products add column if not exists reviews_count integer not null default 0;

-- ============ 2. CATEGORIES ============

alter table public.categories add column if not exists description text not null default '';
alter table public.categories add column if not exists sort_order integer not null default 0;

-- ============ 3. ORDERS ============

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists subtotal numeric(14,2);
alter table public.orders add column if not exists delivery_fee numeric(14,2) not null default 0;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists note text;

-- Mavjud buyurtmalarni to'ldiramiz: subtotal = total_amount (yetkazib berish
-- puli hozircha 0, chunki narx faqat naqd/onlayn to'lov, delivery_fee yo'q edi).
update public.orders set subtotal = total_amount where subtotal is null;

create sequence if not exists public.order_number_seq;

create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'OS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  if new.subtotal is null then
    new.subtotal := new.total_amount;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_order_number on public.orders;
create trigger trg_set_order_number
  before insert on public.orders
  for each row execute function public.set_order_number();

-- Mavjud qatorlarga ham order_number beramiz (bir martalik backfill).
update public.orders set order_number = 'OS-' || to_char(created_at, 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0')
where order_number is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_order_number_key'
  ) then
    alter table public.orders add constraint orders_order_number_key unique (order_number);
  end if;
end $$;

-- ============ 4. ORDER_ITEMS ============

alter table public.order_items add column if not exists variant text;
alter table public.order_items add column if not exists image_url text;

-- ============ 5. PROFILES ============

alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name text not null default '';
alter table public.profiles add column if not exists avatar_url text;

-- Mavjud display_name'ni ism/familiyaga ajratamiz (birinchi bo'sh joygacha).
update public.profiles
set first_name = coalesce(nullif(split_part(display_name, ' ', 1), ''), first_name),
    last_name = coalesce(nullif(substring(display_name from length(split_part(display_name,' ',1)) + 2), ''), last_name)
where display_name is not null and display_name <> '' and first_name = '';

-- Yangi ro'yxatdan o'tishda first_name/last_name berilsa, display_name'ni ham
-- sinxronlab qo'yamiz (eski admin/panel display_name'ga tayanadi).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',
      trim(coalesce(new.raw_user_meta_data->>'first_name','') || ' ' || coalesce(new.raw_user_meta_data->>'last_name',''))),
    coalesce(new.raw_user_meta_data->>'phone',''),
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name','')
  );
  return new;
end;
$$;

-- ============ 6. ADDRESSES ============

alter table public.addresses add column if not exists label text not null default 'Uy';
alter table public.addresses add column if not exists recipient_name text;
alter table public.addresses add column if not exists district text;
alter table public.addresses add column if not exists street text;
alter table public.addresses add column if not exists zip text;
alter table public.addresses add column if not exists is_default boolean not null default false;

-- ============ 7. STORE_SETTINGS ============

alter table public.store_settings add column if not exists email text not null default '';
alter table public.store_settings add column if not exists delivery_fee_tashkent numeric(14,2) not null default 0;
alter table public.store_settings add column if not exists delivery_fee_republic numeric(14,2) not null default 0;
alter table public.store_settings add column if not exists free_delivery_threshold numeric(14,2) not null default 0;
alter table public.store_settings add column if not exists instagram_url text not null default '';
alter table public.store_settings add column if not exists telegram_url text not null default '';
alter table public.store_settings add column if not exists facebook_url text not null default '';
alter table public.store_settings add column if not exists youtube_url text not null default '';

-- ============ 8. RLS: yangi jadvallar ============

alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;

drop policy if exists public_read_product_images on public.product_images;
create policy public_read_product_images on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.is_active = true or public.is_admin())));

drop policy if exists admin_write_product_images on public.product_images;
create policy admin_write_product_images on public.product_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_product_variants on public.product_variants;
create policy public_read_product_variants on public.product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.is_active = true or public.is_admin())));

drop policy if exists admin_write_product_variants on public.product_variants;
create policy admin_write_product_variants on public.product_variants
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ 9. sales_count: order_items insert bo'lganda avtomatik oshadi ============

create or replace function public.bump_sales_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    update public.products set sales_count = sales_count + new.quantity where id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_sales_count on public.order_items;
create trigger trg_bump_sales_count
  after insert on public.order_items
  for each row execute function public.bump_sales_count();

-- ============ 10. display_name'ni first_name/last_name bilan sinxronlash ============
-- Foydalanuvchi profilini (Ism/Familiya) tahrirlaganda display_name ham
-- yangilanadi — eski admin panel/boshqa joylarda display_name ishlatilsa ham
-- eskirmaydi.

create or replace function public.sync_display_name()
returns trigger language plpgsql as $$
begin
  if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    new.display_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_display_name on public.profiles;
create trigger trg_sync_display_name
  before update on public.profiles
  for each row execute function public.sync_display_name();
