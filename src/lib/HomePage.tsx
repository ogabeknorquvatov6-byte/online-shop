import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Link } from './router';
import type { Banner, Category, Product, Promotion } from './types';
import { ProductCard, ProductGrid, ProductGridSkeleton, ErrorState, SpotlightCard, productGridClass } from './ProductCard';
import { ProductCarousel } from './ProductCarousel';
import { SectionHeader } from './SectionHeader';
import {
  ArrowRight, Flame, Sparkles, TrendingUp, Loader2, Truck, RotateCcw, ShieldCheck,
} from 'lucide-react';
import {
  PRODUCT_SELECT, adaptProducts, adaptBanner, adaptPromotion, fetchPromoDiscountMap,
  BANNER_SELECT, PROMOTION_SELECT,
  type ProductRow, type BannerRow, type PromotionRow,
} from './adapters';
import { fetchCategories } from './catalogData';
import { useSettings } from './settings';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedSection } from './AnimatedPrimitives';
import { AuroraBackground } from './AuroraBackground';
import { MOTION } from './motion';
import { useSeo, useSiteJsonLd } from './seo';
import { SECTION, consumeSection, scrollToSection, type SectionId } from './sections';
import { button, card, cx, darkBand, focusRing, shell, skeleton } from './design';
import { Img } from './Img';
import { PromoStage } from './PromoStage';

const PAGE_FIRST = 12;
const PAGE_STEP = 8;
const PROMO_LIMIT = 12;
const TRENDING_LIMIT = 12;

/* ── "Yana koʻrish" bilan ishlaydigan roʻyxat ────────────────────────
 * Boʻlim boshida PAGE_FIRST ta mahsulot, keyin har bosishda PAGE_STEP ta
 * qoʻshiladi. Mavjud mahsulotlar tugaganda tugma yoʻqoladi.
 */
function useIncrementalProducts(orderColumn: 'sales_count' | 'created_at') {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const fetchRange = useCallback(
    async (from: number, to: number) => {
      const [res, promoMap] = await Promise.all([
        supabase
          .from('products')
          .select(PRODUCT_SELECT, { count: 'exact' })
          .eq('is_active', true)
          .order(orderColumn, { ascending: false })
          // Barqaror tartib: ikkilamchi kalitsiz bir xil qiymatli mahsulotlar
          // keyingi "sahifa"da takrorlanib qolishi mumkin.
          .order('id', { ascending: true })
          .range(from, to),
        fetchPromoDiscountMap(supabase),
      ]);
      if (res.error) throw res.error;
      return { items: adaptProducts(res.data ?? [], promoMap), count: res.count ?? 0 };
    },
    [orderColumn]
  );

  const loadFirst = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchRange(0, PAGE_FIRST - 1)
      .then(({ items, count }) => {
        if (cancelled) return;
        setProducts(items);
        setTotal(count);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [fetchRange]);

  useEffect(() => loadFirst(), [loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const from = products.length;
      const { items, count } = await fetchRange(from, from + PAGE_STEP - 1);
      setTotal(count);
      // Takrorlanishdan himoya — tarmoq javoblari kechikkanda ham.
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...items.filter((p) => !seen.has(p.id))];
      });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [products.length, fetchRange, loadingMore]);

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore: products.length < total,
    loadMore,
    retry: loadFirst,
  };
}

export function HomePage() {
  const { settings } = useSettings();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promoProducts, setPromoProducts] = useState<Product[]>([]);
  /*
   * "Hozir trendda" — HAQIQIY `products.view_count` boʻyicha.
   *
   * Nega "Bugun" emas? Chunki bunday maʼlumot yoʻq: `view_count` —
   * umrbod hisoblagich (migratsiya `20260816030000`), unda vaqt belgisi
   * yoʻq, `best_selling_products()` esa butun tarix boʻyicha yigʻadi.
   * Sarlavhada "bugun" deyish — oʻylab topilgan daʼvo boʻlardi, shuning
   * uchun boʻlim koʻrilishlar boʻyicha nomlanadi va shunday nomlanadi.
   *
   * `.gt('view_count', 0)` MUHIM: hech kim hech narsa koʻrmagan doʻkonda
   * "trend" tartibi tasodifiy boʻlardi. Bunday holda soʻrov boʻsh qaytadi
   * va boʻlim umuman chizilmaydi — yaʼni signal boʻlmasa, daʼvo ham yoʻq.
   */
  const [trending, setTrending] = useState<Product[]>([]);
  const [activePromo, setActivePromo] = useState<Promotion | null>(null);
  const [promoExpired, setPromoExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [highlighted, setHighlighted] = useState<SectionId | null>(null);

  const bestsellers = useIncrementalProducts('sales_count');
  const fresh = useIncrementalProducts('created_at');

  useSeo({
    description:
      "OpenShop — telefonlar, noutbuklar, audio va maishiy texnika. Rasmiy kafolat, Oʻzbekiston boʻylab tez yetkazib berish va qulay narxlar.",
    canonicalPath: '/',
  });

  /*
   * Organization + WebSite strukturaviy maʼlumoti FAQAT bosh sahifada.
   * Uni har bir sahifada takrorlash Google uchun foyda bermaydi, lekin
   * har bir sahifada ortiqcha JSON-LD bloki hosil qiladi.
   */
  useSiteJsonLd({
    name: settings?.store_name?.trim() || 'OpenShop',
    logo: settings?.logo_url ?? null,
    phone: settings?.phone ?? null,
  });

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [{ data: b }, cats, { data: promos }, trendingRes] = await Promise.all([
          supabase.from('banners').select(BANNER_SELECT).eq('is_active', true).order('sort_order').returns<BannerRow[]>(),
          fetchCategories(),
          supabase
            .from('promotions')
            .select(PROMOTION_SELECT)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .returns<PromotionRow[]>(),
          supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('is_active', true)
            .gt('view_count', 0)
            .order('view_count', { ascending: false })
            .order('id', { ascending: true })
            .limit(TRENDING_LIMIT)
            .returns<ProductRow[]>(),
        ]);

        setBanners((b ?? []).map(adaptBanner));
        setCategories(cats);

        // Trend boʻlimi chegirma xaritasidan mustaqil — u aksiya narxini
        // emas, eʼtiborni koʻrsatadi. Narxlar odatdagidek adapterdan keladi.
        setTrending(adaptProducts(trendingRes.data ?? [], {}));

        const now = Date.now();
        const live = (promos ?? []).find((p) => !p.ends_at || new Date(p.ends_at).getTime() > now);
        if (live) {
          setActivePromo(adaptPromotion(live));
          setPromoExpired(false);
          const { data: pp } = await supabase
            .from('promotion_products')
            .select(`product:products(${PRODUCT_SELECT})`)
            .eq('promotion_id', live.id)
            .limit(PROMO_LIMIT)
            .returns<{ product: ProductRow | null }[]>();
          const percent = live.discount_percent;
          const raw = (pp ?? [])
            .map((r) => r.product)
            .filter((p): p is ProductRow => Boolean(p) && p!.is_active !== false);
          setPromoProducts(adaptProducts(raw, Object.fromEntries(raw.map((p) => [p.id, percent]))));
        } else {
          setActivePromo(null);
          setPromoProducts([]);
        }
        setLoading(false);
      } catch {
        setLoadError(true);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  /*
   * Menyudan «Aksiya» / «Xit» / «Yangi» bosilganda bu yerga kelinadi.
   * Kontent yuklanib boʻlgandan keyin scroll qilamiz — aks holda boʻlim
   * balandligi hali 0 boʻlib, notoʻgʻri joyga sakrab tushardi.
   */
  useEffect(() => {
    if (loading) return;
    const target = consumeSection();
    if (!target) return;
    const raf = requestAnimationFrame(() => {
      if (scrollToSection(target)) {
        setHighlighted(target);
        setTimeout(() => setHighlighted(null), 1600);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  if (loadError) {
    return (
      <div className={cx(shell, 'py-10')}>
        <ErrorState message="Bosh sahifani yuklab boʻlmadi" onRetry={load} />
      </div>
    );
  }

  /*
   * `!promoExpired` bu SHARTDA ATAYLAB YOʻQ.
   *
   * Taymer foydalanuvchi sahifada turganda nolga yetsa, blok
   * yoʻqolmaydi — u "Aksiya yakunlandi" holatiga oʻtadi. Kartalarni
   * oʻsha holda qoldirish yolgʻon vaʼda boʻlardi, blokni jimgina
   * oʻchirib yuborish esa sahifani foydalanuvchi koʻz oldida
   * sakratardi.
   *
   * KEYINGI yuklanishda blok umuman boʻlmaydi: `activePromo` soʻrovi
   * `ends_at > now` boʻyicha filtrlaydi, yaʼni tugagan aksiya
   * `null` qaytaradi.
   */
  const showPromo = !!activePromo && promoProducts.length > 0;
  const storeName = settings?.store_name?.trim() || 'OpenShop';

  return (
    /*
      Sahifa UCH qismdan iborat: `shell` → chetdan-chetga tasma → `shell`.

      "Hozir trendda" bloki butun kenglikni egallashi kerak, `shell` esa
      max-width va yon toʻldirish beradi. Uni ICHKARIDAN kengaytirish
      uchun `w-screen` + `translateX(-50%)` kerak boʻlardi — lekin
      transform oʻz ichidagi barcha fixed elementlar uchun "containing
      block" yaratadi (`pageVariants` izohida tasvirlangan nuqson) va
      `w-screen` gorizontal scrollbar hosil qiladi.

      Shuning uchun tasma shunchaki `shell` dan TASHQARIDA turadi —
      hech qanday hiyla kerak emas.
    */
    <>
      <div className={cx(shell, 'py-4 lg:py-6')}>
      {/*
        Yashirin `<h1>` OLIB TASHLANDI.

        U hero faqat rasmdan iborat boʻlgan davrdan qolgan edi: sahifada
        koʻrinadigan sarlavha yoʻqligi uchun `sr-only` sarlavha
        qoʻyilgandi. Endi hero oʻz sarlavhasini KOʻRSATADI, yaʼni
        ikkinchisi ortiqcha — va ikkita `<h1>` skrinrider uchun
        sahifaning "mavzusi" ikkita degan maʼnoni berardi.
      */}

      {/* ── Hero ─────────────────────────────────────────────────── */}
      {loading ? (
        /* Skeleton balandligi hero bilan AYNAN bir xil — aks holda
           yuklanish tugagach sahifa sakrardi (CLS). */
        <div
          className={cx(
            'w-full rounded-surface',
            'h-[clamp(21rem,64vw+5rem,26rem)] tab:h-[clamp(24rem,42vw+6rem,30rem)] lg:h-[clamp(28rem,34vw+8rem,34rem)]',
            'lg:max-h-[62vh]',
            skeleton
          )}
        />
      ) : (
        /*
         * Hero HAR DOIM bitta kompozitsiya — dizayndagi toʻq blok:
         * ustki yozuv, uch qatorli sarlavha, taklif va ikkita amal.
         *
         * Banner bor boʻlsa uning RASMI yon tomonda koʻrsatiladi;
         * boʻlmasa blok rasmsiz ishlayveradi. Ilgari bu yerda ikkita
         * butunlay boshqa hero bor edi (karusel yoki zaxira blok) va
         * doʻkon banner qoʻshgan/oʻchirgan zahoti bosh sahifaning
         * birinchi ekrani tanib boʻlmas darajada oʻzgarardi.
         */
        <Hero storeName={storeName} banner={banners[0] ?? null} />
      )}

      {/* ── Ishonch plitkalari ───────────────────────────────────── */}
      <TrustTiles />

      {/* ── Kategoriyalar ────────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="mt-6 md:mt-9" aria-labelledby="categories-heading">
          <SectionHeader
            id="categories-heading"
            eyebrow="Katalog"
            title="Kategoriyalar"
            actionHref="/catalog"
            actionLabel="Barchasi"
          />
          <CategoryStrip categories={categories} />
        </section>
      )}

      </div>


      {/* ── Hozir trendda — chetdan-chetga studiya tasmasi ────────── */}
      {trending.length > 0 && (
        <AnimatedSection className="mt-6 md:mt-9">
          {/*
            Aksiya bloki bilan AYNI yuza (`glassBand`) — ikkalasi ham
            chetdan-chetga ochiq shisha tasma. Ular sahifada ketma-ket
            turadi, shuning uchun farq MAZMUNDA boʻlishi kerak, yuzada
            emas.
          */}
          <section aria-labelledby="trending-heading" className={darkBand}>
            <AuroraBackground />
            <div className={cx(shell, 'py-8 md:py-12')}>
              <SectionHeader
                id="trending-heading"
                eyebrow="Koʻp koʻrilgan"
                eyebrowIcon={Flame}
                title="Hozir trendda"
                subtitle="Xaridorlar hozir eng koʻp ochayotgan mahsulotlar"
                actionHref="/catalog"
                actionLabel="Butun katalog"
                tone="onDark"
              />
              {/*
                EDITORIAL KOMPOZITSIYA — ataylab boshqa boʻlimlarga
                oʻxshamaydi. Telefon: bitta spotlight + qolganlari
                karusel. `tab` dan boshlab: chapda katta spotlight,
                oʻngda 4 ta oddiy karta 2×2.
              */}
              <div className="mt-5 tab:grid tab:grid-cols-3 tab:gap-5">
                <div className="tab:col-span-1">
                  <SpotlightCard product={trending[0]} priority />
                </div>

                <div className="mt-4 hidden tab:col-span-2 tab:mt-0 tab:grid tab:grid-cols-2 tab:gap-5">
                  {trending.slice(1, 5).map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>

                <div className="mt-4 tab:hidden">
                  <ProductCarousel
                    products={trending.slice(1)}
                    seeAllHref="/catalog"
                    seeAllLabel="Butun katalogni koʻrish"
                    ariaLabel="Hozir trenddagi boshqa mahsulotlar"
                  />
                </div>
              </div>
            </div>
          </section>
        </AnimatedSection>
      )}

      <div className={cx(shell, 'pb-6')}>
      {/* ── Xit mahsulotlar ──────────────────────────────────────── */}
      <LoadMoreSection
        id={SECTION.bestsellers}
        eyebrow="Eng koʻp sotilgan"
        eyebrowIcon={TrendingUp}
        title="Xit mahsulotlar"
        subtitle="Xaridorlar eng koʻp tanlaydigan mahsulotlar"
        state={bestsellers}
        seeAllHref="/bestsellers"
        highlighted={highlighted === SECTION.bestsellers}
      />

      </div>

      {/* ── Aksiya — chetdan-chetga sahna ────────────────────────── */}
      {showPromo && activePromo && (
        <AnimatedSection className="mt-6 md:mt-9">
          <PromoStage
            promo={activePromo}
            products={promoProducts}
            highlighted={highlighted === SECTION.promo}
            expired={promoExpired}
            onExpire={() => setPromoExpired(true)}
          />
        </AnimatedSection>
      )}

      <div className={cx(shell, 'pb-6')}>
      {/* ── Yangi kelganlar ──────────────────────────────────────── */}
      <LoadMoreSection
        id={SECTION.fresh}
        eyebrow="Yangi kelganlar"
        eyebrowIcon={Sparkles}
        title="Yangi qoʻshilganlar"
        subtitle="Katalogga soʻnggi qoʻshilgan mahsulotlar"
        state={fresh}
        seeAllHref="/new"
        highlighted={highlighted === SECTION.fresh}
      />
      </div>
    </>
  );
}

/* ── Ishonch plitkalari ──────────────────────────────────────────── */

/**
 * Hero ostidagi uchta qisqa vaʼda.
 *
 * ── NEGA BU YERDA MATN, `[STATIC: …]` BELGISI EMAS ──────────────────
 *
 * Uchala vaʼda ham `staticPages.ts` da yozilgan shartlarning qisqa
 * takrori: `/delivery` — "Toshkent shahri: odatda 1 ish kuni ichida"
 * va "Viloyatlar: 2–3 ish kuni"; `/returns` — "14 kun ichida
 * qaytarish"; `/about` — "Har bir mahsulot rasmiy kafolat taloni
 * bilan". Yaʼni bu oʻylab topilgan daʼvo emas, mavjud siyosatning
 * sarlavhasi.
 *
 * Dizaynda ular ATAYLAB belgilanmagan (sariq punktir yoʻq) — chunki
 * bu sahifa kompozitsiyasining oʻz matni, maʼlumot emas. Ayni naqsh
 * `ProductPage` dagi ishonch blokida allaqachon ishlatilgan.
 *
 * Yetkazib berish NARXI bu yerda YOʻQ va boʻlmasligi kerak: u
 * sozlamalardan keladi va faqat `quoteDelivery` orqali koʻrsatiladi.
 */
const TRUST_TILES = [
  { icon: Truck, title: 'Toshkentda 1 kunda', body: 'Viloyatlarga 2–3 kun' },
  { icon: RotateCcw, title: '14 kun', body: 'ichida qaytarish' },
  { icon: ShieldCheck, title: 'Rasmiy', body: 'kafolat' },
] as const;

function TrustTiles() {
  return (
    <ul className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
      {TRUST_TILES.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className={cx(
            card,
            'shadow-glass',
            // Telefonda ustun (ikonka tepada), 820 dan boshlab qator —
            // tor ekranda uch ustunli gorizontal plitka matnni ikki
            // harfdan keyin sindirardi.
            'flex flex-col items-start gap-2 p-2.5 tab:flex-row tab:items-center tab:gap-3 tab:p-4'
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-700 tab:h-10 tab:w-10">
            <Icon className="h-4 w-4 tab:h-4.5 tab:w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 text-xs leading-tight text-ink-700 tab:text-sm">
            <b className="block text-sm font-semibold text-ink-900 tab:text-base">{title}</b>
            {body}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Kategoriya lentasi ──────────────────────────────────────────── */

/**
 * Yumaloq plitkalar, BARCHA oʻlchamda gorizontal suriladi.
 *
 * Ilgari ikkita alohida maket bor edi: telefonda lenta, planshet va
 * kompyuterda esa 4–8 ustunli toʻr. Ular bir xil maʼlumotni ikki xil
 * shaklda koʻrsatardi va toʻr varianti kategoriyalar sonini 8 ta bilan
 * cheklardi — 9-chisi jimgina yoʻqolardi.
 *
 * Bitta lenta har uchala oʻlchamda ishlaydi va hech qanday kategoriya
 * yoʻqolmaydi: roʻyxat uzun boʻlsa surib koʻriladi.
 *
 * Rasm boʻlmasa — 2×2 kub motivi. Bu ilovaning oʻz belgisi
 * (`CatalogCubes`, splash, 404 dagi kub tili), yaʼni neytral
 * "rasm yoʻq" ikonkasidan koʻra doʻkonning oʻziga tegishli.
 */
function CategoryStrip({ categories }: { categories: Category[] }) {
  return (
    <nav
      aria-label="Kategoriyalar"
      className="no-scrollbar snap-x-start -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:-mx-8 lg:gap-5 lg:px-8"
    >
      {categories.map((c) => (
        <Link
          key={c.id}
          to={`/category/${c.slug}`}
          className={cx(
            'flex w-[4.5rem] shrink-0 flex-col items-center gap-2 rounded-control tab:w-[6.5rem]',
            'transition-transform duration-150 ease-standard hover:-translate-y-0.5 active:scale-95',
            'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
            focusRing
          )}
        >
          <span
            className={cx(
              card,
              'flex h-16 w-16 items-center justify-center overflow-hidden rounded-full shadow-card tab:h-[5.75rem] tab:w-[5.75rem]'
            )}
          >
            {c.image_url ? (
              <Img src={c.image_url} alt="" className="h-full w-full" sizes="92px" iconClassName="h-5 w-5" />
            ) : (
              <CubeMark />
            )}
          </span>
          <span className="line-clamp-2 text-center text-xs font-medium leading-tight text-ink-800 tab:text-sm">
            {c.name}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Rasmsiz kategoriya uchun 2×2 kub — ilovaning oʻz belgisi. */
function CubeMark() {
  return (
    <span aria-hidden="true" className="relative block h-[40%] w-[40%]">
      <span className="absolute left-0 top-0 h-[44%] w-[44%] rounded-[3px] bg-orange-600" />
      <span className="absolute right-0 top-0 h-[44%] w-[44%] rounded-[3px] bg-orange-300" />
      <span className="absolute bottom-0 left-0 h-[44%] w-[44%] rounded-[3px] bg-orange-300" />
      <span className="absolute bottom-0 right-0 h-[44%] w-[44%] rounded-[3px] bg-orange-600" />
    </span>
  );
}

/**
 * ── HERO ───────────────────────────────────────────────────────────
 *
 * Toʻq blok: ustki yozuv → uch qatorli sarlavha → taklif → ikkita amal,
 * yonida rasm. Oʻlchamlar dizayn prototipida oʻlchangan:
 *   fon      ink-900          sarlavha  Onest 40px, ls −0.035em
 *   padding  28/40/56px       ustun     1fr | 1.1fr + 1fr (tab+)
 *   rasm     170/300/360px    gap       20 / 40px
 *
 * ── NEGA KARUSEL EMAS ──────────────────────────────────────────────
 *
 * Ilgari bu yerda ikkita butunlay boshqa hero bor edi: banner bor
 * boʻlsa — rasm karuseli, boʻlmasa — matnli zaxira blok. Yaʼni doʻkon
 * banner qoʻshgan yoki oʻchirgan zahoti bosh sahifaning birinchi
 * ekrani tanib boʻlmas darajada oʻzgarardi.
 *
 * Endi kompozitsiya BITTA va u har doim bir xil gapiradi. Banner
 * maʼlumoti yoʻqolmaydi — uning rasmi yon tomonda turadi; banner
 * boʻlmasa oʻsha joy shunchaki chizilmaydi.
 */
function Hero({ storeName, banner }: { storeName: string; banner: Banner | null }) {
  const reduce = useReducedMotion();

  /*
   * Kirish xoreografiyasi — STORY darajasi, lekin mazmun KUTMAYDI:
   * har bir qator oʻz joyida turadi va faqat ustidan yumshoq
   * ochiladi. Qadam 60ms, yaʼni butun ketma-ketlik ~0.36s da tugaydi.
   */
  const line = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { ...MOTION.story, delay: reduce ? 0 : delay },
  });

  const image = banner?.image_url ?? null;

  return (
    <section className="relative isolate overflow-hidden rounded-surface bg-ink-900">
      {/* Aurora — hero va aksiya bloki AYNI komponentda nafas oladi. */}
      <AuroraBackground />

      <div
        className={cx(
          'relative grid items-center gap-5 px-5 pb-5 pt-7',
          'tab:gap-10 tab:px-8 tab:py-10',
          'lg:px-14 lg:py-14',
          image && 'tab:grid-cols-[1.1fr_1fr]'
        )}
      >
        <div className="min-w-0">
          {/* Nuqta — brend rangini aynan NUR sifatida koʻrsatadi. */}
          <motion.p
            {...line(0)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-400"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.9)]"
            />
            {storeName}
          </motion.p>

          {/*
            SARLAVHA — sahifaning yagona `h1` i.

            Ilgari u `sr-only` edi va hero faqat rasmdan iborat boʻlgani
            uchun ekranda hech qanday sarlavha koʻrinmasdi. Endi u
            koʻrinadi va shu sababli alohida yashirin sarlavha ham
            kerak emas.

            Uch qator ATAYLAB alohida `span` — ular birin-ketin (60ms
            qadam) ochiladi. Uchinchi qator `orange-300` da: u
            doʻkonning asosiy vaʼdasi.
          */}
          <h1 className="mt-3.5 text-display-lg leading-[1.06] tracking-[-0.035em] text-white">
            <motion.span {...line(0.06)} className="block">Yangi texnika.</motion.span>
            <motion.span {...line(0.12)} className="block">Halol narx.</motion.span>
            <motion.span {...line(0.18)} className="block text-orange-300">
              Toshkentda&nbsp;— ertagayoq.
            </motion.span>
          </h1>

          <motion.p
            {...line(0.24)}
            className="mt-3.5 max-w-[27.5rem] text-base leading-relaxed text-white/75"
          >
            Telefonlar, noutbuklar va maishiy texnika rasmiy kafolat bilan.
            Viloyatlarga 2–3 kunda.
          </motion.p>

          <motion.div {...line(0.3)} className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/catalog"
              className={cx(
                button('primary', 'lg'),
                // Qalinlik + brend nuri: bu sahifadagi asosiy amal.
                'shadow-press shadow-[0_8px_24px_-8px_rgba(234,97,0,0.9)]'
              )}
            >
              Katalogni koʻrish <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/promotions"
              className={cx(
                button('outline', 'lg'),
                'border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15'
              )}
            >
              Aksiyalar
            </Link>
          </motion.div>
        </div>

        {/*
          Banner rasmi. Bannerning MATNI bu yerda koʻrsatilmaydi —
          sarlavha allaqachon chapda turibdi va ikkitasi bir vaqtda
          ikki xil daʼvo qilardi. Rasm esa doʻkonning oʻz mahsuloti
          va u kompozitsiyaga qoʻshimcha maʼno beradi.
        */}
        {image && (
          <motion.div
            {...line(0.24)}
            className="relative h-[10.625rem] overflow-hidden rounded-card tab:h-[18.75rem] lg:h-[22.5rem]"
          >
            <Img
              src={image}
              alt={banner?.title ?? ''}
              priority
              sizes="(min-width: 1024px) 40vw, (min-width: 820px) 45vw, 92vw"
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
            />
          </motion.div>
        )}
      </div>
    </section>
  );
}


/* ── "Yana koʻrish" boʻlimi ──────────────────────────────────────── */

function LoadMoreSection({
  id, eyebrow, eyebrowIcon, title, subtitle, state, seeAllHref, highlighted,
}: {
  id: SectionId;
  eyebrow: string;
  eyebrowIcon: typeof Sparkles;
  title: string;
  subtitle: string;
  state: ReturnType<typeof useIncrementalProducts>;
  seeAllHref: string;
  highlighted: boolean;
}) {
  const { products, loading, loadingMore, error, hasMore, loadMore, retry } = state;

  if (!loading && !error && products.length === 0) return null;

  return (
    <AnimatedSection className="mt-6 md:mt-9">
      <section
        id={id}
        aria-labelledby={`${id}-heading`}
        className={cx(
          'scroll-mt-28 rounded-surface transition-shadow duration-500',
          highlighted && 'ring-2 ring-orange-500 ring-offset-4 ring-offset-ink-50'
        )}
      >
        <SectionHeader
          id={`${id}-heading`}
          eyebrow={eyebrow}
          eyebrowIcon={eyebrowIcon}
          title={title}
          subtitle={subtitle}
          actionHref={seeAllHref}
          actionLabel="Barchasini koʻrish"
        />

        <div className="mt-5">
          {loading ? (
            <ProductGridSkeleton count={PAGE_FIRST} />
          ) : error && products.length === 0 ? (
            <ErrorState onRetry={retry} />
          ) : (
            <>
              <ProductGrid products={products} className={productGridClass} />

              {/* Yangi partiya yuklanayotganda skeleton — scroll sakramaydi */}
              {loadingMore && (
                <div className={cx(productGridClass, 'mt-3 md:mt-4')} aria-hidden="true">
                  {Array.from({ length: PAGE_STEP }).map((_, i) => (
                    <div key={i} className={cx('aspect-[3/4] rounded-card', skeleton)} />
                  ))}
                </div>
              )}

              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    className={cx(button('outline', 'lg'), 'min-w-[13rem]')}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
                      </>
                    ) : (
                      'Yana koʻrish'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </AnimatedSection>
  );
}
