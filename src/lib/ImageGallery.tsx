import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, X, Expand } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useBodyScrollLock, useEscapeKey, useGyroParallax } from './uiHooks';
import { GYRO } from './motion';
import { cx, focusRing } from './design';
import { Img, fetchPriorityAttr } from './Img';

export type GalleryImage = { id: string; image_url: string };

/*
 * Mahsulot galereyasi.
 *
 * Ilgari mahsulotga amalda faqat BITTA rasm qo'shish mumkin edi va
 * ko'rish rejimi yo'q edi. Endi:
 *  - cheksiz rasm, katta asosiy rasm + miniatyuralar;
 *  - mobil: barmoq bilan surish, rasm hisoblagichi;
 *  - desktop: strelkalar va miniatyuralar;
 *  - to'liq ekran (lightbox): klaviatura ← → Esc bilan boshqariladi.
 */

export function ImageGallery({
  images,
  alt,
  /** Tashqaridan boshqarish (masalan rang tanlanganda mos rasmga o'tish). */
  activeIndex,
  onActiveIndexChange,
  badge,
  parallax,
}: {
  images: GalleryImage[];
  alt: string;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  badge?: React.ReactNode;
  /**
   * Telefon egilganda rasm ramka ichida siljisinmi.
   *
   * Ixtiyoriy va standart holda O'CHIQ: galereya lightbox ichida ham
   * ishlatiladi, u yerda esa rasm allaqachon butun ekranni egallaydi
   * va siljitish joyi yo'q.
   */
  parallax?: boolean;
}) {
  const reduce = useReducedMotion();
  const { x: gyroX, y: gyroY, enable: enableGyro } = useGyroParallax();
  const [internalIndex, setInternalIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const index = activeIndex ?? internalIndex;
  const setIndex = useCallback(
    (next: number, dir: number) => {
      if (next < 0 || next >= images.length) return;
      setDirection(dir);
      setInternalIndex(next);
      onActiveIndexChange?.(next);
    },
    [images.length, onActiveIndexChange]
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      if (images.length < 2) return;
      const next = (index + delta + images.length) % images.length;
      setIndex(next, delta);
    },
    [index, images.length, setIndex]
  );

  const current = images[index];
  const multiple = images.length > 1;

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-card border border-ink-200 bg-white text-ink-300">
        <ImageOff className="h-12 w-12" />
        <span className="text-sm">Rasm mavjud emas</span>
      </div>
    );
  }

  const slideVariants = {
    initial: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? '10%' : '-10%' }),
    animate: { opacity: 1, x: 0 },
    exit: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? '-10%' : '10%' }),
  };

  return (
    <div>
      {/* Asosiy rasm — mahsulot sahifasining LCP elementi, shuning uchun
          `fetchpriority="high"` va `decoding="sync"` bilan yuklanadi. */}
      <div
        className="group relative overflow-hidden rounded-card border border-ink-200 bg-white"
        /* iOS ruxsati foydalanuvchi rasmga tekkanda so'raladi. */
        onTouchEnd={parallax ? enableGyro : undefined}
      >
        {/*
          PARALLAKS QATLAMI — rasmning O'ZIDA emas, uning ustida.

          Rasmga to'g'ridan-to'g'ri qo'llab bo'lmaydi: u `drag="x"`
          bilan suriladi va Motion o'sha paytda `x` ni o'zi
          boshqaradi — gyroskop bilan bitta qiymat uchun kurash
          ketardi. Alohida o'rov esa `y` va `x` ni mustaqil ushlaydi,
          surish esa avvalgidek ishlayveradi.

          Nishoncha va tugmalar bu o'rovdan TASHQARIDA: ramka va
          boshqaruvlar qimirlamasligi kerak, aks holda parallaks
          emas, butun blokning tebranishi bo'lib ko'rinardi.
        */}
        <motion.div
          className="relative"
          style={parallax && !reduce ? { x: gyroX, y: gyroY, scale: GYRO.overscan } : undefined}
        >
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.img
              key={current.id}
              custom={direction}
              src={current.image_url}
              alt={`${alt} — ${index + 1}-rasm`}
              className="aspect-square w-full touch-pan-y select-none object-cover"
              draggable={false}
              {...fetchPriorityAttr(true)}
              decoding="sync"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              drag={multiple && !reduce ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.35}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50) step(1);
                else if (info.offset.x > 50) step(-1);
              }}
            />
          </AnimatePresence>
        </motion.div>

        {badge && <div className="pointer-events-none absolute left-3 top-3">{badge}</div>}

        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="Rasmni to‘liq ekranda ochish"
          className={cx(
            // Sensorli qurilmalarda 44px — bu tugma rasm ustida turadi va
            // noto'g'ri bosilsa foydalanuvchi kutilmagan joyga tushib qoladi.
            //
            // Chegara `xl` (1280px): pastroq har qanday qiymatda
            // planshetda (768–1279px, hover YO'Q) "to'liq ekran" tugmasi
            // butunlay ko'rinmay qolardi.
            'absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-sm backdrop-blur-sm transition-opacity xl:h-9 xl:w-9',
            'xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100',
            focusRing
          )}
        >
          <Expand className="h-4 w-4" />
        </button>

        {multiple && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Oldingi rasm"
              className={cx(
                // Planshetda strelkalar DOIMO ko'rinadi (hover yo'q), faqat
                // desktopda hover bilan ochiladi — shuning uchun `xl:opacity-0`.
                'absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-sm backdrop-blur-sm transition-opacity sm:flex xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100',
                focusRing
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Keyingi rasm"
              className={cx(
                'absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-sm backdrop-blur-sm transition-opacity sm:flex xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100',
                focusRing
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <span className="absolute bottom-3 right-3 rounded-full bg-ink-900/65 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
              {index + 1} / {images.length}
            </span>

            {/* Sensorli qurilmalar uchun nuqtalar — telefon VA planshet.
                Ilgari `sm:hidden` edi: planshetda strelkalar ham (opacity-0),
                nuqtalar ham ko'rinmay, faqat "1 / 5" hisoblagich qolardi. */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 xl:hidden">
              {images.slice(0, 8).map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setIndex(i, i > index ? 1 : -1)}
                  aria-label={`${i + 1}-rasm`}
                  className={cx(
                    'h-1.5 rounded-full shadow transition-all duration-200',
                    i === index ? 'w-5 bg-orange-600' : 'w-1.5 bg-white'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {multiple && (
        <div className="no-scrollbar mt-3 hidden gap-2 overflow-x-auto pb-1 sm:flex">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i, i > index ? 1 : -1)}
              aria-label={`${i + 1}-rasmni ko‘rsatish`}
              aria-current={i === index}
              className={cx(
                'h-16 w-16 shrink-0 overflow-hidden rounded-control border-2 transition-colors',
                focusRing,
                i === index ? 'border-orange-600' : 'border-ink-200 hover:border-ink-300'
              )}
            >
              <Img src={img.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox && (
          <Lightbox
            images={images}
            index={index}
            alt={alt}
            onClose={() => setLightbox(false)}
            onStep={step}
            onSelect={(i) => setIndex(i, i > index ? 1 : -1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Lightbox({
  images, index, alt, onClose, onStep, onSelect,
}: {
  images: GalleryImage[];
  index: number;
  alt: string;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  onSelect: (i: number) => void;
}) {
  const reduce = useReducedMotion();
  useBodyScrollLock(true);
  useEscapeKey(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStep]);

  const current = images[index];
  const multiple = images.length > 1;

  // Portal: lightbox sahifadagi `overflow-hidden` yoki `transform` bo'lgan
  // ota-elementlar ichida qamalib qolmasligi kerak.
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — rasmlar`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[120] flex flex-col bg-ink-900/95 backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <span className="text-sm tabular-nums text-white/70">{index + 1} / {images.length}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className={cx('flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white', focusRing)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        <AnimatePresence initial={false} mode="wait">
          <motion.img
            key={current.id}
            src={current.image_url}
            alt={`${alt} — ${index + 1}-rasm`}
            draggable={false}
            {...fetchPriorityAttr(true)}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            transition={{ duration: 0.18 }}
            drag={multiple && !reduce ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) onStep(1);
              else if (info.offset.x > 60) onStep(-1);
            }}
            className="max-h-full max-w-full select-none rounded-card object-contain"
          />
        </AnimatePresence>

        {multiple && (
          <>
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label="Oldingi rasm"
              className={cx('absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20', focusRing)}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label="Keyingi rasm"
              className={cx('absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20', focusRing)}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {multiple && (
        <div
          className="no-scrollbar flex shrink-0 justify-start gap-2 overflow-x-auto px-4 py-4 sm:justify-center"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`${i + 1}-rasm`}
              aria-current={i === index}
              className={cx(
                'h-14 w-14 shrink-0 overflow-hidden rounded-control border-2 transition-colors',
                focusRing,
                i === index ? 'border-orange-500' : 'border-white/20 hover:border-white/50'
              )}
            >
              <Img src={img.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </motion.div>,
    document.body
  );
}
