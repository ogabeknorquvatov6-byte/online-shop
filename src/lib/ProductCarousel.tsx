import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Link } from './router';
import type { Product } from './types';
import { ProductCard, ProductCardSkeleton } from './ProductCard';
import { cx, focusRing } from './design';

/*
 * Gorizontal mahsulot karuseli.
 *
 * - Mobil: barmoq bilan surish (native scroll + scroll-snap — JS dragʻdan
 *   koʻra silliqroq va batareyani kam yeydi).
 * - Desktop: chap/oʻng strelkalar, faqat surish mumkin boʻlganda koʻrinadi.
 * - Oxirida "Barchasini koʻrish" kartasi turadi: foydalanuvchi roʻyxat
 *   oxiriga yetganda uni tabiiy ravishda uchratadi.
 */

/*
 * Karusel kartasining kengligi.
 *
 * `tab` (820px) da karta sezilarli darajada kattalashadi (224px). Ilgari
 * oʻlcham `md` da 200pxʼda toʻxtardi va 912pxʼlik planshetda ekran
 * mayda kartalar bilan toʻlib ketardi — bu "choʻzilgan mobil" hissini
 * beradigan asosiy narsalardan biri edi. Endi planshetda kartalar
 * kamroq, lekin yiriroq va mahsulot rasmi haqiqatan koʻrinadi.
 */
const CARD_WIDTH = 'w-[9.5rem] sm:w-[11rem] md:w-[12.5rem] tab:w-[14rem] lg:w-[15rem]';

export function ProductCarousel({
  products,
  loading,
  seeAllHref,
  seeAllLabel = 'Barchasini koʻrish',
  skeletonCount = 6,
  ariaLabel,
}: {
  products: Product[];
  loading?: boolean;
  seeAllHref: string;
  seeAllLabel?: string;
  skeletonCount?: number;
  ariaLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  /*
   * Surish holati 0..1.
   *
   * Strelkalar faqat `md` dan boshlab koʻrinadi, yaʼni TELEFONDA roʻyxat
   * qanchaligi va qayerda turgani haqida hech qanday ishora yoʻq edi.
   * Ingichka progress chizigʻi buni nuqtalar roʻyxatisiz hal qiladi —
   * mahsulotlar soni oʻzgaruvchan boʻlgani uchun nuqtalar bu yerda
   * yaramaydi (20 ta nuqta hech kimga foyda bermaydi).
   */
  const [progress, setProgress] = useState(0);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < max - 8);
    setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [sync, products.length, loading]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.85), behavior: reduce ? 'auto' : 'smooth' });
  };

  const arrow = (side: 'left' | 'right', enabled: boolean) =>
    cx(
      'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full',
      'border border-ink-200 bg-white text-ink-700 shadow-card transition-opacity duration-200',
      'hover:bg-ink-50 md:flex',
      side === 'left' ? '-left-4' : '-right-4',
      enabled ? 'opacity-100' : 'pointer-events-none opacity-0',
      focusRing
    );

  return (
    <div className="relative">
      <button type="button" onClick={() => page(-1)} className={arrow('left', canPrev)} aria-label="Orqaga surish" tabIndex={canPrev ? 0 : -1}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button type="button" onClick={() => page(1)} className={arrow('right', canNext)} aria-label="Oldinga surish" tabIndex={canNext ? 0 : -1}>
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={scroller}
        role="region"
        aria-label={ariaLabel}
        className={cx(
          // Chetlari sahifa gutterʼiga tekkanda "kesilgan" koʻrinmasligi uchun
          // konteyner chetlarigacha choʻziladi va ichkarida padding beriladi.
          'no-scrollbar snap-x-start -mx-4 flex gap-3 overflow-x-auto scroll-px-4 px-4 pb-1',
          'sm:-mx-5 sm:scroll-px-5 sm:px-5 lg:mx-0 lg:scroll-px-0 lg:px-0'
        )}
      >
        {loading
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className={cx('shrink-0', CARD_WIDTH)}>
                <ProductCardSkeleton />
              </div>
            ))
          : products.map((p, i) => (
              <div key={p.id} className={cx('shrink-0', CARD_WIDTH)}>
                <ProductCard product={p} priority={i < 3} />
              </div>
            ))}

        {!loading && products.length > 0 && (
          <Link
            to={seeAllHref}
            className={cx(
              'group flex shrink-0 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-300 bg-white p-5 text-center transition-colors hover:border-orange-400 hover:bg-orange-50',
              CARD_WIDTH,
              focusRing
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-600 transition-transform duration-200 group-hover:translate-x-0.5">
              <ArrowRight className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold leading-snug text-ink-900">{seeAllLabel}</span>
            <span className="text-xs text-ink-500">Barcha takliflar bitta sahifada</span>
          </Link>
        )}
      </div>

      {/*
        Faqat mobil/planshetda (strelkalar `md:flex` — ular bo'lganda
        ortiqcha) va faqat ro'yxat haqiqatan suriladigan bo'lsa.
        `translateX` — kompozitsiya bosqichida bajariladi, layout qayta
        hisoblanmaydi. Ichida `position: fixed` element yo'q.
      */}
      {(canPrev || canNext) && (
        <div className="mt-3 flex justify-center md:hidden" aria-hidden="true">
          <div className="h-1 w-14 overflow-hidden rounded-full bg-ink-200">
            <div
              className="h-full w-1/3 rounded-full bg-orange-500"
              style={{ transform: `translateX(${progress * 200}%)` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
