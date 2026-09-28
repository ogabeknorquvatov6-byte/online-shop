import { motion, useReducedMotion } from 'motion/react';
import { AURORA, EASE } from './motion';
import { cx } from './design';

/*
 * AURORA — SEKIN HARAKATLANUVCHI GRADIENT TUMAN.
 *
 * Hero va aksiya blokining fonida ilgari ikkita QIMIRLAMAS blur dogʻi
 * turardi. Ular chuqurlik berardi, lekin blok "rasm"dek qotib qolgandi:
 * sahifada bir necha soniya turgan foydalanuvchi uchun u oʻlik yuza edi.
 *
 * Endi oʻsha dogʻlar juda sekin suzadi. Maqsad DIQQATNI TORTISH EMAS —
 * aksincha, harakat sezilmasligi kerak. U faqat toʻq yuzani tirik
 * qiladi, xuddi xonadagi yorugʻlik kun davomida sekin oʻzgargandek.
 *
 * QOIDALAR:
 *
 *  - FAQAT `transform` va `opacity`. Hech qanday `width`, `height`,
 *    `top`, `left`, `background-position` yoki `filter` animatsiya
 *    qilinmaydi. Blur BIR MARTA hisoblanadi, keyin brauzer tayyor
 *    qatlamni shunchaki siljitadi — yaʼni cheksiz sikl boʻlsa ham
 *    har kadrda qayta chizish YOʻQ.
 *
 *  - YANGI RANG YOʻQ. Aynan oʻsha `orange-600/25` va `orange-500/15` —
 *    yaʼni bu blok "boshqa sayt"ga aylanmaydi, oʻzining fonini
 *    harakatga keltiradi xolos.
 *
 *  - `prefers-reduced-motion` da tuman toʻliq toʻxtaydi va qatlamlar
 *    OʻRTA holatida qoladi (pastdagi `from`/`to` nolga nisbatan
 *    simmetrik). Statik kompozitsiya ham toʻgʻri koʻrinadi: hech bir
 *    dog' chetga surilib, kompozitsiyani ogʻdirib qoʻymaydi.
 */

type AuroraTone = 'dark' | 'light';

/*
 * Qatlamlar. Uchta — ikkita emas.
 *
 * Ikkita dogʻda harakat "ikki nuqta orasida borib-kelish" boʻlib
 * koʻrinadi. Uchinchisi (kichik va markazga yaqin) ikkalasining
 * orasidan oʻtib, umumiy tasvirni oldindan aytib boʻlmaydigan qiladi.
 *
 *   box   — oʻlcham va joylashuv (Tailwind sinflari)
 *   color — mavjud ikki nur rangidan biri
 *   from/to — suzish chegaralari (px). NOLGA NISBATAN SIMMETRIK:
 *             shuning uchun harakatsiz holat aynan oʻrtada boʻladi.
 */
const LAYERS = [
  {
    box: '-right-16 -top-16 h-56 w-56 sm:h-72 sm:w-72 lg:h-96 lg:w-96',
    color: 'bg-orange-600/25',
    blur: 'blur-2xl',
    from: { x: -26, y: -18, s: 0.92 },
    to: { x: 26, y: 18, s: 1.14 },
  },
  {
    box: '-bottom-24 left-4 h-44 w-44 sm:left-8 sm:h-56 sm:w-56 lg:h-72 lg:w-72',
    color: 'bg-orange-500/15',
    blur: 'blur-3xl',
    // Teskari yoʻnalish: ikki dog' bir-biriga qarab yurganda tuman
    // "nafas olayotgandek" boʻladi, bir tomonga sirgʻalgandek emas.
    from: { x: 22, y: 16, s: 1.12 },
    to: { x: -22, y: -16, s: 0.9 },
  },
  {
    box: 'left-1/3 top-1/4 h-32 w-32 sm:h-44 sm:w-44 lg:h-56 lg:w-56',
    color: 'bg-orange-500/15',
    blur: 'blur-3xl',
    from: { x: -18, y: 20, s: 1.06 },
    to: { x: 18, y: -20, s: 0.88 },
  },
] as const;

/**
 * Bitta oʻqning cheksiz sikli.
 *
 * `repeatType: 'mirror'` — qaytish yoʻli bir xil, lekin teskari. Shu
 * sababli hech qanday "sakrash" nuqtasi yoʻq: element hech qachon
 * birdan boshlangʻich holatga tashlanmaydi.
 */
function cycle(duration: number, delay: number) {
  return {
    duration,
    delay,
    repeat: Infinity,
    repeatType: 'mirror' as const,
    // `inOut` — chekkalarda sekinlashadi, yaʼni burilish nuqtasi
    // koʻzga tashlanmaydi.
    ease: EASE.inOut,
  };
}

export function AuroraBackground({ tone = 'dark' }: { tone?: AuroraTone }) {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        /*
         * Ranglar ikkala ohangda BIR XIL, faqat kuchi boshqacha.
         *
         * Bir xil alfa toʻq (`ink-900`) va oq yuzada butunlay boshqacha
         * oʻqiladi: toʻqda u yumshoq nur, oqda esa matn ostidagi
         * iflos dogʻga aylanadi. Shuning uchun yangi rang KIRITILMAYDI —
         * butun qatlam biroz shaffoflashtiriladi.
         */
        tone === 'light' && 'opacity-60'
      )}
    >
      {LAYERS.map((l, i) => {
        const delay = reduce ? 0 : i * AURORA.stagger;
        return (
          <motion.span
            key={i}
            className={cx('absolute rounded-full', l.box, l.color, l.blur)}
            initial={reduce ? false : { x: l.from.x, y: l.from.y, scale: l.from.s }}
            /* Harakatsiz holat — aynan oʻrta nuqta (from va to simmetrik). */
            animate={reduce ? { x: 0, y: 0, scale: 1 } : { x: l.to.x, y: l.to.y, scale: l.to.s }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    /*
                     * Har bir oʻq OʻZ siklida yuradi — natijada
                     * traektoriya toʻgʻri chiziq emas, ochiq egri
                     * boʻladi (Lissaju figurasi).
                     *
                     * DIQQAT: qiymatga xos (per-key) oʻtish umumiy
                     * oʻtishdan MEROS OLMAYDI — u uni butunlay
                     * almashtiradi. Shuning uchun `repeat`, `ease` va
                     * `delay` uchala oʻqda ham toʻliq yozilgan;
                     * `cycle()` aynan shu takrorni bir joyga yigʻadi.
                     */
                    x: cycle(AURORA.base, delay),
                    y: cycle(AURORA.base * AURORA.ratioY, delay),
                    scale: cycle(AURORA.base * AURORA.ratioScale, delay),
                  }
            }
          />
        );
      })}
    </div>
  );
}
