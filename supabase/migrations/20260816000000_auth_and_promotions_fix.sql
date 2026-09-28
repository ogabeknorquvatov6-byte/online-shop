/*
# Auth hardening + promotions wired into effective pricing

1. Changes
- create_cash_order now rejects orders from deactivated (blocked) accounts.
- New function `active_promotion_discounts()` returns the best active
  promotion discount percent per product, so the storefront can show
  promotion-driven pricing (not just the manual discount_price field).
- New function `products_with_effective_price()` is not created; instead
  the frontend combines discount_price and the promotion map client-side
  for flexibility (see PromotionContext).

2. Security
- No RLS changes. create_cash_order remains SECURITY DEFINER, callable
  only by authenticated users, and now double-checks profile status.
*/

create or replace function public.effective_price(p_product public.products)
returns numeric language sql stable security definer set search_path = public
as $$
  select least(
    coalesce(p_product.discount_price, p_product.price),
    coalesce(
      p_product.price * (1 - (
        select max(pr.discount_percent) from public.promotion_products pp
        join public.promotions pr on pr.id = pp.promotion_id
        where pp.product_id = p_product.id and pr.is_active = true
          and pr.starts_at <= now() and (pr.ends_at is null or pr.ends_at >= now())
      ) / 100.0),
      p_product.price
    )
  )
$$;

create or replace function public.create_cash_order(p_customer_name text, p_phone text, p_address text, p_latitude numeric, p_longitude numeric, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_order_id uuid; v_item jsonb; v_product public.products%rowtype; v_total numeric := 0; v_price numeric; v_qty integer; v_active boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_active into v_active from public.profiles where id = auth.uid();
  if v_active is not true then raise exception 'ACCOUNT_BLOCKED'; end if;
  if length(trim(p_customer_name)) < 2 or length(trim(p_phone)) < 5 or length(trim(p_address)) < 5 then raise exception 'INVALID_DETAILS'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'EMPTY_CART'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found or v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    v_price := public.effective_price(v_product);
    v_total := v_total + v_price * v_qty;
  end loop;
  insert into public.orders (user_id, customer_name, phone, address, latitude, longitude, total_amount) values (auth.uid(), trim(p_customer_name), trim(p_phone), trim(p_address), p_latitude, p_longitude, v_total) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := public.effective_price(v_product);
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (v_order_id, v_product.id, v_product.name, v_price, v_qty);
    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;
  return v_order_id;
end; $$;
revoke all on function public.create_cash_order from public;
grant execute on function public.create_cash_order to authenticated;

-- Best active promotion discount percent per product (read-only, public).
create or replace function public.active_promotion_discounts()
returns table(product_id uuid, discount_percent integer)
language sql stable security definer set search_path = public
as $$
  select pp.product_id, max(p.discount_percent)::integer as discount_percent
  from public.promotion_products pp
  join public.promotions p on p.id = pp.promotion_id
  where p.is_active = true
    and p.starts_at <= now()
    and (p.ends_at is null or p.ends_at >= now())
  group by pp.product_id
$$;
revoke all on function public.active_promotion_discounts() from public;
grant execute on function public.active_promotion_discounts to anon, authenticated;
