import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion,
  useTransform, type MotionValue,
} from 'motion/react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Link } from './router';
import type { Banner } from './types';
import { cx, focusRing } from './design';
import { DURATION, GYRO, springs } from './motion';
import { useGyroParallax } from './uiHooks';
import { fetchPriorityAttr } from './Img';

/*
 * HERO — JISMONIY MAHSULOT KARUSELI.
 *
 * Markazda katta faol karta, yonida esa HAQIQIY qoʻshni karta chetdan
 * koʻrinib turadi. Surilganda kartalar birgalikda siljiydi va oʻrin
 * almashadi — yaʼni bu "rasm almashtirgich" emas, jismoniy karusel.
 *
 * ── YAGONA HOLAT TIZIMI ───────────────────────────────────────────
 *
 * Butun karusel BITTA uzluksiz qiymat — `pos` — atrofida qurilgan.
 * U "oʻralmagan" (unwrapped) slayd pozitsiyasi: 0, 1, 2, -1 …
 *
 *   surish     → `pos` ni barmoq bilan birga real vaqtda oʻzgartiradi
 *   strelka    → `target` ni ±1 qiladi
 *   klaviatura → xuddi shunday
 *   pagination → eng qisqa yoʻl bilan `target` ni oʻzgartiradi
 *   avtoplay   → `target` ni +1 qiladi
 *
 * Hammasi bir joyga borib taqaladi, shuning uchun strelka va surish
 * uchun ALOHIDA animatsiya yoʻq va ular bir-biri bilan urishmaydi.
 *
 * Har bir slaydning koʻrinishi (x, scale, opacity, rotateY) `pos` dan
 * HOSILA sifatida hisoblanadi. Shu sababli surish davomida kartalar
 * uzluksiz kichrayadi/kattalashadi — qoʻyib yuborilgunicha kutilmaydi.
 *
 * ── IKKI SLAYD HOLATI ─────────────────────────────────────────────
 *
 * Ikkita bannerda "oldingi" va "keyingi" bir xil slayd boʻlib qolishi
 * mumkin degan xavotir bor edi. Amalda yoʻq: eng qisqa yoʻl hisobi
 * (`wrapDelta`) har doim BITTA tomonni tanlaydi —
 *   1-slayd faol → 2-slayd OʻNGDA
 *   2-slayd faol → 1-slayd CHAPDA
 * Yaʼni bir xil rasm ikki tomonda hech qachon chizilmaydi.
 */

/** Qoʻshni karta markazdan qancha uzoqda turadi (karta enining ulushi). */
const STEP_RATIO = 0.62;
/** Avtomatik almashinuv oraligʻi. */
const AUTOPLAY_MS = 7000;
/** Shu ulushdan ortiq surilsa slayd almashadi. */
const SWIPE_FRACTION = 0.22;
/**
 * Shu pikseldan kam harakat — bu hali ham BOSISH.
 * Barmoq hech qachon mutlaqo qimirlamay turmaydi, shuning uchun nol
 * chegara bilan oddiy tegish ham "surish" deb hisoblanardi.
 */
const CLICK_SLOP_PX = 8;

/**
 * `i` ga `from` dan eng qisqa (oʻralgan) masofa.
 *
 * DIQQAT: `from` CHEKLANMAGAN. Avtoplay `pos` ni toʻxtovsiz oshirib
 * boradi (0, 1, 2 … 7, 8 …), shuning uchun bu yerda TOʻLIQ modul
 * arifmetikasi kerak.
 *
 * Ilgari bu funksiya faqat BIR MARTA ±count tuzatish qilardi. U
 * `|raw| <= 1.5*count` gacha toʻgʻri ishlaydi, keyin buziladi:
 * `pos = 7`, `count = 4` boʻlganda 0-slayd uchun `raw = -7` →
 * `-7 + 4 = -3` qaytarardi, holbuki toʻgʻri javob `+1`. Natijada bir
 * necha avtoplay siklidan keyin BARCHA kartalar ekrandan chapga chiqib
 * ketardi va markazda hech narsa qolmasdi (oʻlchandi: markazlar
 * -1101, -735, -552; hech bir kartada `opacity: 1` yoʻq).
 */
function wrapDelta(i: number, from: number, count: number): number {
  const half = count / 2;
  // Avval [0, count) oraligʻiga keltiramiz — manfiy qiymatlarda ham.
  const d = (((i - from) % count) + count) % count;
  // Soʻng (-half, half] oraligʻiga: qaysi tomon yaqinroq boʻlsa.
  return d > half ? d - count : d;
}

export function HeroShowcase({ banners }: { banners: Banner[] }) {
  const reduce = useReducedMotion();
  const count = banners.length;
  const multiple = count > 1;

  const stageRef = useRef<HTMLDivElement>(null);
  const [stepPx, setStepPx] = useState(0);

  /* Uzluksiz pozitsiya — karuselning yagona haqiqat manbai. */
  const pos = useMotionValue(0);
  /* Oʻralmagan nishon. `pos` shunga qarab animatsiya qilinadi. */
  const targetRef = useRef(0);
  const [index, setIndex] = useState(0);

  const [userTookOver, setUserTookOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* Bir qadam necha piksel — surishni slayd birligiga aylantirish uchun. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const slideW = el.clientWidth * (el.clientWidth >= 820 ? 0.58 : el.clientWidth >= 640 ? 0.64 : 0.82);
      setStepPx(Math.max(1, slideW * STEP_RATIO));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* `pos` oʻzgarganda koʻrinadigan indeks yangilanadi (pagination uchun). */
  useMotionValueEvent(pos, 'change', (v) => {
    if (count === 0) return;
    const next = ((Math.round(v) % count) + count) % count;
    setIndex((prev) => (prev === next ? prev : next));
  });

  /** Nishonga siljish — barcha boshqaruvlar shu yerdan oʻtadi. */
  const settleTo = useCallback(
    (target: number, manual: boolean) => {
      if (count === 0) return;
      if (manual) setUserTookOver(true);
      targetRef.current = target;
      /*
       * `as never` — `springs.soft` da `type: 'spring'` literal emas,
       * oddiy `string` deb tiplangan (motion.ts da `as const` yoʻq),
       * shuning uchun TS `animate()` ning notoʻgʻri overloadʼini
       * tanlaydi. Umumiy tokenni oʻzgartirmaslik uchun cast shu yerda.
       */
      animate(pos, target, (reduce ? { duration: DURATION.ui } : springs.soft) as never);
    },
    [count, pos, reduce]
  );

  const step = useCallback((delta: number) => settleTo(targetRef.current + delta, true), [settleTo]);

  /*
   * SURISH vs BOSISH.
   *
   * Karta butunlay bosiladigan havola bilan qoplangan. Agar hech narsa
   * qilinmasa, foydalanuvchi karuselni surganida barmoq uzilishi bilan
   * oʻsha havola ham ochilib ketadi — yaʼni surmoqchi boʻlgan odam
   * boshqa sahifaga tushib qoladi.
   *
   * Shuning uchun gesture davomida bosib oʻtilgan masofa oʻlchanadi va
   * u chegaradan oshsa, keyingi `click` bekor qilinadi. Kichik
   * tebranish (barmoqning tabiiy qimirlashi) bosishligicha qoladi.
   */
  const dragDistRef = useRef(0);
  const consumedClick = useCallback(() => dragDistRef.current > CLICK_SLOP_PX, []);

  /* Avtoplay — xuddi shu `settleTo` orqali, yaʼni bir xil jismoniy oʻtish. */
  useEffect(() => {
    if (!multiple || reduce || userTookOver || paused || dragging) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      settleTo(targetRef.current + 1, false);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [multiple, reduce, userTookOver, paused, dragging, settleTo]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiple) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    },
    [multiple, step]
  );

  /* Qaysi slaydlar umuman chiziladi — faol va uning bevosita qoʻshnilari. */
  const rendered = useMemo(() => {
    return banners
      .map((b, i) => ({ banner: b, i, delta: wrapDelta(i, index, count) }))
      .filter((s) => Math.abs(s.delta) <= 1);
  }, [banners, index, count]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Tavsiya etilgan mahsulotlar"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={stageRef}
        tabIndex={multiple ? 0 : -1}
        role={multiple ? 'group' : undefined}
        aria-label={multiple ? 'Slaydlar — chap/oʻng strelkalar bilan almashtiring' : undefined}
        onKeyDown={onKeyDown}
        className={cx(
          /*
           * SAHNA — SHAFFOF va EKRAN CHETIGACHA.
           *
           * Ilgari bu yerda `bg-ink-100` va `rounded-surface` bor edi:
           * natijada hero sahifa ustiga qoʻyilgan kulrang KARTA boʻlib
           * koʻrinardi ("oq sahifa → alohida kulrang quti → banner").
           * Endi sahna koʻrinmaydi — kartalar toʻgʻridan-toʻgʻri sahifa
           * fonida turadi va hero Home sahifasining tabiiy qismi boʻladi.
           *
           * `-mx-*` — `shell` ning yon toʻldirishini bekor qiladi, yaʼni
           * mobilda kartalar ekran chetigacha boradi va "suzuvchi
           * orolcha" taassuroti yoʻqoladi. `lg:mx-0` da hero yana
           * konteyner ichiga qaytadi.
           *
           * `overflow-hidden` SAQLANADI — qoʻshni kartalarni aynan shu
           * kesadi va sahifada gorizontal scroll paydo boʻlmaydi.
           */
          'relative isolate overflow-hidden',
          '-mx-4 sm:-mx-5 lg:mx-0 lg:rounded-surface',
          'h-[clamp(21rem,64vw+5rem,26rem)]',
          'tab:h-[clamp(24rem,42vw+6rem,30rem)]',
          'lg:h-[clamp(28rem,34vw+8rem,34rem)]',
          /*
           * PAST EKRANLI noutbuklar uchun cheklov. `clamp()` faqat
           * kenglikka qaraydi; 1280×800 da u 544px berardi — ekran
           * balandligining 68% i. 1920×1080 da 62vh = 670px > 544px,
           * yaʼni baland ekranlarda hech narsa oʻzgarmaydi.
           */
          'lg:max-h-[62vh]',
          focusRing
        )}
        style={{ perspective: 1400 }}
      >
        {/*
          Surish qatlami — BARCHA kartalarni birga ushlaydi. Shuning
          uchun barmoq harakati bitta kartani emas, butun guruhni
          siljitadi.
        */}
        <motion.div
          className="absolute inset-0"
          drag={multiple && !reduce ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          dragMomentum={false}
          onDragStart={() => {
            dragDistRef.current = 0;
            setDragging(true);
          }}
          onDrag={(_, info) => {
            dragDistRef.current = Math.abs(info.offset.x);
            if (!stepPx) return;
            // Surish davomida `pos` ni real vaqtda oʻzgartiramiz —
            // kartalar barmoq bilan birga harakatlanadi.
            pos.set(targetRef.current - info.offset.x / stepPx);
          }}
          onDragEnd={(_, info) => {
            setDragging(false);
            setUserTookOver(true);
            const moved = stepPx ? info.offset.x / stepPx : 0;
            // Chegaradan oshsa — keyingi/oldingi; aks holda joyiga qaytadi.
            const dir = Math.abs(moved) > SWIPE_FRACTION ? (moved < 0 ? 1 : -1) : 0;
            settleTo(targetRef.current + dir, true);
          }}
        >
          {rendered.map(({ banner, i }) => (
            <SlideCard
              key={banner.id}
              banner={banner}
              slideIndex={i}
              pos={pos}
              count={count}
              reduce={!!reduce}
              priority={i === 0}
              /* Holatdan olinadi, `pos.get()` dan EMAS: motion qiymati
                 oʻzgarganda React qayta render qilmaydi, yaʼni havolaning
                 bosilishi/tab tartibi eskirib qolardi. */
              isCenter={i === index}
              consumedClick={consumedClick}
            />
          ))}
        </motion.div>
      </div>

      {multiple && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Oldingi slayd"
            className={cx(
              'absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full',
              'bg-white/90 text-ink-800 shadow-card backdrop-blur transition-colors hover:bg-white tab:flex',
              focusRing
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Keyingi slayd"
            className={cx(
              'absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full',
              'bg-white/90 text-ink-800 shadow-card backdrop-blur transition-colors hover:bg-white tab:flex',
              focusRing
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/*
            KO'RINADIGAN PAGINATION YO'Q — na "03 / 04", na nuqtalar,
            na progress chizig'i.

            Affordans kartalarning O'ZIDA: chetdan qarab turgan qo'shni
            kartalar "yana slaydlar bor, surish mumkin" degan ishorani
            beradi. Pagination o'rniga boshqa bezak ham QO'YILMAYDI.

            Lekin bu ma'noni YO'QOTMASLIGI kerak: skrinrider uchun
            holat pastdagi `sr-only` matnda qoladi, klaviatura esa
            sahnada chap/o'ng strelkalar bilan ishlaydi.
          */}
          <p className="sr-only" aria-live="polite">
            {index + 1} / {count} slayd
          </p>
        </>
      )}
    </section>
  );
}

/* ── Bitta slayd ─────────────────────────────────────────────────── */

function SlideCard({
  banner, slideIndex, pos, count, reduce, priority, isCenter, consumedClick,
}: {
  banner: Banner;
  slideIndex: number;
  pos: MotionValue<number>;
  count: number;
  reduce: boolean;
  priority: boolean;
  isCenter: boolean;
  /** Oxirgi gesture surish edimi — shunda bosish bekor qilinadi. */
  consumedClick: () => boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { x: gyroX, y: gyroY, enable: enableGyro } = useGyroParallax();

  /*
   * Koʻrinish `pos` DAN HOSILA. Barmoq harakatlanganda bu qiymatlar
   * uzluksiz oʻzgaradi, yaʼni kartalar bosqichma-bosqich oʻrin
   * almashadi — "qoʻyib yuborgach rasm almashdi" emas.
   *
   * `d` — shu slaydning markazdan uzoqligi (slayd birligida).
   */
  const d = useTransform(pos, (p) => wrapDelta(slideIndex, p, count));
  const clamped = useTransform(d, (v) => Math.max(-1, Math.min(1, v)));

  /* Markazlashtirish `x` ICHIDA: Motion `transform` ni toʻliq egallaydi
     va sinfdagi `-translate-x-1/2` ni oʻchirib yuborardi. */
  const x = useTransform(d, (v) => `calc(-50% + ${v * STEP_RATIO * 100}%)`);
  const scale = useTransform(clamped, (v) => 1 - Math.abs(v) * 0.16);
  /*
   * Yon kartalar 0.82 — 0.55 EMAS.
   *
   * 0.55 da qoʻshni bannerlar oqarib ketardi va "oʻchirilgan"
   * koʻrinardi: foydalanuvchi yonida nima turganini umuman ajrata
   * olmasdi. 0.82 da esa ular aniq oʻqiladi, lekin markazdagi karta
   * baribir ustun boʻlib qoladi — chunki ierarxiyani asosan OʻLCHAM
   * (scale 0.84) va chuqurlik (rotateY, z-index) ushlab turadi,
   * shaffoflik esa faqat yordamchi.
   */
  const opacity = useTransform(clamped, (v) => 1 - Math.abs(v) * 0.18);
  const rotateY = useTransform(clamped, (v) => -v * 7);
  const zIndex = useTransform(d, (v) => (Math.abs(v) < 0.5 ? 20 : 10));

  return (
    <motion.div
      /*
       * Bosishni QAMRAB OLISH bosqichida toʻxtatamiz.
       *
       * `Link` ning `onClick` propi argument qabul qilmaydi
       * (`() => void`), shuning uchun u yerdan `preventDefault()`
       * chaqirib boʻlmaydi. Capture bosqichi hodisa havolaga
       * yetib borishidan OLDIN ishlaydi — shuning uchun surishdan
       * keyingi "tasodifiy" bosish shu yerda uziladi va umumiy
       * `Link` komponentini oʻzgartirish kerak emas.
       */
      onClickCapture={(e) => {
        if (!consumedClick()) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={
        reduce
          ? { x: '-50%', opacity: isCenter ? 1 : 0, zIndex: isCenter ? 20 : 10 }
          : { x, scale, opacity, rotateY, zIndex }
      }
      className="pointer-events-none absolute inset-y-4 left-1/2 w-[82%] tab:inset-y-6 tab:w-[64%] lg:w-[58%]"
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-surface bg-ink-200 shadow-[0_24px_60px_-28px_rgb(23_20_17/0.55)]"
        /*
         * iOS ruxsati AYNAN shu yerdan soʻraladi: foydalanuvchi
         * bannerga tekkanda. Tizim oynasi shu sababli kutilmaganda
         * emas, u oʻynayotgan element ustida chiqadi. Boshqa
         * platformalarda bu chaqiruv hech narsa qilmaydi.
         */
        onTouchEnd={isCenter ? enableGyro : undefined}
      >
        {failed || !banner.image_url ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-ink-100 text-ink-400">
            <ImageOff className="h-7 w-7" />
            <span className="px-4 text-center text-xs">{banner.title || 'Rasm mavjud emas'}</span>
          </div>
        ) : (
          /*
           * PARALLAKS FAQAT MARKAZDAGI KARTADA.
           *
           * Yon kartalarda ham qoʻllansa uchala rasm barobar
           * siljirdi — bu parallaks emas, butun karuselning
           * qimirlashi boʻlib koʻrinardi. Chuqurlik tuygʻusi aynan
           * BITTA element boshqalardan boshqacha harakat qilganda
           * paydo boʻladi.
           *
           * `scale` — siljiganda chetda boʻshliq ochilmasligi uchun
           * zaxira. Ramka (`overflow-hidden`) qimirlamaydi, yaʼni
           * rasm uning ichida suzadi.
           */
          <motion.img
            src={banner.image_url}
            alt={banner.title || ''}
            draggable={false}
            onError={() => setFailed(true)}
            {...fetchPriorityAttr(priority)}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            style={isCenter && !reduce ? { x: gyroX, y: gyroY, scale: GYRO.overscan } : undefined}
            className="h-full w-full select-none object-cover"
          />
        )}

        {/*
          USTIDA MATN HAM, TUGMA HAM YO'Q.
          (Ilgari bu yerda sarlavha + tavsif + "Katalogni ko'rish"
          tugmasi bo'lgan qorayadigan parda bor edi.)

          Sabab: rasm — bu bannerning O'ZI. Uning ustiga qo'yilgan
          matn qatlami ikki narsani buzardi: (1) admin yuklagan
          vizualning pastki qismini doimiy qoplab turardi, (2) "bosish
          uchun tugma kerak" degan noto'g'ri taassurot berardi.

          Endi butun rasm bosiladi. Sarlavha esa YO'QOLMAYDI — u
          `alt` matnida va havolaning `sr-only` yorlig'ida qoladi,
          ya'ni skrinrider uchun ma'no saqlanadi.
        */}

        {/* Havola FAQAT markazdagi kartada bosiladi — yon karta bosilsa
            foydalanuvchi ko'rmayotgan sahifaga ketib qolardi. */}
        {banner.button_link && (
          <Link
            to={banner.button_link}
            tabIndex={isCenter ? 0 : -1}
            aria-hidden={!isCenter}
            className={cx(
              'absolute inset-0 z-10',
              isCenter ? 'pointer-events-auto' : 'pointer-events-none',
              focusRing
            )}
          >
            <span className="sr-only">{banner.title || 'Bannerni ochish'}</span>
          </Link>
        )}
      </div>
    </motion.div>
  );
}
