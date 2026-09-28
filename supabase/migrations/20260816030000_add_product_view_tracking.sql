-- Tracks how many times each product page has been viewed, to power the
-- "Tavsiya etamiz" (recommended / most viewed) homepage section.

alter table products add column if not exists view_count integer not null default 0;

create or replace function increment_product_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update products set view_count = view_count + 1 where id = p_id;
$$;

grant execute on function increment_product_view(uuid) to anon, authenticated;
