import { useEffect, useState } from 'react';
import { cx } from './design';
import { AnimatedNumber } from './AnimatedNumber';

type Remaining = { d: number; h: number; m: number; s: number };

function diffToParts(ms: number): Remaining {
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
  };
}

/**
 * Aksiya tugashigacha qolgan vaqt.
 *
 * `endDate` berilmasa umuman koʻrsatilmaydi (ilgari muddatsiz aksiyada
 * "00:00:00:00" chiqib turardi). Vaqt tugaganda `onExpire` chaqiriladi,
 * shunda chaqiruvchi boʻlim "aksiya tugadi" holatiga oʻtishi mumkin.
 */
export function CountdownTimer({
  endDate,
  onExpire,
  tone = 'dark',
  className,
}: {
  endDate: string | null | undefined;
  onExpire?: () => void;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const [remaining, setRemaining] = useState<Remaining | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!endDate) {
      setRemaining(null);
      return;
    }
    const target = new Date(endDate).getTime();
    if (Number.isNaN(target)) {
      setRemaining(null);
      return;
    }

    let fired = false;
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setRemaining({ d: 0, h: 0, m: 0, s: 0 });
        setExpired(true);
        if (!fired) {
          fired = true;
          onExpire?.();
        }
        return;
      }
      setExpired(false);
      setRemaining(diffToParts(ms));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // `onExpire` har renderda yangi funksiya bo'lishi mumkin — intervalni
    // qayta yaratmaslik uchun uni bog'liqlikka qo'shmaymiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDate]);

  if (!remaining) return null;

  if (expired) {
    return (
      <span className={cx('inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600', className)}>
        Aksiya yakunlandi
      </span>
    );
  }

  const onDark = tone === 'light';
  /*
   * ── BITTA QATOR, TOʻRTTA QUTI EMAS ──────────────────────────────
   *
   * Ilgari har bir birlik oʻz qutisida turardi: 4 ta 44px quti, ichida
   * 14px raqam va 10px yorliq. Natijada taymer "vidjet" boʻlib
   * koʻrinardi va aksiya blokidagi sarlavha bilan bir ovozda emas,
   * undan alohida gapirardi. Yorliqlar 10px edi — shkalada yoʻq qiymat.
   *
   * Endi u bitta qator: katta raqamlar (28px, kompyuterda 40px —
   * shkaladagi qadamlar) va ular orasida kichik yorliqlar. Taymer
   * blokning IKKINCHI sarlavhasiga aylanadi.
   *
   * SONIYALAR ALOHIDA RANGDA: faqat oʻsha raqam har soniyada
   * oʻzgaradi. Rang koʻzni aynan harakat boʻladigan joyga olib
   * boradi, qolgan uchtasi sokin turadi.
   */
  const num = 'text-display-md lg:text-display-lg leading-none tabular-nums';
  const lbl = cx('text-sm font-medium', onDark ? 'text-ink-300' : 'text-ink-600');
  const sep = cx('leading-none', onDark ? 'text-white/40' : 'text-ink-300');

  return (
    <div
      className={cx(
        'inline-flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-card px-4 py-3.5',
        onDark
          ? 'border border-white/10 bg-white/5 text-white'
          : 'border border-ink-200 bg-ink-50 text-ink-900',
        className
      )}
      role="timer"
      aria-label={`Aksiya tugashiga ${remaining.d} kun ${remaining.h} soat ${remaining.m} daqiqa qoldi`}
    >
      <span className={cx('text-xs uppercase tracking-[0.12em]', onDark ? 'text-white/70' : 'text-ink-600')}>
        Tugashiga
      </span>

      <span className="flex items-baseline gap-1.5 font-bold">
        {/*
          Raqamlar `AnimatedNumber` bilan almashadi — jimgina
          oʻzgarish oʻrniga yuqoriga siljib ketadi. Komponent
          allaqachon mavjud, yangi animatsiya qoidasi kiritilmaydi.
        */}
        <AnimatedNumber value={remaining.d} className={num} />
        <span className={lbl}>kun</span>

        <AnimatedNumber value={String(remaining.h).padStart(2, '0')} className={cx(num, 'ml-1.5')} />
        <span aria-hidden="true" className={sep}>:</span>
        <AnimatedNumber value={String(remaining.m).padStart(2, '0')} className={num} />
        <span aria-hidden="true" className={sep}>:</span>
        <AnimatedNumber
          value={String(remaining.s).padStart(2, '0')}
          className={cx(num, onDark ? 'text-orange-300' : 'text-orange-700')}
        />
      </span>
    </div>
  );
}
