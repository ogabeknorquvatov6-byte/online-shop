/*
# Step 1 — haqiqiy kategoriya ierarxiyasi

Katalog shu paytgacha BIR DARAJALI edi: `categories.parent_id` ustuni
bor edi, lekin unga hech qachon qiymat yozilmagan. Bu migratsiya mavjud
mahsulotlarga TAYANIB minimal, haqiqiy ierarxiya quradi.

## Nega migratsiya fayli, mijoz tomonidagi yozuvlar emas?

  1. ATOMARLIK. Migratsiya bitta tranzaksiyada bajariladi — o'rtada xato
     bo'lsa, HAMMASI qaytariladi. `supabase-js` mijozida tranzaksiya yo'q,
     ya'ni ketma-ket yozuvlarning yarmi bajarilib qolishi mumkin edi.
  2. Qayta ishga tushirish xavfsiz (idempotent): har bir amal o'z shartiga
     ega, shuning uchun ikki marta bajarilsa ham dublikat yaratmaydi.
  3. Versiya nazorati — o'zgarish ko'rib chiqiladigan va qaytariladigan.

## URL XAVFSIZLIGI — MUHIM

Nomlar o'zgaradi, `slug` esa TEGILMAYDI. Shuning uchun mavjud manzillar
(`/category/telefonlar`, `/category/aksessuarlar`, `/category/noutbuklar`,
`/category/maishiy-texnika`) avvalgidek ishlaydi va o'sha kategoriyalarga
olib boradi. Hech qanday redirect yoki alias kerak emas.

## BREND ≠ KATEGORIYA

Xiaomi / Samsung / Apple / JBL / Dyson kabi qiymatlar `products.brand`
ustunida qoladi va katalogda faset filtri sifatida ishlaydi. Ular
kategoriya sifatida YARATILMAYDI.

## Nima o'zgaradi

  Aksessuarlar          → "Aksessuarlar va gadjetlar"  (ildiz, slug o'zgarmaydi)
    └── Naushnik va audio jihozlar                      (YANGI)
  Telefonlar            → "Telefonlar va planshetlar"  (ildiz, slug o'zgarmaydi)
    └── Smartfonlar                                     (YANGI)
  Video va kompyuter texnikalari                        (YANGI ildiz)
    └── Noutbuklar                                      (mavjud, ota biriktirildi)
  Maishiy texnika                                       (o'zgarishsiz)

Mahsulotlar: 4 tasi yangi barg kategoriyalarga ko'chiriladi. Kategoriyasiz
3 ta test mahsuloti TEGILMAYDI. Narx, ombor, rasm, brend — hech biri
o'zgarmaydi, faqat `category_id`.
*/

-- ── 1. Mavjud ildizlarni qayta nomlash (slug saqlanadi) ──────────────
update public.categories set name = 'Aksessuarlar va gadjetlar'
  where slug = 'aksessuarlar' and name <> 'Aksessuarlar va gadjetlar';

update public.categories set name = 'Telefonlar va planshetlar'
  where slug = 'telefonlar' and name <> 'Telefonlar va planshetlar';

-- ── 2. Yangi kategoriyalar ───────────────────────────────────────────
-- `where not exists` — qayta ishga tushirilganda dublikat yaratmaydi.
insert into public.categories (name, slug, parent_id, is_active, sort_order)
select 'Video va kompyuter texnikalari', 'video-va-kompyuter-texnikalari', null, true, 0
where not exists (select 1 from public.categories where slug = 'video-va-kompyuter-texnikalari');

insert into public.categories (name, slug, parent_id, is_active, sort_order)
select 'Smartfonlar', 'smartfonlar', c.id, true, 0
from public.categories c
where c.slug = 'telefonlar'
  and not exists (select 1 from public.categories where slug = 'smartfonlar');

insert into public.categories (name, slug, parent_id, is_active, sort_order)
select 'Naushnik va audio jihozlar', 'naushnik-va-audio-jihozlar', c.id, true, 0
from public.categories c
where c.slug = 'aksessuarlar'
  and not exists (select 1 from public.categories where slug = 'naushnik-va-audio-jihozlar');

-- ── 3. "Noutbuklar" yangi ildizning bolasi bo'ladi ───────────────────
update public.categories child
set parent_id = parent.id
from public.categories parent
where child.slug = 'noutbuklar'
  and parent.slug = 'video-va-kompyuter-texnikalari'
  and child.parent_id is distinct from parent.id;

-- ── 4. Mahsulotlarni barg kategoriyalarga ko'chirish ─────────────────
-- FAQAT `category_id` o'zgaradi. Nom, narx, ombor, rasm — tegilmaydi.

-- "Telefonlar" da to'g'ridan-to'g'ri turgan hamma narsa → "Smartfonlar".
update public.products p
set category_id = (select id from public.categories where slug = 'smartfonlar')
where p.category_id = (select id from public.categories where slug = 'telefonlar');

-- JBL quloqchini → "Naushnik va audio jihozlar".
-- Aniq `id` bo'yicha: "Aksessuarlar" dagi BOSHQA mahsulotlar bo'lsa,
-- ular ko'chmasligi kerak.
update public.products
set category_id = (select id from public.categories where slug = 'naushnik-va-audio-jihozlar')
where id = 'e0af845a-6b87-48cc-88ed-993eb493adab'
  and category_id = (select id from public.categories where slug = 'aksessuarlar');

/*
Tegilmaydiganlar (ataylab):
  • MacBook Air M3 13  — "Noutbuklar" da qoladi (u endi bolaga aylandi)
  • Dyson V15          — "Maishiy texnika" da qoladi
  • 3 ta kategoriyasiz test mahsuloti — `category_id` NULL bo'lib qoladi
*/
