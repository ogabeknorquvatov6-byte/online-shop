import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Link } from '../router';
import type { Order } from '../types';
import { formatPrice } from '../types';
import {
  Package, FolderTree, Users, ShoppingCart, Clock, CheckCircle2, TrendingUp,
  Wallet, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { OrderStatusBadge } from '../AdminPage';
import { AdminError, AdminLoading, AdminSection, AdminEmpty } from '../AdminShared';
import { card, cx, focusRing } from '../design';

type Stats = {
  products: number; products_active: number; out_of_stock: number;
  categories: number; users: number; orders: number;
  orders_new: number; orders_processing: number; orders_delivered: number; orders_cancelled: number;
  revenue: number; revenue_pending: number; revenue_30d: number;
};

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    (async () => {
      /*
       * Ilgari "Umumiy savdo" oxirgi 10 ta buyurtmadan hisoblanardi —
       * ya'ni ko'rsatilgan daromad har doim noto'g'ri edi. Endi agregatsiya
       * serverda, `admin_dashboard_stats()` RPC ichida bajariladi.
       */
      const [statsRes, ordersRes] = await Promise.all([
        supabase.rpc('admin_dashboard_stats'),
        supabase
          .from('orders')
          .select('*, total:total_amount, customer_phone:phone')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (statsRes.error || !statsRes.data || ordersRes.error) {
        setError(true);
        setLoading(false);
        return;
      }
      setStats(statsRes.data as Stats);
      setRecent((ordersRes.data ?? []) as Order[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <AdminLoading rows={4} />;
  if (error || !stats) return <AdminError onRetry={load} />;

  const money = [
    { label: 'Yetkazilgan savdo', value: formatPrice(stats.revenue), hint: 'Barcha vaqt', icon: Wallet, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Oxirgi 30 kun', value: formatPrice(stats.revenue_30d), hint: 'Yetkazilgan buyurtmalar', icon: TrendingUp, tone: 'text-orange-700 bg-orange-50' },
    { label: 'Jarayondagi summa', value: formatPrice(stats.revenue_pending), hint: 'Hali yetkazilmagan', icon: Clock, tone: 'text-blue-700 bg-blue-50' },
  ];

  const counts = [
    { label: 'Buyurtmalar', value: stats.orders, icon: ShoppingCart, to: '/admin/orders' },
    { label: 'Yangi buyurtmalar', value: stats.orders_new, icon: Clock, to: '/admin/orders', highlight: stats.orders_new > 0 },
    { label: 'Yetkazilgan', value: stats.orders_delivered, icon: CheckCircle2, to: '/admin/orders' },
    { label: 'Mahsulotlar', value: stats.products_active, icon: Package, to: '/admin/products' },
    { label: 'Kategoriyalar', value: stats.categories, icon: FolderTree, to: '/admin/categories' },
    { label: 'Foydalanuvchilar', value: stats.users, icon: Users, to: '/admin/users' },
  ];

  return (
    <div className="space-y-8">
      {stats.out_of_stock > 0 && (
        <Link
          to="/admin/products"
          className={cx(
            'flex items-center gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 transition-colors hover:bg-amber-100',
            focusRing
          )}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <span className="flex-1">
            <strong>{stats.out_of_stock} ta</strong> faol mahsulot omborda tugagan — mijozlar ularni sotib ololmaydi.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {money.map((m) => (
          <div key={m.label} className={cx(card, 'p-4')}>
            <div className={cx('inline-flex rounded-control p-2', m.tone)}>
              <m.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 truncate text-xl font-bold tracking-tight text-ink-900">{m.value}</p>
            <p className="mt-0.5 text-sm font-medium text-ink-700">{m.label}</p>
            <p className="text-xs text-ink-400">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {counts.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className={cx(
              card,
              'p-3.5 transition-[border-color,box-shadow] hover:border-ink-300 hover:shadow-card',
              focusRing,
              c.highlight && 'border-orange-300 bg-orange-50/50'
            )}
          >
            <c.icon className={cx('h-4 w-4', c.highlight ? 'text-orange-600' : 'text-ink-400')} />
            <p className="mt-2 text-xl font-bold tabular-nums text-ink-900">{c.value}</p>
            <p className="text-xs text-ink-500">{c.label}</p>
          </Link>
        ))}
      </div>

      <AdminSection
        title="So‘nggi buyurtmalar"
        actions={
          <Link to="/admin/orders" className={cx('flex items-center gap-1 rounded-sm text-sm font-medium text-orange-700 hover:text-orange-800', focusRing)}>
            Barchasi <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        {recent.length === 0 ? (
          <AdminEmpty title="Hali buyurtma yo‘q" message="Birinchi buyurtma kelganda u shu yerda ko‘rinadi." />
        ) : (
          <ul className={cx(card, 'divide-y divide-ink-100')}>
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">№ {o.order_number}</p>
                  <p className="truncate text-xs text-ink-500">
                    {o.customer_name || '—'} · {new Date(o.created_at).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-sm font-semibold tabular-nums text-ink-900">{formatPrice(o.total)}</p>
                  <OrderStatusBadge status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
