import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from './router';
import { useLiveSearch, buildFlatItems, itemHref, type FlatItem } from './search';
import { popVariants, DURATION, EASE } from './motion';
import { useEscapeKey } from './uiHooks';
import { SearchResultsBody } from './SearchResults';
import { pushRecentSearch, readRecentSearches } from './searchHistory';
import { cx, focusRing, input as inputClass, popSurface } from './design';

/**
 * Desktop jonli qidiruv — input ostida ochiladigan dropdown.
 *
 * Klaviatura: ArrowUp/Down natijalar bo'ylab, Enter tanlaydi (yoki hech
 * narsa belgilanmagan bo'lsa to'liq qidiruv sahifasini ochadi), Escape yopadi.
 * Desktopda dropdown to'liq sahifadan qulayroq, shuning uchun u saqlanadi;
 * mobil esa alohida `/search` sahifasiga o'tadi.
 */
export function DesktopSearch() {
  const { navigate } = useRouter();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { results, loading, error: searchError, retry: retrySearch, hasQuery } = useLiveSearch(open ? value : '');

  useEffect(() => setActiveIndex(-1), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEscapeKey(open, () => setOpen(false));

  const flat = useMemo(
    () => buildFlatItems(results.categories, results.brands, results.products),
    [results]
  );

  /*
   * So'nggi qidiruvlar — dropdown BO'SH so'rovda ham foydali bo'lishi uchun.
   *
   * Mobil `/search` sahifasida bu allaqachon bor edi, desktopda esa
   * dropdown faqat matn kiritilgandan keyin ochilardi va fokusda hech
   * narsa ko'rsatmasdi. Ro'yxat `localStorage` dan o'qiladi, shuning
   * uchun uni har ochilishda yangilaymiz (boshqa tabda o'zgargan bo'lishi
   * mumkin).
   */
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (open) setRecent(readRecentSearches());
  }, [open]);

  const submitFullSearch = () => {
    const q = value.trim();
    if (!q) return;
    setRecent(pushRecentSearch(q));
    setOpen(false);
    navigate(`/catalog?q=${encodeURIComponent(q)}`);
  };

  const runRecent = (term: string) => {
    setRecent(pushRecentSearch(term));
    setOpen(false);
    navigate(`/catalog?q=${encodeURIComponent(term)}`);
  };

  const pick = (item: FlatItem) => {
    if (value.trim()) pushRecentSearch(value);
    setOpen(false);
    navigate(itemHref(item));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && flat[activeIndex]) pick(flat[activeIndex]);
      else submitFullSearch();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={(e) => { e.preventDefault(); submitFullSearch(); }}>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-label="Mahsulot qidirish"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Mahsulot, kategoriya yoki brend qidiring…"
            className={inputClass(false, 'h-10 bg-ink-50 pl-9 pr-10 focus:bg-white')}
          />
          {value && (
            <button
              type="button"
              onClick={() => { setValue(''); setOpen(false); }}
              aria-label="Qidiruvni tozalash"
              className={cx('absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700', focusRing)}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {open && !hasQuery && recent.length > 0 && (
          <motion.div
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: DURATION.ui, ease: EASE.standard }}
            className={cx(popSurface, 'absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden p-2')}
          >
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Soʻnggi qidiruvlar
            </p>
            {recent.slice(0, 6).map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => runRecent(term)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50',
                  focusRing
                )}
              >
                <Clock className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="line-clamp-1">{term}</span>
              </button>
            ))}
          </motion.div>
        )}

        {open && hasQuery && (
          <motion.div
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: DURATION.ui, ease: EASE.standard }}
            className={cx(popSurface, 'absolute left-0 right-0 top-full z-40 mt-2 max-h-[70vh] overflow-hidden')}
          >
            <SearchResultsBody
              query={value}
              loading={loading}
              error={searchError}
              onRetry={retrySearch}
              categories={results.categories}
              brands={results.brands}
              products={results.products}
              activeIndex={activeIndex}
              onHoverIndex={setActiveIndex}
              onPick={pick}
            />
            {flat.length > 0 && (
              <button
                type="button"
                onClick={submitFullSearch}
                className={cx(
                  'flex w-full items-center justify-center border-t border-ink-100 px-4 py-3 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50',
                  focusRing
                )}
              >
                «{value.trim()}» boʻyicha barcha natijalar
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mobil qidiruv "tugmasi".
 *
 * Ilgari u joyida overlay ochardi: brauzerning «orqaga» tugmasi overlayni
 * yopmasdan butun sahifadan chiqib ketardi va havolani ulashib bo'lmasdi.
 * Endi u haqiqiy marshrutga (`/search`) o'tadi — orqaga qaytish tabiiy
 * ishlaydi va qidiruv sahifasi to'liq UX beradi.
 */
export function MobileSearchTrigger({ tabIndex }: { tabIndex?: number }) {
  const { navigate } = useRouter();
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={() => navigate('/search')}
      className={cx(
        'flex h-11 w-full items-center gap-2.5 rounded-control border border-ink-200 bg-ink-50 px-3.5 text-left text-sm text-ink-400 transition-colors active:bg-ink-100',
        focusRing
      )}
    >
      <Search className="h-4.5 w-4.5 shrink-0" />
      Mahsulot, kategoriya yoki brend
    </button>
  );
}
