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

  const units = [
    { label: 'kun', value: remaining.d },
    { label: 'soat', value: remaining.h },
    { label: 'daq', value: remaining.m },
    { label: 'son', value: remaining.s },
  ];

  const box =
    tone === 'dark'
      ? 'bg-ink-900 text-white'
      : 'bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm';
  const sub = tone === 'dark' ? 'text-ink-400' : 'text-white/60';

  if (expired) {
    return (
      <span className={cx('inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-500', className)}>
        Aksiya yakunlandi
      </span>
    );
  }

  return (
    <div
      className={cx('flex items-center gap-1.5', className)}
      role="timer"
      aria-label={`Aksiya tugashiga ${remaining.d} kun ${remaining.h} soat qoldi`}
    >
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-1.5">
          <div className={cx('flex w-[2.75rem] flex-col items-center rounded-control py-1.5', box)}>
            {/*
              Raqamlar `AnimatePresence` bilan almashadi — sekundlar
              jimgina o'zgarish o'rniga yuqoriga siljib ketadi. Bu aksiya
              blokidagi yagona doimiy harakat va u "vaqt ketyapti" degan
              hissni beradi. Komponent allaqachon mavjud, yangi animatsiya
              qoidalari kiritilmaydi.
            */}
            <AnimatedNumber
              value={String(u.value).padStart(2, '0')}
              className="text-sm font-bold leading-none tabular-nums"
            />
            <span className={cx('mt-0.5 text-[10px] leading-none', sub)}>{u.label}</span>
          </div>
          {i < units.length - 1 && (
            <span aria-hidden="true" className={cx('-mt-2 text-sm font-bold', tone === 'dark' ? 'text-ink-300' : 'text-white/40')}>
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
