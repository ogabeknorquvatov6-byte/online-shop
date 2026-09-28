import { useMemo } from 'react';
import { SearchX, Tag, LayoutGrid, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { formatPrice } from './types';
import { splitHighlight, buildFlatItems, type SearchCategory, type SearchProductRow, type FlatItem } from './search';
import { DURATION } from './motion';
import { cx, focusRing, skeleton } from './design';
import { Img } from './Img';

/*
 * Qidiruv natijalarining ko'rinishi. Desktop dropdown ham, to'liq ekranli
 * mobil qidiruv sahifasi ham AYNAN shu komponentdan foydalanadi — shuning
 * uchun natijalar ikkala joyda bir xil ko'rinadi va bir marta tuzatilsa
 * hamma joyda tuzaladi.
 */


/** Qidirilgan so'zga mos qismni ajratib ko'rsatadi. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitHighlight(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-orange-100 text-orange-800">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

export function ProductThumb({ url, size = 'md' }: { url: string | null; size?: 'md' | 'lg' }) {
  // Skeleton/buzuq rasm holatlari `Img` ichida — bu yerda faqat o'lcham.
  return (
    <Img
      src={url}
      alt=""
      className={cx(
        'shrink-0 rounded-control border border-ink-100',
        size === 'lg' ? 'h-14 w-14' : 'h-11 w-11'
      )}
      sizes={size === 'lg' ? '56px' : '44px'}
      iconClassName="h-4 w-4"
    />
  );
}

export function SearchResultsBody({
  query, loading, error, categories, brands, products, activeIndex, onHoverIndex, onPick, onRetry, dense,
}: {
  query: string;
  loading: boolean;
  /** So'rov muvaffaqiyatsiz tugadi (tarmoq/server). */
  error?: boolean;
  categories: SearchCategory[];
  brands: string[];
  products: SearchProductRow[];
  activeIndex: number;
  onHoverIndex: (i: number) => void;
  onPick: (item: FlatItem) => void;
  onRetry?: () => void;
  dense?: boolean;
}) {
  const flat = useMemo(() => buildFlatItems(categories, brands, products), [categories, brands, products]);
  const hasResults = flat.length > 0;

  if (loading && !hasResults) {
    return (
      <div className={dense ? 'space-y-3 p-3' : 'space-y-3 p-4'} aria-busy="true">
        <div className={cx('h-3 w-20 rounded', skeleton)} />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => <div key={i} className={cx('h-8 w-24 rounded-full', skeleton)} />)}
        </div>
        <div className={cx('h-3 w-16 rounded', skeleton)} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={cx('h-11 w-11 rounded-control', skeleton)} />
            <div className="flex-1 space-y-1.5">
              <div className={cx('h-3 w-3/4 rounded', skeleton)} />
              <div className={cx('h-3 w-1/3 rounded', skeleton)} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /*
   * Xato holati "topilmadi" dan AJRATILGAN.
   *
   * Ilgari tarmoq uzilganda ham "Hech narsa topilmadi" chiqardi — bu
   * foydalanuvchiga YOLG'ON ma'lumot: u mahsulot yo'q deb o'ylab
   * ketardi, aslida shunchaki internet uzilgan edi.
   */
  if (error && !hasResults) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <WifiOff className="h-5 w-5" />
        </div>
        <p className="mt-1 text-sm font-medium text-ink-800">Qidiruvni bajarib bo‘lmadi</p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-500">
          Internet aloqasini tekshiring va qayta urinib ko‘ring.
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className={cx('mt-2 text-xs font-semibold text-orange-700 hover:underline', focusRing)}>
            Qayta urinish
          </button>
        )}
      </div>
    );
  }

  if (!hasResults) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.ui }}
        className="flex flex-col items-center gap-2 px-6 py-10 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          <SearchX className="h-5 w-5" />
        </div>
        <p className="mt-1 text-sm font-medium text-ink-800">Hech narsa topilmadi</p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-500">
          Qidiruv so‘zini qisqartirib yoki boshqacha yozib ko‘ring.
        </p>
      </motion.div>
    );
  }

  let flatIdx = -1;

  return (
    <div className={dense ? 'py-2' : 'py-3'}>
      {categories.length > 0 && (
        <div className={dense ? 'px-3 pb-3' : 'px-4 pb-3'}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Kategoriyalar</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              flatIdx += 1;
              const idx = flatIdx;
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={() => onPick({ kind: 'category', data: c })}
                  className={cx(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
                    focusRing,
                    activeIndex === idx
                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5 opacity-50" />
                  <Highlight text={c.name} query={query} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div className={dense ? 'px-3 pb-3' : 'px-4 pb-3'}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Brendlar</p>
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => {
              flatIdx += 1;
              const idx = flatIdx;
              return (
                <button
                  key={b}
                  type="button"
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={() => onPick({ kind: 'brand', data: b })}
                  className={cx(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
                    focusRing,
                    activeIndex === idx
                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                  )}
                >
                  <Tag className="h-3 w-3 opacity-50" />
                  <Highlight text={b} query={query} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div className={dense ? 'px-1.5' : 'px-2'}>
          <p className={cx('mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400', dense ? 'px-2' : 'px-2')}>
            Mahsulotlar
          </p>
          <div className={dense ? '' : 'max-h-80 overflow-y-auto'}>
            {products.map((p) => {
              flatIdx += 1;
              const idx = flatIdx;
              const discounted = p.discount_price != null && p.discount_price > 0 && p.discount_price < p.price;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={() => onPick({ kind: 'product', data: p })}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors',
                    focusRing,
                    activeIndex === idx ? 'bg-orange-50' : 'hover:bg-ink-50'
                  )}
                >
                  <ProductThumb url={p.image_url} size={dense ? 'lg' : 'md'} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug text-ink-800">
                      <Highlight text={p.name} query={query} />
                    </p>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-ink-900">
                        {formatPrice(discounted ? p.discount_price! : p.price)}
                      </span>
                      {discounted && (
                        <span className="text-xs text-ink-400 line-through">{formatPrice(p.price)}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
