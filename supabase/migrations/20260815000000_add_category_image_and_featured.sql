/*
  # Kategoriya rasmi va "Mashhur mahsulot" belgisi

  1. O'zgarishlar
    - `categories` jadvaliga `image_url` ustuni qo'shiladi (bosh sahifada rasmli kategoriya kartalari uchun)
    - `products` jadvaliga `is_featured` ustuni qo'shiladi (admin "Mashhur mahsulotlar" bo'limiga qo'lda belgilaydigan mahsulotlar uchun)

  2. Eslatma
    - Ikkala ustun ham xavfsiz standart qiymatlar bilan qo'shiladi, mavjud qatorlarga ta'sir qilmaydi.
*/

alter table public.categories
  add column if not exists image_url text not null default '';

alter table public.products
  add column if not exists is_featured boolean not null default false;

create index if not exists products_is_featured_idx on public.products (is_featured) where is_featured = true;
