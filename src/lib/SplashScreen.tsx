import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Cube } from './CatalogCubes';
import { EASE, SPLASH, springs } from './motion';

/*
 * KIRISH EKRANI — BELGI KUB-BO'LAKCHALARDAN YIG'ILADI.
 *
 * G'oya: ilovaning imzo shakli — `CatalogCubes` dagi to'rtta plitka.
 * Katalog ikonkasida ular bosilganda TARQALADI; bu yerda esa teskarisi,
 * ular chetlardan uchib kelib YIG'ILADI. Ya'ni do'kon "o'zini yig'ib"
 * ochiladi. Shakl ham, prujina ham (`springs.snappy`) o'sha ikonkanikidek.
 *
 * ── BU EKRAN HECH KIMNI KUTTIRMAYDI ───────────────────────────────
 *
 * Eng muhim qaror: splash ilovaning O'RNIGA emas, USTIDA turadi.
 * `<App />` bir vaqtda mount bo'ladi va ma'lumotlarni allaqachon
 * yuklay boshlaydi — splash so'nganda sahifa tayyor bo'lib chiqadi,
 * bo'm-bo'sh emas. Agar splash ilovani almashtirganda, uning har bir
 * millisekundi yuklanish vaqtiga QO'SHILARDI.
 *
 * ── NEGA `pointer-events-none` ────────────────────────────────────
 *
 * Qoplama butun ekranni to'sib turadi. Agar u biror sababga ko'ra
 * yo'qolmasa (masalan tab fon rejimiga o'tib `requestAnimationFrame`
 * to'xtasa — bu loyihada o'lchangan hodisa), foydalanuvchi ilovadan
 * BUTUNLAY ajralib qolardi. `pointer-events: none` bilan esa eng
 * yomon holatda ham ilova bosiladigan bo'lib qoladi.
 *
 * Shu sababdan yo'q qilish ham TAYMER bilan boshqariladi, animatsiya
 * tugashi bilan emas: chiqish animatsiyasi faqat bezak, u
 * TO'G'RILIK uchun javobgar emas.
 *
 * ── REDUCED MOTION ────────────────────────────────────────────────
 *
 * Splash umuman ko'rsatilmaydi. Unda hech qanday MA'LUMOT yo'q —
 * u sof bezak, shuning uchun uni o'tkazib yuborish foydalanuvchi
 * uchun faqat yaxshi: ilova darhol ochiladi.
 */

/*
 * Bo'lakchalar. `CatalogCubes` dagi dam olish holatining kattalashtirilgan
 * nusxasi: ±4.5 → ±15, kub 7px → 22px (taxminan 3.2 barobar).
 *
 *   x/y   — yakuniy joy (belgidagi o'rni)
 *   fx/fy — qayerdan uchib keladi
 *   rx/ry — boshlang'ich burilish (yig'ilgach nolga tushadi)
 *
 * Burchaklar ±70° ichida: 90° da yassi plitka qirrasi bilan turib
 * ko'rinmay qolardi — ayni sabab `CheckoutPage` dagi zarrachalarda ham.
 */
const PIECES = [
  { x: -15, y: -15, fx: -52, fy: -40, rx: 58, ry: -70, tone: 'bg-orange-600' },
  { x: 15, y: -15, fx: 48, fy: -50, rx: -64, ry: 52, tone: 'bg-orange-500' },
  { x: -15, y: 15, fx: -46, fy: 50, rx: 46, ry: 68, tone: 'bg-orange-500' },
  { x: 15, y: 15, fx: 52, fy: 40, rx: -54, ry: -60, tone: 'bg-orange-600' },
] as const;

const CUBE_PX = 22;

/**
 * Yig'ilish qancha davom etadi (ms).
 *
 * Prujina `duration` qabul qilmaydi, shuning uchun bu qiymat
 * HISOBLANMAYDI — u brauzerda o'lchangan. `springs.snappy` bilan
 * bitta bo'lakcha 283ms da joyiga tushadi, `SPLASH.step` (0.07s)
 * navbati bilan to'rttasi 478ms da tugaydi:
 *
 *   1-bo'lakcha +283ms   3-bo'lakcha +422ms
 *   2-bo'lakcha +351ms   4-bo'lakcha +478ms
 *
 * Talab qilingan oraliq — 400–600ms.
 */
const ASSEMBLE_MS = 478;
const TOTAL_MS = ASSEMBLE_MS + (SPLASH.hold + SPLASH.fade) * 1000;

export function SplashScreen() {
  const reduce = useReducedMotion();
  /*
   * `reduce` boshida `null` bo'lishi mumkin, shuning uchun `=== true`
   * bilan tekshiriladi: noaniq holatda splash KO'RSATILADI va keyingi
   * renderda o'chadi — teskarisi bo'lsa u umuman chiqmay qolardi.
   */
  const skip = reduce === true;
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (skip) return;
    const t = window.setTimeout(() => setDone(true), TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [skip]);

  if (skip) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: SPLASH.fade, ease: EASE.standard }}
          className="pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-white"
        >
          {/* Belgi — to'rtta bo'lakcha bitta plitkaga yig'iladi. */}
          <span className="relative flex h-14 w-14 items-center justify-center" style={{ perspective: 420 }}>
            {PIECES.map((p, i) => (
              <motion.span
                key={i}
                className="absolute block"
                initial={{ x: p.fx, y: p.fy, rotateX: p.rx, rotateY: p.ry, opacity: 0, scale: 0.6 }}
                animate={{ x: p.x, y: p.y, rotateX: 0, rotateY: 0, opacity: 1, scale: 1 }}
                transition={{ ...springs.snappy, delay: i * SPLASH.step }}
              >
                <Cube size={CUBE_PX} className={p.tone} />
              </motion.span>
            ))}
          </span>

          {/* Yozuv — bo'lakchalar joyiga tushgach. Header'dagi bilan bir xil. */}
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: SPLASH.fade, ease: EASE.standard, delay: SPLASH.wordDelay }}
            className="text-lg font-bold tracking-tight text-ink-900"
          >
            Open<span className="text-orange-600">Shop</span>
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
