import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { useRouter, Link } from './router';
import type { Order } from './types';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from './types';
import { useSeo } from './seo';
import {
  LayoutDashboard, Package, FolderTree, Image as ImageIcon, Tag, ShoppingCart, Users,
  Settings, LogOut, Menu, X, ExternalLink, ShieldAlert,
} from 'lucide-react';
import { AdminDashboard } from './admin/Dashboard';
import { AdminProducts } from './admin/Products';
import { AdminCategories } from './admin/Categories';
import { AdminBanners } from './admin/Banners';
import { AdminPromotions } from './admin/Promotions';
import { AdminOrders } from './admin/Orders';
import { AdminUsers } from './admin/Users';
import { AdminSettings } from './admin/StoreSettings';
import { button, cx, focusRing, skeleton } from './design';

export type AdminTab =
  | 'dashboard' | 'products' | 'categories' | 'banners'
  | 'promotions' | 'orders' | 'users' | 'settings';

const MENU: { key: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'products', label: 'Mahsulotlar', icon: Package },
  { key: 'categories', label: 'Kategoriyalar', icon: FolderTree },
  { key: 'banners', label: 'Bannerlar', icon: ImageIcon },
  { key: 'promotions', label: 'Aksiyalar', icon: Tag },
  { key: 'orders', label: 'Buyurtmalar', icon: ShoppingCart },
  { key: 'users', label: 'Foydalanuvchilar', icon: Users },
  { key: 'settings', label: 'Sozlamalar', icon: Settings },
];

export function AdminLayout({ tab }: { tab: AdminTab }) {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const label = MENU.find((m) => m.key === tab)?.label ?? 'Admin';
  useSeo({ title: `${label} · Admin`, noindex: true });

  /*
   * Ilgari bu guard `profile` hali yuklanmagan paytda ham admin panelni
   * toʻliq render qilardi (chunki `profile && !profile.is_admin` false
   * boʻlardi): oddiy foydalanuvchi bir zumga admin interfeysini koʻrib,
   * oʻnlab muvaffaqiyatsiz soʻrov yuborardi. Endi avval auth holati
   * aniqlanadi, keyingina qaror qabul qilinadi.
   */
  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate('/login', { replace: true });
  }, [authLoading, user, navigate]);

  // Marshrut oʻzgarganda mobil yon panel yopilsin.
  useEffect(() => setSidebarOpen(false), [tab]);

  if (authLoading || (user && !profile)) {
    return (
      <div className="min-h-screen bg-ink-50 p-6">
        <div className={cx('h-14 w-full rounded-card', skeleton)} />
        <div className={cx('mt-4 h-64 w-full rounded-card', skeleton)} />
      </div>
    );
  }

  if (!user) return null;

  if (!profile?.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-ink-900">Kirish taqiqlangan</h1>
        <p className="mt-1.5 max-w-sm text-sm text-ink-500">
          Bu boʻlim faqat administratorlar uchun. Agar bu xato deb hisoblasangiz,
          doʻkon egasiga murojaat qiling.
        </p>
        <Link to="/" className={cx(button('primary', 'md'), 'mt-6')}>Bosh sahifaga qaytish</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <aside
        aria-label="Admin paneli"
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink-900 transition-transform duration-300 ease-standard md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <span className="text-base font-bold text-white">
            Open<span className="text-orange-500">Shop</span>
            <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
              admin
            </span>
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Menyuni yopish"
            className={cx('flex h-9 w-9 items-center justify-center rounded-control text-white/60 md:hidden', focusRing)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Admin navigatsiyasi" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {MENU.map((item) => (
            <Link
              key={item.key}
              to={`/admin${item.key === 'dashboard' ? '' : '/' + item.key}`}
              aria-current={tab === item.key ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors',
                focusRing,
                tab === item.key ? 'bg-orange-600 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" /> {item.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <p className="truncate px-3 pb-2 text-xs text-white/40">
            {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || user.email}
          </p>
          <button
            onClick={() => { signOut(); navigate('/'); }}
            className={cx('flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-sm text-red-300 transition-colors hover:bg-white/10', focusRing)}
          >
            <LogOut className="h-4 w-4" /> Chiqish
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Menyuni yopish"
          tabIndex={-1}
        />
      )}

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur-md lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Menyuni ochish"
            className={cx('-ml-2 flex h-10 w-10 items-center justify-center rounded-control text-ink-700 md:hidden', focusRing)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="flex-1 truncate text-base font-semibold text-ink-900">{label}</h1>
          <Link
            to="/"
            className={cx('flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900', focusRing)}
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Saytga oʻtish</span>
          </Link>
        </header>

        <main id="main" className="p-4 lg:p-6">
          {tab === 'dashboard' && <AdminDashboard />}
          {tab === 'products' && <AdminProducts />}
          {tab === 'categories' && <AdminCategories />}
          {tab === 'banners' && <AdminBanners />}
          {tab === 'promotions' && <AdminPromotions />}
          {tab === 'orders' && <AdminOrders />}
          {tab === 'users' && <AdminUsers />}
          {tab === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  );
}

/** Buyurtma statusi nishonchasi — dashboard va buyurtmalar roʻyxatida bir xil. */
export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cx(
        'inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        ORDER_STATUS_COLORS[status] || 'bg-ink-100 text-ink-600'
      )}
    >
      {ORDER_STATUS_LABELS[status] || status}
    </span>
  );
}


export type { Order };
