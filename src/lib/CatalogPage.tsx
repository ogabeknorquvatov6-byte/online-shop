import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { Link, useRouter } from './router';
import type { Category, Product } from './types';
import { formatPriceShort } from './types';
import { ProductGrid, ProductGridSkeleton, EmptyState, ErrorState, productGridWithSidebarClass } from './ProductCard';
import { SlidersHorizontal, X, SearchX, ChevronRight, ChevronLeft, Check, Star } from 'lucide-react';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap } from './adapters';
import { useCategories } from './catalogData';
import { buildCategoryTree, expandWithDescendants, pathToNode } from './categoryTree';
import { likePattern } from './search';
import { useSeo, useBreadcrumbJsonLd } from './seo';
import { AnimatedDrawer } from './AnimatedPrimitives';
import { AnimatePresence, motion } from 'motion/react';
import { button, checkboxBase, chip, countBadge, cx, focusRing, selectBase, shell } from './design';

const PRICE_SLIDER_MAX = 50_000_000;
const PRICE_STEP = 50_000;
const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'popular', label: 'Ommabopligi boʻyicha' },
  { value: 'price_asc', label: 'Avval arzonlari' },
  { value: 'price_desc', label: 'Avval qimmatlari' },
  { value: 'new', label: 'Avval yangilari' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/** Ikki tutqichli narx oralig'i slayderi. */
function PriceRangeSlider({
  min, max, onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const minPct = (Math.min(min, PRICE_SLIDER_MAX) / PRICE_SLIDER_MAX) * 100;
  const maxPct = (Math.min(max, PRICE_SLIDER_MAX) / PRICE_SLIDER_MAX) * 100;
  const thumb =
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ' +
    '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-orange-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs font-medium text-ink-700">
        <span className="rounded-control bg-ink-50 px-2 py-1 tabular-nums">{formatPriceShort(min)}</span>
        <span className="text-ink-300">—</span>
        <span className="rounded-control bg-ink-50 px-2 py-1 tabular-nums">
          {max >= PRICE_SLIDER_MAX ? `${formatPriceShort(PRICE_SLIDER_MAX)}+` : formatPriceShort(max)}
        </span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-ink-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-orange-600"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range" min={0} max={PRICE_SLIDER_MAX} step={PRICE_STEP} value={min}
          aria-label="Eng past narx"
          onChange={(e) => onChange(Math.min(Number(e.target.value), max - PRICE_STEP), max)}
          className={cx('pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent', thumb)}
        />
        <input
          type="range" min={0} max={PRICE_SLIDER_MAX} step={PRICE_STEP} value={max}
          aria-label="Eng yuqori narx"
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + PRICE_STEP))}
          className={cx('pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent', thumb)}
        />
      </div>
    </div>
  );
}

export function CatalogPage({ categoryId }: { categoryId?: string }) {
  const { route } = useRouter();
  const { categories } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [brands, setBrands] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchQuery = route.query.get('q') || '';
  const brandParam = route.query.get('brand') || '';

  const [selectedCats, setSelectedCats] = useState<string[]>(categoryId ? [categoryId] : []);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(brandParam ? [brandParam] : []);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(PRICE_SLIDER_MAX);
  /*
   * Reyting / chegirma / mavjudlik filtrlari.
   *
   * Uchalasi ham SERVER tomonda qo'llanadi. Bu shart emasdek tuyulishi
   * mumkin, lekin muhim: ro'yxat sahifalangan va `count: 'exact'` bilan
   * keladi. Agar filtrlash mijozda bo'lsa, "1234 ta mahsulot" soni va
   * sahifalar soni FILTRLANMAGAN to'plamdan hisoblanib qolardi — ya'ni
   * foydalanuvchi bo'sh sahifalarni varaqlayverardi.
   */
  const [minRating, setMinRating] = useState(0);
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [sort, setSort] = useState<SortValue>('popular');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const gridTopRef = useRef<HTMLDivElement>(null);

  /*
   * Tanlangan kategoriyalar + ularning BARCHA avlodlari.
   *
   * `categories` allaqachon yuqorida yuklangan (`useCategories`, jarayon
   * davomida keshlanadi), shuning uchun bu yerda qo'shimcha tarmoq
   * so'rovi YO'Q — faqat xotiradagi ro'yxatdan daraxt quriladi.
   *
   * `.join()` bog'liqlikda: massiv har renderda yangi havola bo'ladi,
   * shuning uchun uning MAZMUNI bo'yicha solishtiramiz — aks holda
   * `loadProducts` cheksiz qayta ishga tushardi.
   */
  /* Daraxt BIR MARTA quriladi va uni ham so'rov, ham non-yo'l ishlatadi. */
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const categoryIdsToQuery = useMemo(
    () => expandWithDescendants(categoryTree, selectedCats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryTree, selectedCats.join()]
  );

  const activeCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const pageTitle = activeCategory?.name || (searchQuery ? `«${searchQuery}» boʻyicha natijalar` : 'Barcha mahsulotlar');

  useSeo({
    title: pageTitle,
    description: activeCategory?.description
      ? String(activeCategory.description)
      : `${pageTitle} — OpenShop katalogi. Rasmiy kafolat va tez yetkazib berish.`,
    /*
     * Canonical ATAYLAB parametrsiz.
     *
     * `?brand=Apple&q=…` variantlari asosiy katalog sahifasining bir xil
     * mazmunini takrorlaydi. Ularning har biri alohida canonical bo'lsa,
     * Google bir sahifaning o'nlab nusxasini indekslab, reytingni ular
     * o'rtasida bo'lib yuboradi.
     */
    canonicalPath: activeCategory ? `/category/${activeCategory.slug}` : '/catalog',
    // Qidiruv so'rovi bilan ochilgan katalog — vaqtinchalik natija ro'yxati.
    noindex: Boolean(searchQuery),
  });

  /*
   * NON-YO'L HAQIQIY DARAXTDAN QURILADI.
   *
   * Ilgari bu yerda faqat uchta bo'g'in bor edi: Bosh sahifa → Katalog →
   * joriy kategoriya. Ichma-ich kategoriyalarda bu NOTO'G'RI: "Smartfon"
   * sahifasida uning otalari ("Telefonlar va planshetlar" → "Telefon")
   * umuman ko'rinmasdi va foydalanuvchi qayerda turganini bilmasdi.
   *
   * `pathToNode` daraxt bo'ylab yuqoriga yurib butun zanjirni qaytaradi,
   * shuning uchun kategoriya ierarxiyasi o'zgarsa — non-yo'l o'zi
   * moslashadi. Hech narsa qo'lda yozilmaydi.
   */
  const trail = useMemo(
    () => (activeCategory ? pathToNode(categoryTree, activeCategory.id) : []),
    [categoryTree, activeCategory]
  );

  useBreadcrumbJsonLd(
    activeCategory
      ? [
          { name: 'Bosh sahifa', path: '/' },
          { name: 'Katalog', path: '/catalog' },
          ...trail.map((c) => ({ name: c.name, path: `/category/${c.slug}` })),
        ]
      : null
  );

  useEffect(() => {
    supabase
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .not('brand', 'is', null)
      .neq('brand', '')
      .returns<{ brand: string | null }[]>()
      .then(({ data }) => {
        const set = new Set((data ?? []).map((d) => d.brand).filter((b): b is string => Boolean(b)));
        setBrands([...set].sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  useEffect(() => {
    setSelectedCats(categoryId ? [categoryId] : []);
  }, [categoryId]);

  useEffect(() => {
    if (brandParam) setSelectedBrands([brandParam]);
  }, [brandParam]);

  const loadProducts = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    let cancelled = false;
    (async () => {
      try {
        let q = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' }).eq('is_active', true);
        // `%` va `_` — LIKE joker belgilari, foydalanuvchi matnidan ekranlanadi.
        // `likePattern` — apostrof variantlari `_` jokeriga aylanadi,
        // ya'ni "qo'shimcha" so'rovi "qoʻshimcha" nomini ham topadi.
        if (searchQuery) q = q.ilike('name', likePattern(searchQuery));
        /*
         * Kategoriya filtri PASTKI DARAXT bo'yicha.
         *
         * Ilgari bu yerda aniq moslik turardi:
         *     q.eq('category_id', selectedCats[0])
         * Mahsulot esa faqat bitta — odatda eng pastki — kategoriyaga
         * bog'lanadi. Shu sababli ota-kategoriya tanlanganda so'rov 0
         * qator qaytarardi va "Telefonlar va planshetlar" kabi bo'lim
         * bo'sh ko'rinardi.
         *
         * `categoryIdsToQuery` tanlangan kategoriyalarning o'zini ham,
         * avlodlarini ham o'z ichiga oladi va takrorlanmaydi, shuning
         * uchun bitta mahsulot ikki marta qaytmaydi.
         *
         * Bitta element bo'lsa ham `.in(...)` ishlatiladi: `.eq(...)` bilan
         * ikki tarmoq saqlash mantiqni ikkiga bo'lardi, natija esa bir xil.
         */
        if (categoryIdsToQuery.length) q = q.in('category_id', categoryIdsToQuery);
        if (selectedBrands.length) q = q.in('brand', selectedBrands);
        if (priceMin > 0) q = q.gte('price', priceMin);
        if (priceMax < PRICE_SLIDER_MAX) q = q.lte('price', priceMax);
        if (minRating > 0) q = q.gte('rating', minRating);
        if (onlyInStock) q = q.gt('stock', 0);
        /*
         * Chegirma filtri `discount_price` ustuni bo'yicha.
         *
         * CHEKLOV, ataylab: PostgREST ikkita ustunni bir-biri bilan
         * solishtira olmaydi, shuning uchun "discount_price < price"
         * shartini server tomonda yozib bo'lmaydi — faqat "chegirma narxi
         * belgilangan" tekshiriladi. Shuningdek AKSIYA orqali kelgan
         * chegirma bu yerga tushmaydi: u `fetchPromoDiscountMap` dan
         * mijozda hisoblanadi. Ikkalasini ham qamrash uchun bazada
         * hisoblanadigan ustun yoki view kerak bo'lardi — bu alohida
         * migratsiya, shuning uchun hozircha filtr `discount_price` bilan
         * cheklangan va shu bo'yicha halol ishlaydi.
         */
        if (onlyDiscounted) q = q.not('discount_price', 'is', null).gt('discount_price', 0);

        if (sort === 'price_asc') q = q.order('price', { ascending: true });
        else if (sort === 'price_desc') q = q.order('price', { ascending: false });
        else if (sort === 'new') q = q.order('created_at', { ascending: false });
        else q = q.order('sales_count', { ascending: false });
        // Barqaror tartib: ikkilamchi kalitsiz bir xil `sales_count` li
        // mahsulotlar sahifalar orasida takrorlanib/yo'qolib qolardi.
        q = q.order('id', { ascending: true });
        q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        const [{ data, count, error }, promoMap] = await Promise.all([q, fetchPromoDiscountMap(supabase)]);
        if (cancelled) return;
        if (error) throw error;
        setProducts(adaptProducts(data ?? [], promoMap));
        setTotal(count ?? 0);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    /*
     * `categoryIdsToQuery` — `selectedCats` O'RNIGA.
     *
     * So'rov endi to'g'ridan-to'g'ri `selectedCats` ni ishlatmaydi,
     * shuning uchun uni bu yerda saqlash ortiqcha bo'lardi: yoyilgan
     * ro'yxat `selectedCats` dan hosil qilinadi va u o'zgarganda
     * `useMemo` yangi massiv qaytaradi — ya'ni bog'liqlik baribir
     * ishga tushadi.
     *
     * Bu bog'liqlik kategoriyalar KECHIKIB kelgan holatni ham qamraydi:
     * kesh bo'sh bo'lsa yoyilgan ro'yxat avval bo'sh, keyin to'liq
     * bo'ladi va so'rov aynan o'shanda qayta ketadi.
     */
    searchQuery, categoryIdsToQuery, selectedBrands, priceMin, priceMax, sort, page,
    // Yangi filtrlar ham shu yerda BO'LISHI SHART: aks holda `loadProducts`
    // qayta yaratilmaydi va 1-sahifada turganda reyting/chegirma/mavjudlik
    // o'zgartirilsa so'rov umuman qayta ketmaydi (sahifa raqami o'zgarmagani
    // uchun `filterKey` mexanizmi ham yordam bermaydi).
    minRating, onlyDiscounted, onlyInStock,
  ]);

  /*
   * Filtr o'zgarganda 1-sahifaga qaytamiz. Ilgari bu qilinmagani uchun
   * 3-sahifada turgan foydalanuvchi filtrni o'zgartirsa, natijalari
   * 3-sahifada bo'lmagan holatda BO'SH ro'yxat ko'rardi — mahsulot bor
   * bo'lsa ham "Mahsulot topilmadi" chiqardi.
   *
   * Bu render paytida bajariladi (effektda emas), aks holda avval eski
   * sahifa bilan bitta ortiqcha so'rov ketardi.
   */
  const filterKey = `${selectedCats.join()}|${selectedBrands.join()}|${priceMin}|${priceMax}|${sort}|${searchQuery}|${minRating}|${onlyDiscounted}|${onlyInStock}`;
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (seenFilterKey !== filterKey) {
    setSeenFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  useEffect(() => loadProducts(), [loadProducts]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (p: number) => {
    setPage(p);
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleCat = (id: string) =>
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleBrand = (b: string) =>
    setSelectedBrands((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));

  const resetFilters = () => {
    setSelectedCats(categoryId ? [categoryId] : []);
    setSelectedBrands([]);
    setPriceMin(0);
    setPriceMax(PRICE_SLIDER_MAX);
    setMinRating(0);
    setOnlyDiscounted(false);
    setOnlyInStock(false);
  };

  const activeFilterCount =
    (categoryId ? 0 : selectedCats.length) +
    selectedBrands.length +
    (priceMin > 0 || priceMax < PRICE_SLIDER_MAX ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (onlyDiscounted ? 1 : 0) +
    (onlyInStock ? 1 : 0);

  const filters = (
    <FilterPanel
      categories={categories}
      selectedCats={selectedCats}
      onToggleCat={toggleCat}
      onClearCats={() => setSelectedCats([])}
      lockedCategory={!!categoryId}
      priceMin={priceMin}
      priceMax={priceMax}
      onPrice={(mn, mx) => { setPriceMin(mn); setPriceMax(mx); }}
      brands={brands}
      selectedBrands={selectedBrands}
      onToggleBrand={toggleBrand}
      minRating={minRating}
      onMinRating={setMinRating}
      onlyDiscounted={onlyDiscounted}
      onToggleDiscounted={() => setOnlyDiscounted((v) => !v)}
      onlyInStock={onlyInStock}
      onToggleInStock={() => setOnlyInStock((v) => !v)}
    />
  );

  return (
    <div className={cx(shell, 'py-4 lg:py-7')}>
      {/*
        KATALOG SARLAVHASI — to'q "band".

        Ilgari bu oddiy oq fondagi matn edi va sahifa to'g'ridan-to'g'ri
        mahsulot to'ridan boshlanardi: katalog bosh sahifadan keyin
        vizual jihatdan "bo'shashib" ketardi. Endi sahifa aniq boshlanish
        nuqtasiga ega — o'sha `ink-900` yuzasi (aksiya bloki, 404 va
        bannersiz hero bilan bir xil til), ustida yumshoq brend nuri.

        Ichida `position: fixed` element yo'q, transform ham yo'q —
        faqat gradient va blur qatlami.
      */}
      <section className="relative isolate overflow-hidden rounded-surface bg-ink-900 px-5 py-6 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-orange-600/25 blur-3xl sm:h-64 sm:w-64"
        />

        <nav aria-label="Yoʻnalish" className="relative flex flex-wrap items-center gap-1.5 text-sm text-white/50">
          <Link to="/" className={cx('rounded-sm transition-colors hover:text-orange-300', focusRing)}>
            Bosh sahifa
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-white/30" />
          <Link to="/catalog" className={cx('rounded-sm transition-colors hover:text-orange-300', focusRing)}>
            Katalog
          </Link>
          {/*
            Har bir ota-kategoriya bosiladigan havola, oxirgisi esa oddiy
            matn — chunki u joriy sahifaning o'zi. Zanjir daraxtdan
            olinadi, ya'ni yangi daraja qo'shilsa o'zi uzayadi.
          */}
          {trail.map((c, i) => {
            const isLast = i === trail.length - 1;
            return (
              <span key={c.id} className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-white/30" />
                {isLast ? (
                  <span className="font-medium text-white" aria-current="page">{c.name}</span>
                ) : (
                  <Link
                    to={`/category/${c.slug}`}
                    className={cx('rounded-sm transition-colors hover:text-orange-300', focusRing)}
                  >
                    {c.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-display-sm text-white md:text-display-md lg:text-[2.25rem] lg:leading-[1.12]">
              {pageTitle}
            </h1>
            {activeCategory?.description && (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
                {String(activeCategory.description)}
              </p>
            )}
          </div>

          {/* Mahsulotlar soni — HAQIQIY `count`, taxmin emas. */}
          {!loading && (
            <p className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              {total} ta mahsulot
            </p>
          )}
        </div>
      </section>

      <div className="mt-6 flex gap-8">
        {/* Desktop filtr paneli */}
        {/*
          Yon panel `tab` (820px) dan boshlanadi, `lg` dan emas.

          Planshetda telefon uslubidagi pastki varaq noto'g'ri edi: ekran
          kengligi yetarli bo'lsa ham, filtrlar butun ekranni yopib
          turadigan modal ichida qolardi va foydalanuvchi natijalarni
          filtr bilan BIR VAQTDA ko'ra olmasdi. 820px'da 208px'lik ustun
          + 3 ustunli grid bemalol sig'adi.
        */}
        <aside className="hidden w-52 shrink-0 tab:block lg:w-56 xl:w-64" aria-label="Filtrlar">
          <div className="space-y-6 lg:sticky" style={{ top: 'calc(var(--header-h) + 1rem)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">Filtrlar</h2>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className={cx('rounded-sm text-xs font-medium text-orange-700 hover:text-orange-800', focusRing)}>
                  Tozalash
                </button>
              )}
            </div>
            {filters}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div ref={gridTopRef} className="mb-4 flex items-center justify-between gap-3 scroll-mt-24">
            <button
              onClick={() => setFiltersOpen(true)}
              className={cx(button('outline', 'md'), 'tab:hidden')}
              aria-label="Filtrlarni ochish"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtr
              {activeFilterCount > 0 && (
                <span className={cx(countBadge.inline, 'ml-0.5')}>{activeFilterCount}</span>
              )}
            </button>

            <label className="ml-auto flex items-center gap-2 text-sm text-ink-500">
              <span className="hidden sm:inline">Saralash:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortValue)}
                aria-label="Saralash tartibi"
                className={selectBase}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Faol filtrlar — ko'rinadigan va bir bosishda olib tashlanadi */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {!categoryId &&
                selectedCats.map((id) => {
                  const c = categories.find((x) => x.id === id);
                  return c ? (
                    <ActiveFilterPill key={id} label={c.name} onRemove={() => toggleCat(id)} />
                  ) : null;
                })}
              {selectedBrands.map((b) => (
                <ActiveFilterPill key={b} label={b} onRemove={() => toggleBrand(b)} />
              ))}
              {(priceMin > 0 || priceMax < PRICE_SLIDER_MAX) && (
                <ActiveFilterPill
                  label={`${formatPriceShort(priceMin)} – ${formatPriceShort(priceMax)}`}
                  onRemove={() => { setPriceMin(0); setPriceMax(PRICE_SLIDER_MAX); }}
                />
              )}
              <button onClick={resetFilters} className={cx('rounded-sm px-1 text-xs font-medium text-ink-500 hover:text-ink-900', focusRing)}>
                Hammasini tozalash
              </button>
            </div>
          )}

          {/*
            ATAYLAB `AnimatePresence mode="wait"` EMAS.
            (Xuddi shu xato App.tsx dagi sahifa o'tishlarida ham bor edi.)

            `mode="wait"` yangi mazmunni eskisining CHIQISH animatsiyasi
            tugagunicha umuman mount qilmaydi. Ya'ni mahsulotlar bazadan
            kelib bo'lgan bo'lsa ham, ular skeleton so'nguncha ko'rinmaydi
            — bu har bir yuklashga bekorga qo'shilgan kechikish.

            Bundan ham yomoni: chiqish animatsiyasi `requestAnimationFrame`
            ga tayanadi, brauzer esa FONDAGI yorliqda uni to'xtatib qo'yadi.
            Foydalanuvchi katalogni ochib boshqa yorliqqa o'tsa, qaytganda
            skeleton MANGU qotib qolardi (aynan shu holat sinovda
            takrorlandi: ma'lumot kelgan, `loading=false`, lekin ekranda
            hamon skeleton).

            Endi mazmun tayyor bo'lishi bilan DARHOL chiziladi va faqat
            yumshoq kirish animatsiyasi qoladi.
          */}
          <div>
            {loading ? (
              <ProductGridSkeleton count={8} className={productGridWithSidebarClass} />
            ) : loadError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ErrorState onRetry={loadProducts} />
              </motion.div>
            ) : products.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <EmptyState
                  title="Mahsulot topilmadi"
                  message={
                    searchQuery
                      ? `«${searchQuery}» boʻyicha hech narsa topilmadi. Boshqa soʻz bilan urinib koʻring.`
                      : 'Tanlangan filtrlarga mos mahsulot yoʻq. Filtrlarni kengaytirib koʻring.'
                  }
                  icon={<SearchX className="h-6 w-6" />}
                  action={
                    activeFilterCount > 0 ? (
                      <button onClick={resetFilters} className={button('outline', 'md')}>Filtrlarni tozalash</button>
                    ) : (
                      <Link to="/catalog" className={button('primary', 'md')}>Butun katalogni koʻrish</Link>
                    )
                  }
                />
              </motion.div>
            ) : (
              // Katalogda grid ekranning eng tepasida — birinchi qator LCP bo'ladi.
              <ProductGrid
                key={`${page}-${sort}-${searchQuery}`}
                products={products}
                className={productGridWithSidebarClass}
                priorityCount={2}
              />
            )}
          </div>

          {!loading && !loadError && totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
          )}
        </div>
      </div>

      {/*
        Mobil filtr — pastdan chiqadigan varaq.

        DIQQAT: to'liq ekranli o'ram (`fixed inset-0`) ATAYLAB
        `AnimatePresence` DAN TASHQARIDA.

        Ilgari u ichkarida edi va shuning uchun chiqish animatsiyasi
        tugagunicha DOM'da `pointer-events: auto` bilan qolib turardi.
        Fon allaqachon ko'rinmas (`opacity: 0`) bo'lsa ham, u butun
        ekranni qoplab bosishlarni yutib yuborardi — o'lchandi:
        `elementFromPoint` mahsulot kartasini emas, fonni qaytarardi.
        Kadrlar to'xtagan holatda (fondagi yorliq) bu HOLAT MANGU
        qolardi: sahifa ko'rinishi joyida, lekin hech nima bosilmasdi.

        Endi o'ram doim mount va uning bosish qabul qilishi `filtersOpen`
        HOLATIGA bog'langan — animatsiyaga emas. Varaq avvalgidek
        silliq pastga sirg'alib chiqadi, lekin o'sha paytda ham sahifa
        allaqachon bosiladigan bo'ladi.
      */}
      <div
        className={cx(
          'fixed inset-0 z-[70] tab:hidden',
          !filtersOpen && 'pointer-events-none'
        )}
      >
        <AnimatePresence>
          {filtersOpen && (
            <AnimatedDrawer
              side="bottom"
              onClose={() => setFiltersOpen(false)}
              ariaLabel="Filtrlar"
              panelClassName="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-surface bg-white shadow-overlay"
            >
              {/*
                `touchAction: none` — varaqni aynan shu tepa qismidan
                barmoq bilan pastga surib yopish uchun. Usiz brauzer
                harakatni scroll deb talqin qiladi va surish ishlamaydi.
              */}
              <div className="shrink-0 px-4 pt-2.5" style={{ touchAction: 'none' }}>
                <div className="mx-auto h-1 w-10 rounded-full bg-ink-200" />
                <div className="mt-3 flex items-center justify-between border-b border-ink-100 pb-3">
                  <h2 className="text-base font-semibold text-ink-900">Filtrlar</h2>
                  <button
                    onClick={() => setFiltersOpen(false)}
                    className={cx('-mr-1.5 flex h-10 w-10 items-center justify-center rounded-control text-ink-400', focusRing)}
                    aria-label="Yopish"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">{filters}</div>

              <div
                className="shrink-0 border-t border-ink-100 p-4"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
              >
                <div className="flex gap-3">
                  <button onClick={resetFilters} className={cx(button('outline', 'lg'), 'flex-1')}>
                    Tozalash
                  </button>
                  <button onClick={() => setFiltersOpen(false)} className={cx(button('primary', 'lg'), 'flex-[1.4]')}>
                    {loading ? 'Qoʻllash' : `${total} ta mahsulotni koʻrish`}
                  </button>
                </div>
              </div>
            </AnimatedDrawer>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ActiveFilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button onClick={onRemove} className={chip(true)} aria-label={`${label} filtrini olib tashlash`}>
      {label}
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/** Reyting filtri variantlari — `products.rating` (0–5) bo'yicha. */
const RATING_OPTIONS = [4.5, 4, 3] as const;

function FilterPanel({
  categories, selectedCats, onToggleCat, onClearCats, lockedCategory,
  priceMin, priceMax, onPrice, brands, selectedBrands, onToggleBrand,
  minRating, onMinRating, onlyDiscounted, onToggleDiscounted, onlyInStock, onToggleInStock,
}: {
  categories: Category[];
  selectedCats: string[];
  onToggleCat: (id: string) => void;
  onClearCats: () => void;
  lockedCategory: boolean;
  priceMin: number;
  priceMax: number;
  onPrice: (min: number, max: number) => void;
  brands: string[];
  selectedBrands: string[];
  onToggleBrand: (b: string) => void;
  minRating: number;
  onMinRating: (v: number) => void;
  onlyDiscounted: boolean;
  onToggleDiscounted: () => void;
  onlyInStock: boolean;
  onToggleInStock: () => void;
}) {
  const [brandQuery, setBrandQuery] = useState('');
  const visibleBrands = useMemo(
    () => brands.filter((b) => b.toLowerCase().includes(brandQuery.trim().toLowerCase())),
    [brands, brandQuery]
  );

  return (
    <>
      {!lockedCategory && categories.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">Kategoriyalar</h3>
          <div className="space-y-0.5">
            <button
              onClick={onClearCats}
              className={cx(
                'block w-full rounded-control px-2.5 py-2 text-left text-sm transition-colors',
                focusRing,
                selectedCats.length === 0 ? 'bg-orange-50 font-medium text-orange-700' : 'text-ink-600 hover:bg-ink-50'
              )}
            >
              Barcha mahsulotlar
            </button>
            {categories.map((c) => {
              const active = selectedCats.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onToggleCat(c.id)}
                  aria-pressed={active}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-2 text-left text-sm transition-colors',
                    focusRing,
                    active ? 'bg-orange-50 font-medium text-orange-700' : 'text-ink-600 hover:bg-ink-50'
                  )}
                >
                  <span className="line-clamp-1">{c.name}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink-900">Narx oraligʻi</h3>
        <PriceRangeSlider min={priceMin} max={priceMax} onChange={onPrice} />
      </section>

      {brands.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">Brend</h3>
          {brands.length > 8 && (
            <input
              type="search"
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder="Brend qidirish"
              aria-label="Brend qidirish"
              className="mb-2 h-9 w-full rounded-control border border-ink-200 px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          )}
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {visibleBrands.length === 0 ? (
              <p className="px-2 py-2 text-xs text-ink-400">Brend topilmadi</p>
            ) : (
              visibleBrands.map((b) => (
                <label
                  key={b}
                  className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-600 transition-colors hover:bg-ink-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedBrands.includes(b)}
                    onChange={() => onToggleBrand(b)}
                    className={checkboxBase}
                  />
                  <span className="line-clamp-1">{b}</span>
                </label>
              ))
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Reyting</h3>
        {/*
          Chip'lar — teginish uchun checkbox ro'yxatidan qulayroq va
          `chip()` allaqachon dizayn tizimida bor. Balandligi 36px, lekin
          ular yonma-yon va oraliqli, shuning uchun teginish maydoni yetarli.
        */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onMinRating(0)}
            aria-pressed={minRating === 0}
            className={chip(minRating === 0)}
          >
            Barchasi
          </button>
          {RATING_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onMinRating(minRating === r ? 0 : r)}
              aria-pressed={minRating === r}
              className={chip(minRating === r)}
            >
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {r}+
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Chegirma va mavjudlik</h3>
        <div className="space-y-0.5">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-600 transition-colors hover:bg-ink-50">
            <input
              type="checkbox"
              checked={onlyDiscounted}
              onChange={onToggleDiscounted}
              className={checkboxBase}
            />
            <span>Faqat chegirmadagilar</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-600 transition-colors hover:bg-ink-50">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={onToggleInStock}
              className={checkboxBase}
            />
            <span>Faqat sotuvda borlari</span>
          </label>
        </div>
      </section>
    </>
  );
}

/**
 * Sahifalash. Ilgari BARCHA sahifa raqamlari chiqarilardi — 500 mahsulotda
 * bu 25 ta tugma bo'lib, mobil ekrandan chiqib ketardi. Endi joriy sahifa
 * atrofidagi oyna + birinchi/oxirgi ko'rsatiladi.
 */
function Pagination({
  page, totalPages, onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages: (number | 'gap')[] = [];
  const push = (p: number) => { if (!pages.includes(p)) pages.push(p); };
  push(1);
  if (page - 1 > 2) pages.push('gap');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
  if (totalPages - page > 2) pages.push('gap');
  if (totalPages > 1) push(totalPages);

  const navBtn = (disabled: boolean) =>
    cx(
      'flex h-10 w-10 items-center justify-center rounded-control border border-ink-200 text-ink-600 transition-colors',
      disabled ? 'cursor-not-allowed text-ink-300' : 'hover:border-ink-300 hover:bg-ink-50',
      focusRing
    );

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Sahifalar">
      <button onClick={() => onChange(page - 1)} disabled={page === 1} className={navBtn(page === 1)} aria-label="Oldingi sahifa">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-ink-300">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={page === p ? 'page' : undefined}
            className={cx(
              'h-10 min-w-10 rounded-control px-3 text-sm font-medium transition-colors',
              focusRing,
              // Oq raqam ostida `orange-700` — sabab `design.ts`
              // dagi `buttonVariant.primary` izohida.
              page === p ? 'bg-orange-700 text-white' : 'border border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
            )}
          >
            {p}
          </button>
        )
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages} className={navBtn(page === totalPages)} aria-label="Keyingi sahifa">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
