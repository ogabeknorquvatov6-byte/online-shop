/*
# Promotions — description ustuni (additive)

Dizayn (`project`) aksiya kartochkasida tavsif (description) ko'rsatadi va
tahrirlaydi, lekin production `promotions` jadvalida bunday ustun yo'q edi.
Bu migratsiya faqat shu bitta ustunni qo'shadi — hech narsa o'chirilmaydi
yoki qayta nomlanmaydi, mavjud qatorlar bo'sh matn bilan to'ldiriladi.
*/

alter table public.promotions add column if not exists description text not null default '';
