import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * Botning umumiy "poydevori": Supabase klientlari, Telegram API o'rami,
 * sessiya va til. Bu fayl `index.ts` (autentifikatsiya) va `features/*`
 * (katalog, savat, checkout) tomonidan BIRGA ishlatiladi — shunda
 * klaviatura uslubi, xato ishlash va sessiya mantig'i ikki joyda
 * ajralib ketmaydi.
 */

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
export const ADMIN_CHAT_ID = Deno.env.get('ADMIN_CHAT_ID') ?? '';
/** Sayt manzili — bot xabarlaridagi havolalar uchun. */
export const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');

export const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/* ── Telegram API ─────────────────────────────────────────────── */

export type Keyboard = Record<string, unknown>;

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  // Telegram xatolari jimgina yo'qolmasin — aks holda "bot javob bermayapti"
  // deb soatlab sabab qidiriladi.
  if (!json?.ok) console.error('telegram api error', method, json?.description ?? res.status);
  return json;
}

export function sendText(chatId: number | string, text: string, replyMarkup?: Keyboard) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

export function sendPhoto(chatId: number | string, photo: string, caption: string, replyMarkup?: Keyboard) {
  return tg('sendPhoto', { chat_id: chatId, photo, caption, reply_markup: replyMarkup, parse_mode: 'HTML' });
}

export function sendMediaGroup(chatId: number | string, urls: string[], caption: string) {
  const media = urls.slice(0, 10).map((url, i) => ({
    type: 'photo',
    media: url,
    ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
  }));
  return tg('sendMediaGroup', { chat_id: chatId, media });
}

/**
 * Mavjud xabarni O'RNIDA yangilaydi.
 * Katalogni varaqlashda har safar yangi xabar yuborilsa, chat bir necha
 * o'nlab bir xil kartochkalar bilan to'lib ketardi. Shuning uchun
 * ro'yxat/savat sahifalari bitta xabar ichida yangilanadi.
 */
export function editText(chatId: number | string, messageId: number, text: string, replyMarkup?: Keyboard) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

export function deleteMessage(chatId: number | string, messageId: number) {
  return tg('deleteMessage', { chat_id: chatId, message_id: messageId });
}

export function answerCallback(id: string, text?: string, alert = false) {
  return tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });
}

export function isAdminChat(fromId: number | string): boolean {
  return !!ADMIN_CHAT_ID && String(fromId) === String(ADMIN_CHAT_ID);
}

/* ── Til ──────────────────────────────────────────────────────── */

export type Lang = 'uz' | 'ru' | 'en';

export type Dict = Record<string, Record<Lang, string>>;

export function translator(dict: Dict) {
  return (key: string, lang: Lang, vars?: Record<string, string | number>): string => {
    let s = dict[key]?.[lang] ?? dict[key]?.uz ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/* ── Sessiya ──────────────────────────────────────────────────── */

export type Session = {
  chat_id: number;
  state: string;
  phone: string | null;
  pending_password: string | null;
  pending_login: string | null;
  language: string | null;
  user_id: string | null;
  fail_count: number;
  draft_text: string | null;
  draft_photo: string | null;
  draft_buttons: unknown;
  [key: string]: unknown;
};

export async function getSession(chatId: number): Promise<Session> {
  const { data } = await admin.from('telegram_sessions').select('*').eq('chat_id', chatId).maybeSingle();
  if (data) return data as Session;
  const { data: created } = await admin
    .from('telegram_sessions')
    .insert({ chat_id: chatId, state: 'idle' })
    .select()
    .single();
  return created as Session;
}

export async function setSession(chatId: number, patch: Record<string, unknown>) {
  const { error } = await admin
    .from('telegram_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId);
  if (error) console.error('setSession failed', { chatId, patch, error });
}

export function langOf(session: { language?: string | null }): Lang {
  return (session.language as Lang) ?? 'uz';
}

/* ── Formatlash ───────────────────────────────────────────────── */

export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${Math.round(n).toLocaleString('ru-RU')} so'm`;
}

/** HTML parse_mode uchun xavfsiz matn (mahsulot nomlarida `<` bo'lishi mumkin). */
export function esc(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Telegram caption chegarasi 1024 belgi; xabar — 4096. */
export function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
