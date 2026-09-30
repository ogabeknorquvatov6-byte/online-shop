import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { RotateCcw, Scissors } from 'lucide-react';
import { formatPrice, formatOrderDate, ORDER_STATUS_LABELS } from './types';
import { EASE, springOptions } from './motion';
import { cx, focusRing } from './design';
import { playMotor, playFeedTick, playStopClick, playFiberSnap, playTear, type StopSound } from './receiptAudio';

/*
 * CHEK PRINTERI — YAGONA JISMONIY TIZIM.
 *
 * Ikki koʻrinish, bitta kod:
 *   `printer`    — toʻlov tugagach. Mashina chekni bosib chiqaradi,
 *                  foydalanuvchi uni tortib YIRTIB oladi.
 *   `standalone` — Buyurtmalarim. Buyurtma allaqachon oʻtgan, chek
 *                  allaqachon bor: mashina ham, bosish ham kerak emas.
 *                  Chek YOLGʻIZ turadi va 360° aylanadi.
 *
 * QOGʻOZ TEPADAN CHIQADI. Haqiqiy kassa printerida qogʻoz korpusning
 * ustidagi tirqishdan chiqib, mashinaning OLD TOMONIGA osilib tushadi.
 * Ilgari bu yerda qogʻoz qutining ostidan chiqardi va shuning uchun
 * "mashinadan chiqyapti" degan tuygʻu umuman yoʻq edi.
 *
 * MEʼMORIY OʻZAK: BITTA QADAM, BITTA HODISA. Har qadamda ayni bir
 * tikda qogʻoz siljiydi, qator bosiladi va mexanik tovush chiqadi —
 * ular bitta funksiya ichida tugʻilgani uchun ajralib keta olmaydi
 * (oʻlchangan: oʻrtacha 6.7ms).
 *
 * Bu fayl backendʼga TEGMAYDI: `supabase` ham, RPC ham yoʻq.
 */

export type ReceiptData = {
  /** Bazadagi haqiqiy buyurtma raqami. */
  number: string;
  /** Serverda hisoblangan yakuniy summa. */
  total: number;
  payment: string;
  /** `orders.status` — haqiqiy holat, taxmin emas. */
  status: string;
  items: { key: string; name: string; quantity: number }[];
  /** `orders.created_at` (ISO). */
  date?: string;
};

export type ReceiptMode = 'success' | 'cancelled';
export type ReceiptVariant = 'printer' | 'standalone';

const MAX_ITEMS = 4;

const STEP_MS = 82;
const FEED_START = 170;
const TEAR_PAUSE = 300;

/* Tortish: shu masofadan keyin qogʻoz uziladi. */
const PULL_MAX = 132;
const PULL_TEAR_AT = 86;

/**
 * QIYA YIRTIQ — QOʻL BILAN YIRTILGANDEK.
 *
 * Qiymatlar chapdan oʻngga PASAYIB boradi (0% → ~5%), yaʼni chiziq
 * gorizontal emas, qiya. Ustiga notekislik qoʻshilgan.
 *
 * Nega qiya: qoʻl chekni bir chetidan ushlab yirtadi va chok oʻsha
 * tomondan boshlanib, qarama-qarshi tomonga qarab "ketadi". Toʻgʻri
 * gorizontal chiziq qaychida qirqilgandek koʻrinadi, qoʻlda
 * yirtilgandek emas.
 *
 * Qiymatlar QATʼIY — `Math.random()` emas. Aks holda har renderda
 * yirtiq shakli sakrab oʻzgarardi.
 */
const TEAR_PROFILE: [number, number][] = [
  [0, 0], [8, 0.9], [17, 0.35], [26, 1.75], [35, 1.15], [44, 2.5],
  [53, 1.95], [62, 3.3], [71, 2.85], [80, 4.15], [89, 3.7], [100, 5.0],
];

/** Bekor qilingan chek shu balandlikda ikkiga boʻlinadi. */
const RIP_AT = 56;

function ripPolygons() {
  const pts = TEAR_PROFILE.map(([x, dy]) => [x, RIP_AT + dy] as const);
  const top = `polygon(0% 0%, 100% 0%, ${[...pts].reverse().map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
  const bottom = `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%, 0% 100%)`;
  return { top, bottom };
}

/** Yirtib olingan chekning yuqori qirrasi — oʻsha qiya chok. */
const TORN_TOP = `polygon(${TEAR_PROFILE.map(([x, dy]) => `${x}% ${dy}%`).join(', ')}, 100% 100%, 0% 100%)`;

/*
 * Chek qatorlari MAʼLUMOT sifatida quriladi: qadamlar soni qatorlar
 * soniga TENG boʻlishi shart. JSX ichida qoʻlda sanasak, bitta qator
 * qoʻshilganda haydovchi undan bexabar qolardi.
 */
function buildLines(data: ReceiptData, cancelled: boolean) {
  const shown = data.items.slice(0, MAX_ITEMS);
  const hiddenCount = data.items.length - shown.length;
  const units = data.items.reduce((s, i) => s + i.quantity, 0);
  const when = formatOrderDate(data.date);

  const lines: { key: string; node: React.ReactNode }[] = [
    { key: 'brand', node: <p className="text-[11px] font-bold tracking-[0.3em]">OPENSHOP</p> },
    { key: 'rule1', node: <p className="text-[9px] tracking-[0.35em] text-ink-300">* * * * * * *</p> },
    {
      key: 'head',
      node: (
        <p className={cx('text-[13px] font-bold leading-snug', cancelled ? 'text-ink-700' : 'text-ink-900')}>
          {cancelled ? 'BUYURTMA BEKOR QILINDI' : 'BUYURTMA QABUL QILINDI'}
        </p>
      ),
    },
    { key: 'num', node: <p className="text-xs font-semibold tabular-nums">#{data.number}</p> },
  ];

  // Sana FAQAT haqiqatan mavjud boʻlsa chiziladi.
  if (when) {
    lines.push({ key: 'date', node: <p className="text-[10px] tabular-nums text-ink-400">{when}</p> });
  }

  lines.push({ key: 'div1', node: <Dashed /> });

  for (const it of shown) {
    lines.push({
      key: `it-${it.key}`,
      node: (
        <div className="flex items-baseline justify-between gap-2 text-left text-[11px]">
          <span className="min-w-0 flex-1 truncate">{it.name}</span>
          <span className="shrink-0 tabular-nums">×{it.quantity}</span>
        </div>
      ),
    });
  }
  if (hiddenCount > 0) {
    lines.push({
      key: 'more',
      node: <p className="text-left text-[11px] text-ink-400">+{hiddenCount} ta boshqa mahsulot</p>,
    });
  }

  lines.push(
    { key: 'div2', node: <Dashed /> },
    {
      key: 'total',
      node: (
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-500">Jami</span>
          <span
            className={cx(
              'text-[15px] font-bold tabular-nums',
              cancelled ? 'text-ink-500 line-through' : 'text-orange-700'
            )}
          >
            {formatPrice(data.total)}
          </span>
        </div>
      ),
    },
    {
      key: 'meta',
      node: (
        <p className="text-left text-[10px] text-ink-400">
          {units} dona · {data.payment}
        </p>
      ),
    },
    {
      key: 'status',
      node: (
        <p
          className={cx(
            'mt-1 inline-block rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
            cancelled ? 'bg-ink-200 text-ink-600' : 'bg-emerald-100 text-emerald-800'
          )}
        >
          {ORDER_STATUS_LABELS[data.status] || data.status}
        </p>
      ),
    },
    { key: 'thanks', node: <p className="pt-1 text-[10px] text-ink-400">Rahmat!</p> }
  );

  return lines;
}

const Dashed = () => <div className="border-t border-dashed border-ink-300" />;

/*
 * YIRTILISH BOSQICHLARI.
 *
 *   `tearing`  — chok KETAYOTGAN payt (~300ms). Ilgari bu bosqich
 *                umuman yoʻq edi: qoʻyib yuborilishi bilan chek
 *                birdan "tayyor" boʻlib qolardi va shuning uchun
 *                yirtilish sezilmasdi — oddiy almashinuvga oʻxshardi.
 *   `detached` — yirtib olingan chek. Butun, 360° aylanadi.
 *   `ripped`   — bekor qilingan chek ikkiga boʻlinadi.
 */
type Phase = 'idle' | 'printing' | 'printed' | 'tearing' | 'detached' | 'ripped';

/** Chok ketish vaqti. Tovushning "yirtilish" fazasiga mos. */
const TEARING_MS = 300;

export function OrderReceiptPrinter({
  data,
  mode = 'success',
  variant = 'printer',
  autoRip = false,
  onDone,
}: {
  data: ReceiptData;
  /** Chek MATNI. */
  mode?: ReceiptMode;
  /**
   * `printer` — mashina bosib chiqaradi, soʻng tortib yirtiladi.
   * `standalone` — tayyor chek yolgʻiz turadi va aylanadi.
   */
  variant?: ReceiptVariant;
  /**
   * Chek OʻZI ikkiga boʻlinadimi (tovush bilan). MATNDAN ALOHIDA:
   * yirtilish — HODISA ("hozir bekor qilindi"), holat emas.
   */
  autoRip?: boolean;
  onDone?: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const cancelled = mode === 'cancelled';
  const standalone = variant === 'standalone';

  const lines = useMemo(() => buildLines(data, cancelled), [data, cancelled]);
  const total = lines.length;

  /* Yolgʻiz chek allaqachon bosilgan — u hech narsa kutmaydi. */
  const [step, setStep] = useState(reduce || standalone ? total : 0);
  const [phase, setPhase] = useState<Phase>(() => {
    if (standalone) return autoRip ? 'ripped' : 'detached';
    if (reduce) return autoRip ? 'ripped' : 'printed';
    return 'idle';
  });
  /*
   * Chok ketayotgan paytdagi tortilish masofasi (px).
   *
   * Tortish holatining QOLGANI (`pull`, taranglik, tovush ostonalari)
   * `PrinterStage` ichida yashaydi — u yerda barmoq bilan bevosita
   * ishlaydi. Bu yerda faqat yirtilish NATIJASI kerak.
   */
  const [tearFrom, setTearFrom] = useState(0);

  const ripApart = useCallback(() => {
    setPhase('ripped');
    playTear();
    onDone?.();
  }, [onDone]);

  /*
   * YIRTISH — IKKI BOSQICH.
   *
   * Ilgari bu bitta qadam edi: bosildi → chek tayyor. Shuning uchun
   * yirtilish "oddiy" tuyulardi. Endi avval CHOK KETADI (`tearing`,
   * 300ms) va faqat undan keyin chek yakuniy holatiga oʻtadi.
   * Tovush ham aynan chok ketgan paytda boshlanadi.
   */
  const startTear = useCallback(
    (fromPx: number) => {
      setTearFrom(fromPx);
      setPhase('tearing');
      playTear();
      window.setTimeout(() => {
        setPhase('detached');
        onDone?.();
      }, TEARING_MS);
    },
    [onDone]
  );

  /* ── YAGONA HAYDOVCHI ──────────────────────────────────────────── */
  useEffect(() => {
    if (standalone || reduce) {
      onDone?.();
      return;
    }

    let stopped = false;
    let timer = 0;
    let stopMotor: StopSound = () => {};

    const begin = window.setTimeout(() => {
      if (stopped) return;
      setPhase('printing');
      stopMotor = playMotor(total * STEP_MS + 400);

      let k = 0;
      const stepOnce = () => {
        if (stopped) return;
        k += 1;

        /*
         * SINXRONLIKNING OʻZAGI: tovush va holat ayni bir tikda
         * beriladi. Orada animatsiya tizimi ham, ikkinchi taymer ham
         * yoʻq — ular ajralib keta olmaydi.
         */
        playFeedTick(k);
        setStep(k);

        if (k < total) {
          timer = window.setTimeout(stepOnce, STEP_MS);
          return;
        }

        stopMotor();
        playStopClick();
        setPhase('printed');

        if (autoRip) {
          timer = window.setTimeout(() => {
            if (!stopped) ripApart();
          }, TEAR_PAUSE);
        }
      };

      stepOnce();
    }, FEED_START);

    return () => {
      stopped = true;
      window.clearTimeout(begin);
      window.clearTimeout(timer);
      stopMotor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, standalone, autoRip, total]);

  const printed = phase === 'printed';
  const canPull = printed && !reduce && !autoRip;

  return (
    <div className="w-full">
      {/* Ekran o'quvchisi animatsiyani ham, tovushni ham kutmaydi. */}
      <p role="status" aria-live="polite" className="sr-only">
        {cancelled
          ? `Buyurtma bekor qilindi. Buyurtma raqami ${data.number}.`
          : `Buyurtma raqami ${data.number}.`}{' '}
        Umumiy summa {formatPrice(data.total)}. Holat:{' '}
        {ORDER_STATUS_LABELS[data.status] || data.status}.
      </p>

      {phase === 'detached' ? (
        <DetachedReceipt data={data} lines={lines} reduce={reduce} />
      ) : phase === 'ripped' ? (
        <RippedReceipt lines={lines} reduce={reduce} standalone={standalone} />
      ) : phase === 'tearing' ? (
        <TearingStage lines={lines} from={tearFrom} />
      ) : (
        <PrinterStage
          lines={lines}
          step={step}
          total={total}
          feeding={step > 0 && step < total}
          reduce={reduce}
          canPull={canPull}
          onTear={startTear}
        />
      )}

      {/*
        TORTMASDAN HAM YIRTISH MUMKIN. Sudrash sichqoncha/barmoq talab
        qiladi; klaviatura bilan yuradigan foydalanuvchi uchun bu yo'l
        yopiq bo'lib qolardi.
      */}
      {canPull && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => startTear(PULL_TEAR_AT)}
            className={cx(PILL, focusRing)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Chekni yirtib olish
          </button>
        </div>
      )}
    </div>
  );
}

const PILL =
  'inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700';

/* Qogʻoz kengligi — barcha koʻrinishlarda bir xil. */
const PAPER_W = 'w-[14.5rem] min-[380px]:w-[15.5rem] sm:w-[16.5rem]';
/*
 * Korpus endi TAILWIND KENGLIGI EMAS — u 3D quti va oʻlchami `BOX`
 * dan (320px, dizayndagi OSChek bilan bir xil). Konteyner butun
 * kenglikni oladi, quti esa uning markazida turadi.
 */

/* ── MASHINA + QOGʻOZ ─────────────────────────────────────────────── */

/*
 * QOʻL BILAN TORTISH.
 *
 * NEGA MOTION'NING `drag` I EMAS.
 *
 * `drag` barmoqni QATʼIY nisbatda kuzatadi: `dragElastic` doimiy va
 * `dragConstraints` oxirida qattiq toʻxtatadi. Natijada qogʻoz emas,
 * QUTI sudralgandek tuyulardi — qarshilik boshidan oxirigacha bir xil.
 *
 * Haqiqiy qogʻoz esa boshqacha: avval tirqishdan yengil sirgʻalib
 * chiqadi, soʻng taranglashadi va oxirida deyarli qimirlamay qoladi.
 * Aynan shu "qotib borish" qoʻlga "hozir uziladi" deb aytadi.
 *
 * Shuning uchun bu yerda barmoq masofasi EKSPONENSIAL egri chiziq
 * orqali oʻtkaziladi:
 *
 *     koʻchish = PULL_MAX · (1 − e^(−masofa / RESIST))
 *
 * Boshida hosila ≈ 1 (qogʻoz barmoq bilan birga ketadi), oxirida esa
 * nolga intiladi (qancha tortmang, deyarli qoʻshimcha koʻchish yoʻq).
 * Barmoq va qogʻoz orasidagi shu farq — qarshilikning oʻzi.
 */
/*
 * `RESIST = PULL_MAX` — TASODIF EMAS, SHART.
 *
 * Egri chiziqning boshlangʻich qiyaligi `PULL_MAX / RESIST` ga teng.
 * Ular teng boʻlsa qiyalik aynan 1 boʻladi, yaʼni birinchi
 * piksellarda qogʻoz barmoq bilan BIR XIL tezlikda ketadi — xuddi
 * haqiqiy qogʻoz tirqishdan sirgʻalib chiqqandek.
 *
 * Oʻlchov shuni koʻrsatdi: alohida qiymat (62) berilganda qiyalik
 * 2.13 boʻlib qolardi va 10px tortilganda qogʻoz 19.7px siljirdi —
 * qogʻoz qoʻldan OʻZIB ketardi. Bu darhol "rezina" tuygʻusini berardi.
 *
 * Uzilish nuqtasida (86px) qiyalik ~0.35 ga tushadi: qogʻoz hamon
 * javob beradi, lekin aniq qarshilik qiladi.
 */
const RESIST = PULL_MAX;
const resist = (raw: number) => PULL_MAX * (1 - Math.exp(-Math.max(0, raw) / RESIST));

/*
 * Tola uzilish ostonalari. Taranglik shu nuqtalardan oʻtganda bittadan
 * "qirs" eshitiladi — har biri bir marta, chunki qoʻl orqaga-oldinga
 * qimirlaganda tovush takrorlanib, "shitirlash" boʻlib ketardi.
 */
const SNAP_AT = [0.5, 0.66, 0.78, 0.87, 0.94, 0.985];

function PrinterStage({
  lines,
  step,
  total,
  feeding,
  reduce,
  canPull,
  onTear,
}: {
  lines: { key: string; node: React.ReactNode }[];
  step: number;
  total: number;
  feeding: boolean;
  reduce: boolean;
  canPull: boolean;
  onTear: (fromPx: number) => void;
}) {
  const hiddenPct = total > 0 ? ((total - step) / total) * 100 : 0;

  const pull = useMotionValue(0);
  const [pulling, setPulling] = useState(false);
  const [ready, setReady] = useState(false);

  const startY = useRef(0);
  const firedSnaps = useRef<Set<number>>(new Set());

  /* Taranglik 0..1 — barcha vizual javoblar shundan chiqadi. */
  const tension = useTransform(pull, [0, PULL_TEAR_AT], [0, 1]);
  const seamOpacity = useTransform(tension, [0.2, 0.95], [0, 1]);
  const boxShadow = useTransform(
    pull,
    [0, PULL_MAX],
    ['0 14px 26px -18px rgba(23,20,17,0.3)', '0 26px 38px -20px rgba(23,20,17,0.55)']
  );
  /*
   * Qogʻoz TEPASI choʻziladi, matn EMAS. Ilgari butun varaqqa `scaleY`
   * berilgan edi va harflar ham choʻzilardi — bu darhol "raqamli"
   * koʻrinardi. Endi faqat tirqish ostidagi boʻsh tasma tortiladi.
   */
  const neckScale = useTransform(tension, [0, 1], [1, 1.5]);
  // Bir qoʻl bilan tortilgani uchun qogʻoz ozgina qiyshayadi.
  const tilt = useTransform(tension, [0, 1], [0, 0.7]);
  /*
   * Boshlangʻich yirtiqning koʻrinishi. Bu YUQORIDA hisoblanadi, JSX
   * ichida emas: u `canPull && (...)` shartining ichida chaqirilganda
   * hookʼlar tartibi renderdan renderga oʻzgarardi va `canPull`
   * almashgan zahoti React yiqilardi.
   */
  const nickOpacity = useTransform(tension, [0.7, 1], [0, 1]);

  const down = (e: React.PointerEvent) => {
    if (!canPull) return;
    startY.current = e.clientY;
    firedSnaps.current.clear();
    setPulling(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!pulling) return;
    const raw = e.clientY - startY.current;
    const y = resist(raw);
    pull.set(y);

    const t = y / PULL_TEAR_AT;
    setReady(t >= 1);

    // Taranglik ortgani sari tolalar bittalab uziladi.
    for (const th of SNAP_AT) {
      if (t >= th && !firedSnaps.current.has(th)) {
        firedSnaps.current.add(th);
        playFiberSnap(th);
      }
    }
  };

  const up = (e: React.PointerEvent) => {
    if (!pulling) return;
    setPulling(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ushlanmagan bo'lsa — muammo emas.
    }

    const y = pull.get();
    if (y >= PULL_TEAR_AT) {
      onTear(y);
      return;
    }

    /*
     * Yetarli tortilmadi. Ilgari bu `pull.set(0)` edi — qogʻoz bir
     * kadrда joyiga "sakrab" qaytardi. Haqiqiy qogʻoz esa tarangligini
     * yoʻqotib, bir oz tebranib joyiga qaytadi.
     */
    setReady(false);
    firedSnaps.current.clear();
    animate(pull, 0, { type: 'spring', stiffness: 260, damping: 18, mass: 0.7 });
  };

  return (
    <div className="relative mx-auto flex w-full flex-col items-center" aria-hidden="true">
      <PrinterBody feeding={feeding} reduce={reduce} />

      {/*
        Qog'oz korpus USTIGA chiqadi (`z-20`) va manfiy chekinish bilan
        tepadagi tirqishga kiritiladi — orada tirqish qolmaydi.
      */}
      <div className={cx('relative z-20', PAPER_W)} style={{ marginTop: -PAPER_LIFT }}>
        <motion.div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{
            y: pull,
            rotate: canPull ? tilt : 0,
            boxShadow,
            clipPath: `inset(0% 0% ${hiddenPct}% 0%)`,
            transformOrigin: '50% 0%',
            /*
             * Tortish paytida sahifa SIRGʻALMASIN — lekin faqat qogʻoz
             * ustida va faqat tortish mumkin boʻlganda. Qolgan joyda
             * brauzerning odatdagi scrollʼi buzilmaydi.
             */
            touchAction: canPull ? 'none' : undefined,
            cursor: canPull ? (pulling ? 'grabbing' : 'grab') : undefined,
            transition: reduce ? undefined : `clip-path ${STEP_MS * 0.62}ms linear`,
          }}
        >
          {/*
            TARANG BO'YIN — tirqish bilan matn orasidagi bo'sh tasma.
            Cho'zilish faqat shu yerda sodir bo'ladi, shuning uchun
            harflar hech qachon buzilmaydi.
          */}
          {canPull && (
            <motion.span
              className="pointer-events-none absolute inset-x-0 top-0 h-9 origin-top bg-[#fbfaf8]"
              style={{ scaleY: neckScale }}
            />
          )}

          <PaperSheet lines={lines} step={step} reduce={reduce} fromSlot />

          {/*
            CHOK CHIZIG'I — tortilgan sari ko'rina boradi va qog'oz
            QAYERDAN uzilishini oldindan aytadi.
          */}
          {canPull && (
            <motion.span
              className="pointer-events-none absolute inset-x-0 top-[2.15rem] h-px"
              style={{
                opacity: seamOpacity,
                backgroundImage:
                  'repeating-linear-gradient(90deg, rgba(23,20,17,0.55) 0 4px, transparent 4px 8px)',
              }}
            />
          )}

          {/*
            BOSHLANG'ICH YIRTIQ — chok CHAP chekkadan ketadi, shuning
            uchun birinchi tishcha ham o'sha yerda paydo bo'ladi.
            Foydalanuvchi uzilish qayerdan boshlanishini ko'radi.
          */}
          {canPull && (
            <motion.span
              className="pointer-events-none absolute left-0 top-[2.15rem] h-1.5 w-3"
              style={{
                opacity: nickOpacity,
                backgroundColor: '#fbfaf8',
                clipPath: 'polygon(0% 0%, 100% 0%, 55% 100%, 0% 45%)',
                filter: 'drop-shadow(0 1px 0 rgba(23,20,17,0.35))',
              }}
            />
          )}
        </motion.div>

        {canPull && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className={cx(
              'mt-3 text-center text-[11px] transition-colors',
              ready ? 'font-semibold text-orange-700' : 'text-ink-400'
            )}
          >
            {/* Ostona oshgach matn o'zgaradi — qo'l qachon bo'shatishni biladi. */}
            {ready ? 'Qoʻyib yuboring — uziladi' : 'Chekni pastga torting'}
          </motion.p>
        )}
      </div>
    </div>
  );
}

/*
 * ── MASHINA KORPUSI — HAQIQIY 3D QUTI ───────────────────────────────
 *
 * Ilgari korpus TEKIS edi: ikkita div va gradientlar chuqurlikni
 * TAQLID qilardi. Yon tomondan qaralganda u qogʻoz boʻlagiga
 * aylanardi — ayniqsa telefon egilganda, chunki hech narsa
 * oʻzgarmasdi.
 *
 * Endi bu oltita yuzli quti: old panel, ustki qopqoq, ikkita yon,
 * orqa va polga tushgan soya. Kamera `rotateX(-20°) rotateY(-14°)` —
 * quti biroz yuqoridan va chapdan koʻrinadi, yaʼni ustki qopqoq ham,
 * oʻng yon ham bir vaqtda koʻzga tashlanadi.
 *
 * FAQAT TRANSFORM. Rasm, SVG yoki canvas yoʻq; blur ham yoʻq —
 * poldagi soya statik radial gradient.
 *
 * OʻLCHAMLAR dizayndagi OSChek bilan bir xil: 320 × 104 × 210.
 */

/** Korpus oʻlchamlari (px). Yuzlarning `translateZ` i shulardan. */
const BOX = { w: 320, h: 104, d: 210 } as const;

/*
 * Konteyner balandligi va qogʻoz siljishi — BRAUZERDA OʻLCHANGAN.
 *
 * 3D quti proyeksiyasi 207px joy egallaydi (old panel eng pastda).
 * Ilgari bu yerda 150 turardi va old panel konteynerdan 56px pastga
 * chiqib, kesilib qolgandi.
 *
 * `PAPER_LIFT` — qogʻoz konteyner tubidan shuncha YUQORIGA koʻtariladi,
 * shunda uning tepasi aynan tirqishga tushadi. Ikkala qiymat bir-biriga
 * bogʻliq, shuning uchun ular yonma-yon turadi: birini oʻzgartirsangiz
 * ikkinchisini ham qayta oʻlchash kerak.
 */
const BODY_H = 210;
const PAPER_LIFT = 146;

/** Kameraning tinch holati (daraja). */
const CAM = { rx: -20, ry: -14 } as const;

/** Kursor ostida kamera shuncha ogʻadi (daraja). */
const CAM_SWING = 9;

/** Yirtish plankasi tishlari — `clip-path` bilan, qoʻshimcha elementsiz. */
const TEETH = (() => {
  const pts = ['0 0', '100% 0', '100% 40%'];
  for (let x = 98.5; x > 0; x -= 1.5) {
    pts.push(`${x.toFixed(1)}% 100%`, `${(x - 0.75).toFixed(2)}% 40%`);
  }
  pts.push('0 40%');
  return `polygon(${pts.join(', ')})`;
})();

/** Barcha yuzlar 0×0 "oʻq" nuqtasiga nisbatan joylashadi. */
const FACE = 'pointer-events-none absolute';

function PrinterBody({ feeding, reduce }: { feeding: boolean; reduce: boolean }) {
  /*
   * Kamera burchagi kursor bilan ±9° ogʻadi.
   *
   * `useMotionValue` + `useSpring`: React qayta render QILMAYDI,
   * qiymat toʻgʻridan-toʻgʻri DOMʼga yoziladi. Aynan shu naqsh
   * mahsulot kartochkasidagi tilt uchun ham ishlatilgan.
   */
  const rawX = useMotionValue<number>(CAM.rx);
  const rawY = useMotionValue<number>(CAM.ry);
  const rx = useSpring(rawX, springOptions.soft);
  const ry = useSpring(rawY, springOptions.soft);

  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    rawY.set(CAM.ry + nx * 2 * CAM_SWING);
    rawX.set(CAM.rx - ny * 2 * CAM_SWING);
  };
  const rest = () => {
    rawX.set(CAM.rx);
    rawY.set(CAM.ry);
  };

  return (
    <div
      className="relative z-10 w-full"
      style={{ height: BODY_H, perspective: 1100, perspectiveOrigin: '50% 28%' }}
      onPointerMove={(e) => { if (e.pointerType !== 'touch') follow(e); }}
      onPointerLeave={rest}
      onPointerCancel={rest}
      aria-hidden="true"
    >
      {/*
        3D OʻQ — 0×0 nuqta. Barcha yuzlar shunga nisbatan quriladi.
        `preserve-3d` zanjiri shu yerdan boshlanadi va yuzlargacha
        uzilmaydi (dizayn qoidasi).
      */}
      <motion.div
        className="absolute left-1/2"
        style={{
          width: 0,
          height: 0,
          // Quti oʻz balandligining yarmicha pastga tushiriladi, shunda
          // ustki qopqoq konteyner tepasida qoladi va qogʻoz tirqishdan
          // chiqqandek koʻrinadi.
          // Quti oʻqi konteyner tepasidan shuncha pastda. Konteyner
          // faqat PASTGA oʻsdi (150 → 210), shuning uchun bu qiymat
          // oʻzgarmaydi va quti joyidan qimirlamaydi.
          top: 92,
          transformStyle: 'preserve-3d',
          rotateX: reduce ? CAM.rx : rx,
          rotateY: reduce ? CAM.ry : ry,
        }}
      >
        {/* Polga tushgan soya — quti "oʻtiradi", osilib turmaydi. */}
        <span
          className={FACE}
          style={{
            left: -230, top: -160, width: 460, height: 320,
            transform: 'rotateX(90deg) translateZ(-54px)',
            background:
              'radial-gradient(ellipse at 50% 50%, rgb(24 23 22 / .38) 0%, rgb(24 23 22 / .16) 38%, rgb(24 23 22 / 0) 68%)',
          }}
        />

        {/* Orqa yuz */}
        <span
          className={FACE}
          style={{
            left: -BOX.w / 2, top: -BOX.h / 2, width: BOX.w, height: BOX.h,
            transform: 'rotateY(180deg) translateZ(105px)',
            borderRadius: '0 0 18px 18px',
            background: '#161514',
          }}
        />

        {/* Chap yon */}
        <span
          className={FACE}
          style={{
            left: -105, top: -BOX.h / 2, width: BOX.d, height: BOX.h,
            transform: 'rotateY(-90deg) translateZ(160px)',
            borderRadius: '0 0 16px 16px',
            background: 'linear-gradient(90deg, #1b1a18, #2b2826 70%, #211f1d)',
          }}
        />

        {/* Oʻng yon */}
        <span
          className={FACE}
          style={{
            left: -105, top: -BOX.h / 2, width: BOX.d, height: BOX.h,
            transform: 'rotateY(90deg) translateZ(160px)',
            borderRadius: '0 0 16px 16px',
            background: 'linear-gradient(90deg, #211f1d, #2b2826 30%, #1b1a18)',
          }}
        />

        {/* ── USTKI QOPQOQ — qogʻoz shu yerdan chiqadi ───────────── */}
        <div
          className={FACE}
          style={{
            left: -BOX.w / 2, top: -BOX.d / 2, width: BOX.w, height: BOX.d,
            transform: 'rotateX(90deg) translateZ(52px)',
            borderRadius: '22px 22px 6px 6px',
            background: 'linear-gradient(180deg, #2a2725 0%, #3d3936 55%, #4a4642 100%)',
            boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / .05)',
          }}
        >
          {/* Qopqoq choki */}
          <span className="absolute left-[18px] right-[18px] top-[58px] h-px bg-black/45" />
          <span className="absolute left-[18px] right-[18px] top-[59px] h-px bg-white/[0.06]" />

          {/* Tutqich */}
          <span
            className="absolute left-[132px] top-[22px] h-2 w-14 rounded-full bg-black/35"
            style={{ boxShadow: 'inset 0 1px 2px rgb(0 0 0 / .6)' }}
          />

          {/* Qogʻoz tirqishi — bosish paytida ichida toʻq sariq nur yuguradi */}
          <span
            className="absolute left-7 right-7 top-[162px] h-3 overflow-hidden rounded-[3px] bg-[#050505]"
            style={{ boxShadow: 'inset 0 3px 6px rgb(0 0 0 / .95), 0 1px 0 rgb(255 255 255 / .08)' }}
          >
            {feeding && !reduce && (
              <motion.span
                initial={{ x: '-60%' }}
                animate={{ x: '360%' }}
                transition={{ duration: 0.36, repeat: Infinity, ease: EASE.inOut }}
                className="absolute inset-y-0 w-14 bg-gradient-to-r from-transparent via-orange-400/45 to-transparent"
              />
            )}
          </span>

          {/*
            YIRTISH PLANKASI — tishli metall qirra. Qogʻoz aynan shu
            qirraga bosib uziladi, shuning uchun u tirqishdan darhol
            keyin turadi.
          */}
          <span
            className="absolute left-[26px] right-[26px] top-[176px] h-[5px]"
            style={{ background: 'linear-gradient(180deg, #b9b6b0, #6d6a65)', clipPath: TEETH }}
          />
        </div>

        {/* ── OLD PANEL ───────────────────────────────────────────── */}
        <div
          className={cx(FACE, 'flex flex-col items-center justify-center gap-3')}
          style={{
            left: -BOX.w / 2, top: -BOX.h / 2, width: BOX.w, height: BOX.h,
            transform: 'translateZ(105px)',
            borderRadius: '4px 4px 20px 20px',
            background: 'linear-gradient(180deg, #3b3734 0%, #242220 45%, #141312 100%)',
            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / .12), inset 0 -2px 0 rgb(0 0 0 / .4)',
          }}
        >
          <span className="text-base font-semibold tracking-tight text-white/90">
            Open<span className="text-orange-500">Shop</span>
          </span>

          {/*
            Toʻq sariq yorugʻlik chizigʻi — bosish paytida yorqinroq
            yonadi. Alohida animatsiya EMAS, holatdan kelib chiqadi,
            yaʼni tirqishdagi nur bilan sinxron.
          */}
          <span
            className="block h-[3px] rounded-full bg-orange-500 transition-[opacity,box-shadow] duration-150"
            style={{
              width: 104,
              opacity: feeding && !reduce ? 1 : 0.6,
              boxShadow: feeding
                ? '0 0 14px 2px rgba(249,115,22,0.75)'
                : '0 0 8px 1px rgba(249,115,22,0.4)',
            }}
          />

          {/* FEED tugmasi (bezak) */}
          <span
            className="absolute bottom-[18px] right-[22px] h-[18px] w-[18px] rounded-full"
            style={{
              background: 'radial-gradient(circle at 40% 35%, #3a3633, #121110)',
              boxShadow: '0 0 0 2px #0b0a0a, inset 0 1px 0 rgb(255 255 255 / .1)',
            }}
          />

          {/* Quvvat chirogʻi */}
          <span
            className="absolute bottom-6 left-6 h-1.5 w-1.5 rounded-full bg-[#22c55e]"
            style={{ boxShadow: '0 0 6px 1px rgb(34 197 94 / .6)' }}
          />
        </div>
      </motion.div>
    </div>
  );
}

/* ── CHOK KETAYOTGAN PAYT ─────────────────────────────────────────── */

/*
 * YIRTILISHNING OʻZI — eng muhim 300ms.
 *
 * Uch narsa BIR VAQTDA sodir boʻladi va aynan shu uchligi uni
 * "haqiqiy" qiladi. Ilgari uchalasi ham yoʻq edi: chek shunchaki
 * yoʻqolib, yangisi paydo boʻlardi.
 *
 *  1. CHOK BIR TOMONDAN KETADI. Aylanish oʻqi CHAP chekkada
 *     (`transformOrigin: 0% 0%`), shuning uchun oʻng chekka koʻproq
 *     pastga tushadi — chok chapdan oʻngga "ketayotgandek" koʻrinadi.
 *     Markazdan aylantirilsa, ikkala chekka barobar tushib, qaychida
 *     qirqilgandek chiqardi.
 *
 *  2. QOLGAN QOGʻOZ ORQAGA SAKRAYDI. Tarang qogʻoz uzilganda ichkarida
 *     qolgan qismi keskin yuqoriga tortiladi. Bu juda kichik detal,
 *     lekin usiz uzilish "boʻsh" tuyuladi.
 *
 *  3. TEZLIK NOTEKIS. `EASE.standard` — boshida keskin, oxirida
 *     sekin: qoʻl yulqib tortganda shunday boʻladi.
 */
function TearingStage({
  lines,
  from,
}: {
  lines: { key: string; node: React.ReactNode }[];
  from: number;
}) {
  return (
    <div className="relative mx-auto flex w-full flex-col items-center" aria-hidden="true">
      <PrinterBody feeding={false} reduce={false} />

      <div className={cx('relative z-20 -mt-[5.4rem]', PAPER_W)}>
        {/* Ichkarida qolgan parcha — yuqoriga sakraydi. */}
        <motion.div
          className="absolute inset-x-0 top-0 h-10 overflow-hidden"
          initial={{ y: from * 0.35 }}
          animate={{ y: -14 }}
          transition={{ type: 'spring', stiffness: 700, damping: 26, mass: 0.5 }}
        >
          <div className="h-10 bg-[#fbfaf8]" style={{ clipPath: STUB_BOTTOM }} />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-ink-900/45 to-transparent" />
        </motion.div>

        {/* Yirtib olingan bo'lak — chapdan o'ngga uzilib tushadi. */}
        <motion.div
          initial={{ y: from, rotate: 0, opacity: 1 }}
          animate={{ y: from + 54, rotate: 3.4, opacity: 1 }}
          transition={{ duration: TEARING_MS / 1000, ease: EASE.standard }}
          style={{ transformOrigin: '0% 0%' }}
        >
          <PaperSheet lines={lines} step={lines.length} reduce={false} tornTop />
        </motion.div>
      </div>
    </div>
  );
}

/** Mashinada qolgan parchaning pastki qirrasi — oʻsha qiya chok. */
const STUB_BOTTOM = `polygon(0% 0%, 100% 0%, ${[...TEAR_PROFILE]
  .reverse()
  .map(([x, dy]) => `${x}% ${60 + dy * 4}%`)
  .join(', ')})`;

/* ── IKKIGA BOʻLINGAN CHEK (bekor qilingan) ───────────────────────── */

function RippedReceipt({
  lines,
  reduce,
  standalone,
}: {
  lines: { key: string; node: React.ReactNode }[];
  reduce: boolean;
  standalone: boolean;
}) {
  const { top, bottom } = ripPolygons();
  const sheet = <PaperSheet lines={lines} step={lines.length} reduce={reduce} fromSlot={!standalone} />;

  return (
    <div className="relative mx-auto flex w-full flex-col items-center" aria-hidden="true">
      {!standalone && <PrinterBody feeding={false} reduce={reduce} />}
      <div className={cx('relative z-20', PAPER_W, !standalone && '-mt-[5.4rem]')}>
        {/* Yuqori bo'lak — joyida qoladi. */}
        <div style={{ clipPath: top }}>{sheet}</div>

        {/* Pastki bo'lak — uziladi va tushadi. */}
        <motion.div
          className="absolute inset-0"
          style={{ clipPath: bottom, transformOrigin: '50% 0%' }}
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={reduce ? { opacity: 0.3 } : { y: 32, rotate: 3.2, skewX: -1.6, opacity: 0 }}
          transition={reduce ? { duration: 0.2 } : { duration: 0.62, ease: EASE.standard }}
        >
          {sheet}
        </motion.div>
      </div>
    </div>
  );
}

/* ── YOLGʻIZ CHEK: 360° ───────────────────────────────────────────── */

function DetachedReceipt({
  data,
  lines,
  reduce,
}: {
  data: ReceiptData;
  lines: { key: string; node: React.ReactNode }[];
  reduce: boolean;
}) {
  const rot = useMotionValue(0);
  const spring = useSpring(rot, { stiffness: 120, damping: 20, mass: 0.6 });
  const dragging = useRef(false);
  const lastX = useRef(0);
  const [flipped, setFlipped] = useState(false);

  /*
   * Orqa tomon koʻrinayotganini BURCHAKdan hisoblaymiz, alohida
   * holatdan emas: aks holda sudrab aylantirilganda tugma matni
   * haqiqatga mos kelmay qolardi.
   */
  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      const norm = ((v % 360) + 360) % 360;
      setFlipped(norm > 90 && norm < 270);
    });
    return unsub;
  }, [spring]);

  const down = (e: React.PointerEvent) => {
    if (reduce) return;
    dragging.current = true;
    lastX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    // 0.55°/px — toʻliq aylanish uchun ~650px, ataylab "ogʻir".
    rot.set(rot.get() + dx * 0.55);
  };
  const up = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ushlanmagan bo'lsa — muammo emas.
    }
    // Eng yaqin yuzga oʻtiradi: chek hech qachon qiyshiq qolmaydi.
    rot.set(Math.round(rot.get() / 180) * 180);
  };

  const flip = () => rot.set(Math.round(rot.get() / 180) * 180 + 180);

  return (
    <div className="flex w-full flex-col items-center">
      <div className={cx('relative [perspective:1100px]', PAPER_W)} aria-hidden="true">
        <motion.div
          initial={reduce ? false : { y: -12, rotate: -2, opacity: 0.92 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          transition={reduce ? { duration: 0.2 } : { duration: 0.5, ease: EASE.standard }}
        >
          <motion.div
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{
              rotateY: spring,
              transformStyle: 'preserve-3d',
              // Vertikal sirgʻalish SAHIFAGA tegishli, gorizontal esa
              // chekni aylantiradi. Bitta qiymat ikkalasini ajratadi.
              touchAction: 'pan-y',
              cursor: reduce ? undefined : 'ew-resize',
            }}
            className="relative"
          >
            <div style={{ backfaceVisibility: 'hidden' }}>
              <PaperSheet lines={lines} step={lines.length} reduce={reduce} tornTop />
            </div>
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <ReceiptBack data={data} />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <button type="button" onClick={flip} className={cx(PILL, focusRing, 'mt-5')}>
        <RotateCcw className="h-3.5 w-3.5" />
        {flipped ? 'Old tomonini koʻrish' : 'Orqa tomonini koʻrish'}
      </button>
    </div>
  );
}

/*
 * CHEKNING ORQA TOMONI.
 *
 * Ataylab kam: bu yerda soxta QR kod, soxta kuzatuv raqami yoki soxta
 * aloqa maʼlumoti YOʻQ. Loyihada bunday maʼlumot manbai yoʻq, oʻylab
 * topish esa mumkin emas. Brend yuzasi va buyurtma raqami — ikkalasi
 * ham haqiqiy.
 */
function ReceiptBack({ data }: { data: ReceiptData }) {
  return (
    <div
      className="relative flex h-full min-h-[15rem] flex-col items-center justify-center gap-3 bg-[#f4f2ef] px-6 py-10 text-center"
      style={{ clipPath: TORN_TOP }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-ink-900/10" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-ink-900/10" />

      <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-ink-600">OPENSHOP</p>
      <p className="font-mono text-[9px] tracking-[0.35em] text-ink-300">* * * * * * *</p>
      <p className="max-w-[13rem] text-[11px] leading-relaxed text-ink-500">
        Xaridingiz uchun rahmat. Buyurtma holatini «Buyurtmalarim» boʻlimida kuzatib borishingiz
        mumkin.
      </p>
      <p className="font-mono text-[10px] tabular-nums text-ink-400">#{data.number}</p>
    </div>
  );
}

/* ── QOGʻOZ VARAGʻI ───────────────────────────────────────────────── */

function PaperSheet({
  lines,
  step,
  reduce,
  fromSlot = false,
  tornTop = false,
}: {
  lines: { key: string; node: React.ReactNode }[];
  step: number;
  reduce: boolean;
  /** Tirqishdan chiqyaptimi — tepasiga egrilik soyasi qoʻyiladi. */
  fromSlot?: boolean;
  /** Yirtib olingan chekning tepasi qiya chok boʻladi. */
  tornTop?: boolean;
}) {
  return (
    <div
      className={cx(
        'relative bg-[#fbfaf8] px-4 pb-5',
        // Tirqishdan chiqayotgan qogʻozning tepasi mashina ichida
        // qoladi, shuning uchun unga qoʻshimcha joy kerak.
        fromSlot ? 'pt-12' : 'pt-5',
        !tornTop && 'shadow-[0_12px_24px_-16px_rgba(23,20,17,0.55)]'
      )}
      style={tornTop ? { clipPath: TORN_TOP } : undefined}
    >
      {/*
        Tirqishdan chiqayotgan qog'ozning egriligi: tepasi mashina
        ichida qorong'i, pastga qarab yorishadi. Aynan shu soya qog'ozni
        "mashinadan chiqyapti" qilib ko'rsatadi.
      */}
      {fromSlot && (
        <>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-11 bg-gradient-to-b from-ink-900/45 via-ink-900/12 to-transparent" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-ink-900/25" />
        </>
      )}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-ink-900/10" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-ink-900/10" />

      <div className="relative space-y-2 text-center font-mono text-ink-800">
        {lines.map((l, i) => (
          <div
            key={l.key}
            style={{
              opacity: reduce || i < step ? 1 : 0,
              // Termal bosish — qator BUTUNLIGICHA, harfma-harf emas.
              transition: reduce ? undefined : 'opacity 70ms linear',
            }}
          >
            {l.node}
          </div>
        ))}
      </div>

      {/* Chekning tishli pastki qirrasi. */}
      <span
        className="pointer-events-none absolute inset-x-0 -bottom-px h-2"
        style={{
          backgroundImage: 'radial-gradient(circle at 4px 8px, transparent 4px, #fbfaf8 4px)',
          backgroundSize: '9px 9px',
          backgroundPosition: 'center bottom',
        }}
      />
    </div>
  );
}
