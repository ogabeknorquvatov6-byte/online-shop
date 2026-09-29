import { Link } from './router';
import { useSettings } from './settings';
import {
  Instagram, Send, Facebook, Youtube, Phone, Mail, MapPin, Truck, ShieldCheck, RotateCcw,
} from 'lucide-react';
import { cx, focusRing, glassBand, shell } from './design';

const BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '') || '';

const COLUMNS = [
  {
    title: 'Doʻkon',
    links: [
      { label: 'Katalog', path: '/catalog' },
      { label: 'Aksiyalar', path: '/promotions' },
      { label: 'Yangi mahsulotlar', path: '/new' },
      { label: 'Xit sotuvlar', path: '/bestsellers' },
    ],
  },
  {
    title: 'Mijozlarga',
    links: [
      { label: 'Mening profilim', path: '/account' },
      { label: 'Buyurtmalarim', path: '/account/orders' },
      { label: 'Sevimlilar', path: '/favorites' },
      { label: 'Savat', path: '/cart' },
    ],
  },
  {
    title: 'Yordam',
    links: [
      { label: 'Yetkazib berish', path: '/delivery' },
      { label: 'Qaytarish siyosati', path: '/returns' },
      { label: 'Koʻp soʻraladigan savollar', path: '/faq' },
      { label: 'Aloqa', path: '/contact' },
    ],
  },
];

/*
 * Kafolat plitkalari — footerning ENG TEPASIDA.
 *
 * Ular bosh sahifadagi ishonch plitkalari bilan bir xil vaʼdani
 * takrorlaydi, lekin boshqa lahzada: u yerda xarid BOSHLANISHIDA, bu
 * yerda esa foydalanuvchi sahifani oxirigacha koʻrib chiqqanda. Matn
 * `staticPages.ts` dagi siyosatdan.
 */
const GUARANTEES = [
  { icon: Truck, title: 'Toshkentda 1 kunda', sub: 'Viloyatlarga 2–3 kun' },
  { icon: RotateCcw, title: '14 kun ichida qaytarish', sub: 'Original qadoq bilan' },
  { icon: ShieldCheck, title: 'Rasmiy kafolat', sub: 'Ishlab chiqaruvchi taloni bilan' },
];

/** Logotip belgisi — brendning 2×2 kub motivi. */
function LogoMark() {
  return (
    <span aria-hidden="true" className="relative flex h-[30px] w-[30px] shrink-0 rounded-control bg-orange-600">
      <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-[2px] bg-white" />
      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-[2px] bg-white" />
      <span className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-[2px] bg-white" />
      <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-[2px] bg-white" />
    </span>
  );
}

export function Footer() {
  const { settings } = useSettings();
  const storeName = settings?.store_name?.trim() || 'OpenShop';

  const socials = [
    { url: settings?.instagram_url, icon: Instagram, label: 'Instagram' },
    { url: settings?.telegram_url, icon: Send, label: 'Telegram' },
    { url: settings?.facebook_url, icon: Facebook, label: 'Facebook' },
    { url: settings?.youtube_url, icon: Youtube, label: 'YouTube' },
  ].filter((s): s is { url: string; icon: typeof Instagram; label: string } => !!s.url?.trim());

  /*
   * Telegram tugmasi FAQAT bot nomi sozlangan boʻlsa.
   *
   * `VITE_TELEGRAM_BOT_USERNAME` boʻsh boʻlsa havola `t.me/` ga olib
   * borardi — yaʼni hech qayerga. Maʼlumoti yoʻq element umuman
   * chizilmaydi (dizayn qoidasi).
   */
  const botUrl = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : null;

  return (
    /*
      ── FOOTER OCHIQ SHISHA ───────────────────────────────────────
      Bosh sahifadagi ikkita tasma (aksiya, "Hozir trendda") bilan
      AYNI yuza. Sahifa oxirигacha bitta materialda qoladi: ochiq,
      iliq, shisha qirrali.

      Ajralish rangdan emas, QIRRADAN keladi — tepadagi ingichka
      chiziq va gradient. Shu sababli footer sahifani "kesib"
      tashlamaydi, lekin kontent tugaganini aniq bildiradi.
    */
    <footer className={cx(glassBand, 'mt-12 text-ink-700 md:mt-16')}>
      <div className={cx(shell, 'py-10 lg:py-14')}>
        {/* Kafolatlar */}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {GUARANTEES.map((g) => (
            <li
              key={g.title}
              className="flex items-center gap-3 rounded-card border border-white/70 bg-white/70 p-3.5 shadow-glass backdrop-blur-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                <g.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 text-sm leading-snug">
                <b className="block font-semibold text-ink-900">{g.title}</b>
                <span className="text-ink-600">{g.sub}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-8">
          <div className="col-span-2">
            <Link
              to="/"
              className={cx('inline-flex items-center gap-2.5 rounded-control text-xl font-bold text-ink-900', focusRing)}
            >
              <LogoMark />
              {storeName === 'OpenShop' ? (
                <>Open<span className="text-orange-700">Shop</span></>
              ) : (
                storeName
              )}
            </Link>

            <p className="mt-3 max-w-[19rem] text-sm leading-relaxed text-ink-600">
              Elektronika va maishiy texnika — rasmiy kafolat bilan, Toshkent boʻylab 1 kunda.
            </p>

            {botUrl && (
              <a
                href={botUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={cx(
                  'mt-4 inline-flex h-11 items-center gap-2 rounded-control bg-ink-900 px-4 text-sm font-semibold text-white',
                  'transition-colors hover:bg-ink-800',
                  focusRing
                )}
              >
                {/* Koʻk FAQAT ikonkada — oq fon ustidagi koʻk matn
                    kontrastdan oʻtmasdi (kirish sahifasi bilan ayni qoida). */}
                <Send className="h-4.5 w-4.5 text-sky-400" aria-hidden="true" />
                Telegram bot
              </a>
            )}

            <div className="mt-5 space-y-2.5 text-sm">
              {settings?.phone && (
                <a
                  href={`tel:${settings.phone.replace(/\s/g, '')}`}
                  className={cx('flex items-center gap-2.5 rounded-sm text-ink-700 hover:text-orange-700', focusRing)}
                >
                  <Phone className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
                  <span className="font-medium">{settings.phone}</span>
                </a>
              )}
              {settings?.email && (
                <a
                  href={`mailto:${settings.email}`}
                  className={cx('flex items-center gap-2.5 rounded-sm text-ink-700 hover:text-orange-700', focusRing)}
                >
                  <Mail className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
                  {settings.email}
                </a>
              )}
              {settings?.address && (
                <p className="flex items-start gap-2.5 text-ink-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
                  {settings.address}
                </p>
              )}
            </div>

            {socials.length > 0 && (
              <div className="mt-5 flex gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={s.label}
                    className={cx(
                      'flex h-11 w-11 items-center justify-center rounded-control border border-ink-200 bg-white/70 text-ink-600',
                      'transition-colors hover:border-orange-300 hover:text-orange-700',
                      focusRing
                    )}
                  >
                    <s.icon className="h-4.5 w-4.5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-sm font-semibold text-ink-900">{col.title}</h2>
              {/* Touch-first: telefonda har bir havola kamida 44px balandlikda
                  boʻlishi kerak, aks holda barmoq bilan tegish qiyin. md+ da
                  sichqoncha aniqroq — ixcham roʻyxatga qaytadi. */}
              <ul className="mt-3 space-y-0.5 md:mt-3.5 md:space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.path}>
                    <Link
                      to={l.path}
                      className={cx(
                        'flex min-h-11 items-center rounded-sm text-sm text-ink-600 hover:text-orange-700',
                        'md:block md:min-h-0',
                        focusRing
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-ink-200 pt-6 text-xs text-ink-600 sm:flex-row">
          <p>© {new Date().getFullYear()} {storeName}. Barcha huquqlar himoyalangan.</p>
          <p>Toʻlov: naqd pul, Click, Payme</p>
        </div>
      </div>
    </footer>
  );
}
