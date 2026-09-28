import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { CartProvider } from './lib/cart';
import { FavoritesProvider } from './lib/favorites';
import { FlightProvider } from './lib/flight';
import { ToastProvider } from './lib/toast';
import { SettingsProvider } from './lib/settings';
import { RouterProvider, useRouter, Link } from './lib/router';
import { Header } from './lib/ui';
import { BottomNav } from './lib/BottomNav';
import { Footer } from './lib/Footer';
import { CartDrawer } from './lib/CartDrawer';
import { useCartDrawer } from './lib/uiHooks';
import { HomePage } from './lib/HomePage';
import { CatalogPage } from './lib/CatalogPage';
import { ProductPage } from './lib/ProductPage';
import { CartPage } from './lib/CartPage';
import { CheckoutPage } from './lib/CheckoutPage';
import { AuthPage } from './lib/AuthPage';
import { AccountPage } from './lib/AccountPage';
import { FavoritesPage } from './lib/FavoritesPage';
import { SearchPage } from './lib/SearchPage';
import { supabase } from './lib/supabase';
import {
  ProductGrid,
  ProductGridSkeleton,
  EmptyIllustration,
  EmptyState,
  ErrorState,
  productGridClass,
} from './lib/ProductCard';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap, type ProductRow } from './lib/adapters';
import type { Product } from './lib/types';
import { motion, useReducedMotion } from 'motion/react';
import { pageVariants, pageTransition, MOTION } from './lib/motion';
import { useSeo } from './lib/seo';
import { STATIC_PAGES, type StaticPagePath } from './lib/staticPages';
import { button, cx, shell, skeleton } from './lib/design';
import { Sparkles, TrendingUp, PackageSearch, SearchX, Package, ArrowLeft } from 'lucide-react';

/*
 * Admin paneli mijozlar uchun kerak emas, lekin u eng katta ekran to'plami.
 * Uni alohida chunk'ga ajratamiz — bosh sahifaga kirgan oddiy foydalanuvchi
 * endi admin kodini umuman yuklab olmaydi.
 */
const AdminLayout = lazy(() =>
  import('./lib/AdminPage').then((m) => ({ default: m.AdminLayout }))
);

function Routes() {
  const { route } = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { open, openCart, closeCart } = useCartDrawer();
  const { match } = route;
  const rawPath = route.pathname;

  /* ── Admin: mijoz header/footer'isiz ─────────────────────────── */
  if (match.name === 'admin') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-ink-50 p-6">
            <div className={cx('h-14 w-full rounded-card', skeleton)} />
            <div className={cx('mt-4 h-64 w-full rounded-card', skeleton)} />
          </div>
        }
      >
        <AdminLayout tab={match.tab} />
      </Suspense>
    );
  }

  /* Kirish sahifasi — o'z to'liq ekran maketiga ega. */
  if (match.name === 'login') return <AuthPage />;

  /*
   * Qidiruv va shaxsiy kabinet umumiy header (logo + qidiruv + menyu)ni
   * ISHLATMAYDI — ularning har biri o'z minimal sarlavhasiga ega. Bu
   * sahifalarda foydalanuvchi aniq bir vazifada bo'ladi va ortiqcha
   * navigatsiya faqat chalg'itadi. Pastdagi navigatsiya esa saqlanadi,
   * shunda mobil foydalanuvchi istalgan paytda chiqib keta oladi.
   */
  if (match.name === 'search') {
    return (
      <FocusedShell>
        <SearchPage />
      </FocusedShell>
    );
  }

  if (match.name === 'account') {
    return (
      <FocusedShell>
        <AccountPage tab={match.tab} orderId={match.orderId} />
      </FocusedShell>
    );
  }

  /* ── Mijoz sahifalari ────────────────────────────────────────── */
  let content: React.ReactNode;

  switch (match.name) {
    case 'home': content = <HomePage />; break;
    case 'catalog': content = <CatalogPage />; break;
    case 'promotions': content = <PromotionsPage />; break;
    case 'new': content = <NewProductsPage />; break;
    case 'bestsellers': content = <BestsellersPage />; break;
    case 'category': content = <CategoryRoute slug={match.slug} />; break;
    case 'product': content = <ProductPage slug={match.slug} />; break;
    case 'cart': content = <CartPage />; break;
    case 'checkout': content = <CheckoutRoute user={!!user} authLoading={authLoading} />; break;
    case 'favorites': content = <FavoritesPage />; break;
    case 'static': content = <StaticPage path={match.path} />; break;
    default: content = <NotFound />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Header onCartClick={openCart} />
      {/* `tab:pb-0` — <BottomNav> aynan shu chegarada yo'qoladi. */}
      <main id="main" className="flex-1 pb-[var(--bottom-nav-h)] tab:pb-0">
        {/*
          Sahifa o'tishi ATAYLAB `AnimatePresence`siz.

          Ilgari `AnimatePresence mode="wait"` ishlatilardi: u yangi sahifani
          eskisining chiqish animatsiyasi TUGAGUNCHA umuman mount qilmaydi.
          Foydalanuvchi pastki navigatsiyada tez-tez bosganda o'tishlar
          navbatga tizilib, sahifa bir necha soniya kechikib ochilardi
          (o'lchandi: ~3 s). Endi yangi sahifa DARHOL render bo'ladi va
          faqat kirish animatsiyasi o'ynaydi — bu sezilarli darajada tezroq
          va e-commerce uchun to'g'ri xatti-harakat.
        */}
        <motion.div
          key={rawPath}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          transition={pageTransition}
        >
          {content}
        </motion.div>
      </main>
      {/*
        Footer (do'kon nomi, "Do'kon / Mijozlarga / Yordam" ustunlari,
        kontaktlar) FAQAT bosh sahifada ko'rsatiladi. Ichki sahifalarda
        foydalanuvchi aniq bir vazifada bo'ladi — u yerda uzun havolalar
        ro'yxati faqat sahifani cho'zadi va e'tiborni bo'ladi. Barcha
        ekran o'lchamlarida shunday.
      */}
      {match.name === 'home' && <Footer />}
      <BottomNav />
      <CartDrawer open={open} onClose={closeCart} />
    </div>
  );
}

/**
 * Umumiy headersiz maket: sahifa o'z sarlavhasini chizadi, lekin mobil
 * pastki navigatsiya va savat paneli ishlashda davom etadi.
 */
function FocusedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main id="main" className="flex-1">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

/**
 * Checkout faqat tizimga kirgan foydalanuvchi uchun. Ilgari bu yerda login
 * FORMASI mijoz maketi ichida render qilinardi — manzil qatori hamon
 * `/checkout` bo'lib qolar, orqaga qaytish chalkash edi. Endi haqiqiy
 * yo'naltirish bajariladi.
 */
function CheckoutRoute({ user, authLoading }: { user: boolean; authLoading: boolean }) {
  const { navigate } = useRouter();
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true });
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <div className={cx(shell, 'py-10')}>
        <div className={cx('h-72 rounded-card', skeleton)} />
      </div>
    );
  }
  return <CheckoutPage />;
}

function CategoryRoute({ slug }: { slug: string }) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  const load = useCallback(() => {
    setState('loading');
    supabase
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setState('error');
        if (!data) return setState('missing');
        setCategoryId(data.id);
        setState('ready');
      });
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (state === 'loading') {
    return (
      <div className={cx(shell, 'py-8')}>
        <div className={cx('h-6 w-56 rounded', skeleton)} />
        <div className={cx('mt-4 h-9 w-72 rounded', skeleton)} />
        <ProductGridSkeleton count={8} className={cx(productGridClass, 'mt-8')} />
      </div>
    );
  }
  if (state === 'error') {
    return <div className={cx(shell, 'py-10')}><ErrorState onRetry={load} /></div>;
  }
  if (state === 'missing' || !categoryId) return <NotFound />;
  return <CatalogPage categoryId={categoryId} />;
}

/** Mahsulot ro'yxatli sahifalar uchun umumiy qobiq (aksiyalar / yangi / xit). */
function ProductListPage({
  title, subtitle, icon: Icon, seoDescription, emptyTitle, emptyMessage, fetcher,
}: {
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  seoDescription: string;
  emptyTitle: string;
  emptyMessage: string;
  fetcher: () => Promise<Product[]>;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useSeo({ title, description: seoDescription });

  const load = useCallback(() => {
    setState('loading');
    fetcher()
      .then((list) => { setProducts(list); setState('ready'); })
      .catch(() => setState('error'));
  }, [fetcher]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={cx(shell, 'py-5 lg:py-8')}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-orange-50 text-orange-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-display-sm">{title}</h1>
          <p className="text-sm text-ink-500">{subtitle}</p>
        </div>
      </div>

      <div className="mt-6">
        {state === 'loading' ? (
          <ProductGridSkeleton count={10} />
        ) : state === 'error' ? (
          <ErrorState onRetry={load} />
        ) : products.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            message={emptyMessage}
            icon={<SearchX className="h-6 w-6" />}
            action={<Link to="/catalog" className="text-sm font-semibold text-orange-700 hover:underline">Butun katalogni ko‘rish</Link>}
          />
        ) : (
          <ProductGrid products={products} className={productGridClass} priorityCount={2} />
        )}
      </div>
    </div>
  );
}

type LivePromotionRow = { id: string; discount_percent: number; ends_at: string | null };
type PromotionProductRow = { promotion_id: string; product: ProductRow | null };

async function fetchPromotionProducts(): Promise<Product[]> {
  const { data: promos, error } = await supabase
    .from('promotions')
    .select('id, discount_percent, ends_at')
    .eq('is_active', true)
    .returns<LivePromotionRow[]>();
  if (error) throw error;

  const now = Date.now();
  const live = (promos ?? []).filter((p) => !p.ends_at || new Date(p.ends_at).getTime() > now);
  if (live.length === 0) return [];

  const { data, error: linkError } = await supabase
    .from('promotion_products')
    .select(`promotion_id, product:products(${PRODUCT_SELECT})`)
    .in('promotion_id', live.map((p) => p.id))
    .returns<PromotionProductRow[]>();
  if (linkError) throw linkError;

  // Bir mahsulot bir necha aksiyada bo'lsa — eng katta chegirmani olamiz
  // (ilgari birinchi uchragan yozuv olinardi, ya'ni ko'rsatilgan chegirma
  // haqiqiy narxdan kichik bo'lishi mumkin edi).
  const percentByPromo = new Map(live.map((p) => [p.id, p.discount_percent]));
  const bestByProduct = new Map<string, { product: ProductRow; percent: number }>();
  for (const row of data ?? []) {
    const product = row.product;
    if (!product || product.is_active === false) continue;
    const percent = percentByPromo.get(row.promotion_id) ?? 0;
    const current = bestByProduct.get(product.id);
    if (!current || percent > current.percent) bestByProduct.set(product.id, { product, percent });
  }

  const entries = [...bestByProduct.values()];
  return adaptProducts(
    entries.map((e) => e.product),
    Object.fromEntries(entries.map((e) => [e.product.id, e.percent]))
  );
}

async function fetchByOrder(column: 'created_at' | 'sales_count'): Promise<Product[]> {
  const [{ data, error }, promoMap] = await Promise.all([
    supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .order(column, { ascending: false })
      .limit(40)
      .returns<ProductRow[]>(),
    fetchPromoDiscountMap(supabase),
  ]);
  if (error) throw error;
  return adaptProducts(data ?? [], promoMap);
}

const fetchNew = () => fetchByOrder('created_at');
const fetchBestsellers = () => fetchByOrder('sales_count');

function PromotionsPage() {
  return (
    <ProductListPage
      title="Aksiya va chegirmalar"
      subtitle="Cheklangan muddatdagi maxsus narxlar"
      icon={Sparkles}
      seoDescription="OpenShop'dagi joriy aksiyalar va chegirmali mahsulotlar."
      emptyTitle="Hozircha faol aksiya yo‘q"
      emptyMessage="Yangi aksiyalar tez orada. Katalogdagi boshqa takliflarni ko‘ring."
      fetcher={fetchPromotionProducts}
    />
  );
}

function NewProductsPage() {
  return (
    <ProductListPage
      title="Yangi mahsulotlar"
      subtitle="Katalogga so‘nggi qo‘shilganlar"
      icon={PackageSearch}
      seoDescription="OpenShop katalogiga yaqinda qo‘shilgan yangi mahsulotlar."
      emptyTitle="Yangi mahsulot yo‘q"
      emptyMessage="Katalogda hozircha yangi qo‘shilgan mahsulot ko‘rinmadi."
      fetcher={fetchNew}
    />
  );
}

function BestsellersPage() {
  return (
    <ProductListPage
      title="Xit sotuvlar"
      subtitle="Xaridorlar eng ko‘p tanlaydigan mahsulotlar"
      icon={TrendingUp}
      seoDescription="OpenShop'da eng ko‘p sotilgan mahsulotlar reytingi."
      emptyTitle="Ma’lumot yetarli emas"
      emptyMessage="Sotuvlar to‘planganda bu bo‘lim avtomatik to‘ladi."
      fetcher={fetchBestsellers}
    />
  );
}

function StaticPage({ path }: { path: StaticPagePath }) {
  const page = STATIC_PAGES[path];
  useSeo({ title: page.title, description: page.description });

  return (
    <div className={cx(shell, 'py-6 lg:py-10')}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-display-md">{page.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">{page.intro}</p>

        <div className="mt-8 space-y-7">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-ink-900">{section.heading}</h2>
              {section.body && <p className="mt-2 text-sm leading-relaxed text-ink-600">{section.body}</p>}
              {section.items && (
                <ul className="mt-3 space-y-2">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-600">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-card border border-ink-200 bg-white p-5">
          <p className="text-sm font-semibold text-ink-900">Savolingiz qoldimi?</p>
          <p className="mt-1 text-sm text-ink-500">Operatorlarimiz har kuni 09:00–21:00 oralig‘ida javob beradi.</p>
          <Link to="/contact" className="mt-3 inline-flex text-sm font-semibold text-orange-700 hover:underline">
            Biz bilan bog‘lanish →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 404.
 *
 * Kompozitsiya g'oyasi: o'rtadagi NOL — raqam emas, HALQA. Uning ichida
 * yo'qolgan paket suzib turadi. Shunday qilib "4 0 4" ning o'zi sahifaning
 * mazmunini aytadi: bir narsa yo'qolgan.
 *
 * Nega to'q fon? `ink-900` allaqachon OpenShop tizimida bor (aksiya bo'limi
 * va bannersiz hero) — ya'ni bu "boshqa sayt" emas, o'sha do'konning
 * jimroq, atmosferali burchagi. Urg'u — o'sha yagona to'q sariq.
 *
 * Harakat ATAYLAB sekin: halqa ~24 soniyada bir marta aylanadi, paket
 * 4 soniyalik nafas oladi. Bu diqqatni tortmaydi, faqat sahifa "tirik"
 * ekanini bildiradi. `prefers-reduced-motion` da ikkalasi ham to'liq
 * to'xtaydi va kompozitsiya statik holatda ham to'g'ri ko'rinadi.
 *
 * Havolalar hech qachon animatsiyaga bog'liq emas — ular darhol bosiladi.
 */
function NotFound() {
  useSeo({ title: 'Sahifa topilmadi', noindex: true });
  const reduce = useReducedMotion();

  return (
    <div className={cx(shell, 'py-6 lg:py-10')}>
      <section className="relative isolate overflow-hidden rounded-surface bg-ink-900 px-5 py-14 text-center sm:px-8 sm:py-20 lg:py-28">
        {/* Chuqurlik: ikkita yumshoq dog'. Rasm ham, yulduzlar ham yo'q. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-orange-600/20 blur-3xl sm:h-80 sm:w-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl sm:h-72 sm:w-72"
        />

        {/* 4 — halqa — 4 */}
        <div className="relative flex items-center justify-center gap-3 sm:gap-5">
          <span className="bg-gradient-to-b from-white to-white/45 bg-clip-text text-[3.5rem] font-bold leading-none tracking-tight text-transparent sm:text-[5rem] lg:text-[6.5rem]">
            4
          </span>

          {/*
            Halqa — "nol", ichida yo'qolgan paket suzadi.

            Kompozitsiya endi `EmptyIllustration` da yashaydi: aynan shu
            uslub savat, sevimlilar va qidiruvning bo'sh holatlarida ham
            ishlatiladi. Bu yerda faqat o'lcham (`lg`) va to'q fon uchun
            ohang (`dark`) ko'rsatiladi — ko'rinish avvalgidek qoladi.
          */}
          <EmptyIllustration
            tone="dark"
            size="lg"
            icon={<Package className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" />}
          />

          <span className="bg-gradient-to-b from-white to-white/45 bg-clip-text text-[3.5rem] font-bold leading-none tracking-tight text-transparent sm:text-[5rem] lg:text-[6.5rem]">
            4
          </span>
        </div>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...MOTION.story, duration: 0.5, delay: 0.1 }}
          className="relative"
        >
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-400">
            Xato 404
          </p>
          <h1 className="mt-2.5 text-display-sm text-white sm:text-display-md lg:text-display-lg">
            Bu sahifa yo‘qolib qoldi
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            Havola eskirgan bo‘lishi yoki sahifa ko‘chirilgan bo‘lishi mumkin.
            Keling, sizni kerakli joyga qaytaramiz.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className={cx(button('primary', 'lg'), 'shadow-[0_8px_24px_-8px_rgba(234,97,0,0.9)]')}
            >
              <ArrowLeft className="h-4 w-4" /> Bosh sahifaga qaytish
            </Link>
            <Link
              to="/catalog"
              className={cx(
                button('outline', 'lg'),
                'border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15'
              )}
            >
              Katalogni ko‘rish
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <CartProvider>
          <FavoritesProvider>
            <ToastProvider>
              {/*
                FlightProvider marshrutdan TASHQARIDA turadi: uchayotgan
                rasm sahifa almashganda ham uzilib qolmasligi kerak va u
                `document.body` ga portal qilinadi.
              */}
              <FlightProvider>
                <RouterProvider>
                  <Routes />
                </RouterProvider>
              </FlightProvider>
            </ToastProvider>
          </FavoritesProvider>
        </CartProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
