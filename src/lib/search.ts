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
 * Natijalarni bitta tekis roʻyxatga yigʻamiz — klaviatura bilan yuqoriga/
 * pastga yurish uchun kategoriya, brend va mahsulotlar yagona indeksga
 * ega boʻlishi kerak.
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
 * Oʻzbek matnida `oʻ` va `gʻ` uchun toʻgʻri belgi — ʻ (U+02BB), tutuq
 * belgisi uchun ʼ (U+02BC). Lekin KLAVIATURADA ularning ikkalasi ham
 * yoʻq: mijoz `'` (U+0027) yozadi, Word `’` (U+2019) ga aylantiradi,
 * eski maʼlumotlarda `‘` (U+2018) uchraydi, baʼzan ` yoki ´ ham.
 *
 * Natijada qidiruv jimgina ishlamaydi: bazadagi nom "Qoʻshimcha
 * batareya", mijoz "qoʻshimcha" deb yozadi va `ilike` MOS KELMAYDI —
 * doʻkon mahsuloti bor, lekin uni topib boʻlmaydi. Bu eng yomon
 * turdagi xato: hech qanday xato xabari yoʻq, shunchaki "topilmadi".
 */
const APOSTROPHE_CLASS = /['‘’ʻʼ`´′]/g;

/** Kanonik belgi — JS tomonidagi solishtirishlar uchun. */
const CANONICAL = 'ʼ';

/**
 * Barcha apostrof variantlarini bittaga keltiradi.
 *
 * UZUNLIK OʻZGARMAYDI — har bir belgi bitta belgiga almashadi. Bu
 * `splitHighlight` uchun SHART: u normallashtirilgan matnda indeks
 * topib, ASL matndan boʻlak qirqadi. Uzunlik farq qilsa ajratib
 * koʻrsatish bir-ikki harfga surilib ketardi.
 */
export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHE_CLASS, CANONICAL);
}

/**
 * Apostroflarni BUTUNLAY olib tashlaydi (slug uchun).
 *
 * `normalizeApostrophes` dan farqi — u belgini saqlaydi, bu esa oʻchiradi.
 * Ikkalasi ham AYNI `APOSTROPHE_CLASS` ga tayanadi va shu muhim: "apostrof
 * nima?" degan savolga ilovada faqat BITTA javob boʻlishi kerak. Ilgari
 * javob ikkita edi — qidiruv bir xil, slug generatori boshqacha oʻylardi.
 */
export function stripApostrophes(value: string): string {
  return value.replace(APOSTROPHE_CLASS, '');
}

/**
 * `ilike` uchun naqsh: `%…%`, apostroflar `_` bilan almashtirilgan.
 *
 * NEGA `_`, normalizatsiya emas? Chunki solishtirish JSʼda emas,
 * POSTGRESʼda bajariladi va bazadagi ustun qiymatini mijoz tomonidan
 * normallashtirib boʻlmaydi. `_` esa LIKEʼning "aynan bitta istalgan
 * belgi" jokeri — `qo_shimcha` naqshi `qoʻshimcha`, `qoʻshimcha` va
 * `qoʻshimcha` ning uchalasiga ham mos keladi.
 *
 * Tartib MUHIM: avval `escapeLike` (u `_` ni `\_` ga qochiradi va shu
 * bilan mijoz yozgan haqiqiy `_` joker boʻlib ketmaydi), keyin
 * apostroflarni `_` ga aylantiramiz — ular qochirilmaydi, yaʼni joker
 * boʻlib qoladi. Teskari tartibda oʻz jokerimizni oʻzimiz oʻchirардик.
 *
 * Yon taʼsiri: `qo_shimcha` nazariy jihatdan `qoxshimcha` ga ham mos
 * keladi. Bu qabul qilinadi — bu qidiruv taklifi, xavfsizlik chegarasi
 * emas, va bunday soʻz amalda uchramaydi.
 */
export function likePattern(value: string): string {
  return `%${escapeLike(value).replace(APOSTROPHE_CLASS, '_')}%`;
}

/**
 * `.or('name.ilike.%q%,sku.ilike.%q%')` ichida ishlatish uchun xavfsiz matn.
 *
 * PostgRESTʼning `or=` sintaksisida `,` shartlarni AJRATADI, `(` va `)`
 * esa ularni GURUHLAYDI. Foydalanuvchi qidiruviga shu belgilar tushsa,
 * filtr butunlay boshqa maʼnoga ega boʻlib qoladi — yaxshi holatda
 * "400 Bad Request", yomon holatda esa kutilmagan shartlar bilan
 * maʼlumot qaytaradi. Bu — filtr inʼyeksiyasi.
 *
 * Nuqta ham olib tashlanadi: `ustun.operator.qiymat` uchburchagida u
 * ajratuvchi rol oʻynaydi.
 *
 * LIKE joker belgilari (`%`, `_`) alohida `escapeLike` bilan qochiriladi.
 */
export function sanitizeOrFilterTerm(value: string): string {
  return escapeLike(value.replace(/[,()."']/g, ' ').replace(/\s+/g, ' ').trim());
}

// Bir sessiya davomida bir xil soʻrovni qayta-qayta bazadan soʻramaslik uchun
// yengil cache (spec 14: "oldingi search natijalarini kerak boʻlsa cache qil").
const resultCache = new Map<string, SearchResults>();

/**
 * Live search — kategoriyalar, brendlar (products.brand ustunidagi
 * takrorlanmas qiymatlar) va mahsulotlarni bitta debounced soʻrov toʻplami
 * bilan qaytaradi. FAKE maʼlumot yoʻq — hammasi mavjud Supabase jadvallaridan.
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
  /** "Qayta urinish" bosilganda oʻzgaradi va effektni qaytadan ishga tushiradi. */
  const [attempt, setAttempt] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(false);
      // Boʻsh soʻrov — bekor qilingan javob eski natijani yozib
      // qoʻymasligi uchun hisoblagichni oshiramiz.
      requestIdRef.current++;
      return;
    }

    const cacheKey = query.toLowerCase();
    // Qayta urinishda keshdan emas, bazadan olamiz — aks holda "qayta
    // urinish" tugmasi hech narsa qilmagandek koʻrinardi.
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

        // Bu javob eskirgan boʻlsa (foydalanuvchi allaqachon keyingi harfni
        // yozgan boʻlsa) eʼtiborsiz qoldiramiz — natijalar aralashib
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
         * Ilgari bu yerda `catch` UMUMAN YOʻQ edi — faqat `finally`.
         *
         * Tarmoq uzilganda soʻrov rad etilar, xato hech kim ushlamagan
         * "promise rejection" boʻlib konsolga tushar, foydalanuvchi esa
         * spinner oʻchgan boʻsh roʻyxatga qarab "hech narsa topilmadi"
         * deb oʻylardi. Endi haqiqiy xato holati bor va UI qayta urinish
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

/** Qidirilgan soʻzga mos qismni ajratib koʻrsatish uchun matnni boʻlaklarga boʻladi. */
export function splitHighlight(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  /*
   * Solishtirish NORMALLASHTIRILGAN matnda, boʻlaklar esa ASL matndan
   * qirqiladi. Aks holda mijoz "qoʻshimcha" deb yozganda bazadagi
   * "qoʻshimcha" topilardi (naqsh `_` bilan), lekin ajratib koʻrsatish
   * ishlamasdi — natija roʻyxatida qalin qism umuman chiqmasdi.
   *
   * `normalizeApostrophes` uzunlikni saqlaydi, shuning uchun bu yerda
   * topilgan indeks asl matnda ham toʻgʻri joyni koʻrsatadi.
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
