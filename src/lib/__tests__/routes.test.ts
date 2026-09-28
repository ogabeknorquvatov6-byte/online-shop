import { describe, expect, it } from 'vitest';
import { matchRoute, normalizePathname, isPrivateRoute, INDEXABLE_STATIC_PATHS } from '../routes';

/*
 * Marshrut jadvali — butun ilovaning kirish nuqtasi. Bu yerda xato boʻlsa
 * foydalanuvchi "404" yoki umuman boshqa sahifani koʻradi, shuning uchun
 * u eng katta test qamroviga loyiq.
 */

describe('normalizePathname', () => {
  it('bir xil sahifaning turli yozilishlarini birlashtiradi', () => {
    // Oxirgi `/`, takroriy `/` va bosh `/` siz yozuv — hammasi bitta sahifa.
    // Aks holda `/catalog` va `/catalog/` qidiruv tizimi uchun IKKITA
    // alohida (takroriy mazmunli) manzil boʻlib koʻrinadi.
    expect(normalizePathname('/catalog/')).toBe('/catalog');
    expect(normalizePathname('catalog')).toBe('/catalog');
    expect(normalizePathname('//catalog//')).toBe('/catalog');
  });

  it('ildizni saqlaydi', () => {
    expect(normalizePathname('/')).toBe('/');
    expect(normalizePathname('')).toBe('/');
    expect(normalizePathname('///')).toBe('/');
  });
});

describe('matchRoute', () => {
  it('asosiy sahifalarni tanidi', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' });
    expect(matchRoute('/catalog')).toEqual({ name: 'catalog' });
    expect(matchRoute('/promotions')).toEqual({ name: 'promotions' });
    expect(matchRoute('/new')).toEqual({ name: 'new' });
    expect(matchRoute('/bestsellers')).toEqual({ name: 'bestsellers' });
    expect(matchRoute('/cart')).toEqual({ name: 'cart' });
    expect(matchRoute('/checkout')).toEqual({ name: 'checkout' });
    expect(matchRoute('/favorites')).toEqual({ name: 'favorites' });
    expect(matchRoute('/search')).toEqual({ name: 'search' });
  });

  it('slug bilan ishlaydigan marshrutlar', () => {
    expect(matchRoute('/product/iphone-15-pro')).toEqual({ name: 'product', slug: 'iphone-15-pro' });
    expect(matchRoute('/category/telefonlar')).toEqual({ name: 'category', slug: 'telefonlar' });
  });

  it('kodlangan slugni dekodlaydi', () => {
    // Kirill yoki boʻshliqli slug manzilda `%D0%B0` koʻrinishida keladi;
    // bazaga soʻrov esa asl matn bilan yuborilishi kerak.
    expect(matchRoute('/category/maishiy%20texnika')).toEqual({ name: 'category', slug: 'maishiy texnika' });
  });

  it('BUZUQ kodlangan manzil ilovani yiqitmaydi', () => {
    /*
     * `decodeURIComponent('%E0%A4%A')` `URIError` otadi. Marshrut tanlash
     * render paytida bajarilgani uchun bu butun React daraxtini yiqitib,
     * xatolik ekranini chiqarardi — yaʼni manzil qatoriga qoʻlda buzuq
     * havola yozgan har qanday odam saytni ishdan chiqara olardi.
     */
    expect(() => matchRoute('/product/%E0%A4%A')).not.toThrow();
    expect(matchRoute('/product/%E0%A4%A')).toEqual({ name: 'product', slug: '%E0%A4%A' });
    expect(() => matchRoute('/category/%%%')).not.toThrow();
    expect(() => matchRoute('/product/%')).not.toThrow();
    expect(() => matchRoute('/product/100%off')).not.toThrow();
  });

  it('slugsiz mahsulot/kategoriya — 404', () => {
    expect(matchRoute('/product')).toEqual({ name: 'notFound' });
    expect(matchRoute('/category')).toEqual({ name: 'notFound' });
  });

  it('`/register` eski havolalari kirish sahifasiga tushadi', () => {
    // Roʻyxatdan oʻtish Telegram bot orqali. Eski havolalar (bot xabarlari,
    // xatchoʻplar) 404 bermasligi kerak.
    expect(matchRoute('/register')).toEqual({ name: 'login' });
    expect(matchRoute('/login')).toEqual({ name: 'login' });
  });

  it('hisob boʻlimlari faqat maʼlum tab nomlarini qabul qiladi', () => {
    expect(matchRoute('/account')).toEqual({ name: 'account', tab: 'profile' });
    expect(matchRoute('/account/orders')).toEqual({ name: 'account', tab: 'orders' });
    // Nomaʼlum tab — jim turib "profil"ga tushirish emas, ochiq 404.
    // Aks holda `/account/ordrs` xatosi hech qachon sezilmasdi.
    expect(matchRoute('/account/ordrs')).toEqual({ name: 'notFound' });
  });

  it('bitta buyurtmaga chuqur havola', () => {
    /*
     * Ilgari uchinchi boʻlak JIMGINA tashlab yuborilardi: `matchRoute`
     * faqat `segments[1]` ni oʻqir edi. Natijada `/account/orders/<id>`
     * oddiy roʻyxatga tushar, chuqur havola ham, brauzer "orqaga"
     * tugmasi ham buyurtmani ocholmasdi.
     */
    expect(matchRoute('/account/orders/abc-123')).toEqual({
      name: 'account',
      tab: 'orders',
      orderId: 'abc-123',
    });
    // Kodlangan identifikator ochiladi.
    expect(matchRoute('/account/orders/a%20b')).toEqual({
      name: 'account',
      tab: 'orders',
      orderId: 'a b',
    });
    // Uchinchi boʻlak FAQAT `orders` da maʼnoga ega — boshqa joyda 404.
    expect(matchRoute('/account/profile/abc')).toEqual({ name: 'notFound' });
    expect(matchRoute('/account/settings/abc')).toEqual({ name: 'notFound' });
    // Buyurtmasiz manzilda kalit umuman paydo boʻlmasin.
    expect(matchRoute('/account/orders')).not.toHaveProperty('orderId');
  });

  it('admin boʻlimlari', () => {
    expect(matchRoute('/admin')).toEqual({ name: 'admin', tab: 'dashboard' });
    expect(matchRoute('/admin/products')).toEqual({ name: 'admin', tab: 'products' });
    expect(matchRoute('/admin/hack')).toEqual({ name: 'notFound' });
  });

  it('statik sahifalar', () => {
    expect(matchRoute('/about')).toEqual({ name: 'static', path: '/about' });
    expect(matchRoute('/faq')).toEqual({ name: 'static', path: '/faq' });
    expect(matchRoute('/nonexistent')).toEqual({ name: 'notFound' });
  });

  it('ortiqcha boʻlakli manzil 404 beradi', () => {
    // `/catalog/anything` avval ham `/catalog` deb qabul qilinardi:
    // istalgan axlat manzil haqiqiy sahifa boʻlib koʻrinar, natijada
    // qidiruv tizimi cheksiz dublikat indekslashi mumkin edi.
    expect(matchRoute('/catalog/extra')).toEqual({ name: 'notFound' });
    expect(matchRoute('/cart/extra')).toEqual({ name: 'notFound' });
  });

  it('normalizatsiya marshrut tanlashda ham qoʻllanadi', () => {
    expect(matchRoute('/catalog/')).toEqual({ name: 'catalog' });
    expect(matchRoute('/product/abc/')).toEqual({ name: 'product', slug: 'abc' });
  });
});

describe('isPrivateRoute', () => {
  it('tranzaksion va shaxsiy sahifalar indekslanmaydi', () => {
    expect(isPrivateRoute({ name: 'cart' })).toBe(true);
    expect(isPrivateRoute({ name: 'checkout' })).toBe(true);
    expect(isPrivateRoute({ name: 'account', tab: 'orders' })).toBe(true);
    expect(isPrivateRoute({ name: 'admin', tab: 'users' })).toBe(true);
    expect(isPrivateRoute({ name: 'login' })).toBe(true);
  });

  it('doʻkon sahifalari indekslanadi', () => {
    expect(isPrivateRoute({ name: 'home' })).toBe(false);
    expect(isPrivateRoute({ name: 'catalog' })).toBe(false);
    expect(isPrivateRoute({ name: 'product', slug: 'x' })).toBe(false);
    expect(isPrivateRoute({ name: 'static', path: '/about' })).toBe(false);
  });
});

describe('INDEXABLE_STATIC_PATHS', () => {
  it('har bir manzil haqiqiy marshrutga olib boradi', () => {
    // Sitemapʼda 404 beradigan manzil boʻlishi — SEOʻda jiddiy xato.
    for (const path of INDEXABLE_STATIC_PATHS) {
      const route = matchRoute(path);
      expect(route.name, `sitemap manzili buzuq: ${path}`).not.toBe('notFound');
      expect(isPrivateRoute(route), `yopiq sahifa sitemapʼda: ${path}`).toBe(false);
    }
  });
});
