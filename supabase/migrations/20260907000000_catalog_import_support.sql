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
