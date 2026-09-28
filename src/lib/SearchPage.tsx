import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X, Clock, TrendingUp, Tag, LayoutGrid } from 'lucide-react';
import { supabase } from './supabase';
import { useRouter } from './router';
import { useLiveSearch, buildFlatItems, itemHref, type FlatItem } from './search';
import { useCategories } from './catalogData';
import { useSeo } from './seo';
import { SearchResultsBody } from './SearchResults';
import { RecommendationCarousel } from './RecommendationCarousel';
import {
  readRecentSearches, pushRecentSearch, removeRecentSearch, clearRecentSearches,
} from './searchHistory';
import { cx, focusRing, input as inputClass, shell, skeleton } from './design';

/*
 * To'liq ekranli qidiruv sahifasi (mobil uchun asosiy qidiruv tajribasi).
 *
 * Ilgari mobil qidiruv oddiy input edi: bosilganda klaviatura ochilar, lekin
 * hech qanday yo'l-yo'riq yo'q edi. Endi bu alohida marshrut (`/search`) —
 * ya'ni "orqaga" tugmasi tabiiy ishlaydi, havolani ulashish mumkin va
 * brauzer tarixi buzilmaydi.
 *
 * Bo'sh holatda: so'nggi qidiruvlar → ommabop bo'limlar/brendlar →
 * tavsiya etilgan mahsulotlar. Ya'ni foydalanuvchi hech qachon bo'sh
 * ekranga qarab qolmaydi.
 */

export function SearchPage() {
  const { route, navigate } = useRouter();
  const { categories } = useCategories();

  const initial = route.query.get('q') || '';
  const [value, setValue] = useState(initial);
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());
  const [topBrands, setTopBrands] = useState<string[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error: searchError, retry: retrySearch, hasQuery } = useLiveSearch(value);
  const flat = useMemo(
    () => buildFlatItems(results.categories, results.brands, results.products),
    [results]
  );

  useSeo({
    title: value.trim() ? `«${value.trim()}» qidiruvi` : 'Qidiruv',
    description: 'OpenShop katalogidan mahsulot, kategoriya yoki brend qidiring.',
    // Qidiruv natijalari sahifasi indekslanmaydi: har bir so'rov uchun
    // alohida manzil hosil bo'lib, indeks cheksiz "bo'sh" sahifalar bilan
    // to'ladi. Google'ning o'zi ham buni tavsiya qilmaydi.
    noindex: true,
  });

  // Sahifa ochilishi bilan yozishni boshlash mumkin bo'lsin.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  /*
   * «Ommabop qidiruvlar» — soxta statistika emas: eng ko'p sotilgan
   * mahsulotlarning brendlaridan hosil qilinadi. Ya'ni ro'yxat haqiqiy
   * savdo ma'lumotiga tayanadi.
   */
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .neq('brand', '')
      .not('brand', 'is', null)
      .order('sales_count', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        for (const row of (data ?? []) as { brand: string | null }[]) {
          if (row.brand) seen.add(row.brand);
        }
        setTopBrands([...seen].slice(0, 8));
        setBrandsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/', { replace: true });
  };

  const submit = (term = value) => {
    const q = term.trim();
    if (!q) return;
    setRecent(pushRecentSearch(q));
    navigate(`/catalog?q=${encodeURIComponent(q)}`);
  };

  const pick = (item: FlatItem) => {
    if (value.trim()) setRecent(pushRecentSearch(value));
    navigate(itemHref(item));
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Qidiruv paneli — sahifaning o'z minimal headeri */}
      <div
        className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className={cx(shell, 'flex items-center gap-2 py-2.5')}
        >
          <button
            type="button"
            onClick={goBack}
            aria-label="Orqaga"
            className={cx('-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-600 hover:bg-ink-100', focusRing)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Mahsulot, kategoriya yoki brend"
              aria-label="Qidiruv so‘zi"
              className={inputClass(false, 'h-12 bg-ink-50 pl-11 pr-11 text-base focus:bg-white')}
            />
            {value && (
              <button
                type="button"
                onClick={() => { setValue(''); inputRef.current?.focus(); }}
                aria-label="Qidiruvni tozalash"
                className={cx('absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700', focusRing)}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="flex-1 pb-[calc(var(--bottom-nav-h)+1rem)] lg:pb-10">
        {hasQuery ? (
          <div className={cx(shell, 'py-1')}>
            <SearchResultsBody
              query={value}
              loading={loading}
              error={searchError}
              onRetry={retrySearch}
              categories={results.categories}
              brands={results.brands}
              products={results.products}
              activeIndex={-1}
              onHoverIndex={() => {}}
              onPick={pick}
              dense
            />
            {flat.length > 0 && (
              <button
                type="button"
                onClick={() => submit()}
                className={cx(
                  'mt-2 flex w-full items-center justify-center rounded-control border border-ink-200 px-4 py-3.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50',
                  focusRing
                )}
              >
                «{value.trim()}» bo‘yicha barcha natijalar
              </button>
            )}
          </div>
        ) : (
          <div className={cx(shell, 'py-5')}>
            {/* So'nggi qidiruvlar */}
            {recent.length > 0 && (
              <section className="mb-7">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    <Clock className="h-3.5 w-3.5" /> So‘nggi qidiruvlar
                  </h2>
                  <button
                    type="button"
                    onClick={() => setRecent(clearRecentSearches())}
                    className={cx('rounded-sm text-xs font-medium text-ink-400 hover:text-ink-700', focusRing)}
                  >
                    Tozalash
                  </button>
                </div>
                <ul className="divide-y divide-ink-100">
                  {recent.map((term) => (
                    <li key={term} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => submit(term)}
                        className={cx('flex min-w-0 flex-1 items-center gap-3 rounded-control py-3 text-left text-sm text-ink-700 hover:text-orange-700', focusRing)}
                      >
                        <Clock className="h-4 w-4 shrink-0 text-ink-300" />
                        <span className="line-clamp-1">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecent(removeRecentSearch(term))}
                        aria-label={`«${term}» ni ro‘yxatdan olib tashlash`}
                        className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-300 hover:bg-ink-100 hover:text-ink-600', focusRing)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Ommabop bo'limlar */}
            {categories.length > 0 && (
              <section className="mb-7">
                <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <LayoutGrid className="h-3.5 w-3.5" /> Bo‘limlar
                </h2>
                <div className="flex flex-wrap gap-2">
                  {categories.slice(0, 10).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate(`/category/${c.slug}`)}
                      className={cx(
                        'inline-flex h-9 items-center rounded-full border border-ink-200 px-3.5 text-sm font-medium text-ink-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700',
                        focusRing
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Ommabop brendlar — eng ko'p sotilgan mahsulotlar asosida */}
            <section className="mb-7">
              <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <TrendingUp className="h-3.5 w-3.5" /> Ommabop brendlar
              </h2>
              {brandsLoading ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cx('h-9 w-24 rounded-full', skeleton)} />
                  ))}
                </div>
              ) : topBrands.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topBrands.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => navigate(`/catalog?brand=${encodeURIComponent(b)}`)}
                      className={cx(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 px-3.5 text-sm font-medium text-ink-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700',
                        focusRing
                      )}
                    >
                      <Tag className="h-3.5 w-3.5 opacity-50" /> {b}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">Brendlar hali qo‘shilmagan.</p>
              )}
            </section>

            <RecommendationCarousel
              title="Ommabop mahsulotlar"
              subtitle="Boshqa xaridorlar ko‘p tanlagan mahsulotlar"
            />
          </div>
        )}
      </div>
    </div>
  );
}
