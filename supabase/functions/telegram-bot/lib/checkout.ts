import {
  admin, sendText, money, esc, setSession, type Lang, type Keyboard, type Session,
} from './core.ts';
import { t } from './shopI18n.ts';
import { resolveCart, cartLines, deliveryFeeFor, clearCart } from './cart.ts';

/*
 * Bot ichidagi checkout.
 *
 * Bosqichlar sessiyaning `state` maydonida, to'plangan ma'lumot esa
 * `checkout` jsonb'sida saqlanadi:
 *   checkout_address → checkout_address_text → checkout_name
 *   → checkout_note → checkout_confirm
 *
 * MUHIM: bu yerda buyurtma yaratish mantig'i YO'Q. Yakunda
 * `create_order_as` RPC chaqiriladi — u saytdagi checkout bilan
 * AYNAN bir xil funksiya (narx, chegirma, variant, ombor, yetkazib
 * berish — hammasi serverda qayta hisoblanadi).
 */

export type CheckoutDraft = {
  address?: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  name?: string;
  phone?: string;
  note?: string | null;
};

const PAYMENT = 'Naqd pul';

function draftOf(session: Session): CheckoutDraft {
  return (session.checkout as CheckoutDraft) ?? {};
}

/** Manzil matnidan shaharni taxmin qilamiz (yetkazib berish narxi uchun). */
function guessCity(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower.includes('toshkent') || lower.includes('tashkent') || lower.includes('ташкент')) return 'Toshkent';
  return null;
}

/* ── 1. Boshlash: manzilni tanlash ────────────────────────────── */

export async function startCheckout(chatId: number, lang: Lang, session: Session) {
  if (!session.user_id) {
    await sendText(chatId, t('checkout_login_required', lang), {
      inline_keyboard: [[{ text: '🔑', callback_data: 'login' }, { text: '📝', callback_data: 'register' }]],
    });
    return;
  }

  const { lines } = await resolveCart(chatId);
  if (lines.length === 0) {
    await sendText(chatId, t('cart_empty', lang));
    return;
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, first_name, last_name, phone')
    .eq('id', session.user_id)
    .maybeSingle();

  const { data: addresses } = await admin
    .from('addresses')
    .select('id, label, city, district, street, full_address')
    .eq('user_id', session.user_id)
    .order('is_default', { ascending: false })
    .limit(5);

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.display_name ||
    '';

  await setSession(chatId, {
    state: 'checkout_address',
    checkout: { name: fullName, phone: profile?.phone ?? session.phone ?? '' } satisfies CheckoutDraft,
  });

  const rows: Keyboard[] = (addresses ?? []).map((a) => {
    const label = [a.city, a.district, a.street].filter(Boolean).join(', ') || a.full_address || a.label;
    return [{ text: `📍 ${String(label).slice(0, 40)}`, callback_data: `addr:${a.id}` }] as unknown as Keyboard;
  });

  rows.push([{ text: t('btn_type_address', lang), callback_data: 'addr_type' }] as unknown as Keyboard);
  rows.push([{ text: '🔙', callback_data: 'cart' }] as unknown as Keyboard);

  await sendText(chatId, t('choose_address', lang), { inline_keyboard: rows });

  // Joylashuv tugmasi faqat oddiy (reply) klaviaturada ishlaydi.
  await sendText(chatId, '⌨️', {
    keyboard: [[{ text: t('btn_send_location', lang), request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

/* ── 2. Manzil qabul qilindi → ism ────────────────────────────── */

export async function acceptAddress(
  chatId: number,
  lang: Lang,
  session: Session,
  address: string,
  coords?: { lat: number; lng: number }
) {
  const draft = draftOf(session);
  const next: CheckoutDraft = {
    ...draft,
    address,
    city: guessCity(address),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  };

  // Ism profilda bor bo'lsa, so'ramaymiz — ortiqcha savol bermaslik kerak.
  if ((next.name ?? '').trim().length >= 2) {
    await setSession(chatId, { state: 'checkout_note', checkout: next });
    await sendText(chatId, t('ask_order_note', lang), {
      inline_keyboard: [[{ text: t('btn_skip', lang), callback_data: 'note_skip' }]],
    });
    return;
  }

  await setSession(chatId, { state: 'checkout_name', checkout: next });
  await sendText(chatId, t('ask_recipient_name', lang), { remove_keyboard: true });
}

export async function acceptName(chatId: number, lang: Lang, session: Session, name: string) {
  const next: CheckoutDraft = { ...draftOf(session), name: name.trim() };
  await setSession(chatId, { state: 'checkout_note', checkout: next });
  await sendText(chatId, t('ask_order_note', lang), {
    inline_keyboard: [[{ text: t('btn_skip', lang), callback_data: 'note_skip' }]],
  });
}

export async function acceptNote(chatId: number, lang: Lang, session: Session, note: string | null) {
  const next: CheckoutDraft = { ...draftOf(session), note: note?.trim() || null };
  await setSession(chatId, { state: 'checkout_confirm', checkout: next });
  await showConfirmation(chatId, lang, { ...session, checkout: next } as Session);
}

/* ── 3. Tasdiqlash ekrani ─────────────────────────────────────── */

export async function showConfirmation(chatId: number, lang: Lang, session: Session) {
  const draft = draftOf(session);
  const { lines, subtotal } = await resolveCart(chatId);

  if (lines.length === 0) {
    await sendText(chatId, t('cart_empty', lang));
    await setSession(chatId, { state: 'idle', checkout: null });
    return;
  }

  const delivery = await deliveryFeeFor(draft.city ?? null, subtotal);
  const total = subtotal + delivery;

  const text = t('confirm_title', lang, {
    lines: cartLines(lines, lang),
    subtotal: money(subtotal),
    delivery: delivery === 0 ? t('delivery_free', lang) : money(delivery),
    total: money(total),
    name: esc(draft.name ?? ''),
    phone: esc(draft.phone ?? ''),
    address: esc(draft.address ?? ''),
    payment: PAYMENT,
  });

  await sendText(chatId, text, {
    inline_keyboard: [
      [{ text: t('btn_confirm_order', lang), callback_data: 'order_confirm' }],
      [{ text: '🔙', callback_data: 'cart' }],
    ],
  });
}

/* ── 4. Buyurtmani yaratish ───────────────────────────────────── */

const ERROR_KEYS: Record<string, string> = {
  OUT_OF_STOCK: 'err_out_of_stock',
  TOO_MANY_ORDERS: 'err_too_many',
  ACCOUNT_BLOCKED: 'err_blocked',
  INVALID_DETAILS: 'err_details',
  EMPTY_CART: 'cart_empty',
};

export async function submitOrder(chatId: number, lang: Lang, session: Session) {
  const draft = draftOf(session);
  if (!session.user_id) {
    await sendText(chatId, t('checkout_login_required', lang));
    return;
  }

  const { lines } = await resolveCart(chatId);
  if (lines.length === 0) {
    await sendText(chatId, t('cart_empty', lang));
    return;
  }

  /*
   * Faqat `product_id / variant_id / quantity` yuboriladi.
   * Narx ATAYLAB yuborilmaydi — server uni o'zi hisoblaydi, shuning uchun
   * botdan kelgan so'rovni o'zgartirib arzon narx olishning iloji yo'q.
   */
  const payload = lines.map((l) => ({
    product_id: l.item.product_id,
    variant_id: l.item.variant_id,
    quantity: l.item.qty,
    variant: l.variantLabel,
  }));

  const { data: orderId, error } = await admin.rpc('create_order_as', {
    p_user_id: session.user_id,
    p_customer_name: draft.name ?? '',
    p_phone: draft.phone ?? '',
    p_address: draft.address ?? '',
    p_latitude: draft.lat ?? null,
    p_longitude: draft.lng ?? null,
    p_items: payload,
    p_payment_method: PAYMENT,
    p_city: draft.city ?? null,
    p_note: draft.note ?? null,
    p_email: null,
  });

  await setSession(chatId, { state: 'idle', checkout: null });

  if (error || !orderId) {
    const code = Object.keys(ERROR_KEYS).find((k) => error?.message?.includes(k));
    const reason = code ? t(ERROR_KEYS[code], lang) : t('err_unknown', lang);
    console.error('bot order failed', error);
    await sendText(chatId, t('order_failed', lang, { reason }));
    return;
  }

  const { data: created } = await admin
    .from('orders')
    .select('order_number, total_amount')
    .eq('id', orderId)
    .maybeSingle();

  await clearCart(chatId);

  // `telegram-order-notify` webhook ham ishga tushadi; bu esa darhol,
  // buyurtma bergan chatning o'ziga beriladigan tasdiq.
  await sendText(
    chatId,
    t('order_created', lang, {
      number: created?.order_number ?? String(orderId).slice(0, 8).toUpperCase(),
      total: money(created?.total_amount ?? 0),
    }),
    { inline_keyboard: [[{ text: t('btn_catalog', lang), callback_data: 'catalog' }]] }
  );
}
