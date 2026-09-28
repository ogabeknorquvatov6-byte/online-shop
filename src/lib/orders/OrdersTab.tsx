import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Package } from 'lucide-react';
import { supabase } from '../supabase';
import type { Order } from '../types';
import { useToast } from '../toast';
import { Link, useRouter } from '../router';
import { ResponsiveModal } from '../AnimatedPrimitives';
import { EmptyState } from '../ProductCard';
import { button, card, cx, focusRing, skeleton } from '../design';
import { DURATION, EASE } from '../motion';
import { OrderCard } from './OrderCard';
import { OrderDetail } from './OrderDetail';

/*
 * BUYURTMALARIM.
 *
 * Ro'yxat va bitta buyurtma bir MARSHRUTDA yashaydi:
 *   /account/orders          — ro'yxat
 *   /account/orders/<id>     — bitta buyurtma
 *
 * Nega marshrut, nega oddiy holat emas: brauzerning "orqaga" tugmasi
 * ishlashi kerak va havolani yuborib bo'lishi kerak. Holat bilan
 * qilinganda "orqaga" foydalanuvchini do'kondan butunlay chiqarib
 * yuborardi.
 *
 * XAVFSIZLIK: bu yerda buyurtma kimga tegishliligi TEKSHIRILMAYDI va
 * tekshirilishi ham mumkin emas — mijoz aytgan `user_id` ga hech
 * qachon ishonilmaydi. Ro'yxat `user_id = auth.uid()` bilan so'raladi
 * va ustidan RLS turadi, ya'ni birovning id'si manzilga yozilsa
 * ro'yxatdan shunchaki topilmaydi va "topilmadi" ko'rsatiladi.
 */

const IN_PROGRESS = ['Yangi', 'Qabul qilindi', 'Tayyorlanmoqda', 'Yetkazilmoqda'];

type Filter = 'all' | 'active' | 'delivered' | 'cancelled';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Barchasi' },
  { key: 'active', label: 'Jarayonda' },
  { key: 'delivered', label: 'Yetkazib berildi' },
  { key: 'cancelled', label: 'Bekor qilingan' },
];

export function OrdersTab({
  orders,
  loading,
  onChanged,
  orderId,
}: {
  orders: Order[];
  loading: boolean;
  onChanged: () => void;
  /** Manzildagi buyurtma identifikatori (`/account/orders/<id>`). */
  orderId?: string;
}) {
  const { notify } = useToast();
  const { navigate } = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmCancel, setConfirmCancel] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** Bekor qilish backend'da tasdiqlangan buyurtma — chek yirtiladi. */
  const [cancelledId, setCancelledId] = useState<string | null>(null);

  const selected = useMemo(
    () => (orderId ? orders.find((o) => o.id === orderId) ?? null : null),
    [orders, orderId]
  );

  /* Ro'yxatdan chiqilganda "yangi bekor qilindi" belgisi tozalanadi. */
  useEffect(() => {
    if (!orderId) setCancelledId(null);
  }, [orderId]);

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (filter === 'all') return true;
        if (filter === 'active') return IN_PROGRESS.includes(o.status);
        if (filter === 'delivered') return o.status === 'Yetkazildi';
        return o.status === 'Bekor qilindi';
      }),
    [orders, filter]
  );

  const open = (o: Order) => navigate(`/account/orders/${o.id}`);
  const back = () => navigate('/account/orders');

  /*
   * BEKOR QILISH — mavjud oqim, o'zgartirilmagan.
   *
   * Tartib QAT'IY: avval `cancel_own_order`, so'ng — faqat u
   * muvaffaqiyatli tugasa — animatsiya. Xato bo'lsa chek butun qoladi
   * va haqiqiy xato ko'rsatiladi; hech qanday yirtilish ham, tovush
   * ham bo'lmaydi.
   */
  const doCancel = async (order: Order) => {
    setCancelling(true);
    const { error } = await supabase.rpc('cancel_own_order', { p_order_id: order.id });
    setCancelling(false);
    setConfirmCancel(null);

    if (error) {
      notify(
        error.message?.includes('ORDER_NOT_CANCELLABLE')
          ? 'Bu buyurtma allaqachon ishga olingan — bekor qilish uchun operator bilan bogʻlaning.'
          : 'Buyurtmani bekor qilib boʻlmadi.',
        'error'
      );
      return;
    }

    notify('Buyurtma bekor qilindi', 'success');
    setCancelledId(order.id);
    onChanged();
  };

  /* ── Bitta buyurtma ─────────────────────────────────────────────── */
  if (orderId) {
    if (loading) return <DetailSkeleton />;
    if (!selected) {
      return (
        <div className="mt-2">
          <EmptyState
            title="Buyurtma topilmadi"
            message="Bu buyurtma mavjud emas yoki sizga tegishli emas."
            icon={<Package className="h-6 w-6" />}
            action={
              <button onClick={back} className={button('primary', 'md')}>
                Buyurtmalarga qaytish
              </button>
            }
          />
        </div>
      );
    }
    return (
      <>
        <OrderDetail
          order={selected}
          onBack={back}
          onRequestCancel={() => setConfirmCancel(selected)}
          cancelling={cancelling}
          justCancelled={cancelledId === selected.id}
        />
        <CancelModal
          order={confirmCancel}
          busy={cancelling}
          onConfirm={doCancel}
          onClose={() => setConfirmCancel(null)}
        />
      </>
    );
  }

  /* ── Ro'yxat ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={cx('h-[8.5rem] rounded-card', skeleton)} />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        title="Buyurtmalar hali yoʻq"
        message="Mahsulot tanlab, birinchi buyurtmangizni bering — u shu yerda koʻrinadi."
        icon={<Package className="h-6 w-6" />}
        action={
          <Link to="/catalog" className={button('primary', 'md')}>
            Xaridni boshlash
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Buyurtma holati">
        {FILTERS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cx(
              'h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors',
              focusRing,
              filter === t.key ? 'bg-orange-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Bu boʻlimda buyurtma yoʻq" icon={<Package className="h-6 w-6" />} />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((order, i) => (
            <motion.li
              key={order.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DURATION.ui,
                ease: EASE.standard,
                // Zinapoya cheklangan: 6 tadan keyin kechikish o'smaydi,
                // aks holda uzun ro'yxat sekin tuyulardi.
                delay: Math.min(i, 6) * 0.035,
              }}
            >
              <OrderCard order={order} onOpen={() => open(order)} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CancelModal({
  order,
  busy,
  onConfirm,
  onClose,
}: {
  order: Order | null;
  busy: boolean;
  onConfirm: (o: Order) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {order && (
        <ResponsiveModal title="Buyurtmani bekor qilish" onClose={onClose}>
          <p className="text-sm text-ink-600">
            № {order.order_number} buyurtmani bekor qilmoqchimisiz? Bu amalni orqaga qaytarib
            boʻlmaydi.
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => onConfirm(order)} disabled={busy} className={button('danger', 'md')}>
              {busy ? 'Bekor qilinmoqda…' : 'Ha, bekor qilinsin'}
            </button>
            <button onClick={onClose} className={button('outline', 'md')}>
              Yoʻq
            </button>
          </div>
        </ResponsiveModal>
      )}
    </AnimatePresence>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className={cx('h-11 w-48 rounded-control', skeleton)} />
      <div className={cx('h-72 rounded-card', skeleton)} />
      <div className={cx(card, 'space-y-3 p-4')}>
        <div className={cx('h-4 w-32 rounded', skeleton)} />
        <div className={cx('h-4 w-full rounded', skeleton)} />
        <div className={cx('h-4 w-2/3 rounded', skeleton)} />
      </div>
    </div>
  );
}
