/*
 * Marshrutlar jadvali — YAGONA manba.
 *
 * Ilgari marshrut tanlash `App.tsx` ichidagi uzun `if/else` zanjiri edi:
 * har bir shart `rawPath.split('/')[2]` kabi indekslar bilan ishlar, tab
 * nomlari satr sifatida uzatilar va hech qayerda tekshirilmasdi. Natijada
 * yangi sahifa qo'shish uchun App.tsx, BottomNav, Header, sitemap va SEO
 * fayllarini alohida-alohida yangilash kerak edi.
 *
 * Endi bitta SOF funksiya `pathname` ni tekshirilgan birlashma (discriminated
 * union) ga aylantiradi. Bu:
 *   — test qilinadi (DOM ham, React ham kerak emas),
 *   — `switch` da to'liqlikni TypeScript o'zi tekshiradi,
 *   — sitemap va canonical URL'lar shu ro'yxatdan hosil qilinadi.
 */

import { STATIC_PAGES, type StaticPagePath } from './staticPages';

export const ACCOUNT_TABS = ['profile', 'orders', 'favorites', 'addresses', 'settings'] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

export const ADMIN_TABS = [
  'dashboard', 'products', 'categories', 'banners', 'promotions', 'orders', 'users', 'settings',
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export type AppRoute =
  | { name: 'home' }
  | { name: 'catalog' }
  | { name: 'category'; slug: string }
  | { name: 'product'; slug: string }
  | { name: 'promotions' }
  | { name: 'new' }
  | { name: 'bestsellers' }
  | { name: 'search' }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'favorites' }
  | { name: 'login' }
  | { name: 'account'; tab: AccountTab; orderId?: string }
  | { name: 'admin'; tab: AdminTab }
  | { name: 'static'; path: StaticPagePath }
  | { name: 'notFound' };

function isMember<T extends readonly string[]>(list: T, value: string): value is T[number] {
  return (list as readonly string[]).includes(value);
}

/**
 * `decodeURIComponent`, lekin BUZUQ manzilda ham yiqilmaydi.
 *
 * `decodeURIComponent('%E0%A4%A')` `URIError` OTADI. Marshrut tanlash render
 * paytida bajariladi, ya'ni bu xato butun React daraxtini yiqitib,
 * ErrorBoundary'ning "Nimadir noto'g'ri ketdi" ekranini chiqaradi —
 * saytga qo'lda buzuq havola yozgan (yoki eski/noto'g'ri havolani bosgan)
 * har qanday odam butun ilovani ishdan chiqara olardi. Bunday manzil
 * shunchaki mavjud bo'lmagan slug: uni xom holida qaytaramiz, natijada
 * mahsulot topilmaydi va foydalanuvchi toza 404 ko'radi.
 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Yo'ldagi oxirgi `/` ni olib tashlaydi va bo'sh bo'lakni tozalaydi.
 * `/catalog/` va `/catalog` bir xil sahifa — aks holda ular qidiruv
 * tizimlari uchun ikkita alohida (takroriy) manzil bo'lib ko'rinadi.
 */
export function normalizePathname(pathname: string): string {
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const trimmed = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return trimmed || '/';
}

/** `pathname` ni marshrutga aylantiradi. Sof funksiya — brauzer kerak emas. */
export function matchRoute(rawPathname: string): AppRoute {
  const pathname = normalizePathname(rawPathname);
  const segments = pathname.split('/').filter(Boolean);
  const [first, second] = segments;

  if (segments.length === 0) return { name: 'home' };

  switch (first) {
    case 'catalog':
      return segments.length === 1 ? { name: 'catalog' } : { name: 'notFound' };
    case 'promotions':
      return segments.length === 1 ? { name: 'promotions' } : { name: 'notFound' };
    case 'new':
      return segments.length === 1 ? { name: 'new' } : { name: 'notFound' };
    case 'bestsellers':
      return segments.length === 1 ? { name: 'bestsellers' } : { name: 'notFound' };
    case 'search':
      return segments.length === 1 ? { name: 'search' } : { name: 'notFound' };
    case 'cart':
      return segments.length === 1 ? { name: 'cart' } : { name: 'notFound' };
    case 'checkout':
      return segments.length === 1 ? { name: 'checkout' } : { name: 'notFound' };
    case 'favorites':
      return segments.length === 1 ? { name: 'favorites' } : { name: 'notFound' };

    /*
     * `/register` OLIB TASHLANGAN: hisob Telegram bot yoki Google orqali
     * yaratiladi. Eski havolalar (bot xabarlari, xatcho'plar) buzilmasligi
     * uchun u kirish sahifasiga tushadi.
     */
    case 'login':
    case 'register':
      return segments.length === 1 ? { name: 'login' } : { name: 'notFound' };

    case 'category':
      return second ? { name: 'category', slug: safeDecode(second) } : { name: 'notFound' };
    case 'product':
      return second ? { name: 'product', slug: safeDecode(second) } : { name: 'notFound' };

    case 'account': {
      const tab = second ?? 'profile';
      if (!isMember(ACCOUNT_TABS, tab)) return { name: 'notFound' };
      /*
       * Uchinchi bo'lak — BITTA buyurtmaning identifikatori
       * (`/account/orders/<id>`). Ilgari u JIMGINA tashlab
       * yuborilardi: `matchRoute` faqat `segments[1]` ni o'qir edi,
       * shuning uchun bunday manzil oddiy ro'yxatga tushib, chuqur
       * havola ham, brauzer "orqaga" tugmasi ham ishlamasdi.
       *
       * Faqat `orders` uchun qabul qilinadi — boshqa bo'limlarda
       * uchinchi bo'lak ma'noga ega emas va u xato manzil.
       *
       * DIQQAT: bu shunchaki KO'RSATISH uchun. Buyurtma kimga
       * tegishliligini bu yerda hal qilib bo'lmaydi — uni RLS hal
       * qiladi, ya'ni boshqa foydalanuvchining id'si yozilsa so'rov
       * shunchaki 0 qator qaytaradi.
       */
      const third = segments[2];
      if (third) {
        if (tab !== 'orders') return { name: 'notFound' };
        return { name: 'account', tab, orderId: safeDecode(third) };
      }
      return { name: 'account', tab };
    }
    case 'admin': {
      const tab = second ?? 'dashboard';
      return isMember(ADMIN_TABS, tab) ? { name: 'admin', tab } : { name: 'notFound' };
    }
  }

  if (segments.length === 1 && pathname in STATIC_PAGES) {
    return { name: 'static', path: pathname as StaticPagePath };
  }

  return { name: 'notFound' };
}

/**
 * Qidiruv tizimlari indekslashi KERAK BO'LMAGAN marshrutlar.
 *
 * Savat, to'lov va shaxsiy kabinet har bir foydalanuvchi uchun har xil va
 * ular uchun `noindex` qo'yilmasa, Google indeksida bo'sh savat sahifalari
 * paydo bo'ladi.
 */
export function isPrivateRoute(route: AppRoute): boolean {
  switch (route.name) {
    case 'cart':
    case 'checkout':
    case 'favorites':
    case 'login':
    case 'account':
    case 'admin':
    case 'search':
    case 'notFound':
      return true;
    default:
      return false;
  }
}

/** `sitemap.xml` uchun statik (parametrsiz) manzillar. */
export const INDEXABLE_STATIC_PATHS: readonly string[] = [
  '/', '/catalog', '/promotions', '/new', '/bestsellers',
  ...Object.keys(STATIC_PAGES),
];
