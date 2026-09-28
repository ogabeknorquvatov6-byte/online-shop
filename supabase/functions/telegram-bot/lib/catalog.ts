import {
  admin, sendText, sendPhoto, sendMediaGroup, editText, answerCallback,
  money, esc, clamp, setSession, type Lang, type Keyboard,
} from './core.ts';
import { t } from './shopI18n.ts';

/*
 * Katalog: bo'limlar → mahsulotlar ro'yxati (sahifalab) → mahsulot kartasi.
 *
 * Ro'yxat BITTA xabar ichida yangilanadi (editMessageText), aks holda
 * varaqlaganda chat o'nlab bir xil xabar bilan to'lib ketardi.
 */

const PAGE_SIZE = 5;

/** Katalog uchun kerakli maydonlar — ortiqcha ustun tortilmaydi. */
const PRODUCT_FIELDS =
  'id, name, slug, price, discount_price, stock, brand, description, is_active, category_id, ' +
  'product_images(image_url, sort_order, is_primary), ' +
  'product_variants(id, type, value, label, color_code, image_url, stock, price_adjustment, is_active, sort_order)';

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  brand: string | null;
  description: string | null;
  product_images?: { image_url: string; sort_order: number; is_primary: boolean | null }[];
  product_variants?: {
    id: string; type: string; value: string; label: string | null; color_code: string | null;
    image_url: string | null; stock: number | null; price_adjustment: number | null;
    is_active: boolean | null; sort_order: number;
  }[];
};

/** Amaldagi narx — chegirma va variant qo'shimchasi bilan. */
export function effectivePrice(p: CatalogProduct, variantAdjustment = 0): number {
  const base = p.discount_price != null && p.discount_price > 0 ? p.discount_price : p.price;
  return Math.max(0, Number(base) + Number(variantAdjustment || 0));
}

export function productImages(p: CatalogProduct): string[] {
  return [...(p.product_images ?? [])]
    .sort((a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false) || a.sort_order - b.sort_order)
    .map((i) => i.image_url)
    .filter(Boolean);
}

export function activeVariants(p: CatalogProduct) {
  return (p.product_variants ?? [])
    .filter((v) => v.is_active !== false)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function stockLine(stock: number, lang: Lang): string {
  if (stock <= 0) return t('out_of_stock', lang);
  if (stock <= 5) return t('low_stock', lang, { n: stock });
  return t('in_stock', lang);
}

function priceLine(p: CatalogProduct, lang: Lang, adjustment = 0): string {
  const now = effectivePrice(p, adjustment);
  const old = Number(p.price) + Number(adjustment || 0);
  const discounted = p.discount_price != null && p.discount_price > 0 && Number(p.discount_price) < Number(p.price);
  if (!discounted) return t('price_plain', lang, { price: money(now) });
  return t('price_with_old', lang, {
    price: money(now),
    old: money(old),
    discount: Math.round((1 - now / old) * 100),
  });
}

/* ── 1. Bo'limlar ─────────────────────────────────────────────── */

export async function showCategories(chatId: number, lang: Lang, messageId?: number) {
  const { data } = await admin
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  const cats = data ?? [];
  if (cats.length === 0) {
    await sendText(chatId, t('no_categories', lang));
    return;
  }

  // Ikkita ustunli tor tarmoq — telefon ekranida qulay.
  const rows: Keyboard[] = [];
  for (let i = 0; i < cats.length; i += 2) {
    rows.push(
      cats.slice(i, i + 2).map((c: { id: string; name: string }) => ({
        text: clamp(c.name, 28),
        callback_data: `cat:${c.id}:0`,
      })) as unknown as Keyboard
    );
  }
  rows.push([{ text: t('btn_cart', lang), callback_data: 'cart' }] as unknown as Keyboard);
  rows.push([{ text: '🔙', callback_data: 'menu' }] as unknown as Keyboard);

  const markup = { inline_keyboard: rows };
  const text = t('categories_title', lang);

  if (messageId) await editText(chatId, messageId, text, markup);
  else await sendText(chatId, text, markup);
}

/* ── 2. Kategoriya ichidagi mahsulotlar ───────────────────────── */

export async function showCategoryPage(
  chatId: number,
  lang: Lang,
  categoryId: string,
  page: number,
  messageId?: number
) {
  const from = page * PAGE_SIZE;

  const [{ data: category }, { data: products, count }] = await Promise.all([
    admin.from('categories').select('name').eq('id', categoryId).maybeSingle(),
    admin
      .from('products')
      .select(PRODUCT_FIELDS, { count: 'exact' })
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('stock', { ascending: false }) // sotuvda borlar oldinda
      .order('sales_count', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1),
  ]);

  const list = (products ?? []) as unknown as CatalogProduct[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (list.length === 0) {
    const markup = { inline_keyboard: [[{ text: t('btn_back_to_categories', lang), callback_data: 'catalog' }]] };
    const text = t('no_products', lang);
    if (messageId) await editText(chatId, messageId, text, markup);
    else await sendText(chatId, text, markup);
    return;
  }

  const header = t('category_title', lang, {
    name: esc(category?.name ?? ''),
    count: total,
    page: page + 1,
    pages,
  });

  const lines = list.map((p, i) => {
    const n = from + i + 1;
    const soldOut = p.stock <= 0 ? ` · ${t('out_of_stock', lang)}` : '';
    return `${n}. <b>${esc(p.name)}</b>\n     ${money(effectivePrice(p))}${soldOut}`;
  });

  // Har bir mahsulot uchun bitta qator: [ℹ️ Nomi] [🛒]
  const rows: Keyboard[] = list.map((p, i) => {
    const row: Record<string, string>[] = [
      { text: `${from + i + 1}. ${clamp(p.name, 24)}`, callback_data: `prod:${p.id}` },
    ];
    if (p.stock > 0) row.push({ text: '🛒', callback_data: `quickadd:${p.id}` });
    return row as unknown as Keyboard;
  });

  const nav: Record<string, string>[] = [];
  if (page > 0) nav.push({ text: t('btn_prev', lang), callback_data: `cat:${categoryId}:${page - 1}` });
  if (page + 1 < pages) nav.push({ text: t('btn_next', lang), callback_data: `cat:${categoryId}:${page + 1}` });
  if (nav.length) rows.push(nav as unknown as Keyboard);

  rows.push([
    { text: t('btn_back_to_categories', lang), callback_data: 'catalog' },
    { text: t('btn_cart', lang), callback_data: 'cart' },
  ] as unknown as Keyboard);

  const text = `${header}\n\n${lines.join('\n\n')}`;
  const markup = { inline_keyboard: rows };

  if (messageId) await editText(chatId, messageId, text, markup);
  else {
    const res = await sendText(chatId, text, markup);
    // Keyingi varaqlashda shu xabarni o'rnida yangilash uchun eslab qolamiz.
    if (res?.result?.message_id) await setSession(chatId, { list_message_id: res.result.message_id });
  }
}

/* ── 3. Mahsulot kartasi ──────────────────────────────────────── */

export async function getProduct(productId: string): Promise<CatalogProduct | null> {
  const { data } = await admin.from('products').select(PRODUCT_FIELDS).eq('id', productId).maybeSingle();
  return (data as unknown as CatalogProduct) ?? null;
}

/**
 * Mahsulot kartasi: rasm(lar) + tavsif + miqdor boshqaruvi.
 * Tanlov (mahsulot / variant / miqdor) sessiyaning `pending_item` maydonida
 * saqlanadi — callback_data'ning 64 baytlik chegarasiga sig'dirish uchun.
 */
export async function showProduct(
  chatId: number,
  lang: Lang,
  product: CatalogProduct,
  state: { variantId?: string | null; qty: number },
  categoryId?: string | null
) {
  const variants = activeVariants(product);
  const variant = state.variantId ? variants.find((v) => v.id === state.variantId) ?? null : null;
  const adjustment = variant?.price_adjustment ?? 0;

  const available = variant?.stock != null ? variant.stock : product.stock;
  const qty = Math.max(1, Math.min(state.qty, Math.max(1, available)));

  await setSession(chatId, {
    pending_item: { product_id: product.id, variant_id: variant?.id ?? null, qty, category_id: categoryId ?? null },
  });

  // Ko'rishni yozib qo'yamiz — keyinchalik "shu mahsulotni ko'rganlarga"
  // maqsadli xabar yuborish uchun ishlatiladi.
  admin.rpc('track_telegram_product_view', { p_chat_id: chatId, p_product_id: product.id }).then(
    () => {},
    () => {}
  );

  const images = variant?.image_url ? [variant.image_url, ...productImages(product)] : productImages(product);
  const uniqueImages = [...new Set(images)];

  const card = t('product_card', lang, {
    name: esc(product.name),
    brand: product.brand ? `<i>${esc(product.brand)}</i>` : '',
    price: priceLine(product, lang, adjustment),
    stock: stockLine(available, lang),
    description: esc(clamp(product.description?.trim() || t('no_description', lang), 600)),
  });

  const rows: Keyboard[] = [];

  // Variantlar — har biri alohida tugma, tanlangani belgilanadi.
  if (variants.length > 0) {
    for (let i = 0; i < variants.length; i += 3) {
      rows.push(
        variants.slice(i, i + 3).map((v) => ({
          text: `${v.id === variant?.id ? '✅ ' : ''}${clamp(v.label || v.value, 16)}`,
          callback_data: `pvar:${v.id.slice(0, 8)}`,
        })) as unknown as Keyboard
      );
    }
  }

  if (available > 0) {
    rows.push([
      { text: '➖', callback_data: 'pqty:-' },
      { text: t('qty_label', lang, { n: qty }), callback_data: 'noop' },
      { text: '➕', callback_data: 'pqty:+' },
    ] as unknown as Keyboard);
    rows.push([{ text: t('btn_add_to_cart', lang), callback_data: 'padd' }] as unknown as Keyboard);
  } else {
    rows.push([{ text: t('btn_notify_me', lang), callback_data: `notify:${product.id}` }] as unknown as Keyboard);
  }

  rows.push([
    {
      text: t('btn_back_to_category', lang),
      callback_data: categoryId ? `cat:${categoryId}:0` : 'catalog',
    },
    { text: t('btn_cart', lang), callback_data: 'cart' },
  ] as unknown as Keyboard);

  const markup = { inline_keyboard: rows };

  /*
   * Bir nechta rasm bo'lsa media-group yuboriladi, lekin Telegram
   * media-group'ga tugma biriktirishga ruxsat bermaydi — shuning uchun
   * kartochka matni va tugmalar alohida xabarda keladi.
   */
  if (uniqueImages.length > 1) {
    await sendMediaGroup(chatId, uniqueImages, clamp(`<b>${esc(product.name)}</b>`, 1024));
    await sendText(chatId, card, markup);
  } else if (uniqueImages.length === 1) {
    await sendPhoto(chatId, uniqueImages[0], clamp(card, 1024), markup);
  } else {
    await sendText(chatId, card, markup);
  }
}

/* ── 4. Ombor bildirishnomasi ─────────────────────────────────── */

export async function subscribeStockAlert(chatId: number, productId: string, lang: Lang, callbackId: string) {
  const { error } = await admin.from('stock_alerts').insert({ chat_id: chatId, product_id: productId });
  // Takroriy obuna primary key xatosi beradi — bu xato emas, oddiy holat.
  const already = error?.code === '23505';
  await answerCallback(callbackId, already ? t('alert_exists', lang) : t('alert_added', lang), true);
}
