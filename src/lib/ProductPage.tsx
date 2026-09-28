import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useIsVisible } from './uiHooks';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
// `DURATION`/`EASE` — tab ostidagi suriladigan nur uchun (`layoutId`).
import { springs, DURATION, EASE } from './motion';
import { Link, useRouter } from './router';
import type { Product } from './types';
import { formatPrice, discountPercent, hasSellablePrice } from './types';
import { useCart } from './cart';
import { maxQuantityFor, quantityForProduct } from './cartUtils';
import { useFavorites } from './favorites';
import { useToast } from './toast';
import { useSettings } from './settings';
import { quoteDelivery } from './delivery';
import { ErrorState } from './ProductCard';
import { ProductCarousel } from './ProductCarousel';
import { SectionHeader } from './SectionHeader';
import { socialProof, stockState, type ReviewStats } from './productUtils';
import { useSeo, useProductJsonLd, useBreadcrumbJsonLd, canonicalUrl } from './seo';
import {
  Heart, Minus, Plus, ShoppingCart, Truck, Check, ChevronRight, ChevronLeft,
  CheckCircle2, Share2, ShieldCheck, RotateCcw, Star, Package, Sparkles, TrendingUp,
} from 'lucide-react';
import { PRODUCT_SELECT, adaptProduct, adaptProducts, fetchPromoDiscountMap, type ProductRow } from './adapters';
import { ImageGallery } from './ImageGallery';
import type { ProductVariant } from './types';
import { AnimatedButton } from './AnimatedPrimitives';
import { AnimatedNumber } from './AnimatedNumber';
import { ProductReviews } from './ProductReviews';
import { button, card, cx, discountBadge, focusRing, glassPanel, shell, skeleton } from './design';
import { Img } from './Img';

const VARIANT_LABELS: Record<string, string> = {
  color: 'Rang',
  storage: 'Xotira',
  size: 'Oʻlcham',
  memory: 'Xotira',
};

export function ProductPage({ slug }: { slug: string }) {
  const { navigate } = useRouter();
  const { items, addItem } = useCart();
  const { toggle, isFavorite } = useFavorites();
  const { notify } = useToast();
  const { settings } = useSettings();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'desc' | 'specs' | 'reviews'>('desc');
  /*
   * Sharhlar yuklangach reyting va son SHU YERDAN olinadi.
   *
   * `null` — hali yuklanmagan, oʻshanda `products` jadvalidagi qiymat
   * koʻrsatiladi (u ham trigger hisoblagan, yaʼni toʻgʻri). Sharh
   * yuborilgach `ProductReviews` yangi statistikani qaytaradi va
   * sahifadagi yulduzcha darhol yangilanadi — toʻliq qayta yuklash
   * kerak emas.
   */
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  /*
   * Yopishqoq CTA paneli FAQAT asosiy "Savatga qoʻshish" tugmasi ekrandan
   * chiqib ketganda koʻrinadi. Ilgari u sahifa ochilishidanoq turardi va
   * ekranda bir vaqtning oʻzida ikkita bir xil tugma boʻlardi.
   */
  const [setPrimaryCta, primaryCtaVisible] = useIsVisible<HTMLButtonElement>();
  const reduce = useReducedMotion();

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setActiveImg(0);
    setQty(1);
    setSelectedVariants({});
    // Boshqa mahsulotga oʻtildi — oldingisining reytingi qolib ketmasin.
    setReviewStats(null);
    let cancelled = false;
    (async () => {
      try {
        const [{ data, error }, promoMap] = await Promise.all([
          supabase
            .from('products')
            .select(`${PRODUCT_SELECT}, categories(id,name,slug)`)
            .eq('slug', slug)
            .eq('is_active', true)
            .maybeSingle<ProductRow>(),
          fetchPromoDiscountMap(supabase),
        ]);
        if (cancelled) return;
        if (error) throw error;
        if (!data) {
          setProduct(null);
          setLoading(false);
          return;
        }

        setProduct(adaptProduct(data, promoMap[data.id]));
        setLoading(false);

        // Koʻrishlar hisoblagichi va tavsiyalar — asosiy renderʼni bloklamaydi.
        supabase.rpc('increment_product_view', { p_id: data.id });
        if (data.category_id) {
          const { data: rel } = await supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('category_id', data.category_id)
            .neq('id', data.id)
            .eq('is_active', true)
            .gt('stock', 0)
            .order('sales_count', { ascending: false })
            .limit(5);
          if (!cancelled) setRelated(adaptProducts(rel ?? [], promoMap));
        } else if (!cancelled) {
          setRelated([]);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => load(), [load]);

  /*
   * Galereya = mahsulot rasmlari + variantlarning oʻz rasmlari.
   * Rang tanlanganda shu ranga tegishli rasm galereyada tanlanadi, yaʼni
   * foydalanuvchi koʻrib turgan rasm doim tanlagan variantiga mos keladi.
   */
  const images = useMemo(() => {
    const base = [...(product?.product_images ?? [])].sort(
      (a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false) || a.sort_order - b.sort_order
    );
    const seen = new Set(base.map((i) => i.image_url));
    /*
     * `flatMap` — `filter().map()` + `!` OʻRNIGA.
     * TypeScript `.filter()` orqali `image_url` ning null emasligini
     * kuzata olmaydi, shuning uchun ilgari ikkita `!` kerak boʻlgan edi.
     * URLʼni bir marta lokal oʻzgaruvchiga olsak, tekshiruv ham, tur ham
     * tabiiy ravishda toʻgʻri boʻladi.
     */
    const extra = (product?.product_variants ?? []).flatMap((v) => {
      const url = v.image_url;
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [{ id: `variant-${v.id}`, image_url: url }];
    });
    return [...base.map((i) => ({ id: i.id, image_url: i.image_url })), ...extra];
  }, [product?.product_images, product?.product_variants]);

  // Variantlarni turlari boʻyicha guruhlaymiz. Guruh tartibi barqaror:
  // rang → xotira → oʻlcham → qolganlari.
  const variantGroups = useMemo(() => {
    const order = ['color', 'storage', 'memory', 'size'];
    const map = new Map<string, NonNullable<Product['product_variants']>>();
    for (const v of product?.product_variants ?? []) {
      if (v.is_active === false) continue;
      if (!map.has(v.type)) map.set(v.type, []);
      map.get(v.type)!.push(v);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      })
      .map(([type, values]) => ({
        type,
        label: VARIANT_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1),
        values: [...values].sort((a, b) => a.sort_order - b.sort_order),
      }));
  }, [product?.product_variants]);

  const missingVariant = variantGroups.find((g) => !selectedVariants[g.type]);
  const variantLabel = variantGroups
    .map((g) => selectedVariants[g.type])
    .filter(Boolean)
    .join(' / ');

  /*
   * Narx farqi va alohida ombor BIRINCHI guruhdagi (odatda rang)
   * variantga bogʻlanadi — server ham aynan shu ID boʻyicha hisoblaydi,
   * shuning uchun ikkalasi hech qachon ajralib ketmaydi.
   */
  const pricingVariant = useMemo(() => {
    const firstType = variantGroups[0]?.type;
    if (!firstType) return undefined;
    const value = selectedVariants[firstType];
    return variantGroups[0].values.find((v) => v.value === value);
  }, [variantGroups, selectedVariants]);

  const productPath = `/product/${slug}`;

  useSeo({
    title: product ? product.name : loading ? undefined : 'Mahsulot topilmadi',
    description: product?.description?.slice(0, 160) || (product ? `${product.name} — ${formatPrice(product.price)}. Rasmiy kafolat, tez yetkazib berish.` : undefined),
    image: images[0]?.image_url ?? null,
    type: 'product',
    pending: loading,
    canonicalPath: productPath,
    /*
     * Yuklash TUGAGANDAN keyin ham mahsulot topilmasa — `noindex`.
     *
     * Ilgari oʻchirilgan yoki notoʻgʻri slugʻli manzil oddiy sahifa
     * sifatida indekslanardi: sarlavha umumiy ("OpenShop — Online-doʻkon")
     * boʻlib qolar, canonical esa mavjud boʻlmagan mahsulotga ishora
     * qilardi. Bu qidiruv natijalarida boʻsh sahifalar toʻplanishiga
     * olib keladi.
     *
     * `loading` paytida `noindex` BERILMAYDI — aks holda haqiqiy mahsulot
     * sahifasi ham bir zumga noindex boʻlib turardi.
     */
    noindex: !loading && !product,
  });

  useProductJsonLd(
    product
      ? {
          name: product.name,
          description: product.description,
          image: images[0]?.image_url ?? null,
          sku: product.sku,
          brand: product.brand,
          price: product.price,
          inStock: product.stock > 0,
          url: canonicalUrl(productPath),
        }
      : null
  );

  /*
   * Ekrandagi "Bosh sahifa › Katalog › …" zanjiri bilan BIR XIL maʼlumot.
   * Ikkalasi bir manbadan chiqmasa, qidiruv natijasidagi zanjir sahifada
   * koʻringanidan farq qilib qoladi — bu Google uchun xato hisoblanadi.
   */
  useBreadcrumbJsonLd(
    product
      ? [
          { name: 'Bosh sahifa', path: '/' },
          { name: 'Katalog', path: '/catalog' },
          ...(product.category ? [{ name: product.category.name, path: `/category/${product.category.slug}` }] : []),
          { name: product.name, path: productPath },
        ]
      : null
  );

  if (loading) return <ProductPageSkeleton />;

  if (loadError) {
    return (
      <div className={cx(shell, 'py-14')}>
        <ErrorState message="Mahsulotni yuklab boʻlmadi" onRetry={load} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={cx(shell, 'py-16 text-center')}>
        {/*
          Ikonka brend rangida — `EmptyState` bilan bir xil uslub, shunda
          "topilmadi" holati ham do'konning o'z tilida gapiradi.
        */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-500 ring-8 ring-orange-50/50">
          <Package className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink-900">Mahsulot topilmadi</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
          Bu mahsulot sotuvdan olingan yoki havola notoʻgʻri boʻlishi mumkin.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to="/catalog" className={button('primary', 'md')}>
            Katalogga qaytish
          </Link>
          <Link to="/" className={button('outline', 'md')}>
            Bosh sahifa
          </Link>
        </div>
      </div>
    );
  }

  // Variant narx farqini hisobga olgan joriy narx.
  const price = Math.max(0, product.price + (pricingVariant?.price_adjustment ?? 0));
  const oldPrice = product.old_price != null
    ? Math.max(0, product.old_price + (pricingVariant?.price_adjustment ?? 0))
    : null;
  const discount = discountPercent(price, oldPrice);
  const fav = isFavorite(product.id);
  // Variantda alohida ombor yuritilsa — oʻsha qoldiq hal qiluvchi.
  const availableStock = pricingVariant?.stock != null ? pricingVariant.stock : product.stock;
  const stock = stockState(availableStock);
  // Narxi kiritilmagan mahsulotni sotib boʻlmaydi (bazadagi maʼlumot nuqsoni).
  const purchasable = hasSellablePrice(price);
  const inStock = stock !== 'out' && purchasable;
  const maxQty = maxQuantityFor(product, pricingVariant?.id);
  const sold = socialProof(product.sales_count);
  /*
   * Sharhlar tabi ochilgan boʻlsa — jonli qiymat, aks holda
   * `products` jadvalidagi (u ham trigger hisoblagan). Ikkalasi bir xil
   * manbadan kelib chiqadi, shuning uchun sakrash boʻlmaydi.
   */
  const reviewCount = reviewStats?.count ?? product.reviews_count;
  const reviewRating = reviewStats?.rating ?? product.rating;
  const delivery = quoteDelivery(settings, price * qty);

  /*
   * ── SAVATDAGI HAQIQIY SON ───────────────────────────────────────
   *
   * Ilgari "Savatga qoʻshish" bosilgach tugma 1.6 soniyaga "Savatga
   * qoʻshildi" boʻlib, keyin asl holiga qaytardi. Yaʼni sahifa
   * savatda NIMA borligini aytmasdi — faqat "bosildi" deb javob
   * berardi, xuddi mahsulot kartochkasidagi kabi.
   *
   * Endi manba bitta: `quantityForProduct` — mahsulot kartochkasi
   * ishlatadigan AYNI funksiya. Shu sababli bitta mahsulot
   * kartochkada 2 dona boʻlib, sahifasida boshqacha koʻrina olmaydi.
   *
   * Son BARCHA variantlarni qoʻshadi: xaridor qora va oq variantdan
   * bittadan olgan boʻlsa, sahifa 2 koʻrsatadi. Aynan shu qiymat
   * savat sahifasida ham turadi.
   */
  const inCartQty = quantityForProduct(items, product.id);

  const selectVariant = (type: string, value: string) => {
    setSelectedVariants((s) => ({ ...s, [type]: value }));
    setQty(1);
    // Tanlangan variantning rasmi boʻlsa — galereyani oʻsha rasmga oʻtkazamiz.
    const variant = variantGroups.find((g) => g.type === type)?.values.find((v) => v.value === value);
    if (variant?.image_url) {
      const idx = images.findIndex((img) => img.image_url === variant.image_url);
      if (idx >= 0) setActiveImg(idx);
    }
  };

  const ensureVariantChosen = () => {
    if (!missingVariant) return true;
    notify(`Iltimos, «${missingVariant.label}» ni tanlang.`, 'error');
    return false;
  };

  const handleAdd = () => {
    if (!inStock || !ensureVariantChosen()) return;
    addItem(product, qty, variantLabel || undefined, pricingVariant?.id);
    notify(`${product.name} savatga qoʻshildi`, 'success');
  };

  const handleBuy = () => {
    if (!inStock || !ensureVariantChosen()) return;
    addItem(product, qty, variantLabel || undefined, pricingVariant?.id);
    navigate('/checkout');
  };

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/catalog');
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, url });
        return;
      } catch {
        return; // foydalanuvchi bekor qilgan bo'lishi mumkin
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      notify('Havola nusxalandi', 'success');
    } catch {
      notify('Havolani nusxalab boʻlmadi', 'error');
    }
  };

  return (
    <div className={cx(shell, 'py-4 lg:py-8')}>
      {/* Mobil yuqori panel */}
      <div className="-mx-4 mb-3 flex items-center justify-between border-b border-ink-100 px-2 pb-2 md:hidden">
        <button onClick={goBack} aria-label="Orqaga" className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-700', focusRing)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={handleShare} aria-label="Ulashish" className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-700', focusRing)}>
            <Share2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => toggle(product.id)}
            aria-pressed={fav}
            aria-label={fav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qoʻshish'}
            className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-700', focusRing)}
          >
            <Heart className={cx('h-5 w-5', fav && 'fill-orange-600 text-orange-600')} />
          </button>
        </div>
      </div>

      <nav aria-label="Yoʻnalish" className="hidden flex-wrap items-center gap-1.5 text-sm text-ink-500 md:flex">
        <Link to="/" className={cx('rounded-sm hover:text-orange-700', focusRing)}>Bosh sahifa</Link>
        <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
        <Link to="/catalog" className={cx('rounded-sm hover:text-orange-700', focusRing)}>Katalog</Link>
        {product.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
            <Link to={`/category/${product.category.slug}`} className={cx('rounded-sm hover:text-orange-700', focusRing)}>
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
        <span className="line-clamp-1 text-ink-900">{product.name}</span>
      </nav>

      <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-10 xl:gap-14">
        {/* ── Galereya ─────────────────────────────────────────── */}
        <div className="lg:sticky lg:self-start" style={{ top: 'calc(var(--header-h) + 1rem)' }}>
          <ImageGallery
            images={images}
            alt={product.name}
            /* Telefon egilganda rasm ramka ichida suzadi — mahsulot
               "qoʻlda ushlab koʻrilayotgandek" tuyuladi. */
            parallax
            activeIndex={Math.min(activeImg, Math.max(0, images.length - 1))}
            onActiveIndexChange={setActiveImg}
            badge={discount != null ? <span className={discountBadge('md')}>−{discount}%</span> : null}
          />
        </div>

        {/* ── Ma'lumot va CTA ──────────────────────────────────── */}
        <div className="min-w-0">
          {/* Brend — `SectionHeader` bilan bir xil "urg'u chizig'i" uslubida,
              shunda mahsulot sahifasi ham bir xil tilda gapiradi. */}
          {product.brand && (
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
              <span aria-hidden="true" className="h-px w-6 shrink-0 bg-orange-400/70" />
              {product.brand}
            </p>
          )}
          <h1 className="mt-2 text-display-md text-ink-900 lg:text-display-lg">
            {product.name}
          </h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {reviewRating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-ink-900">{reviewRating.toFixed(1)}</span>
                {reviewCount > 0 && <span className="text-ink-600">· {reviewCount} sharh</span>}
              </span>
            )}
            {/*
              Ijtimoiy isbot reyting va artikul bilan BITTA qatorda —
              u ham shu mahsulot haqidagi "quruq fakt". Alohida blok
              qilinsa, sahifada yana bitta e'lon paydo bo'lardi;
              bu yerda esa u mavjud meta qatoriga tabiiy qo'shiladi.
            */}
            {sold && (
              <span className="flex items-center gap-1.5 text-ink-500">
                <TrendingUp className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
                {sold}
              </span>
            )}
            {product.sku && <span className="text-ink-600">Artikul: {product.sku}</span>}
          </div>

          {/*
            Narx bloki o'z YUZASIDA turadi.

            Ilgari u sahifadagi boshqa matnlar orasida oqib ketardi. Endi
            u yumshoq neytral panelda — bu sahifadagi eng muhim raqam va u
            ko'z birinchi tushadigan joy bo'lishi kerak. Chegirma bo'lsa,
            panel brend rangiga bo'yaladi va "tejaysiz" summasi haqiqiy
            farqdan hisoblanadi (o'ylab topilgan foiz emas).
          */}
          {/*
            Panel endi `glassPanel` — yupqa shisha bo'lak: yarim shaffof
            fon va ichki qirra soyasi. Ilgari u oddiy to'ldirilgan quti
            edi va sahifadagi boshqa kartalar bilan bir xil "og'irlikda"
            turardi; narx esa ular orasidan AJRALIB turishi kerak.
          */}
          <div className={glassPanel(discount != null && oldPrice != null ? 'brand' : 'neutral', 'mt-5 p-4')}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* 28px — shkaladagi qadam. Ilgari `text-[2rem]` (32px) edi,
                  yaʼni oltita oʻlchamdan tashqaridagi qiymat. */}
              <span className="text-display-md leading-none tabular-nums text-ink-900">
                {formatPrice(price)}
              </span>
              {oldPrice != null && (
                <span className="text-base tabular-nums text-ink-600 line-through">{formatPrice(oldPrice)}</span>
              )}
            </div>
            {discount != null && oldPrice != null && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                −{discount}% · {formatPrice(oldPrice - price)} tejaysiz
              </p>
            )}
          </div>

          <p
            className={cx(
              'mt-3 flex items-center gap-1.5 text-sm font-medium',
              !purchasable ? 'text-ink-500' : stock === 'in' ? 'text-emerald-700' : stock === 'low' ? 'text-amber-700' : 'text-red-700'
            )}
          >
            {!purchasable ? (
              <>Narxi aniqlanmagan — operator bilan bogʻlaning</>
            ) : stock === 'in' ? (
              <><Check className="h-4 w-4" /> Sotuvda bor</>
            ) : stock === 'low' ? (
              <>Shoshiling — atigi {availableStock} dona qoldi</>
            ) : (
              <>Vaqtincha sotuvda yoʻq</>
            )}
          </p>

          {/* Variantlar: rang guruhi namunali, qolganlari matnli tugmalar */}
          {variantGroups.length > 0 && (
            <div className="mt-6 space-y-5">
              {variantGroups.map((group) => (
                <VariantGroup
                  key={group.type}
                  group={group}
                  selected={selectedVariants[group.type]}
                  basePrice={product.price}
                  onSelect={(value) => selectVariant(group.type, value)}
                />
              ))}
            </div>
          )}

          {/* Miqdor + CTA */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/*
              Stepper tugmalari `flat` botadi — ular tekis va guruh
              chegarasi ichida turadi, ostida soya bo'lishi mumkin emas.
              Asosiy CTA esa `lifted`: uning ostida haqiqiy soya bor va
              bosilganda u qisqaradi (tugma yerga yaqinlashdi).
            */}
            <div className="flex items-center rounded-control border border-ink-200">
              <AnimatedButton
                sink="flat"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Kamaytirish"
                className={cx('flex h-12 w-12 items-center justify-center rounded-l-control text-ink-600 transition-colors hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent', focusRing)}
              >
                <Minus className="h-4 w-4" />
              </AnimatedButton>
              <span className="w-12 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty}</span>
              <AnimatedButton
                sink="flat"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty || !inStock}
                aria-label="Koʻpaytirish"
                className={cx('flex h-12 w-12 items-center justify-center rounded-r-control text-ink-600 transition-colors hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent', focusRing)}
              >
                <Plus className="h-4 w-4" />
              </AnimatedButton>
            </div>

            {/*
              Savatda bor boʻlsa tugma ISHLASHDA DAVOM ETADI — u faqat
              savatda nima borligini qoʻshimcha qilib aytadi. "Yana
              qoʻshish" soʻzi shuning uchun: bosish yana `qty` dona
              qoʻshadi, tugma esa tanlov emas, xabar bilan birga keladi.
            */}
            <AnimatedButton
              sink="lifted"
              ref={setPrimaryCta}
              onClick={handleAdd}
              disabled={!inStock}
              className={cx('min-w-[12rem] flex-1', button('primary', 'lg'))}
            >
              {inCartQty > 0 ? (
                <>
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                  Savatda · <AnimatedNumber value={inCartQty} className="tabular-nums" />
                  {/* `AnimatedNumber` — `inline-flex`, yaʼni yonidagi matn
                      bilan orasida boʻshliq hosil boʻlmaydi. Shuning uchun
                      boʻshliq span ICHIDA yoziladi. */}
                  <span className="font-normal opacity-80">&nbsp;— yana qoʻshish</span>
                </>
              ) : (
                <><ShoppingCart className="h-4.5 w-4.5 shrink-0" /> Savatga qoʻshish</>
              )}
            </AnimatedButton>

            <button
              onClick={() => toggle(product.id)}
              aria-pressed={fav}
              aria-label={fav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qoʻshish'}
              className={cx(
                'hidden h-12 w-12 items-center justify-center rounded-control border transition-colors md:flex',
                focusRing,
                fav ? 'border-orange-600 bg-orange-50 text-orange-600' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:text-orange-600'
              )}
            >
              <Heart className={cx('h-5 w-5', fav && 'fill-current')} />
            </button>
          </div>

          <button onClick={handleBuy} disabled={!inStock} className={cx(button('outline', 'lg'), 'mt-3 w-full')}>
            Bir bosishda buyurtma berish
          </button>

          {/* Yetkazib berish va kafolat */}
          <div className={cx(card, 'mt-6 divide-y divide-ink-100')}>
            <div className="flex items-start gap-3 p-4">
              <Truck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-orange-600" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink-900">Yetkazib berish</p>
                <p className="mt-0.5 text-ink-500">
                  Toshkent boʻylab 1 kun ichida
                  {settings?.delivery_fee_tashkent ? ` — ${formatPrice(settings.delivery_fee_tashkent)}` : ''}
                  . Respublika boʻylab 2–3 kun.
                </p>
                {delivery.freeThreshold > 0 && (
                  <p className="mt-1 text-xs text-emerald-700">
                    {formatPrice(delivery.freeThreshold)} dan yuqori buyurtmalarda bepul
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-orange-600" />
              <div className="text-sm">
                <p className="font-semibold text-ink-900">Rasmiy kafolat</p>
                <p className="mt-0.5 text-ink-500">Original mahsulot, kafolat taloni bilan</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <RotateCcw className="mt-0.5 h-4.5 w-4.5 shrink-0 text-orange-600" />
              <div className="text-sm">
                <p className="font-semibold text-ink-900">14 kun ichida qaytarish</p>
                <p className="mt-0.5 text-ink-500">Mahsulot sizga toʻgʻri kelmasa — qaytarasiz</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleShare}
            className={cx('mt-4 hidden items-center gap-2 rounded-sm text-sm font-medium text-ink-500 hover:text-orange-700 md:inline-flex', focusRing)}
          >
            <Share2 className="h-4 w-4" /> Doʻstlarga ulashish
          </button>
        </div>
      </div>

      {/* ── Tavsif / Xususiyatlar ────────────────────────────── */}
      <section className="mt-8 lg:mt-12">
        {/*
          Faol tab chizigʻi — `border-bottom` EMAS, `layoutId` bilan
          SURILADIGAN nur.

          Ilgari har bir tugmaning oʻz pastki chegarasi bor edi va tab
          almashganda chiziq bir joyda oʻchib, ikkinchisida yonardi.
          Endi u bitta element boʻlib bir tabdan ikkinchisiga suriladi —
          koʻz harakatni kuzatadi va qaysi tabdan qaysisiga oʻtganini
          koʻradi. Motion buni `layoutId` bilan oʻzi hisoblaydi.

          `prefers-reduced-motion` da Motion `layout` animatsiyasini
          oʻtkazib yuboradi (`<MotionConfig reducedMotion="user">`,
          `main.tsx`), yaʼni nur darhol joyiga tushadi.
        */}
        <div className="flex gap-1 border-b border-ink-200" role="tablist" aria-label="Mahsulot maʼlumotlari">
          {([
            ['desc', 'Tavsif'],
            ['specs', 'Xususiyatlar'],
            ['reviews', `Sharhlar (${reviewCount})`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                'relative px-4 py-3 text-sm font-medium transition-colors',
                focusRing,
                // `ink-600` — `ink-500` tab qatorida 4.33:1 berardi (AA 4.5).
                tab === k ? 'text-orange-700' : 'text-ink-600 hover:text-ink-900'
              )}
            >
              {label}
              {tab === k && (
                <motion.span
                  layoutId="product-tab-underline"
                  aria-hidden="true"
                  transition={{ duration: DURATION.drawer, ease: EASE.standard }}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-orange-600"
                />
              )}
            </button>
          ))}
        </div>

        <div className="mt-5 max-w-3xl text-sm leading-relaxed text-ink-600">
          {tab === 'reviews' && (
            /*
             * `key` — boshqa mahsulotga oʻtilganda komponent QAYTA
             * yaratilsin.
             *
             * `ProductPage` marshrut oʻzgarganda unmount boʻlmaydi
             * (bir xil komponent, boshqa `slug`), shuning uchun `key`
             * boʻlmasa `ProductReviews` oʻz holatini saqlab qolardi:
             * yangi mahsulot ostida eski sharhlar, eski "Yana
             * koʻrsatish" holati va eng yomoni — boshqa mahsulotga
             * yozilayotgan tugallanmagan sharh matni koʻrinardi.
             */
            <ProductReviews key={product.id} productId={product.id} onStatsChange={setReviewStats} />
          )}

          {tab === 'desc' &&
            (product.description?.trim() ? (
              <p className="whitespace-pre-line">{product.description}</p>
            ) : (
              <p className="text-ink-500">Bu mahsulot uchun batafsil tavsif hali qoʻshilmagan.</p>
            ))}

          {tab === 'specs' && (
            <dl className="divide-y divide-ink-100 rounded-card border border-ink-200">
              <SpecRow label="Brend" value={product.brand} />
              <SpecRow label="Kategoriya" value={product.category?.name} />
              <SpecRow label="Artikul (SKU)" value={product.sku} />
              {/* `SpecRow` qiymat boʻsh boʻlsa qatorni chizmaydi — hozirgi
                  bazada `warranty` hamma joyda `null`, yaʼni qator koʻrinmaydi. */}
              <SpecRow label="Kafolat" value={product.warranty} />
              <SpecRow label="Omborda" value={product.stock > 0 ? `${product.stock} dona` : 'Yoʻq'} />
              {variantGroups.map((g) => (
                <SpecRow key={g.type} label={g.label} value={g.values.map((v) => v.value).join(', ')} />
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ── O'xshash mahsulotlar ────────────────────────────── */}
      {related.length > 0 && (
        /*
         * Oʻxshash mahsulotlar — GRID emas, KARUSEL.
         *
         * Ilgari bu yerda sahifadagi toʻrtinchi bir xil toʻr turardi va
         * mahsulot sahifasi katalogning davomiga oʻxshab ketardi. Karusel
         * ikki narsani beradi: kompozitsion oʻzgarish (bosh sahifadagi
         * ritm bilan bir xil til) va telefonda tabiiy surish — pastda
         * yopishqoq CTA turgani uchun uzun toʻr ayniqsa noqulay edi.
         */
        <section className="mt-10 lg:mt-14" aria-labelledby="related-heading">
          <SectionHeader
            id="related-heading"
            eyebrow="Sizga yoqishi mumkin"
            eyebrowIcon={Sparkles}
            title="Oʻxshash mahsulotlar"
            actionHref={product.category ? `/category/${product.category.slug}` : '/catalog'}
            actionLabel="Barchasini koʻrish"
          />
          <div className="mt-5">
            <ProductCarousel
              products={related}
              seeAllHref={product.category ? `/category/${product.category.slug}` : '/catalog'}
              seeAllLabel="Butun kategoriyani koʻrish"
              ariaLabel="Oʻxshash mahsulotlar"
            />
          </div>
        </section>
      )}

      {/* Yopishgan CTA ostida joy qoldiramiz — u `tab` dan yuqorida yo'q. */}
      <div className="h-24 tab:hidden" aria-hidden="true" />

      {/*
        Mobil yopishgan CTA — BottomNav ustida.

        DIQQAT: `position: fixed` elementi. Uni transform qo'llanadigan
        elementning ICHIGA solmang — transform "containing block" yaratadi
        va panel viewport'ga emas, o'sha elementga nisbatan joylashadi.
        Shu sababli pastdagi `motion.div` faqat OPACITY va `y` ni panelning
        O'ZIDA animatsiya qiladi (panelning o'zi fixed — bu xavfsiz),
        tashqarisiga hech qanday transformli o'ram qo'shilmaydi.
      */}
      <AnimatePresence>
        {!primaryCtaVisible && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: '100%' }}
            transition={springs.drawer}
            className="fixed left-0 right-0 z-40 border-t border-ink-200 bg-white/95 p-3 backdrop-blur-md tab:hidden"
            style={{ bottom: 'var(--bottom-nav-h)' }}
          >
            <div className="mx-auto flex max-w-shell items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold tabular-nums text-ink-900">{formatPrice(price * qty)}</p>
                {oldPrice != null && (
                  <p className="truncate text-xs tabular-nums text-ink-600 line-through">{formatPrice(oldPrice * qty)}</p>
                )}
              </div>
              {/*
                Yopishqoq paneldagi tugma — AYNI amal, demak ayni his.
                `flat`, `lifted` emas: panel tubida turibdi va ostida
                soya uchun joy yo'q (pastki navigatsiya darhol boshlanadi).
              */}
              {/* Qisqa variant — panelda joy tor, "yana qoʻshish" sigʻmaydi. */}
              <AnimatedButton
                sink="flat"
                onClick={handleAdd}
                disabled={!inStock}
                className={cx('shrink-0', button('primary', 'lg'))}
              >
                {inCartQty > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Savatda · <AnimatedNumber value={inCartQty} className="tabular-nums" />
                  </>
                ) : (
                  <><ShoppingCart className="h-4 w-4 shrink-0" /> Savatga</>
                )}
              </AnimatedButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Variant tanlagich.
 *
 * `color` guruhi rang namunasi (swatch) bilan koʻrsatiladi — admin kiritgan
 * HEX kod ishlatiladi; kod boʻlmasa oddiy matnli tugmaga tushadi. Har bir
 * variant oʻz ombori va narx farqiga ega boʻlishi mumkin, shuning uchun
 * tugmada narx farqi ham koʻrinadi va tugagan variant bloklanadi.
 */
function VariantGroup({
  group, selected, basePrice, onSelect,
}: {
  group: { type: string; label: string; values: ProductVariant[] };
  selected?: string;
  basePrice: number;
  onSelect: (value: string) => void;
}) {
  const isColor = group.type === 'color';
  const chosen = group.values.find((v) => v.value === selected);

  return (
    <fieldset>
      <legend className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink-900">
        <span>{group.label}</span>
        {chosen ? (
          <span className="text-ink-500">{chosen.label || chosen.value}</span>
        ) : (
          <span className="text-xs font-normal text-orange-700">— tanlang</span>
        )}
      </legend>

      <div className="flex flex-wrap gap-2">
        {group.values.map((v) => {
          const active = selected === v.value;
          const soldOut = v.stock != null && v.stock <= 0;
          const delta = v.price_adjustment ?? 0;
          const title = `${v.label || v.value}${delta ? ` (${delta > 0 ? '+' : '−'}${formatPrice(Math.abs(delta))})` : ''}`;

          if (isColor && (v.color_code || v.image_url)) {
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={active}
                aria-label={title}
                title={title}
                disabled={soldOut}
                onClick={() => onSelect(v.value)}
                className={cx(
                  'relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 transition-all',
                  focusRing,
                  active ? 'border-orange-600 ring-2 ring-orange-200' : 'border-ink-200 hover:border-ink-400',
                  soldOut && 'cursor-not-allowed opacity-40'
                )}
                style={v.color_code && !v.image_url ? { backgroundColor: v.color_code } : undefined}
              >
                {v.image_url && (
                  <Img src={v.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                )}
                {soldOut && (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    <span className="h-[2px] w-9 rotate-45 rounded-full bg-ink-500" />
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              disabled={soldOut}
              onClick={() => onSelect(v.value)}
              className={cx(
                'flex h-11 items-center gap-1.5 rounded-control border px-4 text-sm font-medium transition-colors',
                focusRing,
                active
                  ? 'border-orange-600 bg-orange-50 text-orange-700'
                  : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50',
                soldOut && 'cursor-not-allowed text-ink-300 line-through hover:border-ink-200 hover:bg-transparent'
              )}
            >
              {isColor && v.color_code && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border border-ink-200"
                  style={{ backgroundColor: v.color_code }}
                />
              )}
              {v.label || v.value}
              {delta !== 0 && (
                <span className="text-xs text-ink-500">
                  {delta > 0 ? '+' : '−'}{formatPrice(Math.abs(delta))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {chosen?.stock != null && chosen.stock > 0 && chosen.stock <= 5 && (
        <p className="mt-2 text-xs text-amber-700">Bu variantdan {chosen.stock} dona qoldi</p>
      )}
      {chosen && basePrice > 0 && (chosen.price_adjustment ?? 0) !== 0 && (
        <p className="mt-2 text-xs text-ink-500">
          Bu variant narxi asosiy narxdan{' '}
          {(chosen.price_adjustment ?? 0) > 0 ? 'qimmatroq' : 'arzonroq'}:{' '}
          <span className="font-medium text-ink-800">
            {formatPrice(Math.max(0, basePrice + (chosen.price_adjustment ?? 0)))}
          </span>
        </p>
      )}
    </fieldset>
  );
}

function SpecRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-36 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function ProductPageSkeleton() {
  return (
    <div className={cx(shell, 'py-4 lg:py-7')}>
      <div className={cx('h-4 w-64 rounded', skeleton)} />
      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className={cx('aspect-square w-full rounded-card', skeleton)} />
          <div className="mt-3 hidden gap-2 sm:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cx('h-16 w-16 rounded-control', skeleton)} />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className={cx('h-3 w-24 rounded', skeleton)} />
          <div className={cx('h-8 w-4/5 rounded', skeleton)} />
          <div className={cx('h-10 w-52 rounded', skeleton)} />
          <div className={cx('h-4 w-32 rounded', skeleton)} />
          <div className={cx('h-12 w-full rounded-control', skeleton)} />
          <div className={cx('h-40 w-full rounded-card', skeleton)} />
        </div>
      </div>
    </div>
  );
}
