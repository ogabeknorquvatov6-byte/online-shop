import { AnimatePresence, motion } from 'motion/react';
import { DURATION, springs } from './motion';

/** Number/text that cross-fades+slides when its formatted value changes (spec 9/12/15). */
export function AnimatedNumber({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={`inline-flex overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: DURATION.ui, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
/**
 * Savat nishonchasi.
 *
 * Bu raqam — "savatga qoʻshildi" harakatining yagona doimiy, ekranda
 * qoladigan natijasi, shuning uchun u sezilishi kerak. Ilgari u
 * belgilangan davomiylikdagi `ease` bilan chiqardi va oddiy "paydo
 * boʻlish" boʻlib tuyulardi. Endi `springs.snappy` — haqiqiy sakrash.
 * Yangi raqamlar kiritilmaydi: bu prujina allaqachon `motion.ts` da
 * belgilangan va ilovaning umumiy harakat "tili"ga tegishli.
 */
export function AnimatedBadge({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`flex overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0, scale: 0.5 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -8, opacity: 0, scale: 0.5 }}
          transition={springs.snappy}
        >
          {value > 99 ? '99+' : value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
