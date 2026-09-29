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
 * MOBIL KATALOG — toʻliq ekranli ierarxik navigatsiya.
 *
 * Bu desktop mega-menyuning kichraytirilgan nusxasi EMAS. Telefonda
 * uch ustunli menyu oʻqilmaydi, shuning uchun bu yerda boshqa shakl
 * tanlangan: bitta ustun + darajama-daraja kirib borish.
 *
 * MAʼLUMOT BIR XIL. Ikkala yuza ham `useCategoryTree()` dan oziqlanadi,
 * yaʼni admin qoʻshgan kategoriya ikkalasida ham bir vaqtda paydo
 * boʻladi. Faqat TAQDIMOT farq qiladi.
 *
 * Daraja almashishi BROWSER TARIXINI ifloslantirmaydi: bu navigatsiya
 * UIʼsi, marshrut emas. Foydalanuvchi "orqaga" tugmasini bosganda
 * doʻkondan chiqib ketmasligi kerak. Marshrutga oʻtish faqat oxirgi
 * bosqichda — kategoriya tanlanganda — sodir boʻladi.
 *
 * Hayot sikli `AnimatedDrawer` dan meros: `useIsPresent()` tufayli
 * scroll qulfi, fokus tuzogʻi va Escape chiqish animatsiyasini KUTMAYDI.
 */

/*
 * CHIQAYOTGAN ROʻYXAT BOSISHNI YUTIB QOLMASIN.
 *
 * `popLayout` chiqayotgan roʻyxatni `position: absolute` ga oʻtkazadi
 * va u yangisining USTIDA qoladi. Oʻlchandi: `opacity: 0` boʻlsa ham
 * `elementFromPoint` aynan oʻsha koʻrinmas roʻyxatni qaytardi — yaʼni
 * tez bosayotgan foydalanuvchining bosishi "yoʻqolardi".
 *
 * NEGA `useIsPresent()`, NEGA `exit={{ pointerEvents: 'none' }}` EMAS.
 * Ikkinchisi himoyani ANIMATSIYAGA bogʻlaydi: Motion qiymatni faqat
 * birinchi kadrda yozadi. Sahifa fon rejimida boʻlsa kadr umuman
 * kelmaydi (oʻlchandi: 1645ms ichida 0 kadr) va himoya ishlamaydi.
 * `useIsPresent()` esa — React holati: u render paytida qoʻllanadi va
 * `requestAnimationFrame` ga umuman bogʻliq emas.
 */
/*
 * `forwardRef` SHART, bezak emas.
 *
 * `popLayout` bolani `PopChildMeasure` ichiga oʻraydi va chiqayotgan
 * elementni oqimdan chiqarishdan OLDIN uning oʻlchamini ref orqali
 * oʻlchaydi. Oddiy funksional komponent ref ni yutib yuboradi (React
 * ogohlantiradi: "Function components cannot be given refs") va u holda
 * `popLayout` roʻyxatni oʻlchay olmaydi — chiqayotgan roʻyxat oʻz
 * kengligi/joyini saqlamay, koʻz oldida siqilib qoladi.
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
  /** Ochilgan darajalar yoʻli. Boʻsh = yuqori daraja. */
  const [stack, setStack] = useState<CategoryNode[]>([]);
  const [query, setQuery] = useState('');
  /** +1 = ichkariga, −1 = orqaga. Slayd yoʻnalishini belgilaydi. */
  const [dir, setDir] = useState(1);

  /*
   * BREND BOSQICHI — navigatsiyaning oxirgi darajasi.
   *
   *   Kategoriya → Boʻlim → BREND → Mahsulotlar
   *
   * Boʻlim ichida boshqa boʻlim boʻlmasa (barg), mahsulotlarga
   * TOʻGʻRIDAN-TOʻGʻRI oʻtilmaydi: avval shu boʻlimdagi brendlar
   * koʻrsatiladi. Brend tanlanganda katalog filtr bilan ochiladi.
   *
   * `brandFor` — brendlari koʻrsatilayotgan boʻlim. `null` boʻlsa
   * odatdagi kategoriya roʻyxati chiziladi.
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
   * Ichki boʻlimlari bor tugun → keyingi kategoriya darajasi.
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

  /** Sarlavhada koʻrinadigan joriy daraja nomi. */
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
     * Oʻram `AnimatePresence` DAN TASHQARIDA va bosishni qabul qilishi
     * `open` HOLATIGA bogʻlangan. Bu — filtr varagʻidagi bilan bir xil
     * qoida: koʻrinmas qatlam hech qachon bosishni yutib qolmasligi
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
                 * 1. TOʻGʻRILIK. `mode="wait"` da yangi roʻyxat eskisining
                 *    CHIQISH animatsiyasi tugagunicha umuman mount
                 *    boʻlmaydi. Sahifa fon rejimiga oʻtsa brauzer
                 *    `requestAnimationFrame` ni toʻxtatadi (oʻlchandi:
                 *    1645ms ichida 0 kadr) — yaʼni chiqish HECH QACHON
                 *    tugamaydi. Natijada sarlavha «Telefonlar» ga
                 *    oʻzgaradi, lekin ostida hamon ESKI roʻyxat turadi.
                 *    Navigatsiyaning toʻgʻriligi animatsiyaga bogʻlanib
                 *    qolgan edi; endi bogʻlanmagan.
                 *
                 * 2. TEZLIK. `wait` da har bosish 300ms chiqish + 300ms
                 *    kirish = 600ms. Toʻrt bosqichli yoʻlda bu sezilarli
                 *    sustlik. `popLayout` eskisini oqimdan chiqarib,
                 *    ikkalasini BARAVARIGA harakatlantiradi — telefondagi
                 *    odatiy "push" oʻtishi, 300ms.
                 */
                <AnimatePresence mode="popLayout" initial={false}>
                  <NavList
                    /*
                     * `key` ga brend bosqichi ham kiradi — aks holda
                     * kategoriya roʻyxatidan brendlarga oʻtishda
                     * `AnimatePresence` almashinuvni sezmay qolardi va
                     * slayd animatsiyasi oʻynamasdi.
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
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-ink-50 text-xs font-bold uppercase text-ink-600">
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
                            Bu boʻlimda brend koʻrsatilmagan mahsulotlar bor.
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
                                  ? `${node.name} — ichki boʻlimlar`
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
                            Kategoriyalar hali qoʻshilmagan.
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
                <LayoutGrid className="h-4 w-4" /> Butun katalogni koʻrish
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
   * Chaqiruvchi (pastki navigatsiya) `transform` qoʻllanadigan
   * elementlarni oʻz ichiga oladi; transformlangan ota `position: fixed`
   * uchun yangi koordinata boshlanishi yaratadi va toʻliq ekranli
   * qatlam notoʻgʻri joyga tushib qolardi.
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
 * Qidiruv natijalari — har biri oʻz YOʻLI bilan.
 *
 * Faqat nom koʻrsatilsa, "Smartfonlar" qaysi boʻlimga tegishli ekani
 * nomaʼlum boʻlardi. Yoʻl ("Telefonlar → Smartfonlar") buni hal qiladi.
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
        <p className="mt-1 text-sm text-ink-500">Boshqa nom bilan urinib koʻring.</p>
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
