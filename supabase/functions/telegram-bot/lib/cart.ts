import {
  admin, sendText, editText, money, esc, clamp, type Lang, type Keyboard,
} from './core.ts';
import { t } from './shopI18n.ts';
import { effectivePrice, activeVariants, type CatalogProduct } from './catalog.ts';

/*
 * Bot savati.
 *
 * `telegram_carts.items` da FAQAT `{product_id, variant_id, qty}` saqlanadi.
 * Narx hech qachon savatga yozilmaydi — u har safar bazadan o'qiladi.
 * Shu sababli saytdagi "savatdagi narx eskirib qoldi" muammosi bu yerda
 * umuman paydo bo'lmaydi, buyurtmada esa summa baribir serverda
 * (`create_order_as`) qayta hisoblanadi.
 */

export type CartItem = { product_id: string; variant_id: string | null; qty: number };

export type ResolvedLine = {
  item: CartItem;
  product: CatalogProduct;
  variantLabel: string | null;
  unitPrice: number;
  available: number;
  sum: number;
};

const CART_FIELDS =
  'id, name, slug, price, discount_price, stock, brand, description, is_active, ' +
  'product_images(image_url, sort_order, is_primary), ' +
  'product_variants(id, type, value, label, color_code, image_url, stock, price_adjustment, is_active, sort_order)';

export async function getCart(chatId: number): Promise<CartItem[]> {
  const { data } = await admin.from('telegram_carts').select('items').eq('chat_id', chatId).maybeSingle();
  const items = (data?.items ?? []) as CartItem[];
  return Array.isArray(items) ? items.filter((i) => i && typeof i.product_id === 'string' && i.qty > 0) : [];
}

async function saveCart(chatId: number, items: CartItem[]) {
  await admin
    .from('telegram_carts')
    .upsert({ chat_id: chatId, items, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
}

export async function clearCart(chatId: number) {
  await saveCart(chatId, []);
}

function sameLine(a: CartItem, b: { product_id: string; variant_id: string | null }) {
  return a.product_id === b.product_id && (a.variant_id ?? null) === (b.variant_id ?? null);
}

export async function addToCart(
  chatId: number,
  product_id: string,
  variant_id: string | null,
  qty: number,
  max: number
): Promise<CartItem[]> {
  const items = await getCart(chatId);
  const idx = items.findIndex((i) => sameLine(i, { product_id, variant_id }));
  if (idx >= 0) items[idx].qty = Math.min(items[idx].qty + qty, Math.max(1, max));
  else items.push({ product_id, variant_id, qty: Math.min(qty, Math.max(1, max)) });
  await saveCart(chatId, items);
  return items;
}

/**
 * Savat pozitsiyalarini bazadagi joriy holat bilan birlashtiradi.
 * Sotuvdan olingan yoki o'chirilgan mahsulotlar avtomatik chiqarib
 * tashlanadi — mijoz "mavjud emas" mahsulotni tasdiqlab, keyin server
 * xatosiga urilib qolmasin.
 */
export async function resolveCart(
  chatId: number
): Promise<{ lines: ResolvedLine[]; subtotal: number; removed: number }> {
  const items = await getCart(chatId);
  if (items.length === 0) return { lines: [], subtotal: 0, removed: 0 };

  const ids = [...new Set(items.map((i) => i.product_id))];
  const { data } = await admin.from('products').select(CART_FIELDS).in('id', ids);
  const byId = new Map((data ?? []).map((p) => [(p as { id: string }).id, p as unknown as CatalogProduct]));

  const lines: ResolvedLine[] = [];
  const kept: CartItem[] = [];
  let removed = 0;

  for (const item of items) {
    const product = byId.get(item.product_id);
    if (!product || product.is_active === false || product.stock <= 0) {
      removed += 1;
      continue;
    }

    const variant = item.variant_id ? activeVariants(product).find((v) => v.id === item.variant_id) : undefined;
    if (item.variant_id && !variant) {
      removed += 1;
      continue;
    }

    const available = variant?.stock != null ? variant.stock : product.stock;
    if (available <= 0) {
      removed += 1;
      continue;
    }

    const qty = Math.min(item.qty, available);
    const unitPrice = effectivePrice(product, variant?.price_adjustment ?? 0);

    kept.push({ ...item, qty });
    lines.push({
      item: { ...item, qty },
      product,
      variantLabel: variant ? variant.label || variant.value : null,
      unitPrice,
      available,
      sum: unitPrice * qty,
    });
  }

  if (removed > 0 || kept.length !== items.length) await saveCart(chatId, kept);

  return { lines, subtotal: lines.reduce((s, l) => s + l.sum, 0), removed };
}

export async function setLineQty(chatId: number, index: number, delta: number) {
  const { lines } = await resolveCart(chatId);
  const line = lines[index];
  if (!line) return;

  const next = line.item.qty + delta;
  const items = lines.map((l) => l.item);

  if (next <= 0) items.splice(index, 1);
  else items[index] = { ...line.item, qty: Math.min(next, line.available) };

  await saveCart(chatId, items);
}

export async function removeLine(chatId: number, index: number) {
  const { lines } = await resolveCart(chatId);
  const items = lines.map((l) => l.item);
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  await saveCart(chatId, items);
}

/** Yetkazib berish narxi — sayt bilan bir xil qoida (bazadagi funksiya). */
export async function deliveryFeeFor(city: string | null, subtotal: number): Promise<number> {
  const { data, error } = await admin.rpc('delivery_fee_for', { p_city: city, p_subtotal: subtotal });
  if (error) return 0;
  return Number(data ?? 0);
}

export function cartLines(lines: ResolvedLine[], lang: Lang): string {
  return lines
    .map((l, i) =>
      t('cart_line', lang, {
        i: i + 1,
        name: esc(l.product.name) + (l.variantLabel ? ` <i>(${esc(l.variantLabel)})</i>` : ''),
        qty: l.item.qty,
        price: money(l.unitPrice),
        sum: money(l.sum),
      })
    )
    .join('\n\n');
}

/** Savat ekrani — bitta xabar ichida yangilanadi. */
export async function showCart(chatId: number, lang: Lang, messageId?: number) {
  const { lines, subtotal, removed } = await resolveCart(chatId);

  if (removed > 0) await sendText(chatId, t('cart_item_gone', lang));

  if (lines.length === 0) {
    const markup = {
      inline_keyboard: [
        [{ text: t('btn_catalog', lang), callback_data: 'catalog' }],
        [{ text: '🔙', callback_data: 'menu' }],
      ],
    };
    const text = t('cart_empty', lang);
    if (messageId) await editText(chatId, messageId, text, markup);
    else await sendText(chatId, text, markup);
    return;
  }

  const rows: Keyboard[] = lines.map((l, i) => {
    const row: Record<string, string>[] = [
      { text: '➖', callback_data: `ci:${i}:-` },
      { text: `${i + 1}. ${clamp(l.product.name, 14)} ×${l.item.qty}`, callback_data: 'noop' },
      { text: '➕', callback_data: `ci:${i}:+` },
      { text: '🗑', callback_data: `ci:${i}:x` },
    ];
    return row as unknown as Keyboard;
  });

  rows.push([{ text: t('btn_checkout', lang), callback_data: 'checkout' }] as unknown as Keyboard);
  rows.push([
    { text: t('btn_catalog', lang), callback_data: 'catalog' },
    { text: t('btn_clear_cart', lang), callback_data: 'cart_clear' },
  ] as unknown as Keyboard);
  rows.push([{ text: '🔙', callback_data: 'menu' }] as unknown as Keyboard);

  const text = t('cart_title', lang, { lines: cartLines(lines, lang), subtotal: money(subtotal) });
  const markup = { inline_keyboard: rows };

  if (messageId) await editText(chatId, messageId, text, markup);
  else await sendText(chatId, text, markup);
}
