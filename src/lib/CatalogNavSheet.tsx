import { forwardRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ArrowLeft, ChevronRight, LayoutGrid, Search, X, SearchX } from 'lucide-react';
import { Link } from './router';
import { AnimatedDrawer } from './AnimatedPrimitives';
import { useCategoryTree, searchCategories, type CategoryNode } from './categoryTree';
import { useCategoryBrands } from './categoryBrands';
import { DURATION, EASE } from './motion';
import { cx, focusRing, input, skeleton } from './design';
import { Img } from './Img';

/*
 * MOBIL KATALOG — to'liq ekranli ierarxik navigatsiya.
 *
 * Bu desktop mega-menyuning kichraytirilgan nusxasi EMAS. Telefonda
 * uch ustunli menyu o'qilmaydi, shuning uchun bu yerda boshqa shakl
 * tanlangan: bitta ustun + darajama-daraja kirib borish.
 *
 * MA'LUMOT BIR XIL. Ikkala yuza ham `useCategoryTree()` dan oziqlanadi,
 * ya'ni admin qo'shgan kategoriya ikkalasida ham bir vaqtda paydo
 * bo'ladi. Faqat TAQDIMOT farq qiladi.
 *
 * Daraja almashishi BROWSER TARIXINI ifloslantirmaydi: bu navigatsiya
 * UI'si, marshrut emas. Foydalanuvchi "orqaga" tugmasini bosganda
 * do'kondan chiqib ketmasligi kerak. Marshrutga o'tish faqat oxirgi
 * bosqichda — kategoriya tanlanganda — sodir bo'ladi.
 *
 * Hayot sikli `AnimatedDrawer` dan meros: `useIsPresent()` tufayli
 * scroll qulfi, fokus tuzog'i va Escape chiqish animatsiyasini KUTMAYDI.
 */

/*
 * CHIQAYOTGAN RO'YXAT BOSISHNI YUTIB QOLMASIN.
 *
 * `popLayout` chiqayotgan ro'yxatni `position: absolute` ga o'tkazadi
 * va u yangisining USTIDA qoladi. O'lchandi: `opacity: 0` bo'lsa ham
 * `elementFromPoint` aynan o'sha ko'rinmas ro'yxatni qaytardi — ya'ni
 * tez bosayotgan foydalanuvchining bosishi "yo'qolardi".
 *
 * NEGA `useIsPresent()`, NEGA `exit={{ pointerEvents: 'none' }}` EMAS.
 * Ikkinchisi himoyani ANIMATSIYAGA bog'laydi: Motion qiymatni faqat
 * birinchi kadrda yozadi. Sahifa fon rejimida bo'lsa kadr umuman
 * kelmaydi (o'lchandi: 1645ms ichida 0 kadr) va himoya ishlamaydi.
 * `useIsPresent()` esa — React holati: u render paytida qo'llanadi va
 * `requestAnimationFrame` ga umuman bog'liq emas.
 */
/*
 * `forwardRef` SHART, bezak emas.
 *
 * `popLayout` bolani `PopChildMeasure` ichiga o'raydi va chiqayotgan
 * elementni oqimdan chiqarishdan OLDIN uning o'lchamini ref orqali
 * o'lchaydi. Oddiy funksional komponent ref ni yutib yuboradi (React
 * ogohlantiradi: "Function components cannot be given refs") va u holda
 * `popLayout` ro'yxatni o'lchay olmaydi — chiqayotgan ro'yxat o'z
 * kengligi/joyini saqlamay, ko'z oldida siqilib qoladi.
 */
const NavList = forwardRef<HTMLUListElement, React.ComponentProps<typeof motion.ul>>(
  function NavList({ children, ...rest }, ref) {
    const present = useIsPresent();
    return (
      <motion.ul
        {...rest}
        ref={ref}
        className={cx('w-full divide-y divide-ink-50', !present && 'pointer-events-none')}
      >
        {children}
      </motion.ul>
    );
  }
);

export function CatalogNavSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tree, loading } = useCategoryTree();
  const reduce = useReducedMotion();
  /** Ochilgan darajalar yo'li. Bo'sh = yuqori daraja. */
  const [stack, setStack] = useState<CategoryNode[]>([]);
  const [query, setQuery] = useState('');
  /** +1 = ichkariga, −1 = orqaga. Slayd yo'nalishini belgilaydi. */
  const [dir, setDir] = useState(1);

  /*
   * BREND BOSQICHI — navigatsiyaning oxirgi darajasi.
   *
   *   Kategoriya → Bo'lim → BREND → Mahsulotlar
   *
   * Bo'lim ichida boshqa bo'lim bo'lmasa (barg), mahsulotlarga
   * TO'G'RIDAN-TO'G'RI o'tilmaydi: avval shu bo'limdagi brendlar
   * ko'rsatiladi. Brend tanlanganda katalog filtr bilan ochiladi.
   *
   * `brandFor` — brendlari ko'rsatilayotgan bo'lim. `null` bo'lsa
   * odatdagi kategoriya ro'yxati chiziladi.
   */
  const [brandFor, setBrandFor] = useState<CategoryNode | null>(null);
  const { brands, loading: brandsLoading } = useCategoryBrands(brandFor, tree);

  const current = stack.length ? stack[stack.length - 1] : null;
  const list = current ? current.children : tree;
  const results = useMemo(() => searchCategories(tree, query), [tree, query]);
  const searching = query.trim().length > 0;

  const reset = () => {
    setStack([]);
    setBrandFor(null);
    setQuery('');
    setDir(1);
  };

  const close = () => {
    onClose();
    // Keyingi ochilishda yuqori darajadan boshlansin.
    reset();
  };

  /**
   * Ichkariga kirish.
   *
   * Ichki bo'limlari bor tugun → keyingi kategoriya darajasi.
   * Barg tugun → BREND bosqichi.
   */
  const enter = (node: CategoryNode) => {
    setDir(1);
    if (node.children.length > 0) setStack((s) => [...s, node]);
    else setBrandFor(node);
  };

  /** Orqaga — avval brend bosqichidan, keyin kategoriya darajalaridan. */
  const back = () => {
    setDir(-1);
    if (brandFor) setBrandFor(null);
    else setStack((s) => s.slice(0, -1));
  };

  /** Sarlavhada ko'rinadigan joriy daraja nomi. */
  const heading = brandFor ? brandFor.name : current ? current.name : 'Katalog';
  const canGoBack = Boolean(brandFor) || stack.length > 0;

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: dir * 28 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: dir * -28 },
      };

  const sheet = (
    /*
     * O'ram `AnimatePresence` DAN TASHQARIDA va bosishni qabul qilishi
     * `open` HOLATIGA bog'langan. Bu — filtr varag'idagi bilan bir xil
     * qoida: ko'rinmas qatlam hech qachon bosishni yutib qolmasligi
     * kerak, hatto chiqish animatsiyasi tugamasa ham.
     */
    <div className={cx('fixed inset-0 z-[75] tab:hidden', !open && 'pointer-events-none')}>
      <AnimatePresence>
        {open && (
          <AnimatedDrawer
            side="bottom"
            onClose={close}
            ariaLabel="Katalog"
            panelClassName="absolute inset-0 flex flex-col bg-white"
          >
            {/* ── Sarlavha ─────────────────────────────────────── */}
            <div
              className="flex shrink-0 items-center gap-1 border-b border-ink-100 px-2"
              style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
            >
              {canGoBack ? (
                <button
                  type="button"
                  onClick={back}
                  aria-label="Orqaga"
                  className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-600', focusRing)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : (
                <span className="h-11 w-11 shrink-0" aria-hidden="true" />
              )}

              <h2 className="min-w-0 flex-1 truncate pb-2 pt-2 text-center text-base font-semibold text-ink-900">
                {heading}
              </h2>

              <button
                type="button"
                onClick={close}
                aria-label="Yopish"
                className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-500', focusRing)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Kategoriya qidiruvi ──────────────────────────── */}
            <div className="shrink-0 border-b border-ink-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Kategoriyadan qidiring..."
                  aria-label="Kategoriyadan qidirish"
                  className={cx(input(), 'pl-9 pr-9')}
                />
                {searching && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Qidiruvni tozalash"
                    className={cx('absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-400', focusRing)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Ro'yxat ──────────────────────────────────────── */}
            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={cx('h-12 rounded-control', skeleton)} />
                  ))}
                </div>
              ) : searching ? (
                <SearchResults results={results} onPick={close} />
              ) : (
                /*
                 * `popLayout`, `wait` EMAS — va bu ikki sababdan MUHIM.
                 *
                 * 1. TO'G'RILIK. `mode="wait"` da yangi ro'yxat eskisining
                 *    CHIQISH animatsiyasi tugagunicha umuman mount
                 *    bo'lmaydi. Sahifa fon rejimiga o'tsa brauzer
                 *    `requestAnimationFrame` ni to'xtatadi (o'lchandi:
                 *    1645ms ichida 0 kadr) — ya'ni chiqish HECH QACHON
                 *    tugamaydi. Natijada sarlavha «Telefonlar» ga
                 *    o'zgaradi, lekin ostida hamon ESKI ro'yxat turadi.
                 *    Navigatsiyaning to'g'riligi animatsiyaga bog'lanib
                 *    qolgan edi; endi bog'lanmagan.
                 *
                 * 2. TEZLIK. `wait` da har bosish 300ms chiqish + 300ms
                 *    kirish = 600ms. To'rt bosqichli yo'lda bu sezilarli
                 *    sustlik. `popLayout` eskisini oqimdan chiqarib,
                 *    ikkalasini BARAVARIGA harakatlantiradi — telefondagi
                 *    odatiy "push" o'tishi, 300ms.
                 */
                <AnimatePresence mode="popLayout" initial={false}>
                  <NavList
                    /*
                     * `key` ga brend bosqichi ham kiradi — aks holda
                     * kategoriya ro'yxatidan brendlarga o'tishda
                     * `AnimatePresence` almashinuvni sezmay qolardi va
                     * slayd animatsiyasi o'ynamasdi.
                     */
                    key={brandFor ? `brand-${brandFor.id}` : current?.id ?? 'root'}
                    {...slide}
                    transition={{ duration: DURATION.drawer, ease: EASE.standard }}
                  >
                    {/*
                      "Barchasi" — joriy darajaning O'ZIGA o'tish yo'li.
                      Usiz ota-kategoriyaga kirgan foydalanuvchi uning
                      mahsulotlarini umuman ko'ra olmasdi.
                    */}
                    {/* ── BREND BOSQICHI ────────────────────────── */}
                    {brandFor ? (
                      <>
                        {/* Brendsiz — bo'limning BARCHA mahsulotlari. */}
                        <li>
                          <Link
                            to={`/category/${brandFor.slug}`}
                            onClick={close}
                            className={cx('flex min-h-[3rem] items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-orange-700', focusRing)}
                          >
                            Barcha «{brandFor.name}» mahsulotlari
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          </Link>
                        </li>

                        {brandsLoading &&
                          Array.from({ length: 4 }).map((_, i) => (
                            <li key={`sk-${i}`} className="px-4 py-3">
                              <div className={cx('h-5 w-32 rounded', skeleton)} />
                            </li>
                          ))}

                        {!brandsLoading &&
                          brands.map((b) => (
                            <li key={b.name}>
                              {/*
                                Brend FILTR sifatida ochiladi — kategoriya
                                sifatida emas. `?brand=` ni CatalogPage
                                allaqachon o'qiydi.
                              */}
                              <Link
                                to={`/category/${brandFor.slug}?brand=${encodeURIComponent(b.name)}`}
                                onClick={close}
                                className={cx('flex min-h-[3rem] items-center gap-3 px-4 py-3 active:bg-ink-50', focusRing)}
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-ink-50 text-[11px] font-bold uppercase text-ink-500">
                                  {b.name.slice(0, 2)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{b.name}</span>
                                {/* Haqiqiy son — o'ylab topilmagan. */}
                                <span className="shrink-0 text-xs tabular-nums text-ink-400">{b.count}</span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                              </Link>
                            </li>
                          ))}

                        {!brandsLoading && brands.length === 0 && (
                          <li className="px-4 py-10 text-center text-sm text-ink-500">
                            Bu bo‘limda brend ko‘rsatilmagan mahsulotlar bor.
                          </li>
                        )}
                      </>
                    ) : (
                      <>
                        {current && (
                          <li>
                            <Link
                              to={`/category/${current.slug}`}
                              onClick={close}
                              className={cx('flex min-h-[3rem] items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-orange-700', focusRing)}
                            >
                              Barcha «{current.name}» mahsulotlari
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            </Link>
                          </li>
                        )}

                        {list.map((node) => (
                          <li key={node.id}>
                            {/*
                              Hamma tugun ENDI tugma: ichki bo'limi bor
                              bo'lsa keyingi darajaga, bo'lmasa brendlar
                              ro'yxatiga o'tadi. Ikkalasi ham `enter()`
                              ichida hal qilinadi.
                            */}
                            <button
                              type="button"
                              onClick={() => enter(node)}
                              aria-label={
                                node.children.length > 0
                                  ? `${node.name} — ichki bo‘limlar`
                                  : `${node.name} — brendlar`
                              }
                              className={cx('flex w-full min-h-[3rem] items-center gap-3 px-4 py-3 text-left active:bg-ink-50', focusRing)}
                            >
                              <CategoryIcon node={node} />
                              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{node.name}</span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                            </button>
                          </li>
                        ))}

                        {list.length === 0 && !current && (
                          <li className="px-4 py-10 text-center text-sm text-ink-500">
                            Kategoriyalar hali qo‘shilmagan.
                          </li>
                        )}
                      </>
                    )}
                  </NavList>
                </AnimatePresence>
              )}
            </div>

            {/* ── Butun katalog ────────────────────────────────── */}
            <div
              className="shrink-0 border-t border-ink-100 p-3"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <Link
                to="/catalog"
                onClick={close}
                className={cx('flex min-h-[2.75rem] items-center justify-center gap-2 rounded-control bg-ink-900 px-4 text-sm font-semibold text-white', focusRing)}
              >
                <LayoutGrid className="h-4 w-4" /> Butun katalogni ko‘rish
              </Link>
            </div>
          </AnimatedDrawer>
        )}
      </AnimatePresence>
    </div>
  );

  /*
   * PORTAL — `document.body` ga.
   *
   * Chaqiruvchi (pastki navigatsiya) `transform` qo'llanadigan
   * elementlarni o'z ichiga oladi; transformlangan ota `position: fixed`
   * uchun yangi koordinata boshlanishi yaratadi va to'liq ekranli
   * qatlam noto'g'ri joyga tushib qolardi.
   */
  return typeof document === 'undefined' ? null : createPortal(sheet, document.body);
}

function CategoryIcon({ node }: { node: CategoryNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-control border border-ink-200 bg-ink-50">
      {node.image_url ? (
        <Img src={node.image_url} alt="" className="h-full w-full" sizes="36px" iconClassName="h-4 w-4" />
      ) : (
        <LayoutGrid className="h-4 w-4 text-ink-400" />
      )}
    </span>
  );
}

/**
 * Qidiruv natijalari — har biri o'z YO'LI bilan.
 *
 * Faqat nom ko'rsatilsa, "Smartfonlar" qaysi bo'limga tegishli ekani
 * noma'lum bo'lardi. Yo'l ("Telefonlar → Smartfonlar") buni hal qiladi.
 */
function SearchResults({
  results, onPick,
}: {
  results: { node: CategoryNode; path: CategoryNode[] }[];
  onPick: () => void;
}) {
  if (results.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          <SearchX className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-ink-900">Hech narsa topilmadi</p>
        <p className="mt-1 text-sm text-ink-500">Boshqa nom bilan urinib ko‘ring.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-ink-50">
      {results.map(({ node, path }) => (
        <li key={node.id}>
          <Link
            to={`/category/${node.slug}`}
            onClick={onPick}
            className={cx('flex min-h-[3rem] flex-col justify-center gap-0.5 px-4 py-3 active:bg-ink-50', focusRing)}
          >
            <span className="truncate text-sm font-medium text-ink-900">{node.name}</span>
            {path.length > 1 && (
              <span className="truncate text-xs text-ink-400">
                {path.slice(0, -1).map((p) => p.name).join(' → ')}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
