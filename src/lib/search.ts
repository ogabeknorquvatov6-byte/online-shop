import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type SearchCategory = { id: string; name: string; slug: string };

export type SearchProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  discount_price: number | null;
  image_url: string | null;
};

export type SearchResults = {
  categories: SearchCategory[];
  brands: string[];
  products: SearchProductRow[];
};

const EMPTY_RESULTS: SearchResults = { categories: [], brands: [], products: [] };

/*
 * Natijalarni bitta tekis ro'yxatga yig'amiz — klaviatura bilan yuqoriga/
 * pastga yurish uchun kategoriya, brend va mahsulotlar yagona indeksga
 * ega bo'lishi kerak.
 */
export type FlatItem =
  | { kind: 'category'; data: SearchCategory }
  | { kind: 'brand'; data: string }
  | { kind: 'product'; data: SearchProductRow };

export function buildFlatItems(
  categories: SearchCategory[],
  brands: string[],
  products: SearchProductRow[]
): FlatItem[] {
  return [
    ...categories.map((c): FlatItem => ({ kind: 'category', data: c })),
    ...brands.map((b): FlatItem => ({ kind: 'brand', data: b })),
    ...products.map((p): FlatItem => ({ kind: 'product', data: p })),
  ];
}

export function itemHref(item: FlatItem): string {
  if (item.kind === 'category') return `/category/${item.data.slug}`;
  if (item.kind === 'brand') return `/catalog?brand=${encodeURIComponent(item.data)}`;
  return `/product/${item.data.slug}`;
}

/**
 * Foydalanuvchi kiritgan matnni LIKE naqshiga xavfsiz aylantiradi.
 * `%` va `_` — SQL LIKE joker belgilari: ularsiz "50%" deb qidirilganda
 * `%` istalgan matnga mos kelib, butunlay tasodifiy natijalar chiqardi.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/*
 * ── APOSTROF: BITTA TOVUSH, YETTI XIL BELGI ─────────────────────────
 *
 * O'zbek matnida `oʻ` va `gʻ` uchun to'g'ri belgi — ʻ (U+02BB), tutuq
 * belgisi uchun ʼ (U+02BC). Lekin KLAVIATURADA ularning ikkalasi ham
 * yo'q: mijoz `'` (U+0027) yozadi, Word `’` (U+2019) ga aylantiradi,
 * eski ma'lumotlarda `‘` (U+2018) uchraydi, ba'zan ` yoki ´ ham.
 *
 * Natijada qidiruv jimgina ishlamaydi: bazadagi nom "Qoʻshimcha
 * batareya", mijoz "qo'shimcha" deb yozadi va `ilike` MOS KELMAYDI —
 * do'kon mahsuloti bor, lekin uni topib bo'lmaydi. Bu eng yomon
 * turdagi xato: hech qanday xato xabari yo'q, shunchaki "topilmadi".
 */
const APOSTROPHE_CLASS = /['‘’ʻʼ`´′]/g;

/** Kanonik belgi — JS tomonidagi solishtirishlar uchun. */
const CANONICAL = 'ʼ';

/**
 * Barcha apostrof variantlarini bittaga keltiradi.
 *
 * UZUNLIK O'ZGARMAYDI — har bir belgi bitta belgiga almashadi. Bu
 * `splitHighlight` uchun SHART: u normallashtirilgan matnda indeks
 * topib, ASL matndan bo'lak qirqadi. Uzunlik farq qilsa ajratib
 * ko'rsatish bir-ikki harfga surilib ketardi.
 */
export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHE_CLASS, CANONICAL);
}

/**
 * `ilike` uchun naqsh: `%…%`, apostroflar `_` bilan almashtirilgan.
 *
 * NEGA `_`, normalizatsiya emas? Chunki solishtirish JS'da emas,
 * POSTGRES'da bajariladi va bazadagi ustun qiymatini mijoz tomonidan
 * normallashtirib bo'lmaydi. `_` esa LIKE'ning "aynan bitta istalgan
 * belgi" jokeri — `qo_shimcha` naqshi `qoʻshimcha`, `qo'shimcha` va
 * `qo’shimcha` ning uchalasiga ham mos keladi.
 *
 * Tartib MUHIM: avval `escapeLike` (u `_` ni `\_` ga qochiradi va shu
 * bilan mijoz yozgan haqiqiy `_` joker bo'lib ketmaydi), keyin
 * apostroflarni `_` ga aylantiramiz — ular qochirilmaydi, ya'ni joker
 * bo'lib qoladi. Teskari tartibda o'z jokerimizni o'zimiz o'chirардик.
 *
 * Yon ta'siri: `qo_shimcha` nazariy jihatdan `qoxshimcha` ga ham mos
 * keladi. Bu qabul qilinadi — bu qidiruv taklifi, xavfsizlik chegarasi
 * emas, va bunday so'z amalda uchramaydi.
 */
export function likePattern(value: string): string {
  return `%${escapeLike(value).replace(APOSTROPHE_CLASS, '_')}%`;
}

/**
 * `.or('name.ilike.%q%,sku.ilike.%q%')` ichida ishlatish uchun xavfsiz matn.
 *
 * PostgREST'ning `or=` sintaksisida `,` shartlarni AJRATADI, `(` va `)`
 * esa ularni GURUHLAYDI. Foydalanuvchi qidiruviga shu belgilar tushsa,
 * filtr butunlay boshqa ma'noga ega bo'lib qoladi — yaxshi holatda
 * "400 Bad Request", yomon holatda esa kutilmagan shartlar bilan
 * ma'lumot qaytaradi. Bu — filtr in'yeksiyasi.
 *
 * Nuqta ham olib tashlanadi: `ustun.operator.qiymat` uchburchagida u
 * ajratuvchi rol o'ynaydi.
 *
 * LIKE joker belgilari (`%`, `_`) alohida `escapeLike` bilan qochiriladi.
 */
export function sanitizeOrFilterTerm(value: string): string {
  return escapeLike(value.replace(/[,()."']/g, ' ').replace(/\s+/g, ' ').trim());
}

// Bir sessiya davomida bir xil so'rovni qayta-qayta bazadan so'ramaslik uchun
// yengil cache (spec 14: "oldingi search natijalarini kerak bo'lsa cache qil").
const resultCache = new Map<string, SearchResults>();

/**
 * Live search — kategoriyalar, brendlar (products.brand ustunidagi
 * takrorlanmas qiymatlar) va mahsulotlarni bitta debounced so'rov to'plami
 * bilan qaytaradi. FAKE ma'lumot yo'q — hammasi mavjud Supabase jadvallaridan.
 */
type SearchProductQueryRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  discount_price: number | null;
  product_images: { image_url: string; sort_order: number }[] | null;
};

export function useLiveSearch(rawQuery: string, debounceMs = 260) {
  const query = rawQuery.trim();
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  /** "Qayta urinish" bosilganda o'zgaradi va effektni qaytadan ishga tushiradi. */
  const [attempt, setAttempt] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(false);
      // Bo'sh so'rov — bekor qilingan javob eski natijani yozib
      // qo'ymasligi uchun hisoblagichni oshiramiz.
      requestIdRef.current++;
      return;
    }

    const cacheKey = query.toLowerCase();
    // Qayta urinishda keshdan emas, bazadan olamiz — aks holda "qayta
    // urinish" tugmasi hech narsa qilmagandek ko'rinardi.
    const cached = attempt === 0 ? resultCache.get(cacheKey) : undefined;
    if (cached) setResults(cached);
    setLoading(true);
    setError(false);

    const thisRequestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      const like = likePattern(query);
      try {
        const [{ data: cats }, { data: brandRows }, { data: prods }] = await Promise.all([
          supabase
            .from('categories')
            .select('id,name,slug')
            .eq('is_active', true)
            .ilike('name', like)
            .limit(5)
            .returns<SearchCategory[]>(),
          supabase
            .from('products')
            .select('brand')
            .eq('is_active', true)
            .ilike('brand', like)
            .neq('brand', '')
            .limit(30)
            .returns<{ brand: string | null }[]>(),
          supabase
            .from('products')
            .select('id,name,slug,price,discount_price,product_images(image_url,sort_order)')
            .eq('is_active', true)
            .ilike('name', like)
            .order('sales_count', { ascending: false })
            .limit(6)
            .returns<SearchProductQueryRow[]>(),
        ]);

        // Bu javob eskirgan bo'lsa (foydalanuvchi allaqachon keyingi harfni
        // yozgan bo'lsa) e'tiborsiz qoldiramiz — natijalar aralashib
        // ketmasligi uchun (spec 10: "layout sakramasin", tez yozishda ham).
        if (thisRequestId !== requestIdRef.current) return;

        const brandSet = new Set<string>();
        (brandRows ?? []).forEach((r) => {
          if (r.brand) brandSet.add(r.brand);
        });

        const next: SearchResults = {
          categories: cats ?? [],
          brands: [...brandSet].slice(0, 5),
          products: (prods ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            price: p.price,
            discount_price: p.discount_price,
            image_url:
              [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null,
          })),
        };

        resultCache.set(cacheKey, next);
        setResults(next);
      } catch {
        /*
         * Ilgari bu yerda `catch` UMUMAN YO'Q edi — faqat `finally`.
         *
         * Tarmoq uzilganda so'rov rad etilar, xato hech kim ushlamagan
         * "promise rejection" bo'lib konsolga tushar, foydalanuvchi esa
         * spinner o'chgan bo'sh ro'yxatga qarab "hech narsa topilmadi"
         * deb o'ylardi. Endi haqiqiy xato holati bor va UI qayta urinish
         * taklif qila oladi.
         */
        if (thisRequestId !== requestIdRef.current) return;
        setResults(EMPTY_RESULTS);
        setError(true);
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const hasResults = results.categories.length > 0 || results.brands.length > 0 || results.products.length > 0;

  return { query, results, loading, error, retry, hasQuery: query.length > 0, hasResults };
}

/** Qidirilgan so'zga mos qismni ajratib ko'rsatish uchun matnni bo'laklarga bo'ladi. */
export function splitHighlight(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  /*
   * Solishtirish NORMALLASHTIRILGAN matnda, bo'laklar esa ASL matndan
   * qirqiladi. Aks holda mijoz "qo'shimcha" deb yozganda bazadagi
   * "qoʻshimcha" topilardi (naqsh `_` bilan), lekin ajratib ko'rsatish
   * ishlamasdi — natija ro'yxatida qalin qism umuman chiqmasdi.
   *
   * `normalizeApostrophes` uzunlikni saqlaydi, shuning uchun bu yerda
   * topilgan indeks asl matnda ham to'g'ri joyni ko'rsatadi.
   */
  const haystack = normalizeApostrophes(text).toLowerCase();
  const idx = haystack.indexOf(normalizeApostrophes(needle).toLowerCase());
  if (idx === -1) return [{ text, match: false }];
  const end = idx + needle.length;
  const parts: { text: string; match: boolean }[] = [];
  if (idx > 0) parts.push({ text: text.slice(0, idx), match: false });
  parts.push({ text: text.slice(idx, end), match: true });
  if (end < text.length) parts.push({ text: text.slice(end), match: false });
  return parts;
}
