import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateLegacyHashUrl } from '../router';

/*
 * Eski `#/...` havolalarining ko'chirilishi.
 *
 * Bu kod bir marta — ilova ishga tushishida — bajariladi va uni sinash
 * juda qiyin: xato bo'lsa, Telegram botdagi barcha eski havolalar bosh
 * sahifaga tushib qoladi va buni hech kim darhol sezmaydi.
 *
 * To'liq DOM kerak emas — funksiya faqat `window.location` va
 * `window.history.replaceState` bilan ishlaydi, shuning uchun ularning
 * minimal maketi yetarli (jsdom o'rnatishning hojati yo'q).
 */

function stubLocation(href: string) {
  const url = new URL(href);
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: { replaceState },
  });
  return replaceState;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('migrateLegacyHashUrl', () => {
  it('oddiy hash marshrutni toza manzilga oʻgiradi', () => {
    const replaceState = stubLocation('https://shop.uz/#/catalog');
    migrateLegacyHashUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/catalog');
  });

  it('mahsulot havolasini saqlab qoladi', () => {
    const replaceState = stubLocation('https://shop.uz/#/product/iphone-15');
    migrateLegacyHashUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/product/iphone-15');
  });

  it('hash ichidagi soʻrov parametrlarini koʻchiradi', () => {
    const replaceState = stubLocation('https://shop.uz/#/catalog?brand=Apple');
    migrateLegacyHashUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/catalog?brand=Apple');
  });

  it('OAuth qaytishidagi `?code=` ni yoʻqotmaydi', () => {
    // Supabase PKCE oqimi `?code=...` bilan qaytadi. Agar shu paytda
    // manzilda eski hash ham bo'lsa, ikkalasi ham saqlanishi SHART —
    // aks holda foydalanuvchi tizimga kira olmaydi.
    const replaceState = stubLocation('https://shop.uz/?code=abc123#/account');
    migrateLegacyHashUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/account?code=abc123');
  });

  it('`#/` ildizini `/` ga oʻgiradi', () => {
    const replaceState = stubLocation('https://shop.uz/#/');
    migrateLegacyHashUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('hash yoʻq boʻlsa hech narsa qilmaydi', () => {
    const replaceState = stubLocation('https://shop.uz/catalog');
    migrateLegacyHashUrl();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('sahifa ichidagi langar havolaga tegmaydi', () => {
    // `/faq#delivery` — bu marshrut emas, sahifa ichidagi bo'limga havola.
    const replaceState = stubLocation('https://shop.uz/faq#delivery');
    migrateLegacyHashUrl();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('haqiqiy yoʻlda turgan hashni marshrut deb hisoblamaydi', () => {
    // Foydalanuvchi allaqachon `/catalog` da bo'lsa, `#/cart` uni
    // boshqa sahifaga uloqtirmasligi kerak.
    const replaceState = stubLocation('https://shop.uz/catalog#/cart');
    migrateLegacyHashUrl();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
