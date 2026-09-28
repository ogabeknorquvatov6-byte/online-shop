/*
# Order status change — xavfsiz stock tiklash

## Muammo
Admin panelda buyurtma statusini o'zgartirish oddiy
`supabase.from('orders').update({status})` orqali bo'lardi:
- "Bekor qilindi" qilinganda stock hech qachon qaytarilmasdi.
- Bekor qilingan buyurtmani boshqa statusga qaytarsa (masalan
  admin xato bosib qayta faollashtirsa), stock avval kamaytirilgan
  bo'lsa ham hisobga olinmasdi.
- Bitta buyurtmani bir necha marta "Bekor qilindi" <-> boshqa status
  orasida almashtirsa, stock bir necha marta qaytarilib/kamayib,
  noto'g'ri sonlarga olib kelishi mumkin edi.

## Yechim
`orders.stock_restored` bayrog'i + `set_order_status()` funksiyasi:
- Statusni "Bekor qilindi"ga o'zgartirganda — FAQAT bir marta
  (stock_restored = false bo'lsa) har bir order_item bo'yicha
  stock qaytariladi.
- "Bekor qilindi"dan boshqa statusga qaytarilganda — agar stock
  avval qaytarilgan bo'lsa, qayta kamaytiriladi (agar yetarli stock
  bo'lmasa, xatolik qaytarib, statusni o'zgartirishga yo'l qo'ymaydi).
- Faqat admin chaqira oladi.
*/

alter table public.orders add column if not exists stock_restored boolean not null default false;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_current text;
  v_restored boolean;
  v_item record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('Yangi','Qabul qilindi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, stock_restored into v_current, v_restored from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_status = 'Bekor qilindi' and v_current <> 'Bekor qilindi' and not v_restored then
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    end loop;
    update public.orders set status = p_status, stock_restored = true where id = p_order_id;
    return;
  end if;

  if p_status <> 'Bekor qilindi' and v_current = 'Bekor qilindi' and v_restored then
    -- Qayta faollashtirilmoqda: avval qaytarilgan stockni yana band qilamiz.
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id and product_id is not null loop
      if (select stock from public.products where id = v_item.product_id) < v_item.quantity then
        raise exception 'OUT_OF_STOCK';
      end if;
    end loop;
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id and product_id is not null loop
      update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
    end loop;
    update public.orders set status = p_status, stock_restored = false where id = p_order_id;
    return;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end; $$;
revoke all on function public.set_order_status from public;
grant execute on function public.set_order_status to authenticated;
