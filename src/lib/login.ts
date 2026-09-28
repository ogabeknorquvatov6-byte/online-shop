import { normalizePhone } from './phone';

/*
 * Login identifikatori.
 *
 * Foydalanuvchi Telegram botda o'ziga LOGIN o'ylab topadi (masalan
 * `alibek` yoki `ali_2024`). Supabase Auth esa email talab qiladi,
 * shuning uchun ichkarida `<login>@telegram.local` ishlatiladi — bu
 * manzil hech qachon foydalanuvchiga ko'rsatilmaydi va unga xat
 * yuborilmaydi, u faqat texnik identifikator.
 */

export const LOGIN_EMAIL_DOMAIN = '@telegram.local';

export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export function loginToEmail(login: string): string {
  return `${normalizeLogin(login)}${LOGIN_EMAIL_DOMAIN}`;
}

/** Telefon raqami ham login sifatida ishlatilishi mumkin (eski hisoblar). */
export function phoneToLoginEmail(rawPhone: string): string {
  return `${normalizePhone(rawPhone)}${LOGIN_EMAIL_DOMAIN}`;
}

/** Kiritilgan matn telefon raqamiga o'xshaydimi? */
export function looksLikePhone(value: string): boolean {
  return !value.includes('@') && normalizePhone(value).length >= 9;
}

/**
 * Botda ruxsat etilgan login shakli. Sayt ham shu qoidani ishlatadi,
 * shunda foydalanuvchi bir joyda qabul qilingan loginni boshqa joyda
 * "noto'g'ri" degan xabar bilan uchratmaydi.
 */
export function isValidLogin(value: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeLogin(value));
}
