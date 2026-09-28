import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from './cart';
import { maxQuantityFor, unitPrice, cartItemKey } from './cartUtils';
import { useSettings } from './settings';
import { quoteDelivery } from './delivery';
import { Link, useRouter } from './router';
import { formatPrice } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedDrawer } from './AnimatedPrimitives';
import { button, cx, focusRing } from './design';
import { Img } from './Img';

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, subtotal, count, updateQuantity, removeItem } = useCart();
  const { settings } = useSettings();
  const { navigate } = useRouter();

  const delivery = quoteDelivery(settings, subtotal);
  const total = subtotal + delivery.fee;

  const goCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <AnimatedDrawer
            side="right"
            onClose={onClose}
            ariaLabel="Savat"
            panelClassName="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-overlay"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-ink-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
                <ShoppingCart className="h-5 w-5 text-orange-600" />
                Savat
                {count > 0 && <span className="text-sm font-normal text-ink-400">({count})</span>}
              </h2>
              <button
                onClick={onClose}
                className={cx('-mr-1.5 flex h-10 w-10 items-center justify-center rounded-control text-ink-400 hover:bg-ink-100 hover:text-ink-700', focusRing)}
                aria-label="Savatni yopish"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {items.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex flex-1 flex-col items-center justify-center px-6 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                  <ShoppingCart className="h-7 w-7" />
                </div>
                <p className="mt-4 text-base font-semibold text-ink-900">Savatingiz boʻsh</p>
                <p className="mt-1 text-sm text-ink-500">Yoqqan mahsulotlarni savatga qoʻshing.</p>
                <Link to="/catalog" onClick={onClose} className={cx(button('primary', 'md'), 'mt-5')}>
                  Katalogga oʻtish
                </Link>
              </motion.div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {items.map((item) => {
                        const image = item.product.product_images?.[0]?.image_url;
                        const max = maxQuantityFor(item.product, item.variantId);
                        const key = cartItemKey(item);
                        return (
                          <motion.li
                            key={key}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div className="flex gap-3 rounded-card border border-ink-100 p-2.5">
                              <Link
                                to={`/product/${item.product.slug}`}
                                onClick={onClose}
                                className={cx('flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-50', focusRing)}
                              >
                                {/* `Img` bo'sh/buzuq rasm holatini o'zi ko'rsatadi. */}
                                <Img src={image} alt={item.product.name} className="h-full w-full" sizes="64px" iconClassName="h-5 w-5" />
                              </Link>

                              <div className="flex min-w-0 flex-1 flex-col">
                                <Link
                                  to={`/product/${item.product.slug}`}
                                  onClick={onClose}
                                  className={cx('line-clamp-2 rounded-sm text-sm font-medium leading-snug text-ink-900 hover:text-orange-700', focusRing)}
                                >
                                  {item.product.name}
                                </Link>
                                {item.variant && <p className="mt-0.5 text-xs text-ink-500">{item.variant}</p>}
                                <p className="mt-auto pt-1 text-sm font-bold text-ink-900">
                                  {formatPrice(unitPrice(item) * item.quantity)}
                                </p>
                              </div>

                              <div className="flex flex-col items-end justify-between">
                                <button
                                  onClick={() => removeItem(key)}
                                  className={cx('-mr-1 -mt-0.5 flex h-8 w-8 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600', focusRing)}
                                  aria-label={`${item.product.name} — savatdan oʻchirish`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                <div className="flex items-center rounded-control border border-ink-200">
                                  <button
                                    onClick={() => updateQuantity(key, item.quantity - 1)}
                                    className={cx('flex h-8 w-8 items-center justify-center rounded-l-control text-ink-600 hover:bg-ink-50 active:scale-90', focusRing)}
                                    aria-label="Kamaytirish"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-8 text-center text-xs font-semibold tabular-nums" aria-live="polite">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => updateQuantity(key, item.quantity + 1)}
                                    disabled={item.quantity >= max}
                                    className={cx('flex h-8 w-8 items-center justify-center rounded-r-control text-ink-600 hover:bg-ink-50 active:scale-90 disabled:text-ink-300 disabled:hover:bg-transparent', focusRing)}
                                    aria-label="Koʻpaytirish"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </div>

                <div
                  className="shrink-0 border-t border-ink-200 bg-white p-4"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  {delivery.remainingForFree > 0 && (
                    <p className="mb-3 rounded-control bg-orange-50 px-3 py-2 text-xs text-orange-800">
                      Yana <span className="font-semibold">{formatPrice(delivery.remainingForFree)}</span> qoʻshsangiz,
                      yetkazib berish bepul boʻladi.
                    </p>
                  )}
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Mahsulotlar</dt>
                      <dd className="font-medium tabular-nums">{formatPrice(subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Yetkazib berish</dt>
                      <dd className={cx('font-medium tabular-nums', delivery.fee === 0 && 'text-emerald-600')}>
                        {delivery.fee === 0 ? 'Bepul' : formatPrice(delivery.fee)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-ink-100 pt-1.5 text-base">
                      <dt className="font-semibold">Jami</dt>
                      <dd className="font-bold tabular-nums text-orange-700">{formatPrice(total)}</dd>
                    </div>
                  </dl>
                  <button onClick={goCheckout} className={cx(button('primary', 'lg'), 'mt-3 w-full')}>
                    Buyurtmani rasmiylashtirish <ArrowRight className="h-4 w-4" />
                  </button>
                  <button onClick={onClose} className={cx(button('ghost', 'sm'), 'mt-1 w-full')}>
                    Xaridni davom ettirish
                  </button>
                </div>
              </>
            )}
          </AnimatedDrawer>
        </div>
      )}
    </AnimatePresence>
  );
}

