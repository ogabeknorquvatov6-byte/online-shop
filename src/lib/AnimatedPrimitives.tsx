import { forwardRef, useId, type ReactNode } from 'react';
import { motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { X } from 'lucide-react';
import { useBodyScrollLock, useEscapeKey, useFocusOnOpen, useFocusTrap, useIsMobile } from './uiHooks';
import { cx } from './design';
import {
  DURATION,
  EASE,
  PRESS,
  springs,
  overlayVariants,
  modalVariants,
  drawerRightVariants,
  drawerLeftVariants,
  sheetVariants,
  fadeUpItem,
  staggerContainer,
  tapScale,
} from './motion';

/**
 * Bosishga javob beradigan tugma. Haqiqiy `<button>` chizadi.
 *
 * `sink` berilmasa — avvalgidek `tapScale` (kichrayish).
 *
 * `sink` — JISMONIY BOTISH: tugma yuzaga 2px choʻkadi va prujina bilan
 * koʻtariladi.
 *   `flat`   — tekis tugmalar (miqdor steppери): faqat botish.
 *   `lifted` — soyasi bor asosiy tugma: botish + soyaning qisqarishi.
 *
 * SOYA NEGA ALOHIDA ELEMENT.
 *
 * `box-shadow` ni animatsiya qilish oson boʻlardi, lekin u har kadrda
 * qayta chizishni talab qiladi va loyihada faqat `transform`/`opacity`
 * animatsiya qilinadi. Shuning uchun soya — tugma OSTIDAGI mustaqil
 * blur qilingan element: u `scale` va `opacity` bilan qisqaradi, yaʼni
 * blur BIR MARTA hisoblanadi va keyin faqat kompozitsiya qilinadi.
 *
 * Soya `top-full` da, yaʼni tugma qutisidan BUTUNLAY tashqarida.
 * Ichkarida boʻlsa manfiy `z-index` kerak boʻlardi, u esa ishlamasdi:
 * Motion transform beradi, transform stacking context yaratadi va
 * manfiy z-indexʼli bola ota fonining USTIDA chizilib qolardi.
 */
type SinkKind = 'flat' | 'lifted';

/*
 * `children` ATAYLAB qayta eʼlon qilingan.
 *
 * `HTMLMotionProps` bolalar sifatida `MotionValue` ni ham qabul qiladi
 * (Motion matnni toʻgʻridan-toʻgʻri motion valueʼdan chizishi mumkin).
 * Bu yerda esa bolalar yonida soya elementi ham turadi va TypeScript
 * ikkalasini bitta `ReactNode` massiviga keltira olmaydi. Tugma hech
 * qachon `MotionValue` matn koʻrsatmaydi, shuning uchun tip toraytirildi.
 */
type AnimatedButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  sink?: SinkKind;
  children?: ReactNode;
};

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton({ children, className, disabled, sink, ...rest }, ref) {
    const reduce = useReducedMotion();
    const still = Boolean(disabled) || Boolean(reduce);

    if (!sink) {
      return (
        <motion.button
          ref={ref}
          whileTap={still ? undefined : tapScale}
          transition={{ duration: DURATION.micro, ease: EASE.standard }}
          className={className}
          disabled={disabled}
          {...rest}
        >
          {children}
        </motion.button>
      );
    }

    return (
      <motion.button
        ref={ref}
        /*
         * Nom bilan berilgan variantlar — obyekt bilan emas.
         *
         * Motion variant NOMINI bolalarga uzatadi, obyekt koʻrinishidagi
         * `whileTap` esa faqat shu elementga taʼsir qiladi. Soya tugma
         * bilan BIR VAQTDA harakat qilishi uchun ikkalasi ham bitta
         * nomga ("pressed") javob berishi kerak.
         */
        initial={false}
        animate="rest"
        whileTap={still ? undefined : 'pressed'}
        variants={{
          rest: { y: 0, scale: 1 },
          pressed: { y: PRESS.depth, scale: PRESS.scale },
        }}
        transition={springs.snappy}
        className={cx('relative', className)}
        disabled={disabled}
        {...rest}
      >
        {sink === 'lifted' && !still && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-full h-1.5 rounded-full bg-ink-900/30 blur-[5px]"
            variants={{
              rest: { scaleX: 1, scaleY: 1, opacity: 1 },
              pressed: {
                scaleX: PRESS.shadowScale,
                scaleY: PRESS.shadowScale,
                opacity: PRESS.shadowOpacity,
              },
            }}
            transition={springs.snappy}
          />
        )}
        {children}
      </motion.button>
    );
  }
);

export function AnimatedIconButton({ children, className, ...rest }: HTMLMotionProps<'button'>) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.9 }}
      transition={{ duration: DURATION.micro, ease: EASE.standard }}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

/** Full-screen overlay + centered panel, spec section 16. */
export function AnimatedModal({
  onClose,
  children,
  className,
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  /*
   * ── VIZUAL CHIQISH ≠ MANTIQIY HOLAT ──────────────────────────────
   *
   * `useIsPresent()` — `AnimatePresence` yopishni BOSHLAGAN zahoti
   * `false` boʻladi: element hali DOMʼda turadi va chiqish animatsiyasi
   * hali oʻynayapti, lekin dialog MANTIQAN allaqachon yopiq.
   *
   * Nega bu muhim: ilgari bu yerda `useBodyScrollLock(true)` yozilgan
   * edi, yaʼni qulf faqat element DOMʼdan olib tashlanganda boʻshardi.
   * Element esa faqat chiqish animatsiyasi TUGAGANDA olib tashlanadi.
   * Agar animatsiya biror sababga koʻra tugamasa — masalan brauzer
   * sahifani fon rejimiga oʻtkazsa va `requestAnimationFrame` toʻxtasa
   * (oʻlchandi: 600ms ichida 0 ta kadr) — sahifa SCROLL QULFIDA
   * qolib ketardi va foydalanuvchi uchun butunlay ishlamay qolardi.
   *
   * Endi qulf, fokus tuzogʻi va Escape tinglovchisi "dialog ochiqmi"
   * holatiga bogʻlangan, "element DOMʼda bormi" holatiga emas.
   * Animatsiya avvalgidek toʻliq oʻynaydi — u shunchaki endi
   * TOʻGʻRILIK uchun javobgar emas.
   */
  const present = useIsPresent();
  useEscapeKey(present, onClose);
  useBodyScrollLock(present);
  const focusRef = useFocusOnOpen<HTMLDivElement>(present);
  useFocusTrap(focusRef, present);
  return (
    <>
      <motion.div
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DURATION.ui }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={focusRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? 'Dialog'}
        tabIndex={-1}
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DURATION.ui, ease: EASE.standard }}
        className={className}
      >
        {children}
      </motion.div>
    </>
  );
}

/**
 * Modal that renders centered on desktop and as a drag-to-close bottom sheet
 * on mobile (spec section 18). Use this instead of AnimatedModal for any
 * dialog that should appear in both contexts (admin forms, confirmations).
 */
export function ResponsiveModal({
  onClose,
  children,
  title,
  size = 'md',
}: {
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  /** Faqat DESKTOP kengligiga taʼsir qiladi; mobil har doim pastki varaq. */
  size?: 'md' | 'wide';
}) {
  /*
   * ── VIZUAL CHIQISH ≠ MANTIQIY HOLAT ──────────────────────────────
   *
   * `useIsPresent()` — `AnimatePresence` yopishni BOSHLAGAN zahoti
   * `false` boʻladi: element hali DOMʼda turadi va chiqish animatsiyasi
   * hali oʻynayapti, lekin dialog MANTIQAN allaqachon yopiq.
   *
   * Nega bu muhim: ilgari bu yerda `useBodyScrollLock(true)` yozilgan
   * edi, yaʼni qulf faqat element DOMʼdan olib tashlanganda boʻshardi.
   * Element esa faqat chiqish animatsiyasi TUGAGANDA olib tashlanadi.
   * Agar animatsiya biror sababga koʻra tugamasa — masalan brauzer
   * sahifani fon rejimiga oʻtkazsa va `requestAnimationFrame` toʻxtasa
   * (oʻlchandi: 600ms ichida 0 ta kadr) — sahifa SCROLL QULFIDA
   * qolib ketardi va foydalanuvchi uchun butunlay ishlamay qolardi.
   *
   * Endi qulf, fokus tuzogʻi va Escape tinglovchisi "dialog ochiqmi"
   * holatiga bogʻlangan, "element DOMʼda bormi" holatiga emas.
   * Animatsiya avvalgidek toʻliq oʻynaydi — u shunchaki endi
   * TOʻGʻRILIK uchun javobgar emas.
   */
  const present = useIsPresent();
  useEscapeKey(present, onClose);
  useBodyScrollLock(present);
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const focusRef = useFocusOnOpen<HTMLDivElement>(present);
  useFocusTrap(focusRef, present);
  const titleId = useId();
  const dialogA11yProps = title
    ? { 'aria-labelledby': titleId }
    : { 'aria-label': 'Dialog' };

  if (isMobile) {
    return (
      <>
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: DURATION.ui }}
          className="fixed inset-0 z-[80] bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
        <motion.div
          ref={focusRef}
          role="dialog"
          aria-modal="true"
          {...dialogA11yProps}
          tabIndex={-1}
          variants={sheetVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={springs.drawer}
          drag={reduce ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) onClose();
          }}
          /*
           * MUHIM: bu yerda tashqi `panelClassName` ISHLATILMAYDI.
           * Ilgari u ishlatilardi va `AdminModal` "wide" holatida DESKTOP
           * sinflarini (`relative max-w-2xl …`) uzatardi — mobilda ular
           * `fixed inset-x-0 bottom-0` ni almashtirib yuborar, natijada
           * varaq oddiy oqimda, qora fon ORTIDA render boʻlardi va
           * ekranda umuman koʻrinmasdi. Shu sababli mahsulot/banner/
           * aksiya qoʻshish oynalari telefonda ochilmayotgandek tuyulardi.
           */
          className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[88vh] flex-col overflow-hidden rounded-t-surface bg-white shadow-overlay"
        >
          <div className="flex shrink-0 flex-col items-center pt-2.5" style={{ touchAction: 'none' }}>
            <div className="h-1 w-9 rounded-full bg-ink-300" />
            {title && (
              <div className="flex w-full items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
                <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-400"
                  aria-label="Yopish"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
          <div className="overflow-y-auto overscroll-contain p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </motion.div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DURATION.ui }}
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
      />
      <motion.div
        ref={focusRef}
        role="dialog"
        aria-modal="true"
        {...dialogA11yProps}
        tabIndex={-1}
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DURATION.ui, ease: EASE.standard }}
        onClick={(e) => e.stopPropagation()}
        className={
          'relative max-h-[90vh] w-full overflow-y-auto rounded-card bg-white shadow-overlay ' +
          (size === 'wide' ? 'max-w-2xl' : 'max-w-lg')
        }
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink-100 bg-white px-5 py-4">
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink-900">{title}</h2>
            <button
              onClick={onClose}
              className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-400 hover:text-ink-700"
              aria-label="Yopish"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

type DrawerSide = 'right' | 'left' | 'bottom';

const drawerVariantsBySide = {
  right: drawerRightVariants,
  left: drawerLeftVariants,
  bottom: sheetVariants,
};

/** Overlay + sliding drawer/sheet, spec sections 14/15/17. */
export function AnimatedDrawer({
  side = 'right',
  onClose,
  children,
  panelClassName,
  ariaLabel,
}: {
  side?: DrawerSide;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  ariaLabel: string;
}) {
  /*
   * ── VIZUAL CHIQISH ≠ MANTIQIY HOLAT ──────────────────────────────
   *
   * `useIsPresent()` — `AnimatePresence` yopishni BOSHLAGAN zahoti
   * `false` boʻladi: element hali DOMʼda turadi va chiqish animatsiyasi
   * hali oʻynayapti, lekin dialog MANTIQAN allaqachon yopiq.
   *
   * Nega bu muhim: ilgari bu yerda `useBodyScrollLock(true)` yozilgan
   * edi, yaʼni qulf faqat element DOMʼdan olib tashlanganda boʻshardi.
   * Element esa faqat chiqish animatsiyasi TUGAGANDA olib tashlanadi.
   * Agar animatsiya biror sababga koʻra tugamasa — masalan brauzer
   * sahifani fon rejimiga oʻtkazsa va `requestAnimationFrame` toʻxtasa
   * (oʻlchandi: 600ms ichida 0 ta kadr) — sahifa SCROLL QULFIDA
   * qolib ketardi va foydalanuvchi uchun butunlay ishlamay qolardi.
   *
   * Endi qulf, fokus tuzogʻi va Escape tinglovchisi "dialog ochiqmi"
   * holatiga bogʻlangan, "element DOMʼda bormi" holatiga emas.
   * Animatsiya avvalgidek toʻliq oʻynaydi — u shunchaki endi
   * TOʻGʻRILIK uchun javobgar emas.
   */
  const present = useIsPresent();
  useEscapeKey(present, onClose);
  useBodyScrollLock(present);
  const reduce = useReducedMotion();
  const focusRef = useFocusOnOpen<HTMLDivElement>(present);
  useFocusTrap(focusRef, present);

  /*
   * Pastdan chiqadigan varaqni pastga surib yopish mumkin.
   *
   * Ilgari `CatalogPage` filtr varagʻi tepasida "tortish" chizigʻi
   * chizilardi, lekin bu komponentda `drag` UMUMAN yoʻq edi — yaʼni
   * afforder yolgʻon gapirardi: foydalanuvchi varaqni pastga suradi va
   * hech narsa boʻlmaydi. Ayni mantiq `ResponsiveModal` da allaqachon
   * ishlab turibdi, shuning uchun bu yerda oʻsha yechim takrorlanadi
   * (ichki roʻyxat `overscroll-contain` bilan oʻz scrollʼini ushlab qoladi).
   *
   * Yon panellarda (chap/oʻng) surish yoʻq — u yerda tortish chizigʻi ham
   * yoʻq, demak vaʼda ham berilmagan.
   */
  const swipeToDismiss = side === 'bottom' && !reduce;

  return (
    <>
      <motion.div
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DURATION.ui }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={focusRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        variants={drawerVariantsBySide[side]}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={springs.drawer}
        drag={swipeToDismiss ? 'y' : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={
          swipeToDismiss
            ? (_, info) => {
                // Masofa YOKI tezlik — sekin uzun surish ham, tez qisqa
                // "flick" ham yopadi.
                if (info.offset.y > 80 || info.velocity.y > 500) onClose();
              }
            : undefined
        }
        className={panelClassName}
      >
        {children}
      </motion.div>
    </>
  );
}

/** Wraps a grid/list so children fade+rise in with a small stagger (spec 8/14/21). */
export function StaggerGroup({
  children,
  className,
  staggerChildren,
}: {
  children: ReactNode;
  className?: string;
  staggerChildren?: number;
}) {
  const variants = staggerContainer(staggerChildren);
  return (
    <motion.div initial="initial" animate="animate" variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUpItem} className={className}>
      {children}
    </motion.div>
  );
}

/** Reveals content once when it enters the viewport (spec section 21). */
export function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, ease: EASE.standard, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

