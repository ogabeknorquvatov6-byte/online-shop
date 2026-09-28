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
          <p
            className={cx(
              'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]',
              onDark ? 'text-orange-300' : 'text-orange-700'
            )}
          >
            <span
              aria-hidden="true"
              className={cx('h-px w-6 shrink-0', onDark ? 'bg-orange-300/60' : 'bg-orange-400/70')}
            />
            {EyebrowIcon && <EyebrowIcon className="h-3.5 w-3.5" />}
            {eyebrow}
          </p>
        )}
        <h2
          id={id}
          className={cx(
            'mt-1.5 text-display-sm md:text-display-md lg:text-[2.25rem] lg:leading-[1.12] lg:tracking-[-0.028em]',
            onDark && 'text-white'
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className={cx('mt-1 text-sm', onDark ? 'text-white/70' : 'text-ink-500')}>{subtitle}</p>
        )}
      </div>

      {action ??
        (actionHref && actionLabel ? (
          <Link
            to={actionHref}
            className={cx(
              'hidden shrink-0 items-center gap-1 rounded-sm text-sm font-semibold sm:flex',
              onDark ? 'text-white hover:text-orange-300' : 'text-orange-700 hover:text-orange-800',
              focusRing
            )}
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null)}
    </div>
  );
}
