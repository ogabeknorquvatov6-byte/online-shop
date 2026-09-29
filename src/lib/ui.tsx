import { Link, useRouter } from './router';
import { useEffect, useRef, useState } from 'react';
import {
  Heart, ShoppingCart, ShoppingBag, User, Menu, X, ChevronRight, Home, LayoutGrid,
  Phone, Truck, ChevronDown, Flame, Sparkles, TrendingUp, Info,
} from 'lucide-react';
import { useCart } from './cart';
import { useAuth } from './auth';
import { useFavorites } from './favorites';
import { useSettings } from './settings';
import { useCategories } from './catalogData';
import { AnimatePresence, motion } from 'motion/react';
import { AnimatedDrawer, AnimatedIconButton, StaggerGroup, StaggerItem } from './AnimatedPrimitives';
import { AnimatedBadge } from './AnimatedNumber';
import { DesktopSearch, MobileSearchTrigger } from './SearchBox';
import { CatalogMegaMenu } from './CatalogMegaMenu';
import { LocationButton } from './LocationButton';
import { SECTION, requestSection, scrollToSection, type SectionId } from './sections';
import { countBadge, cx, focusRing, shell } from './design';
import { popVariants, DURATION, EASE } from './motion';

/** Bosh sahifadagi boʻlimlarga silliq scroll qiladigan menyu bandlari. */
const SECTION_LINKS: { label: string; section: SectionId; icon: typeof Flame }[] = [
  { label: 'Aksiya', section: SECTION.promo, icon: Flame },
  { label: 'Xit mahsulotlar', section: SECTION.bestsellers, icon: TrendingUp },
  { label: 'Yangi kelganlar', section: SECTION.fresh, icon: Sparkles },
];

/** Oddiy marshrutga olib boradigan bandlar. */
const PAGE_LINKS: { label: string; path: string; icon: typeof Truck }[] = [
  { label: 'Yetkazib berish', path: '/delivery', icon: Truck },
  { label: 'Biz haqimizda', path: '/about', icon: Info },
];

export function Header({ onCartClick }: { onCartClick?: () => void }) {
  const { count } = useCart();
  const { user, profile } = useAuth();
  const { count: favCount } = useFavorites();
  const { settings } = useSettings();
  const { route, navigate } = useRouter();
  const { categories } = useCategories();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);

  const path = route.pathname;
  const onCatalog = route.match.name === 'catalog' || route.match.name === 'category';
  const onHome = route.match.name === 'home';

  /*
   * Scroll kuzatuvi — endi FAQAT sarlavha soyasi uchun.
   *
   * Ilgari bu yerda qidiruv qatorini yigʻish/ochish uchun gisterezisli
   * mantiq bor edi (COLLAPSE_AFTER / EXPAND_AFTER / LOCK_ZONE). Qidiruv
   * endi headerning doimiy qismi va hech qachon yigʻilmaydi, shuning
   * uchun oʻsha hisob-kitobning isteʼmolchisi qolmadi — u oʻchirildi.
   *
   * Qolgani bitta arzon tekshiruv: sahifa yuqorisidamizmi yoki yoʻqmi.
   * `requestAnimationFrame` bilan throttle qilinadi va listener
   * `passive`, yaʼni scroll hech qachon bloklanmaydi.
   */
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled(window.scrollY > 8);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!catalogOpen) return;
    const onDown = (e: MouseEvent) => {
      if (catalogRef.current && !catalogRef.current.contains(e.target as Node)) setCatalogOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCatalogOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [catalogOpen]);

  useEffect(() => {
    setCatalogOpen(false);
    setMobileOpen(false);
  }, [path]);

  /*
   * Boʻlimga oʻtish: bosh sahifada boʻlsak — darhol scroll; boshqa
   * sahifada boʻlsak — avval bosh sahifaga oʻtamiz va HomePage kontent
   * yuklangach oʻzi scroll qiladi (sections.ts dagi "pending" orqali).
   * Ikkala holatda ham sahifa QAYTA YUKLANMAYDI.
   */
  const goToSection = (section: SectionId) => {
    setMobileOpen(false);
    if (onHome) {
      // Menyu yopilish animatsiyasi tugagach scroll qilamiz.
      setTimeout(() => scrollToSection(section), 180);
      return;
    }
    requestSection(section);
    navigate('/');
  };

  const storeName = settings?.store_name?.trim() || 'OpenShop';
  const logoMark = storeName === 'OpenShop' ? (<>Open<span className="text-orange-600">Shop</span></>) : storeName;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-control focus:bg-ink-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Asosiy mazmunga oʻtish
      </a>

      {/* Yupqa ishonch qatori — faqat desktop */}
      <div className="hidden border-b border-ink-200/70 bg-white lg:block">
        <div className={cx(shell, 'flex h-9 items-center justify-between text-xs text-ink-500')}>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-orange-600" /> Toshkent boʻylab 1 kunda yetkazib beramiz
            </span>
            <span className="hidden xl:inline">14 kun ichida qaytarish kafolati</span>
          </div>
          {settings?.phone && (
            <a
              href={`tel:${settings.phone.replace(/\s/g, '')}`}
              className={cx('flex items-center gap-1.5 rounded-sm font-medium text-ink-700 hover:text-orange-700', focusRing)}
            >
              <Phone className="h-3.5 w-3.5" /> {settings.phone}
            </a>
          )}
        </div>
      </div>

      <header
        className={cx(
          'sticky top-0 z-50 border-b bg-white/95 backdrop-blur-md transition-[box-shadow,border-color] duration-200',
          scrolled ? 'border-ink-200 shadow-[0_1px_12px_-6px_rgb(24_23_22/0.25)]' : 'border-ink-200/70'
        )}
      >
        <div className={shell}>
          {/*
            MOBIL QATOR: [☰] [qidiruv] [📍] — BITTA qatorda.

            Ilgari qidiruv ALOHIDA ikkinchi qatorda turardi va sahifa
            pastga surilganda `isCompact` bilan yig'ilib yo'qolardi.
            Natijada qidiruv "sakrab" yurar, ba'zan umuman ko'rinmasdi va
            foydalanuvchi uni qayta topish uchun tepaga qaytishi kerak
            edi. Endi u headerning doimiy, o'zgarmas qismi: bitta joyda
            turadi, hech qayerga yig'ilmaydi va ikkinchi "suzuvchi"
            qidiruv ham yo'q.

            Logotip mobilda ATAYLAB yo'q: uchta element (menyu, qidiruv,
            manzil) 360px'da bemalol sig'ishi uchun. `tab` dan boshlab
            logotip qaytadi va desktop ierarxiyasi o'zgarmaydi.
          */}
          <div className="flex h-14 items-center gap-2 lg:h-16 lg:gap-3">
            <button
              className={cx(
                '-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-700 tab:hidden',
                'transition-transform duration-150 ease-standard active:scale-90',
                focusRing
              )}
              onClick={() => setMobileOpen(true)}
              aria-label="Menyuni ochish"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5.5 w-5.5" />
            </button>

            <Link
              to="/"
              /*
               * `md` (768px), `tab` (820px) EMAS.
               *
               * `tab` da chegaralanganda 768pxʼlik planshetda header
               * logotipsiz qolardi — yaʼni brend belgisi umuman yoʻq
               * [☰][qidiruv][📍] kompozitsiyasi. 768pxʼda joy yetarli:
               * oʻlchandi — logotip qoʻshilgach ham qidiruv ~450px
               * qoladi. 640pxʼdan pastda esa logotip ataylab yashirin,
               * aks holda uchta element siqilib ketadi.
               */
              className={cx('hidden min-w-0 items-center gap-2 rounded-control md:flex', focusRing)}
              aria-label={`${storeName} — bosh sahifa`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-orange-600 text-white lg:h-9 lg:w-9">
                <ShoppingBag className="h-4 w-4 lg:h-4.5 lg:w-4.5" />
              </span>
              <span className="truncate text-lg font-bold tracking-tight text-ink-900 lg:text-xl">
                {logoMark}
              </span>
            </Link>

            {/* YAGONA qidiruv. Mobilda to'liq ekranli qidiruvni ochadi,
                `md` dan boshlab to'liq qidiruv maydoni. */}
            <div className="min-w-0 flex-1 md:max-w-xl lg:max-w-2xl">
              <div className="md:hidden">
                <MobileSearchTrigger />
              </div>
              <div className="hidden md:block">
                <DesktopSearch />
              </div>
            </div>

            <LocationButton />

            {/*
              Sevimlilar va Savat ikonalari MOBILDA headerda ko'rsatilmaydi —
              ular pastdagi navigatsiyada doim qo'l ostida turadi va header
              maksimal darajada toza qoladi. Desktopda bottom nav bo'lmagani
              uchun ular saqlanadi.
            */}
            {/*
              `tab:flex` — 820px dan boshlab bu tugmalar headerda paydo
              bo'ladi, chunki aynan shu yerdan pastki navigatsiya olib
              tashlanadi. Ilgari ular faqat `lg` da chiqardi va planshetda
              savat/sevimlilar headerda UMUMAN yo'q edi.
            */}
            <nav className="hidden items-center gap-0.5 tab:flex" aria-label="Foydalanuvchi amallari">
              <Link
                to="/favorites"
                // "Sevimlilarga uchish" animatsiyasining nishoni.
                data-favorites-target=""
                className={cx('relative flex h-10 w-10 items-center justify-center rounded-control text-ink-700 transition-colors hover:bg-ink-100 hover:text-orange-700', focusRing)}
                aria-label={favCount > 0 ? `Sevimlilar (${favCount} ta)` : 'Sevimlilar'}
              >
                <Heart className={cx('h-5 w-5', favCount > 0 && 'fill-orange-600 text-orange-600')} />
                {favCount > 0 && (
                  <AnimatedBadge value={favCount} className={cx(countBadge.overlay, 'right-0.5 top-0.5')} />
                )}
              </Link>
              <Link
                to={user ? '/account' : '/login'}
                className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-700 transition-colors hover:bg-ink-100 hover:text-orange-700', focusRing)}
                aria-label={user ? 'Mening profilim' : 'Kirish'}
              >
                <User className="h-5 w-5" />
              </Link>
              <AnimatedIconButton
                onClick={onCartClick}
                // "Savatga uchish" animatsiyasi shu nishonni qidiradi.
                data-cart-target=""
                className={cx('relative flex h-10 w-10 items-center justify-center rounded-control text-ink-700 transition-colors hover:bg-ink-100 hover:text-orange-700', focusRing)}
                aria-label={count > 0 ? `Savat (${count} ta mahsulot)` : 'Savat'}
              >
                <ShoppingCart className="h-5 w-5" />
                {count > 0 && (
                  <AnimatedBadge value={count} className={cx(countBadge.overlay, 'right-0.5 top-0.5')} />
                )}
              </AnimatedIconButton>
            </nav>

          </div>

          {/*
            IKKINCHI QIDIRUV QATORI OLIB TASHLANDI.

            Ilgari shu yerda `isCompact` ga bog'langan yig'iladigan qatorda
            yana bitta `MobileSearchTrigger` turardi — ya'ni ilovada IKKITA
            qidiruv elementi bor edi va pastga surilganda biri yo'qolib,
            foydalanuvchi uni izlab qolardi. Endi qidiruv yuqoridagi asosiy
            qatorda, doimiy joyda. `isCompact` faqat sarlavha balandligiga
            ta'sir qiladi va qidiruvni endi qimirlatmaydi — shuning uchun
            scroll paytida layout sakramaydi.
          */}

          {/*
            Desktop/planshet navigatsiyasi — `tab` (820px) dan boshlab.

            Ilgari `lg:flex` (1024px) edi va bu 820–1023px oralig'ida
            "o'lik zona" hosil qilardi: pastki navigatsiya allaqachon
            yashiringan (`tab:hidden`), header'dagi Katalog tugmasi esa
            hali paydo bo'lmagan. Ya'ni planshetda katalog navigatsiyasiga
            umuman kirib bo'lmasdi — faqat gamburger menyusi orqali.

            Chegara endi pastki navigatsiya bilan BIR XIL: `tab` da biri
            o'chadi, ikkinchisi yoqiladi va bo'shliq qolmaydi.
          */}
          <nav className="hidden items-center gap-1 pb-2.5 tab:flex" aria-label="Asosiy navigatsiya">
            <div className="relative" ref={catalogRef}>
              <button
                type="button"
                onClick={() => setCatalogOpen((o) => !o)}
                aria-expanded={catalogOpen}
                aria-haspopup="true"
                className={cx(
                  'flex h-9 items-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors',
                  focusRing,
                  onCatalog || catalogOpen ? 'bg-orange-50 text-orange-700' : 'bg-orange-700 text-white hover:bg-orange-800'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Katalog
                <ChevronDown className={cx('h-3.5 w-3.5 transition-transform duration-200', catalogOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {catalogOpen && (
                  <motion.div
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: DURATION.ui, ease: EASE.standard }}
                  >
                    {/*
                      Mega-menyu endi alohida komponentda va u mobil
                      varaq bilan BIR XIL kategoriya daraxtidan oziqlanadi
                      (`useCategoryTree`). Ilgari bu yerda kategoriyalar
                      tekis ro'yxat sifatida qo'lda chizilardi — ya'ni
                      desktop va mobil bir-biridan mustaqil edi va
                      ierarxiyani umuman ko'rsata olmasdi.
                    */}
                    <CatalogMegaMenu onNavigate={() => setCatalogOpen(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {SECTION_LINKS.map((link) => (
              <button
                key={link.section}
                type="button"
                onClick={() => goToSection(link.section)}
                className={cx(
                  'flex h-9 items-center rounded-control px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900',
                  focusRing
                )}
              >
                {link.label}
              </button>
            ))}

            {PAGE_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                aria-current={path === link.path ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center rounded-control px-3 text-sm font-medium transition-colors',
                  focusRing,
                  path === link.path ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobil yon menyu */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <AnimatedDrawer
              side="left"
              onClose={() => setMobileOpen(false)}
              ariaLabel="Menyu"
              panelClassName="absolute left-0 top-0 flex h-full w-[19rem] max-w-[86%] flex-col overflow-y-auto overscroll-contain bg-white shadow-overlay"
            >
              <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3.5">
                <span className="flex items-center gap-2 text-lg font-bold text-ink-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-control bg-orange-600 text-white">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  {logoMark}
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className={cx('-mr-1.5 flex h-10 w-10 items-center justify-center rounded-control text-ink-500', focusRing)}
                  aria-label="Menyuni yopish"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <Link
                to={user ? '/account' : '/login'}
                onClick={() => setMobileOpen(false)}
                className={cx('flex items-center gap-3 border-b border-ink-100 px-4 py-3.5 active:bg-ink-50', focusRing)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                  <User className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {user
                      ? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mening profilim'
                      : 'Kirish yoki roʻyxatdan oʻtish'}
                  </span>
                  <span className="block truncate text-xs text-ink-500">
                    {user ? profile?.phone || user.email : 'Buyurtmalarni kuzatib boring'}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
              </Link>

              <StaggerGroup className="flex flex-col p-2" staggerChildren={0.03}>
                <StaggerItem>
                  <MenuLink to="/" icon={Home} label="Bosh sahifa" onNavigate={() => setMobileOpen(false)} />
                </StaggerItem>
                <StaggerItem>
                  <MenuLink to="/catalog" icon={LayoutGrid} label="Katalog" onNavigate={() => setMobileOpen(false)} />
                </StaggerItem>

                {SECTION_LINKS.map((link) => (
                  <StaggerItem key={link.section}>
                    <button
                      type="button"
                      onClick={() => goToSection(link.section)}
                      className={cx('flex w-full items-center gap-3 rounded-control px-3 py-3 text-left text-sm font-medium text-ink-700 active:bg-ink-50', focusRing)}
                    >
                      <link.icon className="h-4.5 w-4.5 shrink-0 text-ink-400" />
                      <span className="flex-1">{link.label}</span>
                      <ChevronRight className="h-4 w-4 text-ink-300" />
                    </button>
                  </StaggerItem>
                ))}

                <StaggerItem>
                  <MenuLink to="/favorites" icon={Heart} label="Sevimlilar" badge={favCount} onNavigate={() => setMobileOpen(false)} />
                </StaggerItem>
                <StaggerItem>
                  <MenuLink to="/cart" icon={ShoppingCart} label="Savat" badge={count} onNavigate={() => setMobileOpen(false)} />
                </StaggerItem>

                {PAGE_LINKS.map((link) => (
                  <StaggerItem key={link.path}>
                    <MenuLink to={link.path} icon={link.icon} label={link.label} onNavigate={() => setMobileOpen(false)} />
                  </StaggerItem>
                ))}
              </StaggerGroup>

              {categories.length > 0 && (
                <div className="border-t border-ink-100 p-2">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                    Kategoriyalar
                  </p>
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      to={`/category/${c.slug}`}
                      onClick={() => setMobileOpen(false)}
                      className={cx('flex items-center justify-between rounded-control px-3 py-2.5 text-sm text-ink-700 active:bg-ink-50', focusRing)}
                    >
                      {c.name}
                      <ChevronRight className="h-4 w-4 text-ink-300" />
                    </Link>
                  ))}
                </div>
              )}

              {profile?.is_admin && (
                <div className="mt-auto border-t border-ink-100 p-2">
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    className={cx('flex items-center justify-between rounded-control px-3 py-3 text-sm font-semibold text-orange-700 active:bg-orange-50', focusRing)}
                  >
                    Admin panel
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </AnimatedDrawer>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function MenuLink({
  to, icon: Icon, label, badge, onNavigate,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  badge?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cx('flex items-center gap-3 rounded-control px-3 py-3 text-sm font-medium text-ink-700 active:bg-ink-50', focusRing)}
    >
      <Icon className="h-4.5 w-4.5 shrink-0 text-ink-400" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className={countBadge.inline}>{badge > 99 ? '99+' : badge}</span>
      ) : (
        <ChevronRight className="h-4 w-4 text-ink-300" />
      )}
    </Link>
  );
}
