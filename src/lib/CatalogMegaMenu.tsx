import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { Link } from './router';
import { useCategoryTree, type CategoryNode } from './categoryTree';
import { useCategoryBrands } from './categoryBrands';
import { DURATION, EASE, springs } from './motion';
import { cx, focusRing, popSurface, skeleton } from './design';
import { Img } from './Img';

/*
 * DESKTOP MEGA-MENYU.
 *
 * Chapda — birinchi daraja, oʻngda tanlangan kategoriyaning ichki
 * boʻlimlari VA brendlari. Mobil varaqdagi toʻrt bosqichli yoʻl
 * (kategoriya → boʻlim → brend → mahsulot) shu yerda bir ekranga
 * yoyiladi: desktopda joy bor, ortiqcha bosish kerak emas.
 *
 * ILGARI IKKI REJIM BOR EDI. Ierarxiya boʻlmaganda oʻng panel boʻsh
 * qolardi va shuning uchun tekis toʻr chizilardi. Endi oʻng panel hech
 * qachon boʻsh emas — boʻlimlar boʻlmasa brendlar, ular ham boʻlmasa
 * halol boʻsh holat koʻrsatiladi. Yaʼni ikkinchi rejim keraksiz boʻlib
 * qoldi va OLIB TASHLANDI: bitta yoʻl — bitta xatti-harakat.
 *
 * Menyu hech qachon boʻsh ustunni toʻldirish uchun kategoriya yoki
 * brend OʻYLAB TOPMAYDI.
 *
 * Maʼlumot manbai — `useCategoryTree()`, mobil varaq bilan bir xil.
 */

export function CatalogMegaMenu({ onNavigate }: { onNavigate: () => void }) {
  const { tree, loading } = useCategoryTree();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Birinchi kategoriya sukut boʻyicha faol — oʻng panel hech qachon
  // sababsiz boʻsh turmaydi.
  useEffect(() => {
    if (!activeId && tree.length > 0) setActiveId(tree[0].id);
  }, [tree, activeId]);

  if (loading) {
    return (
      <div className={cx(popSurface, 'absolute left-0 top-full z-50 mt-2 w-[44rem] p-3')}>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={cx('h-9 rounded-control', skeleton)} />
          ))}
        </div>
      </div>
    );
  }

  if (tree.length === 0) return null;

  const active = tree.find((c) => c.id === activeId) ?? tree[0];

  return (
    <div
      className={cx(
        popSurface,
        // Kenglik CHEKLANGAN: 1920pxʼda menyu butun ekranga choʻzilsa
        // qatorlar oʻqib boʻlmas darajada uzun boʻlib ketardi.
        'absolute left-0 top-full z-50 mt-2 flex w-[min(64rem,calc(100vw-3rem))] overflow-hidden'
      )}
    >
      {/* Chap ustun — birinchi daraja */}
      <div className="flex max-h-[70vh] w-64 shrink-0 flex-col border-r border-ink-100">
        <ul
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Asosiy kategoriyalar"
        >
          {tree.map((c) => {
            const isActive = c.id === active.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  // Hover bilan ham, klaviatura fokusi bilan ham almashadi —
                  // sichqonchasiz foydalanuvchi hech narsa yoʻqotmaydi.
                  onMouseEnter={() => setActiveId(c.id)}
                  onFocus={() => setActiveId(c.id)}
                  onClick={() => setActiveId(c.id)}
                  className={cx(
                    'relative flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm transition-colors',
                    focusRing,
                    isActive ? 'font-semibold text-orange-700' : 'text-ink-700 hover:bg-ink-50'
                  )}
                >
                  {/*
                    Faol fon ALOHIDA qatlam va `layoutId` bilan: u
                    kategoriyalar orasida SIRG'ALIB o'tadi. Fonni tugma
                    sinfiga qo'shsak, u shunchaki o'chib-yonardi.
                  */}
                  {isActive && (
                    <motion.span
                      layoutId="megamenu-active"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-control bg-orange-50"
                      transition={springs.snappy}
                    />
                  )}
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-control border border-ink-200 bg-ink-50">
                    {c.image_url ? (
                      <Img src={c.image_url} alt="" className="h-full w-full" sizes="32px" iconClassName="h-4 w-4" />
                    ) : (
                      <LayoutGrid className="h-3.5 w-3.5 text-ink-400" />
                    )}
                  </span>
                  <span className="relative min-w-0 flex-1 truncate">{c.name}</span>
                  <ChevronRight
                    className={cx('relative h-4 w-4 shrink-0', isActive ? 'text-orange-500' : 'text-ink-300')}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <AllCatalogLink onNavigate={onNavigate} />
      </div>

      {/* O'ng panel — tanlangan kategoriyaning bo'limlari + brendlari */}
      <ActivePanel key={active.id} node={active} tree={tree} onNavigate={onNavigate} />
    </div>
  );
}

/*
 * OʻNG PANEL — tanlangan kategoriyaning ichki mazmuni.
 *
 * Mobil varaqda brendlar ALOHIDA ekran boʻlib ochiladi, chunki u yerda
 * joy yoʻq. Desktopda esa drill-down ortiqcha bosish boʻlardi: panel
 * allaqachon keng, shuning uchun boʻlimlar va brendlar YONMA-YON
 * koʻrsatiladi.
 *
 * Brend bosilganda kategoriya sahifasi FILTR bilan ochiladi
 * (`?brand=…`) — `categories` jadvaliga hech narsa yozilmaydi.
 *
 * Panel uchta holatni biladi va ularning hech biri boʻsh koʻrinmaydi:
 *   boʻlimlar bor      → ustunli toʻr
 *   brendlar bor       → yumaloq tugmalar zanjiri
 *   ikkovi ham yoʻq    → halol boʻsh holat («hozircha mahsulot yoʻq»)
 *
 * Boʻsh holatni toʻldirish uchun kategoriya yoki brend OʻYLAB
 * TOPILMAYDI — yoʻq maʼlumot yoʻqligicha aytiladi.
 */
function ActivePanel({
  node,
  tree,
  onNavigate,
}: {
  node: CategoryNode;
  tree: CategoryNode[];
  onNavigate: () => void;
}) {
  const reduce = useReducedMotion();
  const { brands, loading } = useCategoryBrands(node, tree);
  const hasSections = node.children.length > 0;
  const isEmpty = !loading && !hasSections && brands.length === 0;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      // 200ms — almashish DARHOL sezilishi kerak, "sayohat" emas.
      transition={{ duration: DURATION.ui, ease: EASE.standard }}
      className="max-h-[70vh] min-w-0 flex-1 overflow-y-auto overscroll-contain p-4"
      role="tabpanel"
      aria-label={node.name}
    >
      <Link
        to={`/category/${node.slug}`}
        onClick={onNavigate}
        className={cx(
          'inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-800',
          focusRing
        )}
      >
        Barcha «{node.name}» mahsulotlari <ChevronRight className="h-4 w-4" />
      </Link>

      {hasSections && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
          {node.children.map((sub) => (
            <div key={sub.id} className="min-w-0">
              <Link
                to={`/category/${sub.slug}`}
                onClick={onNavigate}
                className={cx('block truncate text-sm font-semibold text-ink-900 hover:text-orange-700', focusRing)}
              >
                {sub.name}
              </Link>
              <SubTree nodes={sub.children} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className={cx('mt-5 pt-4', hasSections && 'border-t border-ink-100')}>
          <div className={cx('h-3 w-20 rounded', skeleton)} />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cx('h-8 w-24 rounded-full', skeleton)} />
            ))}
          </div>
        </div>
      )}

      {!loading && brands.length > 0 && (
        <div className={cx('mt-5 pt-4', hasSections && 'border-t border-ink-100')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Brendlar</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {brands.map((b, i) => (
              <motion.div
                key={b.name}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                /*
                 * Zinapoya CHEKLANGAN: 8 tadan keyin kechikish oʻsmaydi.
                 * Aks holda 30 brendli kategoriyada oxirgisi ~1s kechikib
                 * chiqardi va roʻyxat "sekin" tuyulardi.
                 */
                transition={{
                  duration: DURATION.ui,
                  ease: EASE.standard,
                  delay: reduce ? 0 : Math.min(i, 8) * 0.025,
                }}
              >
                <Link
                  to={`/category/${node.slug}?brand=${encodeURIComponent(b.name)}`}
                  onClick={onNavigate}
                  className={cx(
                    'flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-sm text-ink-700 transition-colors',
                    'hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700',
                    focusRing
                  )}
                >
                  {b.name}
                  <span className="text-xs tabular-nums text-ink-400">{b.count}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-50">
            <LayoutGrid className="h-5 w-5 text-ink-300" />
          </span>
          <p className="text-sm text-ink-500">Bu kategoriyada hozircha mahsulot yoʻq</p>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Ustun ichidagi ichki boʻlimlar — REKURSIV.
 *
 * Ilgari bu yerda qatʼiy ikki qavat yozilgan edi:
 * `sub.children.map(leaf => …)` va shu yerda toʻxtardi. Natijada
 * admin 4-darajali kategoriya yaratsa, u desktop menyusida UMUMAN
 * koʻrinmasdi — mobil varaqda esa koʻrinardi, chunki u stek asosida
 * ishlaydi. Yaʼni bir xil maʼlumot ikki yuzada boshqacha chiqardi.
 *
 * Endi chuqurlik chegarasi yoʻq: daraxt qanchalik chuqur boʻlsa,
 * shunchalik chiziladi va yangi daraja uchun kod oʻzgartirish kerak
 * emas.
 *
 * `depth` faqat CHEKINISH (indent) uchun va u 3-darajadan keyin
 * oʻsmaydi — aks holda chuqur shoxlar ustun kengligidan chiqib
 * ketardi. Yaʼni chegara VIZUAL, maʼlumotga tegishli emas.
 */
function SubTree({
  nodes,
  onNavigate,
  depth = 0,
}: {
  nodes: CategoryNode[];
  onNavigate: () => void;
  depth?: number;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className={cx('space-y-1', depth === 0 ? 'mt-1.5' : 'mt-1')}>
      {nodes.map((n) => (
        <li key={n.id} style={{ paddingLeft: Math.min(depth, 3) * 10 }}>
          <Link
            to={`/category/${n.slug}`}
            onClick={onNavigate}
            className={cx('block truncate text-sm text-ink-500 hover:text-orange-700', focusRing)}
          >
            {n.name}
          </Link>
          <SubTree nodes={n.children} onNavigate={onNavigate} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}


function AllCatalogLink({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      to="/catalog"
      onClick={onNavigate}
      className={cx(
        'mt-1 flex items-center justify-center gap-2 rounded-control border-t border-ink-100 px-2.5 py-2.5 text-sm font-semibold text-ink-700 hover:text-orange-700',
        focusRing
      )}
    >
      <LayoutGrid className="h-4 w-4" /> Butun katalogni koʻrish
    </Link>
  );
}
