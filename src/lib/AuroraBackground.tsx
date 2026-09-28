import { motion, useReducedMotion } from 'motion/react';
import { AURORA, EASE } from './motion';
import { cx } from './design';

/*
 * AURORA — SEKIN HARAKATLANUVCHI GRADIENT TUMAN.
 *
 * Hero va aksiya blokining fonida ilgari ikkita QIMIRLAMAS blur dog'i
 * turardi. Ular chuqurlik berardi, lekin blok "rasm"dek qotib qolgandi:
 * sahifada bir necha soniya turgan foydalanuvchi uchun u o'lik yuza edi.
 *
 * Endi o'sha dog'lar juda sekin suzadi. Maqsad DIQQATNI TORTISH EMAS —
 * aksincha, harakat sezilmasligi kerak. U faqat to'q yuzani tirik
 * qiladi, xuddi xonadagi yorug'lik kun davomida sekin o'zgargandek.
 *
 * QOIDALAR:
 *
 *  - FAQAT `transform` va `opacity`. Hech qanday `width`, `height`,
 *    `top`, `left`, `background-position` yoki `filter` animatsiya
 *    qilinmaydi. Blur BIR MARTA hisoblanadi, keyin brauzer tayyor
 *    qatlamni shunchaki siljitadi — ya'ni cheksiz sikl bo'lsa ham
 *    har kadrda qayta chizish YO'Q.
 *
 *  - YANGI RANG YO'Q. Aynan o'sha `orange-600/25` va `orange-500/15` —
 *    ya'ni bu blok "boshqa sayt"ga aylanmaydi, o'zining fonini
 *    harakatga keltiradi xolos.
 *
 *  - `prefers-reduced-motion` da tuman to'liq to'xtaydi va qatlamlar
 *    O'RTA holatida qoladi (pastdagi `from`/`to` nolga nisbatan
 *    simmetrik). Statik kompozitsiya ham to'g'ri ko'rinadi: hech bir
 *    dog' chetga surilib, kompozitsiyani og'dirib qo'ymaydi.
 */

type AuroraTone = 'dark' | 'light';

/*
 * Qatlamlar. Uchta — ikkita emas.
 *
 * Ikkita dog'da harakat "ikki nuqta orasida borib-kelish" bo'lib
 * ko'rinadi. Uchinchisi (kichik va markazga yaqin) ikkalasining
 * orasidan o'tib, umumiy tasvirni oldindan aytib bo'lmaydigan qiladi.
 *
 *   box   — o'lcham va joylashuv (Tailwind sinflari)
 *   color — mavjud ikki nur rangidan biri
 *   from/to — suzish chegaralari (px). NOLGA NISBATAN SIMMETRIK:
 *             shuning uchun harakatsiz holat aynan o'rtada bo'ladi.
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
    // Teskari yo'nalish: ikki dog' bir-biriga qarab yurganda tuman
    // "nafas olayotgandek" bo'ladi, bir tomonga sirg'algandek emas.
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
 * Bitta o'qning cheksiz sikli.
 *
 * `repeatType: 'mirror'` — qaytish yo'li bir xil, lekin teskari. Shu
 * sababli hech qanday "sakrash" nuqtasi yo'q: element hech qachon
 * birdan boshlang'ich holatga tashlanmaydi.
 */
function cycle(duration: number, delay: number) {
  return {
    duration,
    delay,
    repeat: Infinity,
    repeatType: 'mirror' as const,
    // `inOut` — chekkalarda sekinlashadi, ya'ni burilish nuqtasi
    // ko'zga tashlanmaydi.
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
         * Bir xil alfa to'q (`ink-900`) va oq yuzada butunlay boshqacha
         * o'qiladi: to'qda u yumshoq nur, oqda esa matn ostidagi
         * iflos dog'ga aylanadi. Shuning uchun yangi rang KIRITILMAYDI —
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
            /* Harakatsiz holat — aynan o'rta nuqta (from va to simmetrik). */
            animate={reduce ? { x: 0, y: 0, scale: 1 } : { x: l.to.x, y: l.to.y, scale: l.to.s }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    /*
                     * Har bir o'q O'Z siklida yuradi — natijada
                     * traektoriya to'g'ri chiziq emas, ochiq egri
                     * bo'ladi (Lissaju figurasi).
                     *
                     * DIQQAT: qiymatga xos (per-key) o'tish umumiy
                     * o'tishdan MEROS OLMAYDI — u uni butunlay
                     * almashtiradi. Shuning uchun `repeat`, `ease` va
                     * `delay` uchala o'qda ham to'liq yozilgan;
                     * `cycle()` aynan shu takrorni bir joyga yig'adi.
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
