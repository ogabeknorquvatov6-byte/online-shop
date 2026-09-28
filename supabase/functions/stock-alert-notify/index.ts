import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * "Mavjud bo'lganda xabar bering" bildirishnomasi.
 *
 * Supabase Database Webhook sifatida ulanadi:
 *   Table   : public.products
 *   Events  : UPDATE
 *   Method  : POST → bu funksiya URL'i
 *
 * Ombor 0 dan musbat songa o'tgan paytdagina ishlaydi. Har bir
 * obunachiga bir marta xabar boradi va obuna o'chiriladi — aks holda
 * admin omborni har tahrirlaganda odamlar takroriy xabar olardi.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function money(value: number | string | null | undefined): string {
  return `${Math.round(Number(value ?? 0)).toLocaleString('ru-RU')} so'm`;
}

function esc(raw: string | null | undefined): string {
  return String(raw ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const TEXT: Record<string, string> = {
  uz: '🔔 <b>{name}</b> yana sotuvda!\n\n{price}\n\nTez bo‘ling — miqdor cheklangan.',
  ru: '🔔 <b>{name}</b> снова в наличии!\n\n{price}\n\nУспейте — количество ограничено.',
  en: '🔔 <b>{name}</b> is back in stock!\n\n{price}\n\nHurry — limited quantity.',
};

const BUTTON: Record<string, string> = { uz: '🛒 Savatga', ru: '🛒 В корзину', en: '🛒 Add to cart' };

async function sendText(chatId: number, text: string, replyMarkup?: unknown) {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup, parse_mode: 'HTML' }),
  });
  return res.ok;
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  /*
   * FAIL-CLOSED. Ilgari `if (WEBHOOK_SECRET && ...)` edi — sir
   * o'rnatilmagan bo'lsa tekshiruv butunlay o'tkazib yuborilardi va
   * funksiya URL'ini bilgan har kim mijozlarga soxta "mahsulot
   * mavjud" xabarlarini yubortira olardi.
   *
   * Supabase'da: Database Webhooks → HTTP Headers → X-Webhook-Secret.
   */
  if (!WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not configured — refusing all webhook traffic');
    return new Response('webhook secret not configured', { status: 500 });
  }
  if (!secretsMatch(req.headers.get('X-Webhook-Secret') ?? '', WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const record = payload?.record as { id: string; name: string; stock: number; price: number; discount_price: number | null; is_active: boolean } | undefined;
  const old = payload?.old_record as { stock: number } | undefined;

  if (!record) return new Response('ok');

  // Faqat "yo'q edi → paydo bo'ldi" o'tishi. Boshqa har qanday
  // tahrirlash (narx, nom, tavsif) bildirishnoma yubormaydi.
  const cameBack = (old?.stock ?? 0) <= 0 && record.stock > 0 && record.is_active;
  if (!cameBack) return new Response('ok');

  const { data: alerts } = await admin
    .from('stock_alerts')
    .select('chat_id')
    .eq('product_id', record.id);

  if (!alerts || alerts.length === 0) return new Response('ok');

  const chatIds = [...new Set(alerts.map((a) => Number(a.chat_id)))];

  // Har bir obunachining tilini bilib olamiz.
  const { data: sessions } = await admin
    .from('telegram_sessions')
    .select('chat_id, language')
    .in('chat_id', chatIds);
  const langByChat = new Map((sessions ?? []).map((s) => [Number(s.chat_id), (s.language as string) ?? 'uz']));

  const price = record.discount_price != null && Number(record.discount_price) > 0
    ? record.discount_price
    : record.price;

  const delivered: number[] = [];

  for (const chatId of chatIds) {
    const lang = langByChat.get(chatId) ?? 'uz';
    const text = (TEXT[lang] ?? TEXT.uz)
      .replace('{name}', esc(record.name))
      .replace('{price}', money(price));

    const ok = await sendText(chatId, text, {
      inline_keyboard: [[{ text: BUTTON[lang] ?? BUTTON.uz, callback_data: `quickadd:${record.id}` }]],
    });
    if (ok) delivered.push(chatId);

    // Telegram cheklovi: soniyasiga ~30 xabar. Ehtiyot bilan sekinlashtiramiz.
    await new Promise((r) => setTimeout(r, 40));
  }

  // Yuborilganlar obunadan chiqariladi (bir marta xabar → bir marta).
  // Yuborib bo'lmaganlar (bot bloklangan) qoladi va keyingi safar
  // qayta urinib ko'riladi.
  if (delivered.length > 0) {
    await admin.from('stock_alerts').delete().eq('product_id', record.id).in('chat_id', delivered);
  }

  return new Response(JSON.stringify({ notified: delivered.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
