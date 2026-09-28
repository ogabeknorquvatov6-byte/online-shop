import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Heart } from 'lucide-react';
import { FlightContext, type FlightKind, type FlyFn } from './flightContext';

/*
 * "Savatga tushish" va "Sevimlilarga uchish".
 *
 * Ikkalasi ham bitta mexanizmdan foydalanadi, lekin ATAYLAB boshqacha
 * his beradi:
 *
 *   CART — jismoniy. Mahsulot rasmining oʻzi biroz yoy chizib, oxirida
 *          TEZLASHIB savat ikonkasining ICHIGA tushadi. "Buyum qutiga
 *          tashlandi" degan tuygʻu.
 *
 *   FAV  — hissiy. Yurakcha balandroq va yumshoqroq yoy bilan
 *          koʻtariladi, kichrayadi va soʻnadi. "Yoqtirish yuborildi"
 *          degan tuygʻu. Bu savat animatsiyasining boshqa rangdagi
 *          nusxasi EMAS: traektoriya balandroq, tezlanish yumshoqroq,
 *          obyekt esa rasm emas — chizilgan yurakcha.
 *
 * Umumiy tamoyillar:
 *  - Holat DARHOL yangilanadi. Animatsiya hech narsani kutib turmaydi
 *    va hech narsani toʻsmaydi (`pointer-events: none`).
 *  - Faqat `transform` va `opacity`. `top/left/width/height` umuman
 *    animatsiya qilinmaydi — layout qayta hisoblanmaydi.
 *  - Hamma narsa `document.body` ga PORTAL qilinadi: kartochkalar
 *    transform qoʻllanadigan `AnimatedSection` ichida boʻlishi mumkin,
 *    portalsiz `position: fixed` traektoriyasi buzilardi.
 *  - Vaqtinchalik elementlar oʻzini tozalaydi va toʻplanib qolmaydi.
 */

/** Uchish davomiyligi (ms). Talab: 450–700. */
const FLIGHT_MS = 560;
/** Nishon reaksiyasi (ms). Talab: 200–350. */
const BURST_MS = 320;

type Flight = {
  id: number;
  kind: FlightKind;
  src?: string | null;
  from: { x: number; y: number; size: number };
  to: { x: number; y: number };
  /** Yoyning balandligi — traektoriyani toʻgʻri chiziqdan farqlaydi. */
  arc: number;
};

type Burst = { id: number; kind: FlightKind; x: number; y: number; size: number };

let nextId = 0;

/**
 * Ekranda HAQIQATAN koʻrinib turgan nishonni topadi.
 *
 * Ilova bir vaqtning oʻzida ikkita nishon saqlaydi (header va pastki
 * navigatsiya) — biri har doim yashiringan. Yashiringanini tanlash
 * obyektni ekrandan tashqariga uchirib yuborardi, shuning uchun
 * `display`, `visibility` VA oʻlcham — uchalasi ham tekshiriladi.
 */
function findVisibleTarget(selector: string): { el: HTMLElement; rect: DOMRect } | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { el, rect };
  }
  return null;
}

export function FlightProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  /* Tozalash uchun — komponent yoʻq qilinsa taymerlar ham toʻxtaydi. */
  const timers = useRef<number[]>([]);

  /** Nishon ikonkasining oʻzini "qabul qildim" deb sakratadi. */
  const popTarget = useCallback((el: HTMLElement) => {
    el.classList.add('is-receiving');
    const t = window.setTimeout(() => el.classList.remove('is-receiving'), BURST_MS + 40);
    timers.current.push(t);
  }, []);

  const fly = useCallback<FlyFn>(
    (kind, origin, imageSrc) => {
      const selector = kind === 'cart' ? '[data-cart-target]' : '[data-favorites-target]';
      const target = findVisibleTarget(selector);
      if (!target) return;

      /*
       * REDUCED MOTION: uchish umuman boʻlmaydi. Lekin foydalanuvchi
       * baribir tasdiq olishi kerak — shuning uchun nishon qisqa
       * "pop" qiladi. Global CSS qoidasi (`index.css`) uning
       * davomiyligini nolga tushiradi, yaʼni bu bir zumlik holat
       * oʻzgarishiga aylanadi.
       */
      if (reduce) {
        popTarget(target.el);
        return;
      }

      if (!origin) return;
      const from = origin.getBoundingClientRect();
      if (from.width === 0) return;
      // `cart` rasmsiz ishlamaydi; `fav` esa oʻz yurakchasini chizadi.
      if (kind === 'cart' && !imageSrc) return;

      const size =
        kind === 'cart'
          ? Math.min(96, Math.max(52, from.width * 0.5))
          : 28;

      const id = nextId++;
      const toX = target.rect.left + target.rect.width / 2 - size / 2;
      const toY = target.rect.top + target.rect.height / 2 - size / 2;

      setFlights((prev) => [
        ...prev,
        {
          id,
          kind,
          src: imageSrc,
          from: {
            x: from.left + from.width / 2 - size / 2,
            y: from.top + from.height / 2 - size / 2,
            size,
          },
          to: { x: toX, y: toY },
          // Yurakcha balandroq va yengilroq koʻtariladi.
          arc: kind === 'cart' ? 72 : 118,
        },
      ]);

      // Obyekt AYNAN yetib kelgan payt — nishon shunda javob beradi.
      const arrive = window.setTimeout(() => {
        popTarget(target.el);
        setBursts((prev) => [
          ...prev,
          {
            id,
            kind,
            x: target.rect.left + target.rect.width / 2,
            y: target.rect.top + target.rect.height / 2,
            size: Math.max(target.rect.width, target.rect.height),
          },
        ]);
      }, FLIGHT_MS);

      const cleanup = window.setTimeout(() => {
        setFlights((prev) => prev.filter((f) => f.id !== id));
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, FLIGHT_MS + BURST_MS + 60);

      timers.current.push(arrive, cleanup);
    },
    [reduce, popTarget]
  );

  return (
    <FlightContext.Provider value={fly}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden="true">
            <AnimatePresence>
              {flights.map((f) => {
                /*
                 * EGRI TRAEKTORIYA.
                 *
                 * `x` va `y` ALOHIDA easing bilan animatsiya qilinadi —
                 * shuning uchun natija toʻgʻri chiziq emas, yoy boʻladi.
                 * `y` uch nuqtadan oʻtadi (boshlanish → yuqori nuqta →
                 * nishon), oxirgi qismida esa `easeIn` tufayli
                 * TEZLASHADI: obyekt savatga "tortilgandek" tushadi.
                 */
                const peakY = Math.min(f.from.y, f.to.y) - f.arc;
                return (
                  <motion.div
                    key={f.id}
                    initial={{ x: f.from.x, y: f.from.y, scale: 1, opacity: 1 }}
                    animate={{
                      x: f.to.x,
                      y: [f.from.y, peakY, f.to.y],
                      scale: f.kind === 'cart' ? 0.3 : 0.45,
                      // Oxirgi lahzada soʻnadi — yaʼni ikonkaning
                      // ICHIDA yoʻqoladi, undan oldin emas.
                      opacity: [1, 1, 0],
                    }}
                    /*
                     * `exit` ATAYLAB YOʻQ.
                     *
                     * Obyekt oʻz animatsiyasining oxirida allaqachon
                     * `opacity: 0` ga yetadi — qoʻshimcha chiqish
                     * animatsiyasi ortiqcha. Muhimrogʻi: `exit` boʻlsa,
                     * `AnimatePresence` elementʼni faqat chiqish
                     * animatsiyasi TUGAGACH DOMʼdan oladi. Fon rejimidagi
                     * tabʼda (rAF toʻxtaydi) u hech qachon tugamaydi va
                     * ghost DOMʼda qolib ketardi — yaʼni toʻplanib borardi.
                     * `exit`siz esa holatdan olib tashlash = darhol
                     * unmount.
                     */
                    transition={{
                      x: { duration: FLIGHT_MS / 1000, ease: [0.32, 0.5, 0.3, 1] },
                      y: {
                        duration: FLIGHT_MS / 1000,
                        times: [0, 0.42, 1],
                        ease: ['easeOut', 'easeIn'],
                      },
                      scale: { duration: FLIGHT_MS / 1000, ease: [0.4, 0, 0.6, 1] },
                      opacity: { duration: FLIGHT_MS / 1000, times: [0, 0.86, 1] },
                    }}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: f.from.size,
                      height: f.from.size,
                    }}
                  >
                    {f.kind === 'cart' ? (
                      <img
                        src={f.src ?? ''}
                        alt=""
                        className="h-full w-full rounded-card object-cover shadow-overlay ring-1 ring-black/10"
                      />
                    ) : (
                      // Yurakcha — rasm emas, chizilgan belgi. Yumshoq
                      // nur `drop-shadow` orqali; blur qatlami yoʻq.
                      <Heart
                        className="h-full w-full fill-orange-500 text-orange-500"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(234,97,0,0.55))' }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Nishon atrofidagi halqa — obyekt yetib kelgan lahzada. */}
            <AnimatePresence>
              {bursts.map((b) => (
                <motion.span
                  key={`burst-${b.id}`}
                  initial={{ opacity: 0.5, scale: 0.55 }}
                  animate={{ opacity: 0, scale: 1.85 }}
                  /* `exit` yoʻq — yuqoridagi bilan bir xil sabab. */
                  transition={{ duration: BURST_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: 'absolute',
                    left: b.x - b.size / 2,
                    top: b.y - b.size / 2,
                    width: b.size,
                    height: b.size,
                  }}
                  className={
                    b.kind === 'cart'
                      ? 'rounded-full ring-2 ring-orange-500'
                      : 'rounded-full ring-2 ring-orange-400'
                  }
                />
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </FlightContext.Provider>
  );
}
