import { useEffect } from 'react';
import { Link, useRouter } from './router';
import { useCart } from './cart';
import { maxQuantityFor, unitPrice, cartItemKey } from './cartUtils';
import { useSettings } from './settings';
import { useToast } from './toast';
import { quoteDelivery } from './delivery';
import { formatPrice } from './types';
import { EmptyState } from './ProductCard';
import { RecommendationCarousel } from './RecommendationCarousel';
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight, ShieldCheck, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DURATION, EASE } from './motion';
import { AnimatedNumber } from './AnimatedNumber';
import { useSeo } from './seo';
import { button, card, cx, focusRing, shell } from './design';
import { Img } from './Img';

export function CartPage() {
  const { items, subtotal, count, updateQuantity, removeItem, notice, clearNotice } = useCart();
  const { settings } = useSettings();
  const { notify } = useToast();
  const { navigate } = useRouter();

  useSeo({ title: 'Savat', description: 'Tanlangan mahsulotlaringiz va buyurtma summasi.', noindex: true });

  const delivery = quoteDelivery(settings, subtotal);
  const total = subtotal + delivery.fee;

  // Savat bazaga solishtirilib yangilangan bo'lsa (narx o'zgargan, mahsulot
  // tugagan) — foydalanuvchini bir marta xabardor qilamiz.
  useEffect(() => {
    if (!notice) return;
    notify(notice, 'info');
    clearNotice();
  }, [notice, notify, clearNotice]);

  if (items.length === 0) {
    return (
      <div className={cx(shell, 'py-5 lg:py-8')}>
        <h1 className="text-display-sm">Savat</h1>
        <div className="mt-6">
          <EmptyState
            title="Savatingiz boʻsh"
            message="Katalogdan yoqqan mahsulotlarni tanlang — ular shu yerda toʻplanadi."
            icon={<ShoppingCart className="h-6 w-6" />}
            action={
              <Link to="/catalog" className={button('primary', 'md')}>
                Katalogga oʻtish
              </Link>
            }
          />
        </div>
        {/* Bo'sh savat boshi berk ko'cha bo'lmasligi kerak — darhol
            tanlash mumkin bo'lgan mahsulotlarni taklif qilamiz. */}
        <RecommendationCarousel />
      </div>
    );
  }

  return (
    <div className={cx(shell, 'py-5 lg:py-8')}>
      <h1 className="text-display-sm">Savat</h1>
      <p className="mt-1 text-sm text-ink-500">{count} ta mahsulot</p>

      {/*
        `min-w-0` MAJBURIY: grid elementining sukut bo'yicha `min-width: auto`
        bo'ladi, ya'ni ustun o'z kontentidan kichik bo'la olmaydi. Savat
        qatoridagi `whitespace-nowrap` summa 375px ekranda ustunni kengaytirib
        yuborar va butun sahifa 66px gorizontal toshib ketardi — telefonda bu
        "sayt kattalashib ketdi" bo'lib ko'rinardi.
      */}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 lg:col-span-2">
          <motion.ul layout className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => {
                const key = cartItemKey(item);
                const image = item.product.product_images?.[0]?.image_url;
                const max = maxQuantityFor(item.product, item.variantId);
                const price = unitPrice(item);
                return (
                  <motion.li
                    key={key}
                    layout
                    /*
                     * `height` ANIMATSIYA QILINMAYDI.
                     *
                     * Ilgari bu yerda `height: 0 → auto` bor edi. Balandlik
                     * — layout xossasi: uning har kadri qayta oqim (reflow)
                     * keltirib chiqaradi va uzun savatda seziladi. Bo'shliq
                     * yopilishini `layout` prop'ining o'zi hal qiladi
                     * (Motion buni transform bilan bajaradi), shuning uchun
                     * bu yerda faqat `opacity` va `transform` qoladi.
                     *
                     * Chiqish chapga siljish bilan — element "olib
                     * tashlandi" degan yo'nalishni ko'rsatadi.
                     */
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -24, scale: 0.97 }}
                    transition={{ duration: DURATION.drawer, ease: EASE.standard }}
                  >
                    <div className={cx(card, 'flex gap-3 p-3 sm:gap-4 sm:p-4')}>
                      <Link
                        to={`/product/${item.product.slug}`}
                        className={cx('flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-50 sm:h-24 sm:w-24', focusRing)}
                      >
                        {/* `Img` bo'sh/buzuq rasm holatini o'zi ko'rsatadi. */}
                        <Img src={image} alt={item.product.name} className="h-full w-full" sizes="96px" iconClassName="h-6 w-6" />
                      </Link>

                      <div className="flex min-w-0 flex-1 flex-col">
                        {item.product.brand && (
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{item.product.brand}</p>
                        )}
                        <Link
                          to={`/product/${item.product.slug}`}
                          className={cx('line-clamp-2 rounded-sm text-sm font-medium leading-snug text-ink-900 hover:text-orange-700', focusRing)}
                        >
                          {item.product.name}
                        </Link>
                        {item.variant && <p className="mt-0.5 text-xs text-ink-500">{item.variant}</p>}

                        <p className="mt-1 text-xs text-ink-400">
                          {formatPrice(price)} × {item.quantity}
                        </p>

                        {/*
                          Summa `whitespace-nowrap` bo'lgani uchun torayolmaydi.
                          Shu sababli u miqdor tugmalari bilan bitta qatorga
                          SIG'MASA, `flex-wrap` uni pastki qatorga tushiradi —
                          ustunni kengaytirib yubormaydi.
                        */}
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
                          <div className="flex shrink-0 items-center rounded-control border border-ink-200">
                            <button
                              onClick={() => updateQuantity(key, item.quantity - 1)}
                              aria-label="Kamaytirish"
                              className={cx('flex h-9 w-9 items-center justify-center rounded-l-control text-ink-600 transition-transform hover:bg-ink-50 active:scale-90 sm:h-10 sm:w-10', focusRing)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold tabular-nums sm:w-9">
                              <AnimatedNumber value={item.quantity} />
                            </span>
                            <button
                              onClick={() => updateQuantity(key, item.quantity + 1)}
                              disabled={item.quantity >= max}
                              aria-label="Koʻpaytirish"
                              className={cx('flex h-9 w-9 items-center justify-center rounded-r-control text-ink-600 transition-transform hover:bg-ink-50 active:scale-90 disabled:text-ink-300 disabled:hover:bg-transparent sm:h-10 sm:w-10', focusRing)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <p className="ml-auto whitespace-nowrap text-right text-[15px] font-bold tabular-nums text-ink-900 sm:text-base">
                            <AnimatedNumber value={formatPrice(price * item.quantity)} />
                          </p>
                        </div>
                        {item.quantity >= max && (
                          <p className="mt-1.5 text-[11px] text-amber-600">
                            Omborda {item.product.stock} donadan koʻp qolmagan.
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => removeItem(key)}
                        aria-label={`${item.product.name} — savatdan oʻchirish`}
                        className={cx('-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-control text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600', focusRing)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>

          <Link
            to="/catalog"
            className={cx('mt-4 inline-flex rounded-sm text-sm font-semibold text-orange-700 hover:text-orange-800', focusRing)}
          >
            ← Xaridni davom ettirish
          </Link>
        </div>

        <aside className="min-w-0 lg:col-span-1">
          <div className={cx(card, 'p-5 lg:sticky')} style={{ top: 'calc(var(--header-h) + 1rem)' }}>
            <h2 className="text-base font-semibold text-ink-900">Buyurtma xulosasi</h2>

            {delivery.remainingForFree > 0 && (
              <p className="mt-3 rounded-control bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-800">
                Yana <span className="font-semibold">{formatPrice(delivery.remainingForFree)}</span> qoʻshsangiz,
                yetkazib berish bepul.
              </p>
            )}

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Mahsulotlar soni</dt>
                <dd className="font-medium tabular-nums"><AnimatedNumber value={count} /> dona</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Mahsulotlar jami</dt>
                <dd className="font-medium tabular-nums"><AnimatedNumber value={formatPrice(subtotal)} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Yetkazib berish</dt>
                <dd className={cx('font-medium tabular-nums', delivery.fee === 0 && 'text-emerald-600')}>
                  {delivery.fee === 0 ? 'Bepul' : formatPrice(delivery.fee)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-2.5 text-base">
                <dt className="font-semibold">Jami</dt>
                <dd className="font-bold tabular-nums text-orange-700">
                  <AnimatedNumber value={formatPrice(total)} />
                </dd>
              </div>
            </dl>

            <button
              onClick={() => navigate('/checkout')}
              className={cx(button('primary', 'lg'), 'mt-5 hidden w-full lg:flex')}
            >
              Buyurtmani rasmiylashtirish <ArrowRight className="h-4 w-4" />
            </button>

            <ul className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-xs text-ink-500">
              <li className="flex items-center gap-2"><Truck className="h-4 w-4 shrink-0 text-ink-400" /> Toshkent boʻylab 1 kun ichida</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-ink-400" /> Mahsulotni koʻrib, keyin toʻlaysiz</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobil: oxirgi kartochka yopishgan tugma ostida qolib ketmasin */}
      <div className="h-24 lg:hidden" aria-hidden="true" />

      {/* Mobil yopishgan yakun + CTA — BottomNav ustida turadi */}
      <div
        className="fixed left-0 right-0 z-40 border-t border-ink-200 bg-white/95 p-3 backdrop-blur-md lg:hidden"
        style={{ bottom: 'var(--bottom-nav-h)' }}
      >
        <div className="mx-auto flex max-w-shell items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-500">Jami ({count} dona)</p>
            <p className="truncate text-lg font-bold tabular-nums text-ink-900">
              <AnimatedNumber value={formatPrice(total)} />
            </p>
          </div>
          <button onClick={() => navigate('/checkout')} className={cx(button('primary', 'lg'), 'shrink-0')}>
            Rasmiylashtirish
          </button>
        </div>
      </div>
    </div>
  );
}
