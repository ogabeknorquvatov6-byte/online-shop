import { useEffect } from 'react';

/*
 * Sahifa metadataʼsi.
 *
 * Ilova endi History API marshrutlarida ishlaydi (`/product/iphone-15`),
 * yaʼni har bir sahifaning HAQIQIY manzili bor va uni qidiruv tizimlariga
 * koʻrsatish mantiqiy. Bu modul har bir marshrut uchun title, description,
 * canonical, robots va Open Graph teglarini yangilaydi.
 *
 * MUHIM cheklov (halol aytilsin): bu SPA, server-side rendering yoʻq.
 * Google JavaScriptʼni bajarib indekslaydi va bu teglarni koʻradi, lekin
 * Telegram/WhatsApp/Facebook koʻrinishlari JS ISHLATMAYDI — ular faqat
 * `index.html` dagi statik teglarni oladi. Toʻliq ijtimoiy koʻrinish
 * uchun prerender yoki SSR kerak (yakuniy hisobotdagi "qolgan ishlar").
 */

const SITE_NAME = 'OpenShop';
const DEFAULT_DESCRIPTION =
  "OpenShop — Oʻzbekistondagi ishonchli online-doʻkon. Telefonlar, noutbuklar, audio va aksessuarlar. Tez yetkazib berish, rasmiy kafolat.";

/**
 * Produksiya domeni. Berilmasa joriy domen ishlatiladi.
 *
 * Nega muhim: canonicalʼni doim `window.location` dan olish preview va
 * staging domenlarini ham "asosiy manzil" deb eʼlon qiladi — natijada
 * bitta mahsulot bir necha domenda indekslanib, reyting boʻlinadi.
 */
const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') || '';

/** Joriy sahifaning mutlaq, parametrsiz manzili. */
export function canonicalUrl(pathname: string): string {
  const origin = SITE_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin + (pathname === '/' ? '/' : pathname.replace(/\/+$/, ''));
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export type SeoInput = {
  /** Sahifa nomi — "— OpenShop" avtomatik qoʻshiladi. */
  title?: string;
  description?: string;
  /** Ijtimoiy tarmoqlarda koʻrinadigan rasm (mahsulot sahifasi uchun). */
  image?: string | null;
  /** `website` yoki mahsulot sahifasi uchun `product`. */
  type?: 'website' | 'product';
  /** Sahifa hali yuklanmoqda boʻlsa true — metadata yozilmaydi. */
  pending?: boolean;
  /**
   * Indekslanmasligi kerak boʻlgan sahifa (savat, kabinet, admin, qidiruv).
   * Bunday sahifalar Google natijalarida faqat shovqin hosil qiladi.
   */
  noindex?: boolean;
  /**
   * Canonical uchun yoʻl. Berilmasa joriy `location.pathname` olinadi.
   * Filtrlangan katalogda ATAYLAB parametrsiz yoʻl beriladi — `?brand=`
   * variantlari asosiy katalogning nusxasi hisoblanadi.
   */
  canonicalPath?: string;
};

export function useSeo({
  title, description, image, type = 'website', pending, noindex, canonicalPath,
}: SeoInput) {
  useEffect(() => {
    if (pending) return;

    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Online-doʻkon`;
    const desc = description?.trim() || DEFAULT_DESCRIPTION;
    const url = canonicalUrl(canonicalPath ?? window.location.pathname);

    document.title = fullTitle;

    upsertMeta('name', 'description', desc);
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
    upsertLink('canonical', url);

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', type === 'product' ? 'product' : 'website');
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:locale', 'uz_UZ');

    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);

    /*
     * Rasm YOʻQ boʻlsa eski tegni OʻCHIRAMIZ.
     *
     * Ilgari `og:image` faqat qoʻshilardi, hech qachon olib tashlanmasdi:
     * foydalanuvchi mahsulot sahifasidan "Biz haqimizda"ga oʻtgach, u
     * sahifa havolasi ham hamon oʻsha mahsulot rasmi bilan ulashilardi.
     */
    if (image) {
      upsertMeta('property', 'og:image', image);
      upsertMeta('name', 'twitter:image', image);
    } else {
      removeMeta('property', 'og:image');
      removeMeta('name', 'twitter:image');
    }

    /*
     * Bu yerda ATAYLAB cleanup yo'q.
     *
     * Ilgari komponent yopilganda `document.title` o'zidan OLDINGI qiymatga
     * qaytarilardi. Marshrut o'zgarganda React eski sahifani yangisidan
     * keyin ham tozalab ulgurar va shu tiklash yangi sahifa qo'ygan nomni
     * bosib ketardi — natijada brauzer yorlig'ida doim BIR QADAM ORQADAGI
     * sahifa nomi turardi. Har bir marshrut o'z nomini o'zi qo'yadi.
     */
  }, [title, description, image, type, pending, noindex, canonicalPath]);
}

/* ── Strukturaviy maʼlumot (JSON-LD) ─────────────────────────────────── */

/**
 * JSON-LD blokini `<head>` ga qoʻyadi va komponent yopilganda olib tashlaydi.
 * `id` boʻyicha almashtiriladi — bir sahifada bir necha marta render
 * boʻlsa ham dublikat qolmaydi.
 */
function useJsonLd(id: string, data: object | null | false) {
  /*
   * Bogʻliqlik OBYEKT emas, uning MATNI.
   *
   * Chaqiruvchi har renderʼda yangi obyekt literal beradi (`{...}`), yaʼni
   * obyektga bogʻlansak effekt har renderʼda qayta ishlar va `<head>` ga
   * skript qoʻyib-oʻchirib turardi — mahsulot sahifasida har bir holat
   * oʻzgarishida (variant tanlash, miqdor) takrorlanardi. Matn esa
   * mazmun haqiqatan oʻzgargandagina farq qiladi.
   */
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!json) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seoId = id;
    script.textContent = json;
    document.head.querySelector(`script[data-seo-id="${id}"]`)?.remove();
    document.head.appendChild(script);
    return () => script.remove();
  }, [id, json]);
}

/**
 * Mahsulot sahifasiga schema.org JSON-LD qoʻshadi — qidiruv natijalarida
 * narx va mavjudlik koʻrinishi uchun.
 */
export function useProductJsonLd(data: {
  name: string;
  description?: string | null;
  image?: string | null;
  sku?: string | null;
  brand?: string | null;
  price: number;
  inStock: boolean;
  url: string;
} | null) {
  useJsonLd(
    'product',
    data && {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: data.name,
      description: data.description || undefined,
      image: data.image || undefined,
      sku: data.sku || undefined,
      brand: data.brand ? { '@type': 'Brand', name: data.brand } : undefined,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'UZS',
        price: data.price,
        availability: data.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: data.url,
      },
    }
  );
}

export type Breadcrumb = { name: string; path: string };

/**
 * "Bosh sahifa › Katalog › Telefonlar › iPhone 15" zanjiri.
 *
 * Google buni qidiruv natijasida manzil oʻrniga koʻrsatadi — foydalanuvchi
 * havolani bosishdan oldin sahifa katalogning qayerida turganini koʻradi.
 */
export function useBreadcrumbJsonLd(items: Breadcrumb[] | null) {
  useJsonLd(
    'breadcrumb',
    items &&
      items.length > 1 && {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: canonicalUrl(item.path),
        })),
      }
  );
}

/**
 * Doʻkon va sayt haqidagi bir martalik maʼlumot (bosh sahifada).
 *
 * `SearchAction` Googleʼga sayt ichida qidiruv borligini bildiradi va
 * baʼzi hollarda natijada qidiruv maydoni koʻrsatiladi.
 */
export function useSiteJsonLd(store: { name: string; logo?: string | null; phone?: string | null } | null) {
  useJsonLd(
    'site',
    store && {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${canonicalUrl('/')}#organization`,
          name: store.name,
          url: canonicalUrl('/'),
          logo: store.logo || undefined,
          contactPoint: store.phone
            ? { '@type': 'ContactPoint', telephone: store.phone, contactType: 'customer service', areaServed: 'UZ', availableLanguage: ['uz', 'ru'] }
            : undefined,
        },
        {
          '@type': 'WebSite',
          '@id': `${canonicalUrl('/')}#website`,
          name: store.name,
          url: canonicalUrl('/'),
          inLanguage: 'uz-UZ',
          publisher: { '@id': `${canonicalUrl('/')}#organization` },
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${canonicalUrl('/catalog')}?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    }
  );
}
