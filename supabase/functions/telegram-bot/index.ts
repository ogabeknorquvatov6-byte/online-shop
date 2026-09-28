import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { t as st } from './lib/shopI18n.ts';
import * as Catalog from './lib/catalog.ts';
import * as Cart from './lib/cart.ts';
import * as Checkout from './lib/checkout.ts';
import * as AdminShop from './lib/adminShop.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
// Telegram chat_id of the shop admin. Recovery / forced-deletion approvals go here.
const ADMIN_CHAT_ID = Deno.env.get('ADMIN_CHAT_ID') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- helpers ----------

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}
function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}
function loginToEmail(login: string): string {
  return `${normalizeLogin(login)}@telegram.local`;
}
function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function tg(method: string, body: Record<string, unknown>) {
  await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function sendText(chatId: number | string, text: string, replyMarkup?: Record<string, unknown>) {
  return tg('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup, parse_mode: 'HTML' });
}
function sendPhoto(chatId: number | string, photo: string, caption: string, replyMarkup?: Record<string, unknown>) {
  return tg('sendPhoto', { chat_id: chatId, photo, caption, reply_markup: replyMarkup, parse_mode: 'HTML' });
}
function isAdmin(fromId: number | string): boolean {
  return !!ADMIN_CHAT_ID && String(fromId) === String(ADMIN_CHAT_ID);
}
function deleteMessage(chatId: number | string, messageId: number) {
  return tg('deleteMessage', { chat_id: chatId, message_id: messageId });
}
function answerCallback(id: string, text?: string, alert = false) {
  return tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });
}

// ---------- i18n ----------

type Lang = 'uz' | 'ru' | 'en';

const T: Record<string, Record<Lang, string>> = {
  choose_lang: { uz: 'Tilni tanlang:', ru: 'Выберите язык:', en: 'Choose your language:' },
  welcome: {
    uz: '👋 Xush kelibsiz! Davom etish uchun tanlang:',
    ru: '👋 Добро пожаловать! Выберите действие:',
    en: '👋 Welcome! Choose an action:',
  },
  btn_register: { uz: '📝 Ro‘yxatdan o‘tish', ru: '📝 Регистрация', en: '📝 Register' },
  btn_login: { uz: '🔑 Kirish', ru: '🔑 Войти', en: '🔑 Log in' },
  btn_orders: { uz: '📦 Buyurtmalarim', ru: '📦 Мои заказы', en: '📦 My orders' },
  btn_settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки', en: '⚙️ Settings' },
  btn_logout: { uz: '🚪 Chiqish', ru: '🚪 Выйти', en: '🚪 Log out' },
  btn_back: { uz: '🔙 Orqaga', ru: '🔙 Назад', en: '🔙 Back' },
  btn_share_phone: { uz: '📞 Raqamni ulashish', ru: '📞 Поделиться номером', en: '📞 Share phone number' },
  ask_phone: { uz: 'Telefon raqamingizni yuboring:', ru: 'Отправьте ваш номер телефона:', en: 'Send your phone number:' },
  already_registered: {
    uz: 'ℹ️ Siz avval ushbu raqam bilan ro‘yxatdan o‘tgansiz. Kirish uchun login kiriting:',
    ru: 'ℹ️ Вы уже зарегистрированы с этим номером. Введите логин для входа:',
    en: 'ℹ️ You already have an account with this number. Enter your login to sign in:',
  },
  ask_new_login: {
    uz: '✅ Raqam qabul qilindi. Endi o‘zingizga login o‘ylab toping (masalan: alibek, ali_2024):',
    ru: '✅ Номер принят. Придумайте логин (например: alibek, ali_2024):',
    en: '✅ Number accepted. Choose a login (e.g. alibek, ali_2024):',
  },
  login_taken: {
    uz: '❌ Bu login band. Boshqasini kiriting:',
    ru: '❌ Этот логин уже занят. Введите другой:',
    en: '❌ That login is taken. Enter another:',
  },
  login_invalid: {
    uz: '❌ Login kamida 3 belgidan iborat bo‘lsin (harf/raqam). Qaytadan kiriting:',
    ru: '❌ Логин должен быть не короче 3 символов (буквы/цифры). Введите снова:',
    en: '❌ Login must be at least 3 characters (letters/digits). Try again:',
  },
  ask_password: { uz: 'Parol o‘ylab toping (kamida 6 belgi):', ru: 'Придумайте пароль (минимум 6 символов):', en: 'Choose a password (min 6 characters):' },
  password_too_short: {
    uz: '❌ Parol kamida 6 belgidan iborat bo‘lsin. Qaytadan kiriting:',
    ru: '❌ Пароль должен быть не короче 6 символов. Введите снова:',
    en: '❌ Password must be at least 6 characters. Try again:',
  },
  ask_password_confirm: { uz: 'Parolni tasdiqlang — qaytadan kiriting:', ru: 'Подтвердите пароль — введите ещё раз:', en: 'Confirm your password — type it again:' },
  password_mismatch: {
    uz: '❌ Parollar mos kelmadi. Parolni qaytadan kiriting:',
    ru: '❌ Пароли не совпадают. Введите пароль снова:',
    en: '❌ Passwords did not match. Enter the password again:',
  },
  account_created: {
    uz: '🎉 Hisobingiz yaratildi!\n\nLogin: <code>{login}</code>\nParol: <code>{password}</code>\n\nSaytda shu ma’lumotlar bilan kirishingiz mumkin.',
    ru: '🎉 Аккаунт создан!\n\nЛогин: <code>{login}</code>\nПароль: <code>{password}</code>\n\nИспользуйте эти данные для входа на сайте.',
    en: '🎉 Account created!\n\nLogin: <code>{login}</code>\nPassword: <code>{password}</code>\n\nUse these to sign in on the site.',
  },
  register_failed: {
    uz: '❌ Hisob yaratishda texnik nosozlik yuz berdi. Iltimos, biroz kutib /start orqali qaytadan urinib ko‘ring.',
    ru: '❌ Произошёл технический сбой при создании аккаунта. Подождите немного и попробуйте снова через /start.',
    en: '❌ A technical problem occurred while creating the account. Please wait a moment and try again via /start.',
  },
  ask_login: { uz: 'Login kiriting:', ru: 'Введите логин:', en: 'Enter your login:' },
  ask_login_password: { uz: 'Parolingizni kiriting:', ru: 'Введите ваш пароль:', en: 'Enter your password:' },
  forgot_btn: { uz: '❓ Parolni unutdingizmi?', ru: '❓ Забыли пароль?', en: '❓ Forgot password?' },
  no_account_for_phone: {
    uz: '❌ Bu raqam bilan hisob topilmadi. Ro‘yxatdan o‘tish uchun /start bosing.',
    ru: '❌ Аккаунт с этим номером не найден. Нажмите /start для регистрации.',
    en: '❌ No account found for this number. Press /start to register.',
  },
  wrong_login_or_password: {
    uz: '❌ Login yoki parol noto‘g‘ri. Qaytadan urinib ko‘ring yoki parolni tiklang:',
    ru: '❌ Неверный логин или пароль. Попробуйте снова или восстановите пароль:',
    en: '❌ Wrong login or password. Try again, or recover your account:',
  },
  logged_in: { uz: '✅ Xush kelibsiz! Muvaffaqiyatli kirdingiz.', ru: '✅ Добро пожаловать! Вы вошли в систему.', en: '✅ Welcome! You are signed in.' },
  logged_out: { uz: 'Tizimdan chiqdingiz.', ru: 'Вы вышли из аккаунта.', en: 'You have been logged out.' },
  main_menu: { uz: 'Bosh menyu:', ru: 'Главное меню:', en: 'Main menu:' },
  settings_menu: { uz: 'Sozlamalar:', ru: 'Настройки:', en: 'Settings:' },
  btn_change_lang: { uz: '🌍 Tilni o‘zgartirish', ru: '🌍 Сменить язык', en: '🌍 Change language' },
  btn_change_password: { uz: '🔑 Parolni o‘zgartirish', ru: '🔑 Сменить пароль', en: '🔑 Change password' },
  ask_current_password: { uz: 'Joriy parolingizni kiriting:', ru: 'Введите текущий пароль:', en: 'Enter your current password:' },
  wrong_current_password: { uz: '❌ Joriy parol noto‘g‘ri:', ru: '❌ Неверный текущий пароль:', en: '❌ Current password is wrong:' },
  ask_new_password: { uz: 'Yangi parol kiriting (kamida 6 belgi):', ru: 'Введите новый пароль (минимум 6 символов):', en: 'Enter a new password (min 6 characters):' },
  password_changed: { uz: '✅ Parol muvaffaqiyatli o‘zgartirildi.', ru: '✅ Пароль успешно изменён.', en: '✅ Password changed successfully.' },
  no_orders: { uz: 'Sizda hali buyurtmalar yo‘q.', ru: 'У вас пока нет заказов.', en: 'You have no orders yet.' },
  orders_header: { uz: '📦 So‘nggi buyurtmalaringiz:', ru: '📦 Ваши последние заказы:', en: '📦 Your recent orders:' },
  has_orders_warning: {
    uz: '⚠️ Diqqat! Sizda mavjud buyurtma(lar) bor, shuning uchun akkauntni o‘zingiz o‘chira olmaysiz:\n\n{orders}\n\nIltimos, administrator bilan bog‘laning.',
    ru: '⚠️ Внимание! У вас есть заказ(ы), поэтому вы не можете удалить аккаунт самостоятельно:\n\n{orders}\n\nПожалуйста, свяжитесь с администратором.',
    en: '⚠️ Note: you have existing order(s), so you can’t delete the account yourself:\n\n{orders}\n\nPlease contact the administrator.',
  },
  btn_contact_admin: { uz: '📞 Admin bilan bog‘lanish', ru: '📞 Связаться с админом', en: '📞 Contact admin' },
  confirm_delete: {
    uz: 'Akkauntingizni o‘chirmoqchimisiz? Bu amalni qaytarib bo‘lmaydi.',
    ru: 'Удалить ваш аккаунт? Это действие необратимо.',
    en: 'Delete your account? This action cannot be undone.',
  },
  btn_yes_delete: { uz: '✅ Ha, o‘chirish', ru: '✅ Да, удалить', en: '✅ Yes, delete' },
  btn_no: { uz: '❌ Yo‘q', ru: '❌ Нет', en: '❌ No' },
  account_deleted: {
    uz: '🗑 Akkaunt o‘chirildi. Endi qaytadan ro‘yxatdan o‘tishingiz mumkin.',
    ru: '🗑 Аккаунт удалён. Теперь вы можете зарегистрироваться заново.',
    en: '🗑 Account deleted. You can register again now.',
  },
  contact_sent: {
    uz: '📨 So‘rovingiz administratorga yuborildi. Tez orada bog‘lanamiz.',
    ru: '📨 Ваш запрос отправлен администратору. Мы скоро свяжемся с вами.',
    en: '📨 Your request was sent to the admin. We’ll be in touch soon.',
  },
  admin_new_request: {
    uz: '🆘 Yangi so‘rov\n\nMijoz: {name} (chat_id: {chatId})\nTelefon: {phone}\nLogin: {login}\nSabab: {reason}',
    ru: '🆘 Новый запрос\n\nКлиент: {name} (chat_id: {chatId})\nТелефон: {phone}\nЛогин: {login}\nПричина: {reason}',
    en: '🆘 New request\n\nCustomer: {name} (chat_id: {chatId})\nPhone: {phone}\nLogin: {login}\nReason: {reason}',
  },
  admin_btn_reset: { uz: '✅ Parolni tiklash', ru: '✅ Сбросить пароль', en: '✅ Reset password' },
  admin_btn_force_delete: { uz: '🗑 Akkauntni o‘chirish', ru: '🗑 Удалить аккаунт', en: '🗑 Delete account' },
  admin_done: { uz: '✅ Bajarildi.', ru: '✅ Готово.', en: '✅ Done.' },
  admin_forced_delete_notice: {
    uz: '🗑 Akkauntingiz administrator tomonidan o‘chirildi. Savol bo‘lsa, biz bilan bog‘laning.',
    ru: '🗑 Ваш аккаунт был удалён администратором. Если есть вопросы — свяжитесь с нами.',
    en: '🗑 Your account was deleted by the admin. Contact us if you have questions.',
  },
  password_reset_notice: {
    uz: '🔑 Parolingiz tiklandi!\n\nLogin: <code>{login}</code>\nYangi parol: <code>{password}</code>',
    ru: '🔑 Ваш пароль восстановлен!\n\nЛогин: <code>{login}</code>\nНовый пароль: <code>{password}</code>',
    en: '🔑 Your password was reset!\n\nLogin: <code>{login}</code>\nNew password: <code>{password}</code>',
  },
  press_start: { uz: 'Boshlash uchun /start ni bosing.', ru: 'Нажмите /start чтобы начать.', en: 'Press /start to begin.' },

  // admin panel
  btn_admin_panel: { uz: '🛠 Admin panel', ru: '🛠 Админ-панель', en: '🛠 Admin panel' },
  admin_panel_title: { uz: 'Admin panel:', ru: 'Админ-панель:', en: 'Admin panel:' },
  btn_broadcast: { uz: '📢 Xabar yuborish', ru: '📢 Отправить рассылку', en: '📢 Send broadcast' },
  btn_requests: { uz: '📨 So‘rovlar', ru: '📨 Запросы', en: '📨 Requests' },
  ask_broadcast_content: {
    uz: 'Yubormoqchi bo‘lgan xabaringizni yozing, yoki rasm yuboring (izoh bilan yoki izohsiz):',
    ru: 'Напишите текст рассылки или отправьте фото (с подписью или без):',
    en: 'Write your broadcast message, or send a photo (with or without caption):',
  },
  ask_broadcast_buttons: { uz: 'Tugma qo‘shmoqchimisiz?', ru: 'Добавить кнопки?', en: 'Add buttons?' },
  ask_buttons_format: {
    uz: 'Har bir tugmani alohida qatorda shu ko‘rinishda yuboring:\n<code>Matn - https://havola.uz</code>',
    ru: 'Отправьте каждую кнопку на отдельной строке в формате:\n<code>Текст - https://ссылка.uz</code>',
    en: 'Send each button on its own line in this format:\n<code>Text - https://link.com</code>',
  },
  broadcast_preview: { uz: '👀 Ko‘rinishi shunday bo‘ladi:', ru: '👀 Так будет выглядеть рассылка:', en: '👀 Preview:' },
  btn_send: { uz: '✅ Yuborish', ru: '✅ Отправить', en: '✅ Send' },
  btn_cancel: { uz: '❌ Bekor qilish', ru: '❌ Отмена', en: '❌ Cancel' },
  broadcast_sending: { uz: '⏳ Yuborilmoqda...', ru: '⏳ Отправка...', en: '⏳ Sending...' },
  broadcast_done: { uz: '✅ Xabar {count} kishiga yuborildi.', ru: '✅ Рассылка отправлена {count} пользователям.', en: '✅ Sent to {count} users.' },
  broadcast_cancelled: { uz: 'Bekor qilindi.', ru: 'Отменено.', en: 'Cancelled.' },
  no_requests: { uz: 'Hozircha so‘rovlar yo‘q.', ru: 'Пока нет запросов.', en: 'No requests yet.' },
  request_item: {
    uz: '📨 So‘rov\n\nTelefon: {phone}\nLogin: {login}\nSabab: {reason}\nSana: {date}',
    ru: '📨 Запрос\n\nТелефон: {phone}\nЛогин: {login}\nПричина: {reason}\nДата: {date}',
    en: '📨 Request\n\nPhone: {phone}\nLogin: {login}\nReason: {reason}\nDate: {date}',
  },
  btn_mark_resolved: { uz: '✔️ Yopish', ru: '✔️ Закрыть', en: '✔️ Close' },
  order_cancelled: { uz: '✅ Buyurtma bekor qilindi.', ru: '✅ Заказ отменён.', en: '✅ Order cancelled.' },
  order_cancel_failed: { uz: '❌ Bu buyurtmani bekor qilib bo‘lmaydi.', ru: '❌ Этот заказ нельзя отменить.', en: '❌ This order cannot be cancelled.' },
};

function tr(key: keyof typeof T, lang: Lang, vars?: Record<string, string>): string {
  let s = T[key][lang] ?? T[key].uz;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

const removeKeyboard = { remove_keyboard: true };
function contactKeyboard(lang: Lang) {
  return { keyboard: [[{ text: tr('btn_share_phone', lang), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
}
function langKeyboard() {
  return { inline_keyboard: [[{ text: '🇺🇿 O‘zbekcha', callback_data: 'lang:uz' }, { text: '🇷🇺 Русский', callback_data: 'lang:ru' }, { text: '🇬🇧 English', callback_data: 'lang:en' }]] };
}
function mainMenuKeyboard(lang: Lang, loggedIn: boolean, showAdmin: boolean) {
  const rows: any[] = [];
  // Katalog va savat — login TALAB QILINMAYDI: mehmon ham ko'ra oladi,
  // hisob faqat buyurtma berish bosqichida so'raladi.
  rows.push([{ text: st('btn_catalog', lang), callback_data: 'catalog' }, { text: st('btn_cart', lang), callback_data: 'cart' }]);
  if (loggedIn) {
    rows.push([{ text: tr('btn_orders', lang), callback_data: 'orders' }, { text: tr('btn_settings', lang), callback_data: 'settings' }]);
    rows.push([{ text: tr('btn_logout', lang), callback_data: 'logout' }]);
  } else {
    rows.push([{ text: tr('btn_register', lang), callback_data: 'register' }, { text: tr('btn_login', lang), callback_data: 'login' }]);
  }
  if (showAdmin) rows.push([{ text: tr('btn_admin_panel', lang), callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}
function adminPanelKeyboard(lang: Lang) {
  return {
    inline_keyboard: [
      [{ text: st('btn_stats', lang), callback_data: 'admin_stats' }, { text: st('btn_admin_orders', lang), callback_data: 'admin_orders' }],
      [{ text: tr('btn_broadcast', lang), callback_data: 'admin_broadcast' }, { text: tr('btn_requests', lang), callback_data: 'admin_requests' }],
      [{ text: tr('btn_back', lang), callback_data: 'menu' }],
    ],
  };
}
function yesNoKeyboard(lang: Lang, yesData: string, noData: string) {
  return { inline_keyboard: [[{ text: '✅ Ha', callback_data: yesData }, { text: tr('btn_no', lang), callback_data: noData }]] };
}
function settingsKeyboard(lang: Lang) {
  return { inline_keyboard: [[{ text: tr('btn_change_lang', lang), callback_data: 'change_lang' }], [{ text: tr('btn_change_password', lang), callback_data: 'change_password' }], [{ text: tr('btn_back', lang), callback_data: 'menu' }]] };
}
function forgotKeyboard(lang: Lang) {
  return { inline_keyboard: [[{ text: tr('forgot_btn', lang), callback_data: 'forgot' }]] };
}

// ---------- session ----------

async function getSession(chatId: number) {
  const { data } = await admin.from('telegram_sessions').select('*').eq('chat_id', chatId).maybeSingle();
  if (data) return data;
  const { data: created } = await admin.from('telegram_sessions').insert({ chat_id: chatId, state: 'idle' }).select().single();
  return created;
}
async function setSession(chatId: number, patch: Record<string, unknown>) {
  const { error } = await admin
    .from('telegram_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId);
  if (error) console.error('setSession update failed', { chatId, patch, error });
}
function langOf(session: { language?: string | null }): Lang {
  return (session.language as Lang) ?? 'uz';
}

// ---------- data helpers ----------

async function findProfileByPhone(phone: string) {
  const { data } = await admin.from('profiles').select('id, login, phone, display_name').eq('phone', normalizePhone(phone)).maybeSingle();
  return data;
}
async function findProfileByLogin(login: string) {
  const { data } = await admin.from('profiles').select('id, login, phone, display_name').ilike('login', normalizeLogin(login)).maybeSingle();
  return data;
}
async function createAccount(phone: string, login: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginToEmail(login),
    password,
    email_confirm: true,
    user_metadata: { display_name: login, phone: normalizePhone(phone), login: normalizeLogin(login) },
  });
  return { userId: data?.user?.id ?? null, error };
}
async function verifyLoginPassword(login: string, password: string): Promise<boolean> {
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { error } = await anon.auth.signInWithPassword({ email: loginToEmail(login), password });
  return !error;
}
async function countOrders(userId: string): Promise<number> {
  const { count } = await admin.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
}
async function recentOrdersText(userId: string, lang: Lang): Promise<string> {
  const { data } = await admin.from('orders').select('status, total_amount, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
  if (!data || data.length === 0) return tr('no_orders', lang);
  const lines = data.map(o => `• ${o.status} — ${Number(o.total_amount).toLocaleString('ru-RU')} so'm (${new Date(o.created_at).toLocaleDateString()})`);
  return `${tr('orders_header', lang)}\n\n${lines.join('\n')}`;
}

async function sendMainMenu(chatId: number, session: any) {
  const lang = langOf(session);
  await sendText(chatId, tr('main_menu', lang), mainMenuKeyboard(lang, !!session.user_id, isAdmin(chatId)));
}

function parseButtonLines(text: string): { text: string; url: string }[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sepIdx = line.search(/\s[-|]\s/);
      if (sepIdx === -1) return null;
      const label = line.slice(0, sepIdx).trim();
      const url = line.slice(sepIdx + 3).trim();
      if (!label || !/^https?:\/\//.test(url)) return null;
      return { text: label, url };
    })
    .filter((b): b is { text: string; url: string } => !!b)
    .slice(0, 8);
}

async function sendBroadcastPreview(chatId: number, session: any) {
  const lang = langOf(session);
  const buttons = (session.draft_buttons as { text: string; url: string }[] | null) ?? null;
  const keyboard = buttons && buttons.length > 0 ? { inline_keyboard: buttons.map(b => [{ text: b.text, url: b.url }]) } : undefined;
  await sendText(chatId, tr('broadcast_preview', lang));
  if (session.draft_photo) await sendPhoto(chatId, session.draft_photo, session.draft_text ?? '', keyboard);
  else await sendText(chatId, session.draft_text ?? '', keyboard);
  await sendText(chatId, '—', { inline_keyboard: [[{ text: tr('btn_send', lang), callback_data: 'broadcast_send' }, { text: tr('btn_cancel', lang), callback_data: 'broadcast_cancel' }]] });
}

async function runBroadcast(session: any): Promise<number> {
  const buttons = (session.draft_buttons as { text: string; url: string }[] | null) ?? null;
  const keyboard = buttons && buttons.length > 0 ? { inline_keyboard: buttons.map(b => [{ text: b.text, url: b.url }]) } : undefined;
  const { data: rows } = await admin.from('telegram_sessions').select('chat_id');
  let count = 0;
  for (const row of rows ?? []) {
    try {
      if (session.draft_photo) await sendPhoto(row.chat_id, session.draft_photo, session.draft_text ?? '', keyboard);
      else await sendText(row.chat_id, session.draft_text ?? '', keyboard);
      count++;
    } catch { /* user may have blocked the bot — skip and continue */ }
    await new Promise(r => setTimeout(r, 40));
  }
  return count;
}

// ---------- savdo bo'limi dispetcheri ----------

/**
 * Katalog / savat / checkout / admin-savdo tugmalarini boshqaradi.
 * `true` qaytarsa — hodisa shu yerda yakunlangan va autentifikatsiya
 * mantig'iga o'tmaydi.
 */
async function handleShopCallback(
  chatId: number,
  cq: any,
  action: string,
  session: any,
  lang: Lang
): Promise<boolean> {
  const messageId: number | undefined = cq.message?.message_id;

  if (action === 'noop') return true;

  // ── Katalog ──
  if (action === 'catalog') {
    await Catalog.showCategories(chatId, lang, messageId);
    return true;
  }
  if (action.startsWith('cat:')) {
    const [, categoryId, page] = action.split(':');
    await Catalog.showCategoryPage(chatId, lang, categoryId, Number(page) || 0, messageId);
    return true;
  }
  if (action.startsWith('prod:')) {
    const product = await Catalog.getProduct(action.slice(5));
    if (!product) return true;
    await Catalog.showProduct(chatId, lang, product, { qty: 1 }, (product as any).category_id ?? null);
    return true;
  }

  // Ro'yxatdagi tezkor "🛒" — kartani ochmasdan 1 dona qo'shadi.
  if (action.startsWith('quickadd:')) {
    const product = await Catalog.getProduct(action.slice(9));
    if (!product) return true;
    if (Catalog.activeVariants(product).length > 0) {
      // Variantli mahsulotni "ko'r-ko'rona" qo'shib bo'lmaydi — avval tanlash kerak.
      await Catalog.showProduct(chatId, lang, product, { qty: 1 });
      return true;
    }
    await Cart.addToCart(chatId, product.id, null, 1, product.stock);
    await answerCallback(cq.id, st('added_to_cart', lang, { name: product.name }), false);
    return true;
  }

  // ── Mahsulot kartasidagi miqdor / variant / qo'shish ──
  if (action === 'pqty:+' || action === 'pqty:-' || action === 'padd' || action.startsWith('pvar:')) {
    const pending = session.pending_item as
      | { product_id: string; variant_id: string | null; qty: number; category_id: string | null }
      | null;
    if (!pending) return true;

    const product = await Catalog.getProduct(pending.product_id);
    if (!product) return true;

    if (action === 'padd') {
      const variants = Catalog.activeVariants(product);
      const variant = pending.variant_id ? variants.find(v => v.id === pending.variant_id) : undefined;
      // Variantli mahsulotda tanlov majburiy — aks holda buyurtma serverda rad etiladi.
      if (variants.length > 0 && !variant) {
        await answerCallback(cq.id, st('choose_variant', lang), true);
        return true;
      }
      const max = variant?.stock != null ? variant.stock : product.stock;
      await Cart.addToCart(chatId, product.id, variant?.id ?? null, pending.qty, max);
      await answerCallback(cq.id, st('added_to_cart', lang, { name: product.name }), true);
      await Cart.showCart(chatId, lang);
      return true;
    }

    let variantId = pending.variant_id;
    let qty = pending.qty;

    if (action.startsWith('pvar:')) {
      const prefix = action.slice(5);
      variantId = Catalog.activeVariants(product).find(v => v.id.startsWith(prefix))?.id ?? null;
      qty = 1;
    } else {
      qty = action === 'pqty:+' ? qty + 1 : qty - 1;
    }

    if (messageId) await deleteMessage(chatId, messageId);
    await Catalog.showProduct(chatId, lang, product, { variantId, qty: Math.max(1, qty) }, pending.category_id);
    return true;
  }

  if (action.startsWith('notify:')) {
    await Catalog.subscribeStockAlert(chatId, action.slice(7), lang, cq.id);
    return true;
  }

  // ── Savat ──
  if (action === 'cart') {
    await Cart.showCart(chatId, lang, messageId);
    return true;
  }
  if (action === 'cart_clear') {
    await Cart.clearCart(chatId);
    await answerCallback(cq.id, st('cart_cleared', lang));
    await Cart.showCart(chatId, lang, messageId);
    return true;
  }
  if (action.startsWith('ci:')) {
    const [, idxRaw, op] = action.split(':');
    const idx = Number(idxRaw);
    if (op === 'x') await Cart.removeLine(chatId, idx);
    else await Cart.setLineQty(chatId, idx, op === '+' ? 1 : -1);
    await Cart.showCart(chatId, lang, messageId);
    return true;
  }

  // ── Checkout ──
  if (action === 'checkout') {
    await Checkout.startCheckout(chatId, lang, session);
    return true;
  }
  if (action.startsWith('addr:')) {
    const { data: a } = await admin
      .from('addresses')
      .select('city, district, street, full_address')
      .eq('id', action.slice(5))
      .maybeSingle();
    const address = [a?.city, a?.district, a?.street].filter(Boolean).join(', ') || a?.full_address || '';
    await Checkout.acceptAddress(chatId, lang, session, address);
    return true;
  }
  if (action === 'addr_type') {
    await setSession(chatId, { state: 'checkout_address_text' });
    await sendText(chatId, st('ask_address_text', lang), removeKeyboard);
    return true;
  }
  if (action === 'note_skip') {
    await Checkout.acceptNote(chatId, lang, session, null);
    return true;
  }
  if (action === 'order_confirm') {
    await Checkout.submitOrder(chatId, lang, session);
    return true;
  }

  // ── Admin: statistika va buyurtmalar ──
  if (action === 'admin_stats') {
    if (!isAdmin(chatId)) return true;
    await AdminShop.showStats(chatId, lang);
    return true;
  }
  if (action === 'admin_orders') {
    if (!isAdmin(chatId)) return true;
    await AdminShop.showOrders(chatId, lang, messageId);
    return true;
  }
  if (action.startsWith('aord:')) {
    if (!isAdmin(chatId)) return true;
    await AdminShop.showOrderDetail(chatId, lang, action.slice(5));
    return true;
  }
  if (action.startsWith('ast:')) {
    if (!isAdmin(chatId)) return true;
    const [, orderId, statusIdx] = action.split(':');
    await AdminShop.changeOrderStatus(chatId, lang, orderId, Number(statusIdx));
    return true;
  }

  return false;
}

/**
 * Checkout bosqichlaridagi oddiy xabarlar (manzil matni, ism, izoh,
 * joylashuv). `true` qaytarsa — hodisa yakunlangan.
 */
async function handleShopMessage(chatId: number, msg: any, session: any, lang: Lang): Promise<boolean> {
  const state: string = session?.state ?? 'idle';

  if (msg.location && state.startsWith('checkout_')) {
    const { latitude, longitude } = msg.location;
    await Checkout.acceptAddress(
      chatId,
      lang,
      session,
      `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      { lat: latitude, lng: longitude }
    );
    return true;
  }

  if (!msg.text) return false;

  if (state === 'checkout_address_text') {
    if (msg.text.trim().length < 5) {
      await sendText(chatId, st('address_too_short', lang));
      return true;
    }
    await Checkout.acceptAddress(chatId, lang, session, msg.text.trim());
    return true;
  }

  if (state === 'checkout_name') {
    if (msg.text.trim().length < 2) {
      await sendText(chatId, st('name_too_short', lang));
      return true;
    }
    await Checkout.acceptName(chatId, lang, session, msg.text);
    return true;
  }

  if (state === 'checkout_note') {
    await Checkout.acceptNote(chatId, lang, session, msg.text);
    return true;
  }

  return false;
}

// ---------- webhook ----------

/*
 * Doimiy vaqtli taqqoslash.
 *
 * Oddiy `!==` birinchi mos kelmagan baytda to'xtaydi, ya'ni javob vaqti
 * to'g'ri topilgan prefiks uzunligiga bog'liq bo'ladi. Bu — sirni
 * bayt-bayt topib olish imkoni. Xarajati nolga teng, shuning uchun
 * to'g'ri variantni ishlatamiz.
 */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  /*
   * FAIL-CLOSED — bu blok ilgari FAIL-OPEN edi va bu loyihadagi eng
   * jiddiy zaiflik edi.
   *
   * Eski kod:
   *     if (WEBHOOK_SECRET) { ...tekshirish... }
   *
   * Ya'ni `TELEGRAM_WEBHOOK_SECRET` o'rnatilmagan bo'lsa (yangi muhit,
   * noto'g'ri deploy, secret o'chib ketishi, opechatka) tekshiruv
   * BUTUNLAY o'chib qolardi. Funksiya URL'ini bilgan istalgan odam
   * soxta Telegram "update" yuborib, botni service_role huquqlari bilan
   * boshqara olardi: boshqa odam nomidan buyurtma berish, savatni
   * o'zgartirish, admin buyruqlarini chaqirish.
   *
   * Endi: sir yo'q bo'lsa — 500 (konfiguratsiya xatosi), sir noto'g'ri
   * bo'lsa — 403. Hech qanday holatda "tekshiruvsiz o'tkazish" yo'q.
   */
  if (!WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not configured — refusing all webhook traffic');
    return new Response('webhook secret not configured', { status: 500 });
  }
  const header = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!secretsMatch(header, WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json().catch(() => null);
  // Telegram "update" har doim OBYEKT. Massiv/satr/null yuborilsa — bu
  // Telegram emas: keyingi `update.callback_query` kabi murojaatlar
  // kutilmagan xatoga aylanmasligi uchun shu yerda to'xtatamiz.
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return new Response('ok');
  }

  try {
    // ---- callback queries (button taps) ----
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const action: string = cq.data;
      await answerCallback(cq.id);

      // Admin-only actions: approve reset / forced delete, target chat id embedded in the callback data.
      if (action.startsWith('admin_reset:') || action.startsWith('admin_forcedelete:')) {
        if (!ADMIN_CHAT_ID || String(cq.from.id) !== String(ADMIN_CHAT_ID)) return new Response('ok');
        const targetChatId = Number(action.split(':')[1]);
        const targetSession = await getSession(targetChatId);
        const targetLang = langOf(targetSession);
        const profile = targetSession.phone ? await findProfileByPhone(targetSession.phone) : null;
        if (!profile) { await sendText(chatId, 'Profile not found.'); return new Response('ok'); }

        if (action.startsWith('admin_reset:')) {
          const newPassword = randomPassword();
          await admin.auth.admin.updateUserById(profile.id, { password: newPassword });
          await sendText(targetChatId, tr('password_reset_notice', targetLang, { login: profile.login ?? '', password: newPassword }));
        } else {
          await admin.auth.admin.deleteUser(profile.id);
          await setSession(targetChatId, { user_id: null, phone: null, state: 'idle' });
          await sendText(targetChatId, tr('admin_forced_delete_notice', targetLang));
        }
        await sendText(chatId, tr('admin_done', 'uz'));
        return new Response('ok');
      }

      const session = await getSession(chatId);
      const lang = langOf(session);

      /*
       * ── Savdo bo'limi (katalog / savat / checkout / admin) ──
       * Autentifikatsiya oqimidan OLDIN tekshiriladi, lekin o'z blokida —
       * shunda ishlab turgan auth mantig'iga tegilmaydi.
       */
      const handled = await handleShopCallback(chatId, cq, action, session, lang);
      if (handled) return new Response('ok');

      if (action.startsWith('lang:')) {
        const newLang = action.split(':')[1] as Lang;
        await setSession(chatId, { language: newLang, state: 'idle' });
        const fresh = { ...session, language: newLang };
        await sendMainMenu(chatId, fresh);
        return new Response('ok');
      }

      if (action === 'menu') { await setSession(chatId, { state: 'idle' }); await sendMainMenu(chatId, session); return new Response('ok'); }

      if (action === 'register') {
        await setSession(chatId, { state: 'register_awaiting_phone', phone: null, pending_password: null, pending_login: null });
        await sendText(chatId, tr('ask_phone', lang), contactKeyboard(lang));
        return new Response('ok');
      }
      if (action === 'login') {
        await setSession(chatId, { state: 'login_awaiting_phone', phone: null, pending_password: null, pending_login: null });
        await sendText(chatId, tr('ask_phone', lang), contactKeyboard(lang));
        return new Response('ok');
      }
      if (action === 'logout') {
        await setSession(chatId, { user_id: null, state: 'idle' });
        await sendText(chatId, tr('logged_out', lang));
        await sendMainMenu(chatId, { ...session, user_id: null });
        return new Response('ok');
      }
      if (action === 'orders') {
        if (!session.user_id) return new Response('ok');
        await sendText(chatId, await recentOrdersText(session.user_id, lang));
        return new Response('ok');
      }
      if (action === 'settings') {
        await sendText(chatId, tr('settings_menu', lang), settingsKeyboard(lang));
        return new Response('ok');
      }
      if (action === 'change_lang') {
        await sendText(chatId, tr('choose_lang', lang), langKeyboard());
        return new Response('ok');
      }
      if (action === 'change_password') {
        await setSession(chatId, { state: 'settings_awaiting_current_password' });
        await sendText(chatId, tr('ask_current_password', lang));
        return new Response('ok');
      }

      // Forgot password / account recovery
      if (action === 'forgot') {
        const profile = session.phone ? await findProfileByPhone(session.phone) : null;
        if (!profile) { await sendMainMenu(chatId, session); return new Response('ok'); }
        const orderCount = await countOrders(profile.id);
        if (orderCount > 0) {
          const ordersText = await recentOrdersText(profile.id, lang);
          await sendText(chatId, tr('has_orders_warning', lang, { orders: ordersText }), {
            inline_keyboard: [[{ text: tr('btn_contact_admin', lang), callback_data: 'contact_admin:forgot_with_orders' }]],
          });
        } else {
          await setSession(chatId, { state: 'delete_awaiting_confirm' });
          await sendText(chatId, tr('confirm_delete', lang), {
            inline_keyboard: [[{ text: tr('btn_yes_delete', lang), callback_data: 'confirm_delete' }, { text: tr('btn_no', lang), callback_data: 'menu' }]],
          });
        }
        return new Response('ok');
      }
      if (action === 'confirm_delete') {
        const profile = session.phone ? await findProfileByPhone(session.phone) : null;
        if (profile) await admin.auth.admin.deleteUser(profile.id);
        await setSession(chatId, { state: 'idle', phone: null, user_id: null, pending_login: null, pending_password: null });
        await sendText(chatId, tr('account_deleted', lang));
        await sendMainMenu(chatId, { ...session, user_id: null });
        return new Response('ok');
      }
      if (action.startsWith('contact_admin')) {
        const profile = session.phone ? await findProfileByPhone(session.phone) : (session.user_id ? await admin.from('profiles').select('id, login, phone').eq('id', session.user_id).maybeSingle().then(r => r.data) : null);
        const reasonKey = action.includes(':') ? action.split(':')[1] : 'general';
        const phoneForReq = profile?.phone ?? session.phone ?? null;
        const loginForReq = profile?.login ?? null;
        await admin.from('admin_requests').insert({ chat_id: chatId, phone: phoneForReq, login: loginForReq, reason: reasonKey });
        if (ADMIN_CHAT_ID) {
          await sendText(ADMIN_CHAT_ID, tr('admin_new_request', 'uz', {
            name: cq.from.first_name ?? '—',
            chatId: String(chatId),
            phone: phoneForReq ?? '—',
            login: loginForReq ?? '—',
            reason: reasonKey,
          }), {
            inline_keyboard: [[
              { text: tr('admin_btn_reset', 'uz'), callback_data: `admin_reset:${chatId}` },
              { text: tr('admin_btn_force_delete', 'uz'), callback_data: `admin_forcedelete:${chatId}` },
            ]],
          });
        }
        await sendText(chatId, tr('contact_sent', lang));
        return new Response('ok');
      }

      // ---- admin panel ----
      if (action === 'admin_panel') {
        if (!isAdmin(chatId)) return new Response('ok');
        await sendText(chatId, tr('admin_panel_title', lang), adminPanelKeyboard(lang));
        return new Response('ok');
      }
      if (action === 'admin_broadcast') {
        if (!isAdmin(chatId)) return new Response('ok');
        await setSession(chatId, { state: 'admin_broadcast_awaiting_content', draft_text: null, draft_photo: null, draft_buttons: null });
        await sendText(chatId, tr('ask_broadcast_content', lang));
        return new Response('ok');
      }
      if (action === 'broadcast_btn_yes' || action === 'broadcast_btn_no') {
        if (!isAdmin(chatId)) return new Response('ok');
        if (action === 'broadcast_btn_no') {
          await setSession(chatId, { state: 'admin_broadcast_confirm' });
          await sendBroadcastPreview(chatId, session);
        } else {
          await setSession(chatId, { state: 'admin_broadcast_awaiting_buttons' });
          await sendText(chatId, tr('ask_buttons_format', lang));
        }
        return new Response('ok');
      }
      if (action === 'broadcast_send') {
        if (!isAdmin(chatId)) return new Response('ok');
        await sendText(chatId, tr('broadcast_sending', lang));
        const count = await runBroadcast(session);
        await setSession(chatId, { state: 'idle', draft_text: null, draft_photo: null, draft_buttons: null });
        await sendText(chatId, tr('broadcast_done', lang, { count: String(count) }));
        await sendMainMenu(chatId, session);
        return new Response('ok');
      }
      if (action === 'broadcast_cancel') {
        if (!isAdmin(chatId)) return new Response('ok');
        await setSession(chatId, { state: 'idle', draft_text: null, draft_photo: null, draft_buttons: null });
        await sendText(chatId, tr('broadcast_cancelled', lang));
        await sendMainMenu(chatId, session);
        return new Response('ok');
      }
      if (action === 'admin_requests') {
        if (!isAdmin(chatId)) return new Response('ok');
        const { data: pending } = await admin.from('admin_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10);
        if (!pending || pending.length === 0) {
          await sendText(chatId, tr('no_requests', lang));
          return new Response('ok');
        }
        for (const req of pending) {
          await sendText(chatId, tr('request_item', 'uz', {
            phone: req.phone ?? '—',
            login: req.login ?? '—',
            reason: req.reason ?? '—',
            date: new Date(req.created_at).toLocaleString(),
          }), {
            inline_keyboard: [
              [{ text: tr('admin_btn_reset', 'uz'), callback_data: `admin_reset:${req.chat_id}` }, { text: tr('admin_btn_force_delete', 'uz'), callback_data: `admin_forcedelete:${req.chat_id}` }],
              [{ text: tr('btn_mark_resolved', 'uz'), callback_data: `req_resolve:${req.id}` }],
            ],
          });
        }
        return new Response('ok');
      }
      if (action.startsWith('req_resolve:')) {
        if (!isAdmin(chatId)) return new Response('ok');
        const reqId = action.split(':')[1];
        await admin.from('admin_requests').update({ status: 'resolved' }).eq('id', reqId);
        await sendText(chatId, tr('admin_done', 'uz'));
        return new Response('ok');
      }

      // ---- order cancellation (triggered from an order-notification message) ----
      if (action.startsWith('cancel_order:')) {
        const orderId = action.split(':')[1];
        const { data: order } = await admin.from('orders').select('id, user_id, status').eq('id', orderId).maybeSingle();
        const CANCELLABLE = new Set(['Yangi', 'Qabul qilindi', 'Tayyorlanmoqda']);
        if (!order || order.user_id !== session.user_id || !CANCELLABLE.has(order.status)) {
          await sendText(chatId, tr('order_cancel_failed', lang));
          return new Response('ok');
        }
        await admin.from('orders').update({ status: 'Bekor qilindi' }).eq('id', orderId);
        await sendText(chatId, tr('order_cancelled', lang));
        return new Response('ok');
      }

      return new Response('ok');
    }

    // ---- plain messages ----
    const msg = update.message;
    if (!msg) return new Response('ok');
    const chatId = msg.chat.id;

    if (msg.text === '/start') {
      const session = await getSession(chatId);
      if (!session.language) {
        await sendText(chatId, tr('choose_lang', 'uz'), langKeyboard());
        return new Response('ok');
      }
      await setSession(chatId, { state: 'idle', phone: null, pending_password: null, pending_login: null });
      const lang = langOf(session);
      await sendText(chatId, tr('welcome', lang));
      await sendMainMenu(chatId, session);
      return new Response('ok');
    }

    const session = await getSession(chatId);
    const state = session?.state ?? 'idle';
    const lang = langOf(session);

    // Checkout bosqichlari (manzil / ism / izoh / joylashuv) — auth
    // oqimidan oldin, lekin alohida modulda.
    if (await handleShopMessage(chatId, msg, session, lang)) return new Response('ok');

    // contact (phone) shared
    if (msg.contact?.phone_number && (state === 'register_awaiting_phone' || state === 'login_awaiting_phone')) {
      const phone = normalizePhone(msg.contact.phone_number);
      const existing = await findProfileByPhone(phone);

      if (state === 'register_awaiting_phone') {
        if (existing) {
          await setSession(chatId, { state: 'login_awaiting_login', phone });
          await sendText(chatId, tr('already_registered', lang), removeKeyboard);
        } else {
          await setSession(chatId, { state: 'register_awaiting_login', phone });
          await sendText(chatId, tr('ask_new_login', lang), removeKeyboard);
        }
      } else {
        if (!existing) {
          await setSession(chatId, { state: 'idle', phone: null });
          await sendText(chatId, tr('no_account_for_phone', lang));
        } else {
          await setSession(chatId, { state: 'login_awaiting_login', phone });
          await sendText(chatId, tr('ask_login', lang), removeKeyboard);
        }
      }
      return new Response('ok');
    }

    if (msg.text && state === 'register_awaiting_login') {
      const candidate = msg.text.trim();
      if (!/^[a-zA-Z0-9_.]{3,32}$/.test(candidate)) { await sendText(chatId, tr('login_invalid', lang)); return new Response('ok'); }
      const taken = await findProfileByLogin(candidate);
      if (taken) { await sendText(chatId, tr('login_taken', lang)); return new Response('ok'); }
      await setSession(chatId, { state: 'register_awaiting_password', pending_login: candidate });
      await sendText(chatId, tr('ask_password', lang));
      return new Response('ok');
    }

    if (msg.text && state === 'register_awaiting_password') {
      if (msg.text.length < 6) { await sendText(chatId, tr('password_too_short', lang)); return new Response('ok'); }
      await setSession(chatId, { state: 'register_awaiting_password_confirm', pending_password: msg.text });
      await sendText(chatId, tr('ask_password_confirm', lang));
      return new Response('ok');
    }

    if (msg.text && state === 'register_awaiting_password_confirm') {
      if (msg.text !== session.pending_password) {
        await setSession(chatId, { state: 'register_awaiting_password', pending_password: null });
        await sendText(chatId, tr('password_mismatch', lang));
        return new Response('ok');
      }
      const { userId, error } = await createAccount(session.phone, session.pending_login, msg.text);
      if (error || !userId) {
        /*
         * Asl sababni logga yozamiz. Supabase Auth har qanday trigger
         * xatosini "Database error creating new user" degan umumiy matnga
         * o'rab yuboradi — u foydalanuvchiga ham, nosozlikni topishga
         * ham hech narsa bermaydi. Funksiya loglarida esa to'liq
         * ma'lumot qoladi.
         */
        console.error('createAccount failed', {
          login: session.pending_login,
          phone: session.phone,
          error,
        });
        await sendText(chatId, tr('register_failed', lang));
        await setSession(chatId, { state: 'idle', pending_password: null, pending_login: null });
        return new Response('ok');
      }

      /*
       * 2-QAVAT KAFOLAT.
       *
       * Profil odatda `handle_new_user` triggeri orqali yaratiladi, lekin
       * unga TAYANIB QOLMAYMIZ: trigger o'chib qolishi, huquq yetishmasligi
       * yoki jimgina xato berishi mumkin — o'tmishda aynan shunday bo'lgan
       * va foydalanuvchi bazada umuman ko'rinmay qolgan.
       *
       * `ensure_profile` idempotent: profil bor bo'lsa tegmaydi, yo'q
       * bo'lsa yaratadi. Qaytargan qiymatdan YAKUNIY loginni olamiz —
       * login band bo'lgan bo'lsa u o'zgargan bo'lishi mumkin, va
       * foydalanuvchiga aynan shu login aytilishi kerak.
       */
      const { data: ensured, error: ensureError } = await admin.rpc('ensure_profile', {
        p_user_id: userId,
        p_login: session.pending_login,
        p_phone: session.phone,
        p_display_name: session.pending_login,
      });

      if (ensureError) console.error('ensure_profile failed', { userId, ensureError });

      const finalLogin =
        (ensured as { login?: string } | null)?.login ?? session.pending_login;

      await setSession(chatId, { state: 'idle', pending_password: null, pending_login: null, user_id: userId });
      await sendText(chatId, tr('account_created', lang, { login: finalLogin, password: msg.text }));
      await sendMainMenu(chatId, { ...session, user_id: userId });
      return new Response('ok');
    }

    if (msg.text && state === 'login_awaiting_login') {
      await setSession(chatId, { state: 'login_awaiting_password', pending_login: msg.text.trim() });
      await sendText(chatId, tr('ask_login_password', lang), forgotKeyboard(lang));
      return new Response('ok');
    }

    if (msg.text && state === 'login_awaiting_password') {
      const profile = await findProfileByLogin(session.pending_login);
      const matchesPhone = profile && normalizePhone(profile.phone) === normalizePhone(session.phone ?? profile.phone);
      const ok = profile && matchesPhone && (await verifyLoginPassword(session.pending_login, msg.text));
      if (ok && profile) {
        await setSession(chatId, { state: 'idle', user_id: profile.id, pending_login: null });
        await sendText(chatId, tr('logged_in', lang));
        await sendMainMenu(chatId, { ...session, user_id: profile.id });
      } else {
        await sendText(chatId, tr('wrong_login_or_password', lang), forgotKeyboard(lang));
      }
      return new Response('ok');
    }

    if (msg.text && state === 'settings_awaiting_current_password') {
      if (!session.user_id) { await sendMainMenu(chatId, session); return new Response('ok'); }
      const { data: profile } = await admin.from('profiles').select('login').eq('id', session.user_id).maybeSingle();
      const ok = profile?.login && (await verifyLoginPassword(profile.login, msg.text));
      if (!ok) { await sendText(chatId, `${tr('wrong_current_password', lang)}`); return new Response('ok'); }
      await setSession(chatId, { state: 'settings_awaiting_new_password' });
      await sendText(chatId, tr('ask_new_password', lang));
      return new Response('ok');
    }

    if (msg.text && state === 'settings_awaiting_new_password') {
      if (msg.text.length < 6) { await sendText(chatId, tr('password_too_short', lang)); return new Response('ok'); }
      if (session.user_id) await admin.auth.admin.updateUserById(session.user_id, { password: msg.text });
      await setSession(chatId, { state: 'idle' });
      await sendText(chatId, tr('password_changed', lang));
      await sendMainMenu(chatId, session);
      return new Response('ok');
    }

    // ---- admin: composing a broadcast ----
    if (isAdmin(chatId) && state === 'admin_broadcast_awaiting_content') {
      const photo = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
      const text = photo ? (msg.caption ?? '') : (msg.text ?? '');
      await setSession(chatId, { draft_photo: photo, draft_text: text });
      await sendText(chatId, tr('ask_broadcast_buttons', lang), yesNoKeyboard(lang, 'broadcast_btn_yes', 'broadcast_btn_no'));
      return new Response('ok');
    }
    if (msg.text && isAdmin(chatId) && state === 'admin_broadcast_awaiting_buttons') {
      const buttons = parseButtonLines(msg.text);
      await setSession(chatId, { draft_buttons: buttons, state: 'admin_broadcast_confirm' });
      await sendBroadcastPreview(chatId, { ...session, draft_buttons: buttons });
      return new Response('ok');
    }

    await sendText(chatId, tr('press_start', lang));
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('ok');
  }
});
