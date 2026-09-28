/*
# Buyurtma yaxlitligini mustahkamlash

Bu migratsiya QO'SHIMCHA (additive) va ORQAGA MOS. Hech qanday ustun
o'chirilmaydi va qayta nomlanmaydi; mavjud RLS policy'lar tegilmaydi;
onlayn to'lov (Click/Payme) integratsiyasiga umuman tegilmaydi.

Auditda topilgan va shu yerda tuzatiladigan TO'RTTA muammo:

  1. NAQD PUL buyurtmasi darhol `PAID` deb belgilanardi.
  2. Checkout IDEMPOTENT emas edi — takroriy so'rov ikkinchi buyurtma
     yaratardi va omborni ikki marta kamaytirardi.
  3. Ombor tekshiruvi HAR BIR pozitsiya uchun alohida bajarilardi, ya'ni
     bir mahsulotning ikki varianti birgalikda qoldiqdan oshib ketardi.
  4. Buyurtma holati ISTALGAN holatdan istalganiga o'tardi — holatlar
     mashinasi yo'q edi.
*/

-- ============================================================
-- 1. COD: "buyurtma qabul qilindi" ≠ "pul olindi"
-- ============================================================
/*
 * MUAMMO: `create_order_as` naqd pul uchun `payment_status = 'PAID'`
 * yozardi. Ya'ni kuryer hali yo'lga chiqmasdan, mijoz bir so'm ham
 * to'lamasdan buyurtma "to'langan" hisoblanardi.
 *
 * Oqibati faqat kosmetik emas: har qanday hisobot, "to'lanmagan
 * buyurtmalar" ro'yxati va moliyaviy yig'indi noto'g'ri bo'lardi va
 * kuryerdan pul olinmay qolgani HECH QAYERDA ko'rinmasdi.
 *
 * Yangi qiymat: `COD_PENDING` — "yetkazib berishda naqd olinadi".
 * Pul olingach admin/bot `Yetkazildi` holatiga o'tkazadi va quyidagi
 * trigger uni `PAID` ga o'tkazadi (pastda 5-bo'lim).
 *
 * ONLAYN TO'LOV (Click/Payme) MANTIG'IGA TEGILMAYDI: ular avvalgidek
 * `PENDING` bilan boshlanadi va faqat provayder webhook'i orqali
 * `PAID` bo'ladi.
 */

/*
 * AVVAL CHEKLOVNI KENGAYTIRAMIZ.
 *
 * `orders.payment_status` da `check (payment_status in ('PENDING','PAID',
 * 'FAILED','CANCELLED'))` bor. Uni kengaytirmasdan turib `COD_PENDING`
 * yozib bo'lmaydi: quyidagi UPDATE ham, `create_order_as` ham cheklov
 * buzilishi bilan yiqilardi — ya'ni migratsiyadan keyin NAQD PUL bilan
 * buyurtma berish UMUMAN ishlamay qolardi.
 *
 * Cheklov nomi inline `check` dan avtomatik hosil bo'lgani uchun uni
 * katalogdan topib o'chiramiz — nomga qattiq bog'lanish mo'rt bo'lardi.
 */
do $$
declare v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'orders' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%payment_status%'
  limit 1;

  if v_name is not null then
    execute format('alter table public.orders drop constraint %I', v_name);
  end if;
end $$;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('PENDING', 'COD_PENDING', 'PAID', 'FAILED', 'CANCELLED'));

/*
 * Standart qiymat `PAID` edi — moliyaviy jihatdan xavfli sukut.
 * `payment_status` ni ko'rsatmagan har qanday INSERT buyurtmani
 * "to'langan" deb belgilardi. Endi standart `PENDING`: unutilgan
 * joy pul YO'QOTISHGA emas, ortiqcha tekshiruvga olib keladi.
 */
alter table public.orders alter column payment_status set default 'PENDING';

-- Mavjud ma'lumot: hali yetkazilmagan naqd buyurtmalar noto'g'ri "PAID"
-- turibdi. Ularni to'g'rilaymiz. Yetkazilganlari haqiqatan to'langan —
-- ularga tegmaymiz.
update public.orders
set payment_status = 'COD_PENDING'
where payment_method = 'Naqd pul'
  and payment_status = 'PAID'
  and status not in ('Yetkazildi', 'Bekor qilindi');

-- ============================================================
-- 2. IDEMPOTENTLIK KALITI
-- ============================================================
/*
 * MUAMMO: foydalanuvchi "Buyurtma berish" ni ikki marta bosса, mobil
 * tarmoq so'rovni qayta yuborsa yoki javob yo'qolib qayta urinilsa —
 * IKKITA buyurtma yaratilar va ombor IKKI MARTA kamayardi. UI'dagi
 * `submitting` bayrog'i buni to'xtata olmaydi: u sahifa yangilanishidan,
 * tarmoq qayta urinishidan va parallel so'rovlardan omon qolmaydi.
 *
 * YECHIM: mijoz har bir checkout URINISHI uchun bitta UUID hosil qiladi
 * va uni serverga yuboradi. Ustunda UNIQUE indeks bor, ya'ni ikkinchi
 * so'rov bazaning o'zi tomonidan to'xtatiladi — ilova mantig'i emas,
 * ma'lumotlar bazasi kafolatlaydi. Parallel so'rovlarda ham xuddi
 * shunday: biri yozadi, ikkinchisi unique buzilishini oladi va biz
 * unga MAVJUD buyurtmani qaytaramiz (xato emas).
 */
alter table public.orders
  add column if not exists checkout_request_id uuid;

-- Qisman (partial) unique indeks: eski buyurtmalarda kalit NULL bo'lib
-- qoladi va ular bir-biriga xalaqit qilmaydi.
create unique index if not exists orders_checkout_request_id_key
  on public.orders (checkout_request_id)
  where checkout_request_id is not null;

-- ============================================================
-- 3. HOLATLAR MASHINASI
-- ============================================================
/*
 * MUAMMO: `set_order_status` faqat qiymat ro'yxatdanmi deb tekshirardi.
 * Ya'ni "Yetkazildi" buyurtmani qaytadan "Yangi" qilish, yoki bekor
 * qilingan buyurtmani "Yetkazildi" deb belgilash mumkin edi. Bu
 * ombor va hisobotlarni jimgina buzadi.
 *
 * Ruxsat etilgan o'tishlar:
 *   Yangi          → Qabul qilindi | Bekor qilindi
 *   Qabul qilindi  → Tayyorlanmoqda | Bekor qilindi
 *   Tayyorlanmoqda → Yetkazilmoqda | Bekor qilindi
 *   Yetkazilmoqda  → Yetkazildi | Bekor qilindi
 *   Yetkazildi     → (yakuniy)
 *   Bekor qilindi  → (yakuniy)
 *
 * "Bekor qilindi" YAKUNIY: ilgari undan qaytish mumkin edi va o'sha yo'l
 * omborni qayta band qilardi. Amalda bu deyarli hech qachon kerak emas,
 * lekin ombor hisobini buzish uchun eng qulay yo'l edi. Xato bekor
 * qilingan buyurtma uchun to'g'ri yechim — YANGI buyurtma yaratish.
 */
create or replace function public.order_status_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = public
as $$
  select case
    when p_from = p_to then true                       -- o'zgarishsiz saqlash zararsiz
    when p_from = 'Yangi'          then p_to in ('Qabul qilindi', 'Bekor qilindi')
    when p_from = 'Qabul qilindi'  then p_to in ('Tayyorlanmoqda', 'Bekor qilindi')
    when p_from = 'Tayyorlanmoqda' then p_to in ('Yetkazilmoqda', 'Bekor qilindi')
    when p_from = 'Yetkazilmoqda'  then p_to in ('Yetkazildi', 'Bekor qilindi')
    when p_from = 'Yetkazildi'     then false
    when p_from = 'Bekor qilindi'  then false
    else false
  end;
$$;
grant execute on function public.order_status_transition_allowed(text, text) to authenticated, service_role;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_current text; v_restored boolean; v_item record; v_role text;
  v_method text; v_pay text;
begin
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('Yangi','Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, stock_restored, payment_method, payment_status
    into v_current, v_restored, v_method, v_pay
    from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.order_status_transition_allowed(v_current, p_status) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_status = v_current then return; end if;

  -- Bekor qilish: omborni FAQAT BIR MARTA qaytaramiz.
  -- `stock_restored` bayrog'i takroriy qaytarishning oldini oladi, qator
  -- esa yuqorida `for update` bilan qulflangan — parallel ikkita bekor
  -- qilish so'rovi ham omborni ikki marta oshira olmaydi.
  if p_status = 'Bekor qilindi' then
    if not v_restored then
      for v_item in select product_id, variant_id, quantity from public.order_items
        where order_id = p_order_id and product_id is not null loop
        update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
        if v_item.variant_id is not null then
          update public.product_variants set stock = stock + v_item.quantity
          where id = v_item.variant_id and stock is not null;
        end if;
      end loop;
    end if;
    update public.orders
      set status = p_status,
          stock_restored = true,
          -- Bekor qilingan naqd buyurtma hech qachon to'lanmaydi.
          payment_status = case when v_method = 'Naqd pul' and v_pay = 'COD_PENDING'
                                then 'CANCELLED' else v_pay end
      where id = p_order_id;
    return;
  end if;

  -- Yetkazildi: naqd pul aynan shu daqiqada qo'lga tegadi.
  -- Onlayn to'lovga TEGILMAYDI — uning holati provayder webhook'iniki.
  update public.orders
    set status = p_status,
        payment_status = case when v_method = 'Naqd pul' and p_status = 'Yetkazildi' and v_pay = 'COD_PENDING'
                              then 'PAID' else v_pay end
    where id = p_order_id;
end; $$;
revoke all on function public.set_order_status(uuid, text) from public;
grant execute on function public.set_order_status(uuid, text) to authenticated, service_role;

-- ============================================================
-- 4. CREATE_ORDER_AS — idempotent + to'g'ri ombor tekshiruvi
-- ============================================================
/*
 * O'ZGARISHLAR:
 *
 * a) `p_checkout_request_id` qo'shildi (oxirgi parametr, DEFAULT NULL) —
 *    shuning uchun eski chaqiruvlar o'zgarishsiz ishlashda davom etadi.
 *
 * b) Boshida shu kalit bo'yicha mavjud buyurtma qidiriladi. Topilsa —
 *    YANGI buyurtma yaratilmaydi, mavjudining ID'si qaytariladi.
 *
 * c) Poyga holati (ikki parallel so'rov bir vaqtda tekshiruvdan o'tishi)
 *    `insert` dagi UNIQUE buzilishi bilan ushlanadi va o'sha yerda ham
 *    mavjud buyurtma qaytariladi. Ya'ni himoya IKKI QAVATLI: tez yo'l
 *    uchun oldindan tekshiruv, kafolat uchun bazadagi cheklov.
 *
 * d) OMBOR TEKSHIRUVI ENDI YIG'INDI BO'YICHA. Ilgari har bir pozitsiya
 *    alohida tekshirilardi: qoldiq 5 bo'lganda "Qora × 3" va "Oq × 3"
 *    ikkalasi ham alohida-alohida o'tib ketar, keyin ombor -1 ga tushib
 *    `products_stock_check` cheklovini buzardi. Natijada mijoz tushunarsiz
 *    baza xatosini ko'rardi. Endi bir mahsulotning barcha pozitsiyalari
 *    QO'SHILIB tekshiriladi va aniq `OUT_OF_STOCK` beriladi.
 *
 * e) Naqd pul → `COD_PENDING` (yuqoridagi 1-bo'lim).
 */
create or replace function public.create_order_as(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  /*
   * O'RNI VA `default` YO'QLIGI — IKKALASI HAM ATAYLAB.
   *
   * 1) NEGA `default` YO'Q?
   *    Overload noaniqligining oldini olish uchun. Agar bu parametr
   *    `default null` bo'lsa, 10 ta nomli argument bilan kelgan chaqiruv
   *    IKKALA overload'ga ham mos kelardi (eski 10-argli moslik qobig'i
   *    va yangi 11-argli, oxirgisi standart qiymat bilan). Postgres
   *    bunda `42725 function is not unique` beradi — ya'ni ESKI mijoz
   *    uchun buyurtma berish butunlay ishlamay qolardi.
   *
   *    `default` bo'lmaganda taqsimot aniq:
   *      10 nomli argument → faqat eski (moslik) qobig'iga mos keladi;
   *      11 nomli argument → faqat shu funksiyaga mos keladi.
   *
   * 2) NEGA AYNAN SHU YERDA, `p_payment_method` DAN OLDIN?
   *    Postgres talabi: standart qiymatli parametrdan KEYIN standart
   *    qiymatsiz parametr KELA OLMAYDI. Ilgari bu kalit ro'yxatning
   *    oxirida turardi va migratsiya aynan shu sababdan yiqilgan edi:
   *
   *      ERROR: input parameters after one with a default value
   *             must also have defaults   (SQLSTATE 42P13)
   *
   *    Shuning uchun u oxirgi MAJBURIY parametr sifatida standart
   *    qiymatlilardan oldinga ko'chirildi. Bu mijozlarga ta'sir
   *    QILMAYDI: PostgREST har doim NOMLI argument ishlatadi, ya'ni
   *    parametrlar tartibi RPC chaqiruvida umuman ahamiyatsiz.
   */
  p_checkout_request_id uuid,
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
  v_need record;
begin
  -- ---- Idempotentlik: tez yo'l -------------------------------
  if p_checkout_request_id is not null then
    select id into v_order_id from public.orders
      where checkout_request_id = p_checkout_request_id;
    if found then return v_order_id; end if;
  end if;

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

  v_payment_status := case when p_payment_method = 'Naqd pul' then 'COD_PENDING' else 'PENDING' end;

  -- ---- Har bir pozitsiyaning shakli to'g'rimi ----------------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    if (v_item->>'product_id') is null then raise exception 'INVALID_DETAILS'; end if;
  end loop;

  /*
   * ---- Ombor: MAHSULOT bo'yicha YIG'INDI ----------------------
   * Qatorlar `for update` bilan qulflanadi va aynan shu qulf parallel
   * buyurtmalarning bir xil qoldiqni ikki marta sotishiga yo'l qo'ymaydi.
   * `order by` — deadlock'ning oldini oladi: barcha tranzaksiyalar
   * qatorlarni bir xil tartibda qulflaydi.
   */
  for v_need in
    select (i->>'product_id')::uuid as product_id, sum((i->>'quantity')::integer) as qty
    from jsonb_array_elements(p_items) i
    group by 1
    order by 1
  loop
    select * into v_product from public.products
      where id = v_need.product_id and is_active = true for update;
    if not found then raise exception 'OUT_OF_STOCK'; end if;
    if v_product.stock < v_need.qty then raise exception 'OUT_OF_STOCK'; end if;
  end loop;

  -- ---- Ombor: VARIANT bo'yicha yig'indi -----------------------
  for v_need in
    select nullif(i->>'variant_id', '')::uuid as variant_id, sum((i->>'quantity')::integer) as qty
    from jsonb_array_elements(p_items) i
    where nullif(i->>'variant_id', '') is not null
    group by 1
    order by 1
  loop
    select * into v_variant from public.product_variants
      where id = v_need.variant_id for update;
    if not found or v_variant.is_active is not true then raise exception 'INVALID_VARIANT'; end if;
    -- Variant boshqa mahsulotga tegishli bo'lsa — qalbaki so'rov.
    if not exists (
      select 1 from jsonb_array_elements(p_items) i
      where nullif(i->>'variant_id', '')::uuid = v_need.variant_id
        and (i->>'product_id')::uuid = v_variant.product_id
    ) then raise exception 'INVALID_VARIANT'; end if;
    if v_variant.stock is not null and v_variant.stock < v_need.qty then raise exception 'OUT_OF_STOCK'; end if;
  end loop;

  -- ---- Summani BAZADAGI narxlardan hisoblaymiz ----------------
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    if v_variant_id is not null then
      select * into v_variant from public.product_variants where id = v_variant_id;
      v_price := greatest(v_price + coalesce(v_variant.price_adjustment, 0), 0);
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  v_delivery := coalesce(public.delivery_fee_for(p_city, v_subtotal), 0);

  -- ---- Idempotentlik: kafolat ---------------------------------
  /*
   * Ikki parallel so'rov yuqoridagi tekshiruvdan bir vaqtda o'tishi
   * mumkin. Bu yerda UNIQUE indeks ikkinchisini to'xtatadi va biz
   * unga xato emas, MAVJUD buyurtmani qaytaramiz — foydalanuvchi uchun
   * natija bir xil bo'ladi.
   */
  begin
    insert into public.orders (
      user_id, customer_name, phone, address, latitude, longitude,
      subtotal, delivery_fee, total_amount,
      payment_method, payment_status, city, note, customer_email,
      checkout_request_id
    )
    values (
      p_user_id, trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude,
      v_subtotal, v_delivery, v_subtotal + v_delivery,
      p_payment_method, v_payment_status,
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_note, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      p_checkout_request_id
    )
    returning id into v_order_id;
  exception when unique_violation then
    select id into v_order_id from public.orders
      where checkout_request_id = p_checkout_request_id;
    if found then return v_order_id; end if;
    raise;
  end;

  -- ---- Pozitsiyalar va ombordan yechish -----------------------
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

revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text) from public;
revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text) to service_role;

-- ============================================================
-- 5. CREATE_ORDER — qobiq ham kalitni uzatadi
-- ============================================================
create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_items jsonb,
  -- Tartib sababi `create_order_as` da batafsil izohlangan: standart
  -- qiymatlidan keyin standart qiymatsiz parametr kela olmaydi (42P13),
  -- `default` qo'shish esa overload'ni noaniq qilib qo'yadi (42725).
  p_checkout_request_id uuid,
  p_payment_method text default 'Naqd pul',
  p_city text default null,
  p_note text default null,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  -- NOMLI argumentlar: parametrlar tartibi o'zgarsa ham chaqiruv
  -- to'g'ri qoladi va qaysi overload tanlanayotgani aniq ko'rinadi.
  return public.create_order_as(
    p_user_id             => auth.uid(),
    p_customer_name       => p_customer_name,
    p_phone               => p_phone,
    p_address             => p_address,
    p_latitude            => p_latitude,
    p_longitude           => p_longitude,
    p_items               => p_items,
    p_checkout_request_id => p_checkout_request_id,
    p_payment_method      => p_payment_method,
    p_city                => p_city,
    p_note                => p_note,
    p_email               => p_email
  );
end; $$;
revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, uuid, text, text, text, text) to authenticated;

-- ============================================================
-- 6. CANCEL_OWN_ORDER — holatlar mashinasiga bo'ysunadi
-- ============================================================
/*
 * Mijoz o'z buyurtmasini faqat u hali yig'ilmagan bo'lsa bekor qila
 * oladi. Ombor qaytarish `stock_restored` bayrog'i bilan himoyalangan,
 * qator esa `for update` bilan qulflangan: tugmani ikki marta bosish ham,
 * ikkita parallel so'rov ham omborni ikki marta oshira olmaydi.
 */
create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype; v_item record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_order.status = 'Bekor qilindi' then return; end if;   -- takroriy bosish — zararsiz
  if v_order.status not in ('Yangi', 'Qabul qilindi') then
    raise exception 'CANNOT_CANCEL';
  end if;

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

  update public.orders
    set status = 'Bekor qilindi',
        stock_restored = true,
        payment_status = case when payment_method = 'Naqd pul' and payment_status = 'COD_PENDING'
                              then 'CANCELLED' else payment_status end
    where id = p_order_id;
end; $$;
revoke all on function public.cancel_own_order(uuid) from public;
grant execute on function public.cancel_own_order(uuid) to authenticated;

-- ============================================================
-- 7. ESKI IMZOLAR — O'CHIRILMAYDI, MOSLIK QOBIG'IGA AYLANTIRILADI
-- ============================================================
/*
 * BU BO'LIM DEPLOY XAVFSIZLIGI UCHUN. Uni noto'g'ri qilish oson.
 *
 * Postgres'da parametrlar soni har xil funksiya — BOSHQA funksiya
 * (overload). Ya'ni yangi 11/12 parametrli variant yaratilgach, eski
 * 10/11 parametrli variant bazada QOLADI va u hamon xato mantiqni
 * (naqd pul = `PAID`, pozitsiya bo'yicha ombor tekshiruvi) bajaradi.
 *
 * Birinchi qarashda yechim — eskisini `drop` qilish. LEKIN bu ikki
 * tomonlama nomuvofiqlik oynasini ochadi:
 *
 *   Frontend ESKI (10 arg) + baza YANGI (faqat 11 arg) → PostgREST
 *   chaqiruvni NOMLI argumentlar bilan quradi
 *   (`create_order(p_customer_name => $1, …)`). Mos keluvchi overload
 *   topilmasa u 404/PGRST202 qaytaradi — argument JIM O'TKAZIB
 *   YUBORILMAYDI. Ya'ni keshdagi eski bundle bilan ochgan har bir
 *   mijoz uchun BUYURTMA BERISH BUTUNLAY ISHLAMAY QOLARDI.
 *
 * To'g'ri yechim — "expand and contract": eski imzo SAQLANADI, lekin
 * uning TANASI yangi funksiyaga yo'naltiriladi. Shunda:
 *
 *   eski frontend + yangi baza → ishlaydi (idempotentliksiz, lekin
 *                                 COD/ombor/holat tuzatishlari BILAN)
 *   yangi frontend + yangi baza → ishlaydi (idempotentlik bilan)
 *
 * Uchinchi kombinatsiya (yangi frontend + ESKI baza) mijoz tomonida
 * hal qilinadi — qarang: src/lib/CheckoutPage.tsx dagi zaxira yo'l.
 *
 * Eski imzoni haqiqatan o'chirish — KEYINGI, alohida migratsiyaning
 * ishi, hamma mijozlar yangilangani aniq bo'lgach ("contract" bosqichi).
 */
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
  /*
   * NOMLI argumentlar — POZITSIYALI EMAS.
   *
   * Yangi `create_order_as` da `p_checkout_request_id` `p_items` dan
   * keyin turadi. Pozitsiyali chaqiruvda 8-o'ringa `p_payment_method`
   * ('Naqd pul' matni) tushib qolar va u `uuid` parametriga urinib
   * ko'rilardi — eng yaxshi holatda xato, eng yomonida boshqa
   * overload'ga tushib ketish. Nomli chaqiruv bunday sinfdagi
   * xatolarni butunlay yo'q qiladi.
   *
   * Idempotentlik kaliti yo'q: eski mijoz uni yubora olmaydi. Qolgan
   * barcha tuzatishlar (COD holati, yig'indi ombor tekshiruvi,
   * holatlar mashinasi) baribir qo'llanadi.
   */
  return public.create_order_as(
    p_user_id             => auth.uid(),
    p_customer_name       => p_customer_name,
    p_phone               => p_phone,
    p_address             => p_address,
    p_latitude            => p_latitude,
    p_longitude           => p_longitude,
    p_items               => p_items,
    p_checkout_request_id => null::uuid,
    p_payment_method      => p_payment_method,
    p_city                => p_city,
    p_note                => p_note,
    p_email               => p_email
  );
end; $$;
revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, text, text, text, text) to authenticated;

-- Bot (service_role) uchun ham xuddi shunday moslik qobig'i.
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
begin
  -- Nomli argumentlar: 12 ta nom berilgani uchun chaqiruv ANIQ yangi
  -- (12 argumentli) funksiyaga tushadi — o'z-o'zini chaqirish (rekursiya)
  -- bo'lishi mumkin emas.
  return public.create_order_as(
    p_user_id             => p_user_id,
    p_customer_name       => p_customer_name,
    p_phone               => p_phone,
    p_address             => p_address,
    p_latitude            => p_latitude,
    p_longitude           => p_longitude,
    p_items               => p_items,
    p_checkout_request_id => null::uuid,
    p_payment_method      => p_payment_method,
    p_city                => p_city,
    p_note                => p_note,
    p_email               => p_email
  );
end; $$;
revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) from public;
revoke all on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) from anon, authenticated;
grant execute on function public.create_order_as(uuid, text, text, text, numeric, numeric, jsonb, text, text, text, text) to service_role;
