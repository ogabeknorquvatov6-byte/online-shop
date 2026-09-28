import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ImageOff, MapPin } from 'lucide-react';
import type { Order } from '../types';
import { formatPrice, formatOrderDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../types';
import { OrderReceiptPrinter, type ReceiptData } from '../OrderReceiptPrinter';
import { button, card, cx, focusRing } from '../design';
import { EASE } from '../motion';
import { Img } from '../Img';

/*
 * BITTA BUYURTMA — jismoniy chek + o'qiladigan ma'lumot.
 *
 * IKKI QATLAM, IKKI VAZIFA:
 *   1. Chek printeri — taassurot. U BEZAK: sudrab tortish, yirtish,
 *      aylantirish. Uning hammasi `aria-hidden`.
 *   2. Pastdagi jadval — HAQIQAT. Butun ma'lumot shu yerda matn bo'lib
 *      turadi va u hech qachon animatsiyaga, tovushga yoki rangga
 *      bog'liq emas.
 *
 * Ya'ni chekni umuman ko'rmagan foydalanuvchi ham hech narsa
 * yo'qotmaydi. Aks holda "chiroyli" interfeys ma'lumotni yashirib
 * qo'ygan bo'lardi.
 */

/** Buyurtmani chek uchun ma'lumotga aylantiradi — faqat HAQIQIY maydonlar. */
function toReceiptData(order: Order): ReceiptData {
  return {
    number: order.order_number,
    total: Number(order.total ?? 0),
    payment: order.payment_method,
    status: order.status,
    date: order.created_at,
    items: (order.order_items ?? []).map((it) => ({
      key: it.id,
      name: it.product_name,
      quantity: it.quantity,
    })),
  };
}

export function OrderDetail({
  order,
  onBack,
  onRequestCancel,
  cancelling,
  /** Bekor qilish backend'da TASDIQLANGANDAN keyin `true` bo'ladi. */
  justCancelled,
}: {
  order: Order;
  onBack: () => void;
  onRequestCancel: () => void;
  cancelling: boolean;
  justCancelled: boolean;
}) {
  const [showText, setShowText] = useState(false);
  const items = order.order_items ?? [];

  /*
   * Bekor qilish tugmasi FAQAT baza ruxsat bergan holatda chiqadi.
   * `cancel_own_order` faqat «Yangi» buyurtmani bekor qiladi; boshqa
   * holatda tugmani ko'rsatish foydalanuvchiga yolg'on va'da berish
   * bo'lardi — u bosadi va xato oladi.
   */
  const canCancel = order.status === 'Yangi';

  /*
   * Buyurtma bekor qilinganmi — bazadagi holatdan. `justCancelled`
   * shu yerda ham hisobga olinadi, chunki ro'yxat qayta yuklanguncha
   * qisqa oraliqda `order.status` hali eski bo'lishi mumkin.
   */
  const isCancelled = justCancelled || order.status === 'Bekor qilindi';

  return (
    <div>
      <button onClick={onBack} className={cx('inline-flex min-h-[2.75rem] items-center gap-1 text-sm font-medium text-ink-600 hover:text-ink-900', focusRing)}>
        <ChevronLeft className="h-4 w-4" />
        Buyurtmalarga qaytish
      </button>

      <h2 className="sr-only">Buyurtma № {order.order_number}</h2>

      {/* ── Jismoniy chek ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.34, ease: EASE.standard }}
        className="mt-4 overflow-hidden rounded-card bg-gradient-to-b from-ink-50 to-white py-8"
      >
        <OrderReceiptPrinter
          // `key` — bekor qilingach chek QAYTA bosiladi, ya'ni yangi
          // matn va yirtilish o'z vaqtida ko'rinadi.
          key={justCancelled ? 'cancelled' : 'active'}
          data={toReceiptData(order)}
          /*
           * MATN buyurtmaning HAQIQIY holatidan kelib chiqadi. Ilgari u
           * faqat `justCancelled` ga qarardi va natijada ancha oldin
           * bekor qilingan buyurtma chekida «BUYURTMA QABUL QILINDI»
           * deb turardi — pastdagi nishonchada esa «Bekor qilindi».
           * Bitta ekranda ikki xil haqiqat.
           */
          mode={isCancelled ? 'cancelled' : 'success'}
          /*
           * Yirtilish esa faqat HOZIR bekor qilinganda. Aks holda eski
           * buyurtmani har ochganda chek qaytadan yirtilib, tovush
           * chalinaverardi.
           */
          autoRip={justCancelled}
          /*
           * YOLG'IZ CHEK, mashinasiz. Buyurtma allaqachon o'tgan va
           * cheki allaqachon bor — uni qaytadan "bosib chiqarish"
           * yolg'on bo'lardi. Shuning uchun bu yerda tayyor chek
           * turadi va uni 360° aylantirish mumkin. Mashina faqat
           * to'lov tugagan paytda — chek AYNAN o'shanda tug'iladi.
           */
          variant="standalone"
        />
      </motion.div>

      {/* ── O'qiladigan ma'lumot ───────────────────────────────────── */}
      <div className={cx(card, 'mt-5 p-4')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
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

        <ul className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 text-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-50">
                {item.image_url ? (
                  <Img src={item.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                ) : (
                  <ImageOff className="h-4 w-4 text-ink-300" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-ink-700">
                <span className="line-clamp-1">{item.product_name}</span>
                <span className="text-xs text-ink-400">
                  {item.variant ? `${item.variant} · ` : ''}
                  {item.quantity} × {formatPrice(item.price)}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-ink-900">
                {formatPrice(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
          {/* Oraliq summa FAQAT yetkazib berish haqi bo'lsa ma'noga ega. */}
          {order.subtotal != null && Number(order.delivery_fee) > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-ink-500">Mahsulotlar</dt>
                <dd className="tabular-nums">{formatPrice(Number(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Yetkazib berish</dt>
                <dd className="tabular-nums">{formatPrice(Number(order.delivery_fee))}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-500">Toʻlov usuli</dt>
            <dd className="text-ink-900">{order.payment_method}</dd>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-semibold text-ink-900">Jami</dt>
            <dd className="font-bold tabular-nums text-ink-900">{formatPrice(Number(order.total))}</dd>
          </div>
        </dl>

        {order.address && (
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
            <MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-ink-400" />
            {[order.city, order.address].filter(Boolean).join(', ')}
          </p>
        )}

        {/*
          Chekning MATNLI nusxasi. Sudrab aylantirish — sichqoncha va
          barmoq talab qiladi; bu tugma esa aynan o'sha mazmunni
          klaviatura bilan ham ochadi.
        */}
        <button
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
          className={cx(button('outline', 'sm'), 'mt-4')}
        >
          {showText ? 'Chek matnini yopish' : 'Chek maʼlumotlarini koʻrish'}
        </button>

        {showText && (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-control bg-ink-50 p-3 font-mono text-[11px] leading-relaxed text-ink-700">
{receiptText(order)}
          </pre>
        )}

        {canCancel && (
          <button
            onClick={onRequestCancel}
            disabled={cancelling}
            className={cx(button('outline', 'sm'), 'mt-3 text-red-600 hover:bg-red-50 hover:text-red-700')}
          >
            {cancelling ? 'Bekor qilinmoqda…' : 'Buyurtmani bekor qilish'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Chekning matnli nusxasi — ekran o'quvchi va nusxa olish uchun. */
function receiptText(order: Order): string {
  const rows = (order.order_items ?? [])
    .map((i) => `${i.product_name}  ×${i.quantity}  ${formatPrice(i.price * i.quantity)}`)
    .join('\n');
  return [
    'OPENSHOP',
    `Buyurtma: #${order.order_number}`,
    `Sana: ${formatOrderDate(order.created_at)}`,
    '',
    rows,
    '',
    `Jami: ${formatPrice(Number(order.total))}`,
    `Toʻlov: ${order.payment_method}`,
    `Holat: ${ORDER_STATUS_LABELS[order.status] || order.status}`,
  ].join('\n');
}
