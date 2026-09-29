import { useEffect, useId, useRef, useState } from 'react';
import {
  Eye, EyeOff, ShoppingBag, ShieldCheck, Truck, ArrowLeft, ArrowRight,
  Send, User, Lock, Loader2, AlertCircle, Package, BadgeCheck,
} from 'lucide-react';
import { useAuth } from './auth';
import { useRouter, Link } from './router';
import { useSettings } from './settings';
import { useSeo } from './seo';
import { button, card, cx, focusRing, input } from './design';

const BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '') || 'openshop_bot';
const LAST_LOGIN_KEY = 'openshop-last-login';

/*
 * Kirish sahifasi.
 *
 * Saytda oʻz-oʻzidan roʻyxatdan oʻtish YOʻQ — hisob faqat Telegram bot
 * orqali (tasdiqlangan telefon raqami bilan) yoki Google akkaunti bilan
 * yaratiladi. Shu sababli sahifa "login/registratsiya" tablari oʻrniga
 * bitta aniq vazifaga qurilgan: KIRISH. Roʻyxatdan oʻtish esa alohida,
 * koʻrinarli blok sifatida beriladi va nima uchun aynan bot orqali
 * ekani qisqa tushuntiriladi — foydalanuvchi "roʻyxatdan oʻtish qani?"
 * deb qidirib qolmaydi.
 */
export function AuthPage() {
  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const { settings } = useSettings();

  const [login, setLogin] = useState(() => {
    try {
      return localStorage.getItem(LAST_LOGIN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({ login: false, password: false });

  const passwordId = useId();
  const loginId = useId();
  const errorId = useId();
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const storeName = settings?.store_name?.trim() || 'OpenShop';

  useSeo({
    title: 'Kirish',
    description: 'OpenShop hisobingizga kiring — buyurtmalaringizni kuzating va tezroq rasmiylashtiring.',
    noindex: true,
    canonicalPath: '/login',
  });

  // Allaqachon kirgan boʻlsa bu sahifada ushlab turmaymiz.
  useEffect(() => {
    if (!authLoading && user) navigate('/account', { replace: true });
  }, [authLoading, user, navigate]);

  // Saqlangan login boʻlsa kursor darhol parolga tushsin.
  useEffect(() => {
    const t = setTimeout(() => (login ? passwordRef : loginRef).current?.focus(), 120);
    return () => clearTimeout(t);
    // faqat mount paytida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginError = touched.login && !login.trim() ? 'Loginni kiriting' : '';
  const passwordError = touched.password && !password ? 'Parolni kiriting' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ login: true, password: true });
    setError('');

    if (!login.trim() || !password) {
      // Boʻsh maydonga fokusni qaytaramiz — foydalanuvchi qayerda
      // xatolik borligini qidirib oʻtirmasin.
      (!login.trim() ? loginRef : passwordRef).current?.focus();
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    const { error: err } = await signIn(login, password);
    setSubmitting(false);

    if (err) {
      setError(err);
      setPassword('');
      passwordRef.current?.focus();
      return;
    }

    try {
      localStorage.setItem(LAST_LOGIN_KEY, login.trim());
    } catch {
      // private-browsing — muhim emas
    }
    navigate('/account', { replace: true });
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError('');
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    // Muvaffaqiyatli boʻlsa brauzer Googleʼga ketadi va bu kod bajarilmaydi.
    if (err) {
      setError(err);
      setGoogleLoading(false);
    }
  };

  const busy = submitting || googleLoading;

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-2">
        {/* ── Brend paneli (desktop) ───────────────────────────── */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-600/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />

          <Link to="/" className={cx('relative flex items-center gap-2.5 text-xl font-bold', focusRing)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-orange-600">
              <ShoppingBag className="h-4.5 w-4.5" />
            </span>
            {storeName === 'OpenShop' ? (<>Open<span className="text-orange-500">Shop</span></>) : storeName}
          </Link>

          <div className="relative">
            <h2 className="text-display-md">
              Xaridni <span className="text-orange-500">osonlashtiramiz</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
              Hisobingiz bilan buyurtmalaringizni kuzatib boring, manzillaringizni saqlang va
              rasmiylashtirishni bir necha soniyada yakunlang.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-white/80">
              <li className="flex items-center gap-2.5">
                <Package className="h-4.5 w-4.5 shrink-0 text-orange-500" /> Buyurtma holati real vaqtda
              </li>
              <li className="flex items-center gap-2.5">
                <Truck className="h-4.5 w-4.5 shrink-0 text-orange-500" /> Toshkent boʻylab 1 kunda yetkazib berish
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-orange-500" /> Rasmiy kafolat va 14 kunlik qaytarish
              </li>
            </ul>
          </div>

          <p className="relative text-xs text-white/40">© {new Date().getFullYear()} {storeName}</p>
        </aside>

        {/* ── Forma ────────────────────────────────────────────── */}
        {/*
          `id="main"` — sayt bo'ylab yagona "asosiy mazmun" langari.
          Boshqa maketlar (App.tsx dagi shell va FocusedShell) ham aynan
          shu id'ni ishlatadi; kirish sahifasida u yo'q edi, ya'ni
          `#main` ga ishora qiluvchi havolalar bu yerda hech qayerga
          olib bormasdi.
        */}
        <main id="main" className="flex flex-col justify-center bg-white px-5 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto w-full max-w-sm">
            <Link
              to="/"
              className={cx('mb-7 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-500 hover:text-orange-700 lg:hidden', focusRing)}
            >
              <ArrowLeft className="h-4 w-4" /> Bosh sahifa
            </Link>

            <h1 className="text-display-sm">Hisobingizga kiring</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              Telegram botda tanlagan login va parolingiz bilan.
            </p>

            {/* Xato — bitta joyda, ekran o'quvchiga ham e'lon qilinadi */}
            {error && (
              <div
                id={errorId}
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-control border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
              <div>
                <label htmlFor={loginId} className="mb-1.5 block text-xs font-medium text-ink-600">
                  Login
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    ref={loginRef}
                    id={loginId}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, login: true }))}
                    placeholder="masalan: alibek"
                    aria-invalid={!!loginError}
                    aria-describedby={error ? errorId : undefined}
                    className={input(!!loginError, 'pl-10')}
                  />
                </div>
                {loginError && <p className="mt-1.5 text-xs font-medium text-red-600">{loginError}</p>}
              </div>

              <div>
                <label htmlFor={passwordId} className="mb-1.5 block text-xs font-medium text-ink-600">
                  Parol
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    ref={passwordRef}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    aria-invalid={!!passwordError}
                    aria-describedby={error ? errorId : undefined}
                    className={input(!!passwordError, 'pl-10 pr-12')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Parolni yashirish' : 'Parolni koʻrsatish'}
                    className={cx('absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-control text-ink-400 hover:text-ink-700', focusRing)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && <p className="mt-1.5 text-xs font-medium text-red-600">{passwordError}</p>}
              </div>

              <button type="submit" disabled={busy} aria-busy={submitting} className={cx(button('primary', 'lg'), 'w-full')}>
                {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Kirilmoqda…</>) : 'Kirish'}
              </button>
            </form>

            {/* Parolni unutganlar uchun — bot orqali tiklanadi */}
            <p className="mt-3 text-center text-xs text-ink-500">
              Parolni unutdingizmi?{' '}
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noreferrer noopener"
                className={cx('rounded-sm font-semibold text-orange-700 hover:text-orange-800', focusRing)}
              >
                Bot orqali tiklang
              </a>
            </p>

            {/* Ajratgich */}
            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-ink-200" />
              <span className="text-xs font-medium text-ink-400">yoki</span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              aria-busy={googleLoading}
              className={cx(button('outline', 'lg'), 'w-full')}
            >
              {googleLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Google ochilmoqda…</>
              ) : (
                <><GoogleMark /> Google bilan davom etish</>
              )}
            </button>

            {/* ── Ro'yxatdan o'tish: bot orqali ─────────────────── */}
            <section className={cx(card, 'mt-6 overflow-hidden')} aria-labelledby="register-heading">
              <div className="flex items-start gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-sky-50 text-sky-600">
                  <Send className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="register-heading" className="text-sm font-semibold text-ink-900">
                    Hisobingiz yoʻqmi?
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Roʻyxatdan oʻtish Telegram bot orqali — bir daqiqada. Bot sizga login va
                    parol beradi, shu bilan saytga kirasiz.
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 border-t border-ink-100 px-4 py-3 text-xs text-ink-600">
                <li className="flex items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Telefon raqamingiz Telegram orqali tasdiqlanadi
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Buyurtma holati botga ham xabar qilib turiladi
                </li>
              </ul>

              <div className="border-t border-ink-100 p-3">
                <a
                  href={`https://t.me/${BOT_USERNAME}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cx(
                    /*
                      ── KOʻK FAQAT IKONKADA ────────────────────────────
                      Fon `sky-500` + oq matn = 2.77:1 (oʻlchandi) — AA
                      4.5:1 talab qiladi. Bu esa roʻyxatdan oʻtishning
                      YAGONA yoʻli, yaʼni sahifadagi eng muhim tugma.

                      Endi fon `ink-900` (oq matn bilan 17.9:1) va
                      Telegram koʻki ikonkada qoladi — brend tanilishi
                      saqlanadi, matn esa oʻqiladi. Ikonka MAʼLUMOT
                      tashimaydi (matn yonida), shuning uchun unga
                      matn kontrasti qoidasi tegishli emas.
                    */
                    'flex h-12 w-full items-center justify-center gap-2 rounded-control bg-ink-900 text-sm font-semibold text-white transition-colors hover:bg-ink-800',
                    focusRing
                  )}
                >
                  <Send className="h-4 w-4 text-sky-400" />
                  Telegram bot orqali roʻyxatdan oʻtish
                  <ArrowRight className="h-4 w-4" />
                </a>
                <p className="mt-2 text-center text-xs text-ink-600">@{BOT_USERNAME}</p>
              </div>
            </section>

            <p className="mt-5 text-center text-xs leading-relaxed text-ink-600">
              Davom etish orqali siz{' '}
              <Link to="/returns" className={cx('rounded-sm underline hover:text-ink-600', focusRing)}>
                xizmat shartlari
              </Link>
              ga rozilik bildirasiz.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Googleʼning rasmiy koʻp rangli "G" belgisi. */
function GoogleMark() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
