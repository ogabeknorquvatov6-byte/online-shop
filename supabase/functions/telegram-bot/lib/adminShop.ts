import { admin, sendText, editText, money, esc, clamp, type Lang, type Keyboard } from './core.ts';
import { t } from './shopI18n.ts';

/*
 * Admin uchun tezkor nazorat: statistika va buyurtmalarni saytga
 * kirmasdan boshqarish. Holat o'zgartirish `set_order_status` RPC
 * orqali — u omborni xavfsiz qaytaradi/band qiladi (oddiy UPDATE
 * buni qilmaydi).
 */

const STATUSES = ['Yangi', 'Qabul qilindi', 'Tayyorlanmoqda', 'Yetkazilmoqda', 'Yetkazildi', 'Bekor qilindi'];

export async function showStats(chatId: number, lang: Lang) {
  const { data, error } = await admin.rpc('bot_sales_stats');
  if (error || !data) {
    await sendText(chatId, t('stats_no_sales', lang));
    return;
  }

  const s = data as {
    today_count: number; today_sum: number; open_count: number; week_sum: number;
    top_products: { name: string; qty: number }[];
  };

  const top = (s.top_products ?? []).length
    ? s.top_products.map((p, i) => `${i + 1}. ${esc(p.name)} — ${p.qty} ta`).join('\n')
    : t('stats_no_sales', lang);

  await sendText(
    chatId,
    t('stats_text', lang, {
      todayCount: s.today_count,
      todaySum: money(s.today_sum),
      openCount: s.open_count,
      weekSum: money(s.week_sum),
      top,
    }),
    { inline_keyboard: [[{ text: t('btn_admin_orders', lang), callback_data: 'admin_orders' }], [{ text: '🔙', callback_data: 'admin_panel' }]] }
  );
}

/** So'nggi buyurtmalar ro'yxati — har biri alohida tugma. */
export async function showOrders(chatId: number, lang: Lang, messageId?: number) {
  const { data } = await admin
    .from('orders')
    .select('id, order_number, customer_name, total_amount, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const orders = data ?? [];
  if (orders.length === 0) {
    await sendText(chatId, t('admin_no_orders', lang));
    return;
  }

  const rows: Keyboard[] = orders.map((o) => [
    {
      text: `${o.status === 'Yangi' ? '🆕 ' : ''}№${String(o.order_number ?? '').slice(-6)} · ${money(o.total_amount)}`,
      callback_data: `aord:${o.id}`,
    },
  ] as unknown as Keyboard);

  rows.push([{ text: '🔙', callback_data: 'admin_panel' }] as unknown as Keyboard);

  const markup = { inline_keyboard: rows };
  if (messageId) await editText(chatId, messageId, t('admin_orders_title', lang), markup);
  else await sendText(chatId, t('admin_orders_title', lang), markup);
}

export async function showOrderDetail(chatId: number, lang: Lang, orderId: string) {
  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, customer_name, phone, address, city, note, total_amount, status, order_items(product_name, quantity, unit_price, variant)')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    await sendText(chatId, t('admin_no_orders', lang));
    return;
  }

  const items = (order.order_items ?? []) as { product_name: string; quantity: number; unit_price: number; variant: string | null }[];
  const itemsText = items
    .map((i) => `• ${esc(i.product_name)}${i.variant ? ` (${esc(i.variant)})` : ''} — ${i.quantity} × ${money(i.unit_price)}`)
    .join('\n');

  const text = t('admin_order_card', lang, {
    number: esc(order.order_number ?? ''),
    name: esc(order.customer_name ?? '—'),
    phone: esc(order.phone ?? '—'),
    address: esc([order.city, order.address].filter(Boolean).join(', ') || '—'),
    total: money(order.total_amount),
    status: esc(order.status),
    items: clamp(itemsText, 1500),
  });

  const statusRows: Keyboard[] = [];
  for (let i = 0; i < STATUSES.length; i += 2) {
    statusRows.push(
      STATUSES.slice(i, i + 2).map((s) => ({
        text: `${s === order.status ? '✅ ' : ''}${s}`,
        // `set_order_status` uzun; status indeksini yuboramiz (64 bayt chegarasi).
        callback_data: `ast:${order.id}:${STATUSES.indexOf(s)}`,
      })) as unknown as Keyboard
    );
  }
  statusRows.push([{ text: '🔙', callback_data: 'admin_orders' }] as unknown as Keyboard);

  await sendText(chatId, text + `\n\n${t('btn_change_status', lang)}:`, { inline_keyboard: statusRows });
}

export async function changeOrderStatus(chatId: number, lang: Lang, orderId: string, statusIndex: number) {
  const status = STATUSES[statusIndex];
  if (!status) return;

  // Oddiy UPDATE emas: bu RPC omborni to'g'ri qaytaradi/band qiladi.
  const { error } = await admin.rpc('set_order_status', { p_order_id: orderId, p_status: status });

  if (error) {
    console.error('bot status change failed', error);
    await sendText(chatId, t('status_failed', lang));
    return;
  }
  await sendText(chatId, t('status_updated', lang, { status }));
  await showOrderDetail(chatId, lang, orderId);
}

/* ── Maqsadli xabar: mahsulotni ko'rganlar ────────────────────── */

export async function findProductsByName(query: string) {
  const { data } = await admin
    .from('products')
    .select('id, name')
    .ilike('name', `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .eq('is_active', true)
    .limit(8);
  return data ?? [];
}

export async function viewersOf(productId: string): Promise<number[]> {
  const { data } = await admin
    .from('telegram_product_views')
    .select('chat_id')
    .eq('product_id', productId);
  return [...new Set((data ?? []).map((r) => Number(r.chat_id)))];
}
