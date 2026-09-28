/*
# To'lov arxitekturasi (Click / Payme) + buyurtma rate-limiting

Hozircha haqiqiy Click/Payme credentials yo'q, shuning uchun bu yerda FAKE
to'lov emas — faqat production'da ishlaydigan struktura tayyorlanadi:

1. `payments` jadvali — har bir onlayn to'lov urinishi shu yerda kuzatiladi.
   Status FAQAT webhook orqali (service role, `security definer` emas —
   Edge Function service_role kaliti bilan) o'zgaradi. Frontend/anon/
   authenticated hech qanday holatda `payments.status`ni to'g'ridan-to'g'ri
   yoza olmaydi — shuning uchun bu jadvalda customer uchun faqat SELECT
   policy bor, INSERT/UPDATE policy umuman yo'q (faqat service role, RLS'ni
   chetlab o'tadi).
2. `orders.payment_method` endi 'Naqd pul' bilan bir qatorda 'Click' va
   'Payme'ni ham qabul qiladi; `orders.payment_status` qo'shildi.
3. `create_cash_order` — endi umumiy `create_order(p_payment_method, ...)`
   funksiyasiga aylandi: naqd bo'lsa darhol PAID (chunki yetkazib
   berishda to'lanadi) va status 'Yangi'; online (Click/Payme) bo'lsa
   PENDING va webhook tasdiqlagunча stock band qilinadi, lekin buyurtma
   "to'langan" deb belgilanmaydi.
4. Oddiy rate-limit: bir user 10 daqiqada 5 tadan ortiq buyurtma
   yarata olmaydi (spam/abuse'ni kamaytirish uchun database darajasida).
*/

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('click', 'payme')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
  amount numeric(14,2) not null check (amount >= 0),
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);

alter table public.payments enable row level security;

-- Faqat o'z buyurtmasining to'lov holatini ko'ra oladi. Yozish policy'si
-- yo'q — status faqat webhook Edge Function (service role) orqali
-- o'zgaradi, RLS'ni chetlab o'tadi.
drop policy if exists payment_select_own on public.payments;
create policy payment_select_own on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

-- orders: payment_method endi Click/Payme'ni ham qabul qiladi + payment_status.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('Naqd pul', 'Click', 'Payme'));

alter table public.orders add column if not exists payment_status text not null default 'PAID'
  check (payment_status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED'));

create or replace function public.create_order(
  p_customer_name text, p_phone text, p_address text,
  p_latitude numeric, p_longitude numeric, p_items jsonb,
  p_payment_method text default 'Naqd pul'
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid; v_item jsonb; v_product public.products%rowtype;
  v_total numeric := 0; v_price numeric; v_qty integer; v_active boolean;
  v_recent_orders integer; v_payment_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_active into v_active from public.profiles where id = auth.uid();
  if v_active is not true then raise exception 'ACCOUNT_BLOCKED'; end if;
  if p_payment_method not in ('Naqd pul', 'Click', 'Payme') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;

  -- Rate limit: 10 daqiqada 5 tadan ortiq buyurtma yo'q (abuse'ni kamaytirish).
  select count(*) into v_recent_orders from public.orders
  where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if v_recent_orders >= 5 then raise exception 'TOO_MANY_ORDERS'; end if;

  v_payment_status := case when p_payment_method = 'Naqd pul' then 'PAID' else 'PENDING' end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    v_price := public.effective_price(v_product);
    v_total := v_total + v_price * v_qty;
  end loop;

  insert into public.orders (user_id, customer_name, phone, address, latitude, longitude, total_amount, payment_method, payment_status)
  values (auth.uid(), trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude, v_total, p_payment_method, v_payment_status)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (v_order_id, v_product.id, v_product.name, v_price, v_qty);
    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;

  if p_payment_method in ('Click', 'Payme') then
    insert into public.payments (order_id, provider, status, amount)
    values (v_order_id, lower(p_payment_method), 'PENDING', v_total);
  end if;

  return v_order_id;
end; $$;
/*
 * IMZO ANIQ KO'RSATILGAN — argumentsiz yozuv 42725 beradi.
 *
 * `revoke ... on function public.create_order from public` (imzosiz)
 * Postgres'dan nomni BITTA funksiyaga bog'lashni talab qiladi. Toza
 * bazada shunday: bu yerda faqat 7 argumentli variant mavjud, shuning
 * uchun OpenShop-Test da bu hech qachon muammo bermagan.
 *
 * Lekin migratsiyalar ALLAQACHON yangilangan bazaga qayta o'ynatilsa
 * (produksiyada migratsiya tarixi mos kelmay qolganda), o'sha paytda
 * 10- va 11-argumentli variantlar ham turadi. Uchta nomzod paydo
 * bo'ladi va buyruq quyidagi xato bilan yiqiladi:
 *
 *     ERROR: function name "public.create_order" is not unique (42725)
 *
 * Ya'ni nosozlik migratsiyaning O'ZIDA edi — u shunchaki toza bazada
 * hech qachon ko'rinmagan. Imzo yozilganda buyruq FAQAT shu migratsiya
 * yaratgan variantga tegadi va qayta o'ynatish xavfsiz bo'ladi.
 *
 * (7-argumentli variant keyinroq `20260830000000` da `drop function`
 * bilan olib tashlanadi, ya'ni yakuniy holat o'zgarmaydi.)
 */
revoke all on function public.create_order(text, text, text, numeric, numeric, jsonb, text) from public;
grant execute on function public.create_order(text, text, text, numeric, numeric, jsonb, text) to authenticated;

-- Eski funksiya nomini ham ishlaydigan qilib qoldiramiz (mavjud frontend
-- chaqiruvlarini buzmaslik uchun) — u endi create_order'ga proxy qiladi.
/*
 * TANA TEKSHIRUVI ATAYLAB KECHIKTIRILADI.
 *
 * `language sql` tanasi funksiya YARATILAYOTGANDA nom bo'yicha bog'lanadi
 * (shuning uchun xato chaqiruv paytida emas, `create` paytida chiqadi).
 *
 * Quyidagi chaqiruv 7 ta POZITSIYALI argument beradi. Migratsiya
 * allaqachon yangilangan bazaga qayta o'ynatilganda `create_order` ning
 * IKKI varianti bir vaqtda mos keladi:
 *
 *     (…, jsonb, text)                      ← shu migratsiya yaratgani
 *     (…, jsonb, text, text, text, text)    ← keyingi migratsiyaniki;
 *                                             3 ta standart qiymat
 *                                             tushirib qoldirilishi mumkin
 *
 *     ERROR: function public.create_order(…, unknown) is not unique  (42725)
 *
 * `'Naqd pul'::text` YORDAM BERMAYDI: u faqat `uuid` li uchinchi
 * variantni chiqarib tashlaydi, yuqoridagi ikkitasi baribir qoladi.
 * Nizo TUR bo'yicha emas — ARGUMENT SONI va standart qiymatlar orasida,
 * shuning uchun uni cast bilan hal qilib bo'lmaydi. Nomli argumentlar
 * ham yordam bermaydi (ikkinchi variantda ham xuddi shu nomlar bor).
 *
 * Yechim: tanani tekshirishni ISHGA TUSHIRISH vaqtiga qoldiramiz.
 * Bu yerda xavfsiz, chunki:
 *   — `create_cash_order` ni hech kim chaqirmaydi (ilovada ham,
 *     Edge Function'larda ham 0 ta chaqiruv);
 *   — u `20260830000000` da baribir qaytadan yaratiladi, va o'sha yerda
 *     7-argumentli variant OLDIN o'chirilgani uchun noaniqlik yo'q;
 *   — `set local` tranzaksiya tugashi bilan o'z-o'zidan bekor bo'ladi.
 */
set local check_function_bodies = off;

create or replace function public.create_cash_order(p_customer_name text, p_phone text, p_address text, p_latitude numeric, p_longitude numeric, p_items jsonb)
returns uuid language sql security definer set search_path = public
as $$
  select public.create_order(p_customer_name, p_phone, p_address, p_latitude, p_longitude, p_items, 'Naqd pul');
$$;

reset check_function_bodies;
revoke all on function public.create_cash_order from public;
grant execute on function public.create_cash_order to authenticated;
