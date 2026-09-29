import { useCallback, useEffect, useId, useState } from 'react';
import { useAuth } from './auth';
import { useRouter, Link } from './router';
import { supabase } from './supabase';
import type { Order, Address, Profile, Favorite } from './types';
import { ProductCard, EmptyState, ErrorState, productGridClass } from './ProductCard';
import { useFavorites } from './favorites';
import { useToast } from './toast';
import { useSeo } from './seo';
import { OrdersTab } from './orders/OrdersTab';

/*
 * Aniq ustunlar — `select('*')` EMAS. `types.ts` dagi `Address` shakli
 * bilan bir xil: kod faqat shu maydonlarni oʻqiydi, qolganini tarmoqdan
 * tortishning maʼnosi yoʻq.
 */
const ADDRESS_SELECT =
  'id, user_id, label, recipient_name, phone, city, district, street, zip, is_default, created_at';

import { normalizePhone } from './phone';
import { ResponsiveModal } from './AnimatedPrimitives';
import { AnimatePresence } from 'motion/react';
import {
  User, Package, Heart, MapPin, Settings, LogOut, Plus, Trash2, ChevronRight, ShieldCheck, KeyRound, Star, ArrowLeft,
} from 'lucide-react';
import { button, card, cx, focusRing, input, shell, skeleton } from './design';

type Tab = 'profile' | 'orders' | 'favorites' | 'addresses' | 'settings';

const MENU: { key: Tab; label: string; icon: typeof User }[] = [
  { key: 'profile', label: 'Profil maʼlumotlari', icon: User },
  { key: 'orders', label: 'Buyurtmalarim', icon: Package },
  { key: 'favorites', label: 'Sevimlilar', icon: Heart },
  { key: 'addresses', label: 'Manzillarim', icon: MapPin },
  { key: 'settings', label: 'Xavfsizlik', icon: Settings },
];

const TAB_TITLES: Record<Tab, string> = {
  profile: 'Profil',
  orders: 'Buyurtmalarim',
  favorites: 'Sevimlilar',
  addresses: 'Manzillarim',
  settings: 'Xavfsizlik',
};

export function AccountPage({ tab = 'profile', orderId }: { tab?: Tab; orderId?: string }) {
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const { favorites } = useFavorites();

  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useSeo({ title: TAB_TITLES[tab], description: 'Shaxsiy kabinet: buyurtmalar, manzillar va sozlamalar.', noindex: true });

  const loadAddresses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('addresses')
      .select(ADDRESS_SELECT)
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setAddresses((data ?? []) as Address[]);
  }, [user]);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const [ordersRes, addrRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, total:total_amount, customer_phone:phone, order_items(*, price:unit_price)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('addresses')
          .select(ADDRESS_SELECT)
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (ordersRes.error || addrRes.error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setOrders((ordersRes.data ?? []) as Order[]);
      setAddresses((addrRes.data ?? []) as Address[]);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    // Auth hali tekshirilmoqda boʻlsa kutamiz — aks holda sahifa yangilanganda
    // loginʼga nooʻrin yoʻnaltirish sodir boʻladi.
    if (authLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    load();
  }, [authLoading, user, load, navigate]);

  if (authLoading || !user) {
    return (
      <div className={cx(shell, 'py-10')}>
        <div className={cx('h-64 rounded-card', skeleton)} />
      </div>
    );
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  const onSubPage = tab !== 'profile';

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+1rem)] lg:pb-12">
      {/*
        Shaxsiy kabinet umumiy header (logotip + qidiruv + menyu)ni
        ishlatmaydi — bu yerda foydalanuvchi aniq bir vazifada bo'ladi.
        O'rniga minimal, kontekstga bog'liq sarlavha: orqaga qaytish va
        bo'lim nomi.
      */}
      <div
        className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className={cx(shell, 'flex h-14 items-center gap-2')}>
          <Link
            to={onSubPage ? '/account' : '/'}
            aria-label={onSubPage ? 'Profilga qaytish' : 'Bosh sahifaga qaytish'}
            className={cx('-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-600 hover:bg-ink-100', focusRing)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink-900">
            {onSubPage ? TAB_TITLES[tab] : 'Shaxsiy kabinet'}
          </h1>
          <button
            onClick={() => { signOut(); navigate('/'); }}
            aria-label="Chiqish"
            className={cx('-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600 lg:hidden', focusRing)}
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      <div className={cx(shell, 'py-5 lg:py-8')}>
      <div className="grid min-w-0 gap-6 lg:grid-cols-4 lg:gap-8">
        {/* Desktop yon menyu */}
        <aside className="hidden lg:col-span-1 lg:block">
          <div className={cx(card, 'overflow-hidden')}>
            <div className="flex items-center gap-3 border-b border-ink-100 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{displayName || 'Mijoz'}</p>
                <p className="truncate text-xs text-ink-500">{profile?.phone || user.email}</p>
              </div>
            </div>
            <nav className="flex flex-col p-2" aria-label="Kabinet boʻlimlari">
              {MENU.map((item) => (
                <Link
                  key={item.key}
                  to={`/account${item.key === 'profile' ? '' : '/' + item.key}`}
                  aria-current={tab === item.key ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm transition-colors',
                    focusRing,
                    tab === item.key ? 'bg-orange-50 font-medium text-orange-700' : 'text-ink-600 hover:bg-ink-50'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
              {profile?.is_admin && (
                <Link
                  to="/admin"
                  className={cx('mt-1 flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium text-orange-700 hover:bg-orange-50', focusRing)}
                >
                  <ShieldCheck className="h-4 w-4" /> Admin panel
                </Link>
              )}
              <button
                onClick={() => { signOut(); navigate('/'); }}
                className={cx('mt-1 flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm text-red-600 hover:bg-red-50', focusRing)}
              >
                <LogOut className="h-4 w-4" /> Chiqish
              </button>
            </nav>
          </div>
        </aside>

        {/* Mobil menyu */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3 rounded-card bg-ink-900 p-4 text-white">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{displayName || 'Mijoz'}</p>
              <p className="truncate text-sm text-white/70">{profile?.phone || user.email}</p>
            </div>
          </div>
          <nav className={cx(card, 'mt-3 divide-y divide-ink-100 overflow-hidden')} aria-label="Kabinet boʻlimlari">
            {MENU.map((item) => (
              <Link
                key={item.key}
                to={`/account${item.key === 'profile' ? '' : '/' + item.key}`}
                aria-current={tab === item.key ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 px-4 py-3.5 text-sm transition-colors active:bg-ink-50',
                  focusRing,
                  tab === item.key ? 'text-orange-700' : 'text-ink-700'
                )}
              >
                <item.icon className={cx('h-4.5 w-4.5 shrink-0', tab === item.key ? 'text-orange-600' : 'text-ink-400')} />
                <span className="flex-1 font-medium">{item.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
              </Link>
            ))}
            {profile?.is_admin && (
              <Link to="/admin" className={cx('flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-orange-700 active:bg-orange-50', focusRing)}>
                <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
                <span className="flex-1">Admin panel</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-orange-300" />
              </Link>
            )}
            <button
              onClick={() => { signOut(); navigate('/'); }}
              className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-600 active:bg-red-50', focusRing)}
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" />
              <span className="flex-1">Chiqish</span>
            </button>
          </nav>
        </div>

        <div className="min-w-0 lg:col-span-3">
          {loadError && tab !== 'favorites' && tab !== 'settings' && tab !== 'profile' ? (
            <ErrorState onRetry={load} />
          ) : (
            <>
              {tab === 'profile' && <ProfileTab profile={profile} userId={user.id} onSave={refreshProfile} />}
              {tab === 'orders' && (
                <OrdersTab orders={orders} loading={loading} onChanged={load} orderId={orderId} />
              )}
              {tab === 'favorites' && <FavoritesTab favorites={favorites} />}
              {tab === 'addresses' && (
                <AddressesTab addresses={addresses} userId={user.id} loading={loading} onChange={loadAddresses} />
              )}
              {tab === 'settings' && <SecurityTab />}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── Profil ─────────────────────────────────────────────────────── */
function ProfileTab({ profile, userId, onSave }: { profile: Profile | null; userId: string; onSave: () => Promise<void> }) {
  const { notify } = useToast();
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Profil kechroq yuklansa formani bir marta toʻldiramiz.
  useEffect(() => {
    if (!profile) return;
    setForm((f) =>
      f.first_name || f.last_name || f.phone
        ? f
        : { first_name: profile.first_name || '', last_name: profile.last_name || '', phone: profile.phone || '' }
    );
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.first_name.trim()) next.first_name = 'Ismni kiriting';
    if (form.phone.trim() && normalizePhone(form.phone).length < 9) next.phone = 'Telefon raqam notoʻgʻri';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
      })
      .eq('id', userId);
    if (error) {
      notify('Saqlab boʻlmadi. Qaytadan urinib koʻring.', 'error');
    } else {
      notify('Profil maʼlumotlari saqlandi', 'success');
      await onSave();
    }
    setSaving(false);
  };

  return (
    <section className={cx(card, 'p-5 sm:p-6')}>
      <h2 className="text-base font-semibold text-ink-900">Profil maʼlumotlari</h2>
      <p className="mt-1 text-sm text-ink-500">Bu maʼlumotlar buyurtma rasmiylashtirishda avtomatik toʻldiriladi.</p>
      <form onSubmit={handleSave} noValidate className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ism" required value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} error={errors.first_name} autoComplete="given-name" />
          <Field label="Familiya" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} autoComplete="family-name" />
          <Field label="Telefon" type="tel" inputMode="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={errors.phone} placeholder="+998 90 123 45 67" autoComplete="tel" />
        </div>
        <button type="submit" disabled={saving} className={button('primary', 'md')}>
          {saving ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </form>
    </section>
  );
}


/* ── Sevimlilar ─────────────────────────────────────────────────── */
function FavoritesTab({ favorites }: { favorites: Favorite[] }) {
  if (favorites.length === 0) {
    return (
      <EmptyState
        title="Sevimlilar roʻyxati boʻsh"
        message="Yoqqan mahsulotlarni yurakcha tugmasi bilan saqlang."
        icon={<Star className="h-6 w-6" />}
        action={<Link to="/catalog" className={button('primary', 'md')}>Katalogga oʻtish</Link>}
      />
    );
  }
  return (
    <div className={productGridClass}>
      {favorites.map((f) => (f.product ? <ProductCard key={f.product_id} product={f.product} /> : null))}
    </div>
  );
}

/* ── Manzillar ──────────────────────────────────────────────────── */
const EMPTY_ADDRESS = { label: 'Uy', recipient_name: '', phone: '', city: 'Toshkent', district: '', street: '' };

function AddressesTab({
  addresses, userId, loading, onChange,
}: {
  addresses: Address[];
  userId: string;
  loading: boolean;
  onChange: () => void;
}) {
  const { notify } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.recipient_name.trim()) next.recipient_name = 'Qabul qiluvchi ismini kiriting';
    if (form.phone.trim() && normalizePhone(form.phone).length < 9) next.phone = 'Telefon raqam notoʻgʻri';
    if (!form.city.trim()) next.city = 'Shaharni kiriting';
    if (!form.street.trim()) next.street = 'Koʻcha va uy raqamini kiriting';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    /*
     * MUHIM: `phone` va `city` ustunlari `addresses` jadvalida ILGARI YOʻQ edi,
     * shuning uchun bu forma har safar xatolik bilan tugardi (foydalanuvchiga
     * esa faqat "Xatolik" deb koʻrsatilardi). Ustunlar 20260830 migratsiyasida
     * qoʻshildi, `name`/`full_address` esa trigger orqali avtomatik toʻldiriladi.
     */
    const { error } = await supabase.from('addresses').insert({
      user_id: userId,
      label: form.label.trim() || 'Manzil',
      recipient_name: form.recipient_name.trim(),
      phone: form.phone.trim() || null,
      city: form.city.trim(),
      district: form.district.trim() || null,
      street: form.street.trim(),
      is_default: addresses.length === 0,
    });
    setSaving(false);

    if (error) {
      // Endi haqiqiy sabab koʻrsatiladi — "Xatolik" degan foydasiz xabar emas.
      notify(`Manzilni saqlab boʻlmadi: ${error.message}`, 'error');
      return;
    }
    notify('Manzil qoʻshildi', 'success');
    setForm(EMPTY_ADDRESS);
    setShowForm(false);
    onChange();
  };

  const handleDelete = async (address: Address) => {
    const { error } = await supabase.from('addresses').delete().eq('id', address.id);
    setConfirmDelete(null);
    if (error) {
      notify('Manzilni oʻchirib boʻlmadi', 'error');
      return;
    }
    notify('Manzil oʻchirildi', 'success');
    onChange();
  };

  const makeDefault = async (address: Address) => {
    const { error } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', address.id);
    if (error) {
      notify('Asosiy manzilni oʻzgartirib boʻlmadi', 'error');
      return;
    }
    // Bitta foydalanuvchida faqat bitta asosiy manzil boʻlsin.
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', address.user_id).neq('id', address.id);
    onChange();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Manzillarim</h2>
          <p className="mt-0.5 text-sm text-ink-500">Tez-tez ishlatiladigan yetkazib berish manzillari</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className={button(showForm ? 'outline' : 'primary', 'md')}>
          {showForm ? 'Bekor qilish' : (<><Plus className="h-4 w-4" /> Manzil qoʻshish</>)}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} noValidate className={cx(card, 'mt-4 p-4 sm:p-5')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yorliq" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="Uy, ish…" />
            <Field label="Qabul qiluvchi" required value={form.recipient_name} onChange={(v) => setForm({ ...form, recipient_name: v })} error={errors.recipient_name} autoComplete="name" />
            <Field label="Telefon" type="tel" inputMode="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={errors.phone} placeholder="+998 90 123 45 67" autoComplete="tel" />
            <Field label="Shahar / viloyat" required value={form.city} onChange={(v) => setForm({ ...form, city: v })} error={errors.city} autoComplete="address-level2" />
            <Field label="Tuman" value={form.district} onChange={(v) => setForm({ ...form, district: v })} />
            <Field label="Koʻcha, uy" required value={form.street} onChange={(v) => setForm({ ...form, street: v })} error={errors.street} autoComplete="street-address" />
          </div>
          <button type="submit" disabled={saving} className={cx(button('secondary', 'md'), 'mt-4')}>
            {saving ? 'Saqlanmoqda…' : 'Manzilni saqlash'}
          </button>
        </form>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className={cx('h-24 rounded-card', skeleton)} />)
        ) : addresses.length === 0 ? (
          <EmptyState
            title="Saqlangan manzil yoʻq"
            message="Manzil qoʻshsangiz, buyurtma rasmiylashtirish tezroq boʻladi."
            icon={<MapPin className="h-6 w-6" />}
          />
        ) : (
          addresses.map((a) => (
            <div key={a.id} className={cx(card, 'flex items-start justify-between gap-3 p-4')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink-900">{a.label || 'Manzil'}</p>
                  {a.is_default && (
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                      Asosiy
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-600">
                  {[a.recipient_name, a.phone].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {[a.city, a.district, a.street].filter(Boolean).join(', ')}
                </p>
                {!a.is_default && (
                  <button
                    onClick={() => makeDefault(a)}
                    className={cx('mt-2 rounded-sm text-xs font-medium text-orange-700 hover:text-orange-800', focusRing)}
                  >
                    Asosiy qilib belgilash
                  </button>
                )}
              </div>
              <button
                onClick={() => setConfirmDelete(a)}
                aria-label={`${a.label || 'Manzil'} — oʻchirish`}
                className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600', focusRing)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <ResponsiveModal title="Manzilni oʻchirish" onClose={() => setConfirmDelete(null)}>
            <p className="text-sm text-ink-600">
              «{confirmDelete.label || 'Manzil'}» manzilini oʻchirmoqchimisiz?
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => handleDelete(confirmDelete)} className={button('danger', 'md')}>Oʻchirish</button>
              <button onClick={() => setConfirmDelete(null)} className={button('outline', 'md')}>Bekor qilish</button>
            </div>
          </ResponsiveModal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Xavfsizlik ─────────────────────────────────────────────────── */
function SecurityTab() {
  const { notify } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (password.length < 6) next.password = 'Parol kamida 6 ta belgidan iborat boʻlsin';
    if (password !== confirm) next.confirm = 'Parollar mos kelmadi';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      notify(error.message || 'Parolni yangilab boʻlmadi', 'error');
      return;
    }
    setPassword('');
    setConfirm('');
    notify('Parol yangilandi', 'success');
  };

  return (
    /*
     * Bu boʻlim ilgari "Sozlamalar shu yerda boʻladi." degan tugallanmagan
     * matndan iborat edi. Endi u haqiqiy va foydali amalni bajaradi.
     */
    <section className={cx(card, 'p-5 sm:p-6')}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
        <KeyRound className="h-4 w-4 text-orange-600" /> Parolni oʻzgartirish
      </h2>
      <p className="mt-1 text-sm text-ink-500">Yangi parolni kiriting va tasdiqlang.</p>
      <form onSubmit={submit} noValidate className="mt-5 max-w-md space-y-4">
        <Field label="Yangi parol" type="password" required value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
        <Field label="Yangi parolni tasdiqlang" type="password" required value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
        <button type="submit" disabled={saving} className={button('primary', 'md')}>
          {saving ? 'Saqlanmoqda…' : 'Parolni yangilash'}
        </button>
      </form>
    </section>
  );
}

/* ── Umumiy maydon ──────────────────────────────────────────────── */
function Field({
  label, value, onChange, required, placeholder, type = 'text', inputMode, error, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        {label}
        {required && <span className="text-red-600" aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        className={input(!!error)}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
