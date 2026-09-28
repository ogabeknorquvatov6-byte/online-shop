import { Link } from './router';
import { useSettings } from './settings';
import { Instagram, Send, Facebook, Youtube, Phone, Mail, MapPin, ShoppingBag, Truck, ShieldCheck, RotateCcw } from 'lucide-react';
import { cx, focusRing, shell } from './design';

const COLUMNS = [
  {
    title: 'Do‘kon',
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
      { label: 'Ko‘p so‘raladigan savollar', path: '/faq' },
      { label: 'Aloqa', path: '/contact' },
    ],
  },
];

const GUARANTEES = [
  { icon: Truck, text: 'Toshkent bo‘ylab 1 kunda' },
  { icon: ShieldCheck, text: 'Rasmiy kafolat' },
  { icon: RotateCcw, text: '14 kun ichida qaytarish' },
];

export function Footer() {
  const { settings } = useSettings();
  const storeName = settings?.store_name?.trim() || 'OpenShop';

  const socials = [
    { url: settings?.instagram_url, icon: Instagram, label: 'Instagram' },
    { url: settings?.telegram_url, icon: Send, label: 'Telegram' },
    { url: settings?.facebook_url, icon: Facebook, label: 'Facebook' },
    { url: settings?.youtube_url, icon: Youtube, label: 'YouTube' },
  ].filter((s): s is { url: string; icon: typeof Instagram; label: string } => !!s.url?.trim());

  return (
    <footer className="mt-16 border-t border-ink-200 bg-white lg:mt-20">
      {/* Kafolat lentasi — pastki navigatsiyadan oldingi oxirgi ishonch signali */}
      <div className="border-b border-ink-100 bg-ink-50/60">
        <div className={cx(shell, 'grid grid-cols-1 gap-3 py-5 sm:grid-cols-3')}>
          {GUARANTEES.map((g) => (
            <div key={g.text} className="flex items-center gap-2.5 text-sm text-ink-600">
              <g.icon className="h-4.5 w-4.5 shrink-0 text-orange-600" />
              {g.text}
            </div>
          ))}
        </div>
      </div>

      <div className={cx(shell, 'py-10 lg:py-14')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-8">
          <div className="col-span-2 lg:col-span-2">
            <Link to="/" className={cx('inline-flex items-center gap-2 rounded-control text-xl font-bold text-ink-900', focusRing)}>
              <span className="flex h-8 w-8 items-center justify-center rounded-control bg-orange-600 text-white">
                <ShoppingBag className="h-4 w-4" />
              </span>
              {storeName === 'OpenShop' ? (<>Open<span className="text-orange-600">Shop</span></>) : storeName}
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
              Texnika va kundalik hayot uchun kerakli mahsulotlar. Rasmiy kafolat, halol narx va
              butun O‘zbekiston bo‘ylab yetkazib berish.
            </p>

            <div className="mt-5 space-y-2.5 text-sm">
              {settings?.phone && (
                <a
                  href={`tel:${settings.phone.replace(/\s/g, '')}`}
                  className={cx('flex items-center gap-2.5 rounded-sm text-ink-700 hover:text-orange-700', focusRing)}
                >
                  <Phone className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="font-medium">{settings.phone}</span>
                </a>
              )}
              {settings?.email && (
                <a
                  href={`mailto:${settings.email}`}
                  className={cx('flex items-center gap-2.5 rounded-sm text-ink-700 hover:text-orange-700', focusRing)}
                >
                  <Mail className="h-4 w-4 shrink-0 text-ink-400" />
                  {settings.email}
                </a>
              )}
              {settings?.address && (
                <p className="flex items-start gap-2.5 text-ink-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
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
                      'flex h-10 w-10 items-center justify-center rounded-control border border-ink-200 text-ink-500 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700',
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
                  bo'lishi kerak, aks holda barmoq bilan tegish qiyin. Shuning
                  uchun havolalar mobil ko'rinishda blok bo'lib cho'ziladi va
                  ular orasidagi bo'shliq yopiladi (balandlikning o'zi ritm
                  beradi). md+ da sichqoncha aniqroq — ixcham ro'yxatga qaytadi. */}
              <ul className="mt-3.5 space-y-0.5 md:mt-3.5 md:space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.path}>
                    <Link
                      to={l.path}
                      className={cx(
                        'flex min-h-11 items-center rounded-sm text-sm text-ink-500 hover:text-orange-700',
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

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-ink-100 pt-6 text-xs text-ink-400 sm:flex-row">
          <p>© {new Date().getFullYear()} {storeName}. Barcha huquqlar himoyalangan.</p>
          <p>To‘lov: naqd pul, Click, Payme</p>
        </div>
      </div>
    </footer>
  );
}
