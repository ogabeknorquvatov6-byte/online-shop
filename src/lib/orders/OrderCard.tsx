import { ChevronRight, ImageOff } from 'lucide-react';
import type { Order } from '../types';
import { formatPrice, formatOrderDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../types';
import { cardInteractive, cx, focusRing } from '../design';
import { Img } from '../Img';

/*
 * RO'YXATDAGI BITTA BUYURTMA.
 *
 * Ilgari ro'yxatdagi har bir buyurtma HAMMA narsani birdan ochib
 * ko'rsatardi: barcha mahsulotlar, manzil, oraliq summalar. Uchta
 * buyurtmasi bor odam uchun bu bir ekranga sig'masdi va qaysi
 * buyurtma qayerda tugashini ajratib bo'lmasdi.
 *
 * Endi kartochka — XULOSA: raqam, sana, rasmlar, jami, holat. Qolgani
 * ichkarida. Kartochka `<button>`, ya'ni klaviatura bilan ham
 * ochiladi va `Enter`/`Space` o'zi ishlaydi.
 */

/** Ko'rinadigan rasmlar soni — qolgani «+N» bo'lib yig'iladi. */
const MAX_THUMBS = 3;

export function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const items = order.order_items ?? [];
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const thumbs = items.slice(0, MAX_THUMBS);
  const rest = items.length - thumbs.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(cardInteractive, 'w-full p-4 text-left', focusRing)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">№ {order.order_number}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            <time dateTime={order.created_at}>
              {formatOrderDate(order.created_at)}
            </time>
          </p>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
            ORDER_STATUS_COLORS[order.status] || 'bg-ink-100 text-ink-600'
          )}
        >
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex shrink-0 items-center">
          {thumbs.map((it, i) => (
            <span
              key={it.id}
              // Ustma-ust joylashuv — uchta rasm kam joy egallaydi va
              // "to'plam" bo'lib ko'rinadi.
              className={cx(
                'flex h-10 w-10 items-center justify-center overflow-hidden rounded-control border-2 border-white bg-ink-50',
                i > 0 && '-ml-3'
              )}
            >
              {it.image_url ? (
                <Img src={it.image_url} alt="" className="h-full w-full" sizes="40px" iconClassName="h-4 w-4" />
              ) : (
                <ImageOff className="h-4 w-4 text-ink-300" />
              )}
            </span>
          ))}
          {rest > 0 && (
            <span className="-ml-3 flex h-10 w-10 items-center justify-center rounded-control border-2 border-white bg-ink-100 text-[11px] font-semibold text-ink-500">
              +{rest}
            </span>
          )}
        </div>

        <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
          {units} dona · {order.payment_method}
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3">
        <span className="text-xs text-ink-500">Jami</span>
        <span className="text-base font-bold tabular-nums text-ink-900">
          {formatPrice(Number(order.total))}
        </span>
      </div>
    </button>
  );
}
