import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { matchRoute, normalizePathname, type AppRoute } from './routes';

/*
 * Marshrutizator — History API (`/catalog`), hash EMAS (`#/catalog`).
 *
 * Nega koʻchirildi:
 *   1. Hash qismi SERVERGA UMUMAN YUBORILMAYDI. Yaʼni Google, Telegram
 *      koʻrinishi, Facebook/Twitter kartalari va istalgan crawler uchun
 *      saytdagi barcha sahifa bitta `/` edi — `#/product/iphone-15` va
 *      `#/faq` bir xil manzil sifatida koʻrinardi.
 *   2. `<link rel="canonical">` hash bilan yozilganda eʼtiborga olinmaydi.
 *   3. Hash URLʼlar mijozga "tugallanmagan sayt" taassurotini beradi.
 *
 * Nima saqlab qolindi:
 *   — toʻgʻridan-toʻgʻri kirish va sahifani yangilash (server SPA-fallback,
 *     pastda `public/_redirects` va `vercel.json` bilan taʼminlangan);
 *   — brauzerning orqaga/oldinga tugmalari va scroll holati;
 *   — `?q=`, `?brand=` kabi soʻrov parametrlari;
 *   — Ctrl/Cmd-klik bilan yangi oynada ochish;
 *   — ESKI hash havolalar: `#/product/x` avtomatik `/product/x` ga
 *     almashtiriladi (bot xabarlaridagi va xatchoʻplardagi havolalar).
 */

export type Route = {
  /** Soʻrovsiz yoʻl: `/catalog`. */
  pathname: string;
  /** `?brand=Apple` yoki boʻsh satr. */
  search: string;
  /** Tayyor parametrlar — har renderʼda qayta yaratilmaydi. */
  query: URLSearchParams;
  /** Tekshirilgan marshrut (discriminated union). */
  match: AppRoute;
};

type NavigateOptions = {
  /** Tarixga yangi yozuv qoʻshmaydi (yoʻnaltirishlar, filtr oʻzgarishi). */
  replace?: boolean;
  /** Yangi sahifada tepaga qaytarmaslik (filtr yangilanishi). */
  preserveScroll?: boolean;
};

type RouterValue = {
  route: Route;
  navigate: (to: string, options?: NavigateOptions) => void;
};

const RouterContext = createContext<RouterValue | undefined>(undefined);

/* ── Manzilni oʻqish ─────────────────────────────────────────────────── */

function readRoute(): Route {
  const pathname = normalizePathname(window.location.pathname);
  const search = window.location.search;
  return {
    pathname,
    search,
    query: new URLSearchParams(search),
    match: matchRoute(pathname),
  };
}

/**
 * Eski `#/...` havolalarini toza manzilga koʻchiradi.
 *
 * React render boʻlishidan OLDIN (main.tsx da) chaqiriladi — aks holda
 * ilova avval `/` ni koʻrsatib, keyin sakrab kerakli sahifaga oʻtardi.
 */
export function migrateLegacyHashUrl(): void {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith('#/')) return;

  // Faqat ildizda turgan hash marshrut hisoblanadi. `/faq#delivery` kabi
  // sahifa ichidagi langar havolalarga tegmaymiz.
  if (normalizePathname(pathname) !== '/') return;

  const target = hash.slice(1);
  const [hashPath, hashQuery = ''] = target.split('?');
  const mergedQuery = [search.replace(/^\?/, ''), hashQuery].filter(Boolean).join('&');
  const url = normalizePathname(hashPath) + (mergedQuery ? `?${mergedQuery}` : '');
  window.history.replaceState(null, '', url);
}

/* ── Scroll holati ───────────────────────────────────────────────────── */

/*
 * Orqaga qaytganda foydalanuvchi katalogning OʻZI TURGAN joyiga qaytishi
 * kerak — bu e-commerceʼda eng koʻp ishlatiladigan harakat (mahsulotni
 * ochib, orqaga qaytib, keyingisini ochish). Brauzerning oʻz tiklashi SPAʼda
 * ishonchsiz: DOM hali toʻlmagan boʻladi, shuning uchun oʻzimiz boshqaramiz.
 */
const scrollPositions = new Map<string, number>();

function keyOf(route: Pick<Route, 'pathname' | 'search'>): string {
  return route.pathname + route.search;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(readRoute);
  const routeRef = useRef(route);
  routeRef.current = route;
  /** `pop` — orqaga/oldinga; `push` — ilova ichidagi navigatsiya. */
  const lastNavigationRef = useRef<'push' | 'pop'>('push');

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      // Brauzerning oʻz tiklashi SPAʼda ishonchsiz: u scrollʼni DOM hali
      // toʻlmagan paytda tiklaydi va sahifa pastigacha yetib bormaydi.
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      /*
       * CHIQIB KETAYOTGAN sahifaning holatini AYNAN SHU YERDA saqlaymiz.
       *
       * Ilgari scroll faqat `navigate()` ichida saqlanardi, yaʼni faqat
       * ilova ichidagi bosishlarda. Brauzerning "orqaga" tugmasi esa
       * `navigate()` ni chetlab oʻtadi — natijada foydalanuvchi katalogda
       * pastga tushib, mahsulotni ochib, ORQAGA bosganda katalog eng
       * boshidan ochilardi (e-commerceʼdagi eng koʻp takrorlanadigan
       * harakat aynan shu).
       *
       * `scrollRestoration = 'manual'` boʻlgani uchun bu paytda brauzer
       * hali scroll qilmagan — `window.scrollY` hamon eski sahifaniki.
       */
      scrollPositions.set(keyOf(routeRef.current), window.scrollY);
      lastNavigationRef.current = 'pop';
      setRoute(readRoute());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /*
   * Sahifa almashgandan KEYIN scrollʼni tiklaymiz. `useEffect` DOM
   * yangilangandan soʻng ishlaydi, yaʼni sahifa balandligi allaqachon
   * toʻgʻri — shuning uchun tiklangan pozitsiya "yetib bormay" qolmaydi.
   */
  useEffect(() => {
    if (lastNavigationRef.current !== 'pop') {
      lastNavigationRef.current = 'push';
      return;
    }
    lastNavigationRef.current = 'push';

    const target = scrollPositions.get(keyOf(route)) ?? 0;
    if (target === 0) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }

    /*
     * Tiklashni bir necha kadr davomida QAYTA URINAMIZ.
     *
     * Sahifa mount boʻlgan payt mahsulotlar hali bazadan kelmagan boʻladi
     * — hujjat balandligi skeletonnikidek past. Bitta `scrollTo(2400)`
     * shu balandlikka QIRQILADI va foydalanuvchi kerakli joyga yetib
     * bormaydi. Shuning uchun mazmun kelib, balandlik yetarli boʻlgunicha
     * (yoki muddat tugagunicha) urinishni davom ettiramiz.
     *
     * Foydalanuvchi oʻzi scroll qilsa — darhol toʻxtaymiz: uning
     * harakatiga qarshi kurashish eng yomon variant.
     */
    let timer = 0;
    let aborted = false;
    const deadline = Date.now() + 1500;

    const stop = () => {
      aborted = true;
      clearTimeout(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };

    const attempt = () => {
      if (aborted) return;
      window.scrollTo({ top: target, left: 0, behavior: 'auto' });
      const reached = Math.abs(window.scrollY - target) < 2;
      if (reached || Date.now() > deadline) return stop();
      /*
       * `setTimeout`, `requestAnimationFrame` EMAS.
       *
       * Brauzer fondagi yorliqda rAF ni butunlay toʻxtatib qoʻyadi.
       * Foydalanuvchi mahsulotni yangi yorliqda ochib, keyin eskisiga
       * qaytsa, tiklash umuman ishlamay qolardi (sinovda aynan shu
       * holat kuzatildi). `setTimeout` esa fonda ham ishlaydi.
       */
      timer = window.setTimeout(attempt, 60);
    };

    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });
    attempt();

    return stop;
  }, [route]);

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const [rawPath, rawQuery = ''] = to.split('?');
    const nextPathname = normalizePathname(rawPath);
    const nextSearch = rawQuery ? `?${rawQuery}` : '';
    const current = routeRef.current;

    if (nextPathname === current.pathname && nextSearch === current.search) {
      // Aynan shu manzilga qayta bosildi (masalan logotip) — hech boʻlmaganda
      // tepaga qaytaramiz, shunda bosish javobsiz qolmaydi.
      if (!options?.preserveScroll) window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }

    // Joriy sahifadan chiqishdan oldin uning holatini eslab qolamiz.
    scrollPositions.set(keyOf(current), window.scrollY);

    const url = nextPathname + nextSearch;
    if (options?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);

    setRoute(readRoute());

    const samePage = nextPathname === current.pathname;
    if (!options?.preserveScroll && !samePage) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, []);

  const value = useMemo(() => ({ route, navigate }), [route, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

/* ── Link ────────────────────────────────────────────────────────────── */

type LinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  replace?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>;

export function Link({ to, children, className, onClick, replace, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        // Ctrl/Cmd/Shift-klik va oʻrta tugma brauzerga tegishli — ularni
        // ushlab qolsak "yangi tabda ochish" butunlay ishlamay qoladi.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to, { replace });
        onClick?.();
      }}
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
