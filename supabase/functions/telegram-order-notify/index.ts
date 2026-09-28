import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const ORDER_WEBHOOK_SECRET = Deno.env.get('ORDER_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function formatSum(n: number): string {
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";
}
function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
async function sendText(chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup, parse_mode: 'HTML' }),
  });
}

const CANCELLABLE = new Set(['Yangi', 'Qabul qilindi', 'Tayyorlanmoqda']);

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  /*
   * FAIL-CLOSED. Ilgari `if (ORDER_WEBHOOK_SECRET) { ... }` edi — sir
   * yo'q bo'lsa har kim soxta "buyurtma holati o'zgardi" xabarini
   * yubortira olardi (mijozlarga Telegram orqali).
   */
  if (!ORDER_WEBHOOK_SECRET) {
    console.error('ORDER_WEBHOOK_SECRET is not configured — refusing all webhook traffic');
    return new Response('webhook secret not configured', { status: 500 });
  }
  if (!secretsMatch(req.headers.get('x-webhook-secret') ?? '', ORDER_WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return new Response('ok');

  try {
    const { type, record, old_record } = payload as {
      type: 'INSERT' | 'UPDATE';
      record: { id: string; user_id: string | null; total_amount: number; status: string };
      old_record?: { status: string };
    };
    if (!record?.user_id) return new Response('ok');

    const { data: sessionRow } = await admin
      .from('telegram_sessions')
      .select('chat_id')
      .eq('user_id', record.user_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sessionRow) return new Response('ok');
    const chatId = sessionRow.chat_id as number;

    const cancelKeyboard = CANCELLABLE.has(record.status)
      ? { inline_keyboard: [[{ text: '🚫 Buyurtmani bekor qilish', callback_data: `cancel_order:${record.id}` }]] }
      : undefined;

    if (type === 'INSERT') {
      await sendText(
        chatId,
        `🛍 Buyurtmangiz qabul qilindi!\n\n№ <code>${shortId(record.id)}</code>\nSumma: ${formatSum(record.total_amount)}\nHolat: ${record.status}`,
        cancelKeyboard,
      );
    } else if (type === 'UPDATE' && old_record && old_record.status !== record.status) {
      await sendText(
        chatId,
        `📦 Buyurtmangiz holati yangilandi!\n\n№ <code>${shortId(record.id)}</code>\n${old_record.status} → <b>${record.status}</b>`,
        cancelKeyboard,
      );
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('ok');
  }
});
