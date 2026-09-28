/*
# Add best_selling_products RPC function

Adds a SECURITY DEFINER function that aggregates completed-order quantities
per product and returns the product_ids ranked by total sold. Used by the
homepage "Eng ko'p sotilgan" section and the admin dashboard best-sellers card.

1. New functions
- best_selling_products(): returns table(product_id uuid, total_sold bigint)

2. Security
- Read-only aggregation; granted to anon + authenticated.
*/

create or replace function public.best_selling_products()
returns table(product_id uuid, total_sold bigint)
language sql stable security definer set search_path = public
as $$
  select oi.product_id, sum(oi.quantity)::bigint as total_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status not in ('Bekor qilindi')
    and oi.product_id is not null
  group by oi.product_id
  order by total_sold desc
$$;

revoke all on function public.best_selling_products() from public;
grant execute on function public.best_selling_products to anon, authenticated;
