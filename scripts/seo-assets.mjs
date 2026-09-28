/*
 * `robots.txt` va `sitemap.xml` ni BUILD PAYTIDA hosil qiladi.
 *
 * Nega qo'lda yozilgan fayl emas?
 *   — Sitemap'da haqiqiy mahsulot va kategoriya manzillari bo'lishi kerak.
 *     Qo'lda yozilgan fayl birinchi mahsulot qo'shilgan kuniyoq eskiradi.
 *   — Sayt domeni muhitga bog'liq (`VITE_SITE_URL`). Uni faylga yozib
 *     qo'yish — noto'g'ri domenli sitemap chiqarish demak, bu esa
 *     sitemap'ni butunlay yaroqsiz qiladi.
 *
 * Xavfsizlik: `VITE_SITE_URL` berilmasa yoki bazaga ulanib bo'lmasa,
 * build TO'XTAMAYDI — ogohlantirish chiqadi va sitemap faqat statik
 * manzillar bilan (yoki umuman) yozilmaydi. Deploy hech qachon SEO
 * qo'shimchasi tufayli buzilmasligi kerak.
 */

const STATIC_PATHS = ['/', '/catalog', '/promotions', '/new', '/bestsellers', '/about', '/contact', '/delivery', '/returns', '/faq'];

const DISALLOW = ['/cart', '/checkout', '/account', '/admin', '/login', '/register', '/favorites', '/search'];

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);
}

function urlEntry(origin, path, lastmod, priority) {
  const loc = xmlEscape(origin + path);
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${xmlEscape(lastmod.slice(0, 10))}</lastmod>` : null,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function fetchJson(url, key, signal) {
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Supabase REST orqali indekslanadigan slug'larni oladi (SDK kerak emas). */
async function fetchDynamicPaths(supabaseUrl, anonKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const base = supabaseUrl.replace(/\/+$/, '');
    /*
     * `updated_at` SO'RALMAYDI — `products` jadvalida bunday ustun yo'q
     * (tekshirilgan: PostgREST `42703 column products.updated_at does not
     * exist` qaytaradi va butun so'rov 400 bo'lib, sitemap mahsulotlarsiz
     * qolardi). `lastmod` uchun `created_at` ishlatiladi.
     */
    const [products, categories] = await Promise.all([
      fetchJson(`${base}/rest/v1/products?select=slug,created_at&is_active=eq.true&limit=5000`, anonKey, controller.signal),
      fetchJson(`${base}/rest/v1/categories?select=slug&is_active=eq.true&limit=1000`, anonKey, controller.signal),
    ]);
    return [
      ...categories.filter((c) => c.slug).map((c) => ({ path: `/category/${encodeURIComponent(c.slug)}`, priority: '0.7' })),
      ...products.filter((p) => p.slug).map((p) => ({
        path: `/product/${encodeURIComponent(p.slug)}`,
        lastmod: p.created_at,
        priority: '0.6',
      })),
    ];
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {import('vite').Plugin} */
export function seoAssets() {
  let siteUrl = '';
  let supabaseUrl = '';
  let anonKey = '';
  return {
    name: 'openshop-seo-assets',
    apply: 'build',
    configResolved(config) {
      // `config.env` — Vite `.env` fayllaridan o'qigan qiymatlar.
      // `process.env` bu yerda BO'SH bo'ladi: Vite ularni jarayon
      // muhitiga ko'chirmaydi, faqat o'z konfiguratsiyasiga yuklaydi.
      siteUrl = (config.env.VITE_SITE_URL || '').replace(/\/+$/, '');
      supabaseUrl = config.env.VITE_SUPABASE_URL || '';
      anonKey = config.env.VITE_SUPABASE_ANON_KEY || '';
    },
    async generateBundle() {
      const robotsLines = [
        '# OpenShop — crawler qoidalari',
        '#',
        '# Shaxsiy va tranzaksion sahifalar indekslanmaydi: ular har bir',
        '# foydalanuvchi uchun har xil va qidiruv natijalarida foydasiz',
        '# (bo‘sh savat, kirish formasi, admin paneli).',
        '',
        'User-agent: *',
        'Allow: /',
        '',
        ...DISALLOW.map((p) => `Disallow: ${p}`),
        '',
        '# Filtrlangan katalog sahifalari asosiy katalogning nusxasi.',
        'Disallow: /catalog?*',
      ];

      if (!siteUrl) {
        // Domen noma'lum — sitemap havolasi ham, sitemap fayli ham
        // yozilmaydi. Noto'g'ri domenli sitemap umuman yo'q sitemapdan
        // yomonroq: qidiruv tizimi uni xato deb belgilaydi.
        this.warn(
          'VITE_SITE_URL berilmagan — sitemap.xml yaratilmadi va robots.txt ga Sitemap qatori qo‘shilmadi. ' +
            'Domenni .env ga qo‘shing (masalan VITE_SITE_URL=https://example.uz).'
        );
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsLines.join('\n') + '\n' });
        return;
      }

      robotsLines.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsLines.join('\n') + '\n' });

      let dynamic = [];
      if (supabaseUrl && anonKey) {
        try {
          dynamic = await fetchDynamicPaths(supabaseUrl, anonKey);
        } catch (err) {
          this.warn(`Sitemap uchun mahsulotlar olinmadi (${err.message}) — faqat statik manzillar yoziladi.`);
        }
      }

      const entries = [
        ...STATIC_PATHS.map((path) => ({ path, priority: path === '/' ? '1.0' : '0.8' })),
        ...dynamic,
      ];

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...entries.map((e) => urlEntry(siteUrl, e.path, e.lastmod, e.priority)),
        '</urlset>',
      ].join('\n');

      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml + '\n' });
    },
  };
}
