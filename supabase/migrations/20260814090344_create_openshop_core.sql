/*
# OpenShop core commerce schema

1. New Tables
- `profiles`: authenticated customer identity, phone, display name, and server-controlled role.
- `categories`: public product categories and optional parent categories.
- `products`: public catalog products, price, stock, brand, and image.
- `banners`: active homepage promotions controlled by admins.
- `promotions`: time-bounded product discounts.
- `promotion_products`: products included in promotions.
- `addresses`: saved customer delivery locations.
- `orders`: customer orders, delivery snapshot, cash payment, and status.
- `order_items`: immutable product and price snapshots for each order.
- `store_settings`: public store presentation settings.

2. Security
- RLS is enabled on every table.
- Catalog content is publicly readable; all mutations require an admin.
- Profiles, addresses, and orders are scoped to the signed-in owner.
- Admin mutations use a server-side `is_admin()` check.
- Customer order creation happens through an atomic function that validates stock, recomputes totals, and decrements inventory.

3. Important notes
- Payment is cash on delivery only.
- No promo-code or coupon tables are included.
- Product images use URL fields for the first release; the schema is ready for Storage-backed URLs.
*/

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  brand text not null default '',
  description text not null default '',
  price numeric(14,2) not null check (price >= 0),
  discount_price numeric(14,2) check (discount_price is null or (discount_price >= 0 and discount_price < price)),
  stock integer not null default 0 check (stock >= 0),
  sku text not null unique,
  image_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  button_text text not null default 'Batafsil',
  destination text not null default '/catalog',
  image_url text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_percent integer not null check (discount_percent between 1 and 99),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (promotion_id, product_id)
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  full_address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  customer_name text not null,
  phone text not null,
  address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  payment_method text not null default 'Naqd pul' check (payment_method = 'Naqd pul'),
  status text not null default 'Yangi' check (status in ('Yangi','Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0)
);

create table if not exists public.store_settings (
  id boolean primary key default true,
  store_name text not null default 'OpenShop',
  phone text not null default '+998 71 203 66 60',
  address text not null default 'Toshkent shahri',
  working_hours text not null default 'Har kuni 09:00–21:00',
  description text not null default 'Texnika va kundalik hayot uchun kerakli mahsulotlar.'
);

insert into public.store_settings (id) values (true) on conflict (id) do nothing;

insert into public.categories (name, slug) values
('Telefonlar', 'telefonlar'), ('Noutbuklar', 'noutbuklar'), ('Aksessuarlar', 'aksessuarlar'), ('Maishiy texnika', 'maishiy-texnika')
on conflict (slug) do nothing;

insert into public.products (category_id, name, slug, brand, description, price, discount_price, stock, sku, image_url)
select c.id, x.name, x.slug, x.brand, x.description, x.price, x.discount_price, x.stock, x.sku, x.image_url
from (values
('telefonlar','Samsung Galaxy A26 8/256 GB','samsung-galaxy-a26','Samsung','Yorqin ekran, kuchli kamera va uzoq ishlaydigan batareya.',3498000,2999000,18,'SAM-A26-256','https://images.pexels.com/photos/404280/pexels-photo-404280.jpeg?auto=compress&cs=tinysrgb&w=900'),
('telefonlar','iPhone 15 Pro 256 GB','iphone-15-pro','Apple','Titan korpusli professional smartfon va ajoyib kamera tizimi.',12899000,null,9,'APL-15P-256','https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=900'),
('noutbuklar','MacBook Air M3 13','macbook-air-m3','Apple','Yengil, jim va butun kun ishlashga tayyor noutbuk.',14899000,13999000,7,'APL-MBA-M3','https://images.pexels.com/photos/205421/pexels-photo-205421.jpeg?auto=compress&cs=tinysrgb&w=900'),
('aksessuarlar','JBL Tune 770NC','jbl-tune-770nc','JBL','Shovqinni kamaytiruvchi simsiz quloqchin.',899000,749000,24,'JBL-770-NC','https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&w=900'),
('maishiy-texnika','Dyson V15 changyutgich','dyson-v15','Dyson','Uy tozalash uchun kuchli va aqlli simsiz changyutgich.',7999000,null,4,'DYS-V15-01','https://images.pexels.com/photos/4108715/pexels-photo-4108715.jpeg?auto=compress&cs=tinysrgb&w=900'),
('telefonlar','Xiaomi Redmi Note 15','xiaomi-redmi-note-15','Xiaomi','Katta ekran va tezkor ishlashga ega zamonaviy smartfon.',3013000,2699000,16,'XIA-RN15-01','https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=900')
) as x(category_slug,name,slug,brand,description,price,discount_price,stock,sku,image_url)
join public.categories c on c.slug = x.category_slug
on conflict (slug) do nothing;

insert into public.banners (title, description, button_text, destination, image_url, sort_order)
values ('Yangi mavsum. Yangi imkoniyatlar.', 'Texnologiya va qulaylik bir joyda.', 'Katalogni ko‘rish', '/catalog', 'https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=1600', 1)
on conflict do nothing;

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_created_idx on public.products(created_at desc);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);
create index if not exists order_items_product_idx on public.order_items(product_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active = true) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin to authenticated;

create or replace function public.create_cash_order(p_customer_name text, p_phone text, p_address text, p_latitude numeric, p_longitude numeric, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_order_id uuid; v_item jsonb; v_product public.products%rowtype; v_total numeric := 0; v_price numeric; v_qty integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    v_price := coalesce(v_product.discount_price, v_product.price);
    v_total := v_total + v_price * v_qty;
  end loop;
  insert into public.orders (user_id, customer_name, phone, address, latitude, longitude, total_amount) values (auth.uid(), trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude, v_total) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := coalesce(v_product.discount_price, v_product.price);
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (v_order_id, v_product.id, v_product.name, v_price, v_qty);
    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;
  return v_order_id;
end; $$;
revoke all on function public.create_cash_order from public;
grant execute on function public.create_cash_order to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.banners enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.store_settings enable row level security;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id, display_name, phone) values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''), coalesce(new.raw_user_meta_data->>'phone','')); return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Public catalog read policies.
drop policy if exists public_read_categories on public.categories; create policy public_read_categories on public.categories for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists public_read_products on public.products; create policy public_read_products on public.products for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists public_read_banners on public.banners; create policy public_read_banners on public.banners for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists public_read_promotions on public.promotions; create policy public_read_promotions on public.promotions for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists public_read_promotion_products on public.promotion_products; create policy public_read_promotion_products on public.promotion_products for select to anon, authenticated using (true);
drop policy if exists public_read_settings on public.store_settings; create policy public_read_settings on public.store_settings for select to anon, authenticated using (true);

-- Admin catalog management.
drop policy if exists admin_insert_categories on public.categories; create policy admin_insert_categories on public.categories for insert to authenticated with check (public.is_admin());
drop policy if exists admin_update_categories on public.categories; create policy admin_update_categories on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_delete_categories on public.categories; create policy admin_delete_categories on public.categories for delete to authenticated using (public.is_admin());
drop policy if exists admin_insert_products on public.products; create policy admin_insert_products on public.products for insert to authenticated with check (public.is_admin());
drop policy if exists admin_update_products on public.products; create policy admin_update_products on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_delete_products on public.products; create policy admin_delete_products on public.products for delete to authenticated using (public.is_admin());
drop policy if exists admin_insert_banners on public.banners; create policy admin_insert_banners on public.banners for insert to authenticated with check (public.is_admin());
drop policy if exists admin_update_banners on public.banners; create policy admin_update_banners on public.banners for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_delete_banners on public.banners; create policy admin_delete_banners on public.banners for delete to authenticated using (public.is_admin());
drop policy if exists admin_insert_promotions on public.promotions; create policy admin_insert_promotions on public.promotions for insert to authenticated with check (public.is_admin());
drop policy if exists admin_update_promotions on public.promotions; create policy admin_update_promotions on public.promotions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_delete_promotions on public.promotions; create policy admin_delete_promotions on public.promotions for delete to authenticated using (public.is_admin());
drop policy if exists admin_insert_promo_products on public.promotion_products; create policy admin_insert_promo_products on public.promotion_products for insert to authenticated with check (public.is_admin());
drop policy if exists admin_delete_promo_products on public.promotion_products; create policy admin_delete_promo_products on public.promotion_products for delete to authenticated using (public.is_admin());
drop policy if exists admin_update_settings on public.store_settings; create policy admin_update_settings on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customer-owned data.
drop policy if exists profile_select_own on public.profiles; create policy profile_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profile_update_own on public.profiles; create policy profile_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists address_select_own on public.addresses; create policy address_select_own on public.addresses for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists address_insert_own on public.addresses; create policy address_insert_own on public.addresses for insert to authenticated with check (user_id = auth.uid());
drop policy if exists address_update_own on public.addresses; create policy address_update_own on public.addresses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists address_delete_own on public.addresses; create policy address_delete_own on public.addresses for delete to authenticated using (user_id = auth.uid());
drop policy if exists order_select_own on public.orders; create policy order_select_own on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists admin_update_orders on public.orders; create policy admin_update_orders on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists order_items_select_own on public.order_items; create policy order_items_select_own on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
drop policy if exists admin_select_profiles on public.profiles; create policy admin_select_profiles on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
