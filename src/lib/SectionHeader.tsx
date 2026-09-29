import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from './router';
import { cx, focusRing } from './design';

/*
 * Har bir boʻlim bir xil tuzilishga ega boʻlishi kerak:
 *   eyebrow (ixtiyoriy) → sarlavha → subtitle → oʻngda amal.
 * Ilgari har bir section oʻz sarlavha maketini qaytadan yozardi va ular
 * oʻlchami, boʻshligʻi va hizalanishi boʻyicha bir-biridan farq qilardi.
 */
export function SectionHeader({
  id,
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
  actionHref,
  actionLabel,
  action,
  tone = 'default',
}: {
  id?: string;
  eyebrow?: string;
  eyebrowIcon?: typeof ArrowRight;
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
  /** `onDark` — toʻq fonli bloklar ichida (masalan aksiya boʻlimi). */
  tone?: 'default' | 'onDark';
}) {
  const onDark = tone === 'onDark';

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {/*
          Eyebrow endi "urg'u chizig'i + matn" ko'rinishida.
          Kichik gorizontal chiziq bo'limlarga vizual "boshlanish nuqtasi"
          beradi — sarlavhalar sahifada bir tekis oqim bo'lib qolmaydi.
        */}
        {eyebrow && (
          /*
            Ustki yozuv OCHIQ fonda `ink-600`, brend rangida EMAS.

            Brend ulushi ~10% boʻlishi kerak: toʻq sariq faqat asosiy
            amal, chegirma nishoni va faol holatda. Har boʻlim tepasida
            toʻq sariq eyebrow turganda u "urgʻu" boʻlishdan toʻxtaydi
            va shunchaki matn rangiga aylanadi.

            Toʻq fonda esa aksincha: u yerda neytral kulrang oʻqilmaydi,
            shuning uchun `orange-300` qoladi.
          */
          <p
            className={cx(
              'flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]',
              onDark ? 'text-orange-300' : 'text-ink-600'
            )}
          >
            <span
              aria-hidden="true"
              className={cx('h-px w-6 shrink-0', onDark ? 'bg-orange-300/60' : 'bg-ink-300')}
            />
            {EyebrowIcon && <EyebrowIcon className="h-3.5 w-3.5" />}
            {eyebrow}
          </p>
        )}
        {/* 28px — barcha oʻlchamlarda bir xil (dizayn: `h2` 28px).
            Ilgari 24 → 32 → 36px edi, yaʼni shkalada yoʻq ikkita qiymat. */}
        <h2 id={id} className={cx('mt-1.5 text-display-md', onDark && 'text-white')}>
          {title}
        </h2>
        {subtitle && (
          // `ink-600`: `ink-500` ochiq kulrang `ink-50` fonida 4.33:1 berardi.
          <p className={cx('mt-1 text-sm', onDark ? 'text-white/70' : 'text-ink-600')}>{subtitle}</p>
        )}
      </div>

      {action ??
        (actionHref && actionLabel ? (
          <Link
            to={actionHref}
            className={cx(
              // Havola ham `ink-900` — brend ulushini saqlash uchun.
              'hidden shrink-0 items-center gap-1 rounded-sm text-sm font-semibold sm:flex',
              onDark ? 'text-orange-300 hover:text-orange-200' : 'text-ink-900 hover:text-orange-700',
              focusRing
            )}
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null)}
    </div>
  );
}
