import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Link } from './router';
import type { Banner, Category, Product, Promotion } from './types';
import { ProductCard, ProductGrid, ProductGridSkeleton, ErrorState, SpotlightCard, productGridClass } from './ProductCard';
import { ProductCarousel } from './ProductCarousel';
import { CountdownTimer } from './CountdownTimer';
import { SectionHeader } from './SectionHeader';
import { LayoutGrid, ArrowRight, Flame, Sparkles, TrendingUp, Loader2 } from 'lucide-react';
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
import { button, card, cx, focusRing, shell, skeleton } from './design';
import { Img } from './Img';
import { HeroShowcase } from './HeroShowcase';

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

  const showPromo = !!activePromo && promoProducts.length > 0 && !promoExpired;
  const storeName = settings?.store_name?.trim() || 'OpenShop';

  return (
    <div className={cx(shell, 'py-4 pb-6 lg:py-6')}>
      {/*
        Bosh sahifada `<h1>` UMUMAN YO'Q edi.
        (Tekshirildi: `document.querySelectorAll('h1').length === 0`.)

        Bu ikki tomondan zarar: skrinrider foydalanuvchisi sahifaning nima
        ekanini bilmaydi va sarlavhalar ierarxiyasi darhol `<h2>` dan
        boshlanadi; qidiruv tizimi esa saytning eng muhim sahifasida
        asosiy sarlavhani topa olmaydi.

        Sarlavha KO'RINMAYDI — hero ataylab faqat rasmdan iborat va u
        yerga matn qo'yish dizaynni buzadi. `sr-only` esa aynan shu holat
        uchun: mazmun yordamchi texnologiyalar uchun bor, ko'z uchun yo'q.
      */}
      <h1 className="sr-only">
        {storeName} — Oʻzbekistondagi online-doʻkon: telefonlar, noutbuklar, audio va maishiy texnika
      </h1>

      {/* ── Hero: FAQAT rasm ─────────────────────────────────────── */}
      {loading ? (
        /* Skeleton balandligi HeroShowcase bilan AYNAN bir xil — aks
           holda yuklanish tugagach sahifa sakrardi (CLS). */
        <div
          className={cx(
            'w-full rounded-surface',
            'h-[clamp(21rem,64vw+5rem,26rem)] tab:h-[clamp(24rem,42vw+6rem,30rem)] lg:h-[clamp(28rem,34vw+8rem,34rem)]',
            // `lg:max-h-[62vh]` HeroShowcase bilan bir xil boʻlishi shart —
            // aks holda yuklanish tugagach past ekranlarda sahifa sakraydi.
            'lg:max-h-[62vh]',
            skeleton
          )}
        />
      ) : banners.length > 0 ? (
        <HeroShowcase banners={banners} />
      ) : (
        /*
         * Banner yoʻq boʻlsa ilgari bu yerda UMUMAN hech narsa
         * chizilmasdi va bosh sahifa toʻgʻridan-toʻgʻri kategoriya
         * lentasidan boshlanardi — yangi yoki sozlanmagan doʻkon
         * birinchi ekranda boʻm-boʻsh koʻrinardi. Endi doʻkon oʻz
         * nomi va taklifi bilan ochiladi; rasm talab qilinmaydi,
         * shuning uchun u har doim ishlaydi.
         */
        <FallbackHero storeName={storeName} />
      )}

      {/* ── Kategoriyalar ────────────────────────────────────────── */}
      {categories.length > 0 && (
        <nav aria-label="Kategoriyalar" className="mt-5">
          {/* Mobil: ikonka lentasi */}
          <div className="no-scrollbar snap-x-start -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 md:hidden">
            {categories.slice(0, 12).map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                /*
                  Bosishga javob — sensorli qurilmada bu yagona qaytar
                  aloqa (hover yoʻq). CSS `active:` yetarli: JS kerak emas,
                  `prefers-reduced-motion` esa global qoida bilan
                  oʻtish vaqtini nolga tushiradi.
                */
                className={cx(
                  'flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 rounded-control',
                  'transition-transform duration-150 ease-standard active:scale-95',
                  focusRing
                )}
                aria-current={undefined}
              >
                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-ink-200 bg-white">
                  {c.image_url ? (
                    <Img src={c.image_url} alt="" className="h-full w-full" sizes="56px" iconClassName="h-5 w-5" />
                  ) : (
                    <LayoutGrid className="h-5 w-5 text-ink-400" />
                  )}
                </span>
                <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-ink-700">
                  {c.name}
                </span>
              </Link>
            ))}
          </div>

          {/*
            Planshet/desktop: kartalar.

            `tab` da 5 ustun va kattaroq ikonka — 820–1023px oralig'ida
            4 ustunli tor kartalar kenglikni behuda sarflardi.
          */}
          <div className="hidden gap-3 md:grid md:grid-cols-4 tab:grid-cols-5 tab:gap-4 lg:grid-cols-6 xl:grid-cols-8">
            {categories.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className={cx(
                  card,
                  'group flex items-center gap-2.5 p-2.5 transition-[border-color,box-shadow] hover:border-ink-300 hover:shadow-card',
                  // Planshetda kartalar vertikal — kengroq ikonka va
                  // markazlashgan matn. `lg` da yana ixcham gorizontal
                  // koʻrinishga qaytadi, chunki u yerda 6–8 ustun bor.
                  'tab:flex-col tab:items-center tab:gap-2 tab:p-4 lg:flex-row lg:items-center lg:gap-2.5 lg:p-2.5',
                  'transition-transform duration-150 ease-standard active:scale-[0.97]',
                  focusRing
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-50 tab:h-14 tab:w-14 tab:rounded-full lg:h-10 lg:w-10 lg:rounded-control">
                  {c.image_url ? (
                    <Img src={c.image_url} alt="" className="h-full w-full" sizes="56px" iconClassName="h-5 w-5" />
                  ) : (
                    <LayoutGrid className="h-4 w-4 text-ink-400 tab:h-5 tab:w-5 lg:h-4 lg:w-4" />
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-medium leading-tight text-ink-800 tab:text-center tab:text-sm lg:text-left lg:text-xs">
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* ── Aksiya ───────────────────────────────────────────────── */}
      {showPromo && activePromo && (
        <AnimatedSection className="mt-8 md:mt-12">
          <PromoSection
            promo={activePromo}
            products={promoProducts}
            highlighted={highlighted === SECTION.promo}
            onExpire={() => setPromoExpired(true)}
          />
        </AnimatedSection>
      )}

      {/* ── Hozir trendda ────────────────────────────────────────── */}
      {trending.length > 0 && (
        <AnimatedSection className="mt-8 md:mt-12">
          <section aria-labelledby="trending-heading">
            <SectionHeader
              id="trending-heading"
              eyebrow="Koʻp koʻrilgan"
              eyebrowIcon={Flame}
              title="Hozir trendda"
              subtitle="Xaridorlar hozir eng koʻp ochayotgan mahsulotlar"
              actionHref="/catalog"
              actionLabel="Butun katalog"
            />
            {/*
              EDITORIAL KOMPOZITSIYA — ataylab boshqa bo'limlarga o'xshamaydi.

              Telefon: bitta spotlight + qolganlari karusel (barmoq uchun
              eng qulay shakl).
              `tab` dan boshlab: chapda katta spotlight, o'ngda 4 ta oddiy
              karta 2×2 bo'lib turadi — ya'ni bir xil o'lchamdagi kartalar
              qatori o'rniga aniq ierarxiya paydo bo'ladi.
            */}
            <div className="mt-5 tab:grid tab:grid-cols-3 tab:gap-5">
              <div className="tab:col-span-1">
                <SpotlightCard product={trending[0]} priority />
              </div>

              {/* Planshet/desktop: qo'llab-quvvatlovchi kartalar */}
              <div className="mt-4 hidden tab:col-span-2 tab:mt-0 tab:grid tab:grid-cols-2 tab:gap-5">
                {trending.slice(1, 5).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              {/* Telefon: qolganlari surib ko'riladi */}
              <div className="mt-4 tab:hidden">
                <ProductCarousel
                  products={trending.slice(1)}
                  seeAllHref="/catalog"
                  seeAllLabel="Butun katalogni koʻrish"
                  ariaLabel="Hozir trenddagi boshqa mahsulotlar"
                />
              </div>
            </div>
          </section>
        </AnimatedSection>
      )}

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
  );
}


/**
 * Banner boʻlmaganda koʻrsatiladigan hero.
 *
 * Ataylab RASMSIZ: doʻkon hali sozlanmagan boʻlishi mumkin, shuning uchun
 * bu blok hech qanday yuklangan kontentga bogʻliq emas va har doim
 * ishlaydi. Fon — bitta CSS gradient (rasm ham, blur ham, zarracha effekt
 * ham yoʻq), shuning uchun u oʻrta darajali telefonda ham tekin.
 *
 * Ranglar mavjud identikadan: toʻq neytral yuza (`ink-900` — aynan aksiya
 * boʻlimidagi kabi) va yagona brend urgʻusi (toʻq sariq).
 */
function FallbackHero({ storeName }: { storeName: string }) {
  const reduce = useReducedMotion();
  /*
   * Kirish xoreografiyasi — STORY darajasi, lekin mazmun KUTMAYDI:
   * har bir qator oʻz joyida turadi va faqat ustidan yumshoq
   * ochiladi. Kechikishlar kichik (0.06s qadam), shuning uchun
   * butun ketma-ketlik ~0.35s ichida tugaydi.
   */
  const line = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { ...MOTION.story, duration: 0.5, delay: reduce ? 0 : delay },
  });

  return (
    <section className="relative isolate overflow-hidden rounded-surface bg-ink-900">
      {/*
        Ichki nur — matn va CTA ortidan "to'kiladi".

        Ilgari bu yerda ikkita QIMIRLAMAS blur dog'i turardi. Endi ular
        `AuroraBackground` ichida va juda sekin suzadi: ranglar ham,
        joylashuv ham o'sha-o'sha, faqat fon endi qotib qolmagan.
      */}
      <AuroraBackground />

      <div className="relative px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20">
        {/* Nuqta — Sparkles ikonkasi o'rniga. Sokinroq va urg'u rangini
            aynan NUR sifatida ko'rsatadi. */}
        <motion.p
          {...line(0)}
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-400"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.9)]" />
          {storeName}
        </motion.p>

        <motion.p
          {...line(0.06)}
          className="mt-3 max-w-[17rem] text-display-md text-white sm:max-w-xl sm:text-display-lg lg:max-w-3xl lg:text-[3.5rem] lg:leading-[1.05] lg:tracking-[-0.03em]"
        >
          Texnika va kundalik hayot uchun kerakli hamma narsa
        </motion.p>

        <motion.p
          {...line(0.12)}
          className="mt-3 max-w-sm text-sm leading-relaxed text-white/65 sm:max-w-md sm:text-base lg:max-w-xl lg:text-lg"
        >
          Rasmiy kafolat, halol narx va Oʻzbekiston boʻylab tez yetkazib berish.
        </motion.p>

        <motion.div {...line(0.18)} className="mt-6 flex flex-wrap gap-3 sm:mt-8">
          <Link
            to="/catalog"
            className={cx(button('primary', 'lg'), 'shadow-[0_8px_24px_-8px_rgba(234,97,0,0.9)]')}
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
    </section>
  );
}

/* ── Aksiya boʻlimi ──────────────────────────────────────────────── */

/**
 * Aksiya boʻlimi qolgan boʻlimlardan vizual jihatdan ajralib turishi kerak,
 * lekin YANGI rang kiritmasdan: toʻq neytral fon + mavjud brend toʻq sariq
 * urgʻusi. Shu bilan u "boshqa sayt"dek emas, xuddi shu saytning kuchaytirilgan
 * bloki boʻlib koʻrinadi.
 */
function PromoSection({
  promo, products, highlighted, onExpire,
}: {
  promo: Promotion;
  products: Product[];
  highlighted: boolean;
  onExpire: () => void;
}) {
  return (
    <section
      id={SECTION.promo}
      aria-labelledby="promo-heading"
      className={cx(
        'relative isolate scroll-mt-28 overflow-hidden rounded-surface bg-ink-900 p-5 transition-shadow duration-500 sm:p-7 lg:p-9',
        highlighted && 'ring-2 ring-orange-500 ring-offset-4 ring-offset-ink-50'
      )}
    >
      {/*
        Aksiya bloki "voqea"ga o'xshashi kerak, shunchaki to'q qutiga emas.
        Nur qatlami `-z-10` da, matn ustiga tushmaydi va hech qanday
        `fixed` elementni o'ramaydi (bo'limda `isolate` bor, shuning
        uchun manfiy z-index shu blokdan tashqariga chiqmaydi).

        Hero bilan AYNI komponent: ikkala to'q yuza bir xil tilda
        nafas oladi.
      */}
      <AuroraBackground />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-400">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 ring-1 ring-orange-500/40"
            >
              <Flame className="h-3 w-3" />
            </span>
            Aksiya
          </p>
          <h2
            id="promo-heading"
            className="mt-2 text-display-sm text-white md:text-display-md lg:text-[2.25rem] lg:leading-[1.12]"
          >
            {promo.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">
            {promo.description?.trim() || `Cheklangan muddat — ${promo.discount_percentage}% gacha chegirma`}
          </p>
        </div>

        {/* Sanoq — blokning ikkinchi vizual tayanchi, shuning uchun u
            o'z "yuzasi"da turadi va shunchaki matn bo'lib qolmaydi. */}
        <div className="flex flex-col items-start gap-2 rounded-card border border-white/10 bg-white/[0.06] p-3 sm:items-end sm:p-4">
          {promo.end_date && (
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/45">Tugashiga qoldi</span>
          )}
          <CountdownTimer endDate={promo.end_date} onExpire={onExpire} tone="light" />
        </div>
      </div>

      <div className="mt-5">
        <ProductCarousel
          products={products}
          seeAllHref="/promotions"
          seeAllLabel="Barcha aksiyalarni koʻrish"
          ariaLabel="Aksiyadagi mahsulotlar"
        />
      </div>

      <Link to="/promotions" className={cx(button('primary', 'md'), 'mt-4 w-full sm:hidden')}>
        Barchasini koʻrish <ArrowRight className="h-4 w-4" />
      </Link>
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
    <AnimatedSection className="mt-8 md:mt-12">
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
