import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { MapPin, Check, X } from 'lucide-react';
import { AnimatedDrawer } from './AnimatedPrimitives';
import { button, cx, focusRing } from './design';

/*
 * YETKAZIB BERISH MANZILI — header boshqaruvi.
 *
 * ── Nega brauzer geolokatsiyasi CHAQIRILMAYDI ──────────────────────
 *
 * Loyihada teskari geokodlash (koordinata → "Toshkent, Chilonzor")
 * mexanizmi YO'Q — tekshirildi: geocode/nominatim/mapbox/places
 * bo'yicha birorta ham moslik topilmadi. Koordinatani olish oson,
 * lekin uni odam o'qiydigan manzilga aylantirib bo'lmaydi.
 *
 * Koordinatani olib, uni xom holda ko'rsatish yoki saqlash esa
 * ataylab rad etildi: bu foydalanuvchiga hech narsa aytmaydi va
 * aniq joylashuvni keraksiz joyda saqlash demakdir.
 *
 * Shuning uchun asosiy yo'l — QO'LDA tanlash. Bu:
 *   • hech qanday tashqi xizmatga bog'liq emas,
 *   • mehmon foydalanuvchida ham ishlaydi,
 *   • `delivery.ts` dagi haqiqiy biznes mantiqqa aynan mos keladi
 *     (u faqat "Toshkentmi yoki yo'qmi" ni ajratadi).
 *
 * Geokoder qo'shilgan kunda — faqat shu faylga bitta funksiya
 * qo'shiladi, qolgan hamma narsa o'zgarishsiz qoladi.
 */

/** Yetkazib berish narxi faqat shu ikki holatni ajratadi (`delivery.ts`). */
const CITIES = [
  'Toshkent',
  'Samarqand',
  'Buxoro',
  'Andijon',
  'Fargʻona',
  'Namangan',
  'Qarshi',
  'Nukus',
  'Urganch',
  'Jizzax',
  'Navoiy',
  'Guliston',
  'Termiz',
] as const;

const STORAGE_KEY = 'openshop:delivery-city';

/*
 * ATAYLAB eksport qilinmagan. Hozircha uni faqat shu komponent
 * o'qiydi; eksport qilinsa bu fayl ham komponent, ham funksiya
 * eksport qilgan bo'lardi va Vite'ning Fast Refresh'i modul holatini
 * saqlay olmay qolardi (loyihada `uiHooks.ts` va `flightContext.ts`
 * aynan shu sabab alohida ajratilgan). Boshqa joyga kerak bo'lganda —
 * alohida modulga chiqariladi.
 */
function readDeliveryCity(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function LocationButton() {
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    setCity(readDeliveryCity());
  }, []);

  const choose = useCallback((next: string) => {
    setCity(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Shaxsiy rejimda `localStorage` bloklanishi mumkin — bu holda
         tanlov faqat shu sessiya davomida amal qiladi. */
    }
    setOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={city ? `Yetkazib berish manzili: ${city}. Oʻzgartirish` : 'Yetkazib berish manzilini tanlash'}
        className={cx(
          /*
           * `min-w-11` SHART, `h-11` yetarli emas.
           *
           * Shahar nomi `sm` dan pastda yashiriladi, shuning uchun 360px'da
           * tugma ichida faqat 20px ikonka qoladi va `px-2` bilan umumiy
           * kenglik 36px bo'lib qolardi (o'lchandi). Balandligi 44 bo'lsa
           * ham, 36px kenglik barmoq uchun minimal nishondan kichik.
           */
          'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-2 text-ink-700',
          'transition-[background-color,transform] duration-150 ease-standard hover:bg-ink-100 active:scale-95',
          focusRing
        )}
      >
        <MapPin className={cx('h-5 w-5 shrink-0', city ? 'text-orange-600' : 'text-ink-500')} />
        {/* Shahar nomi faqat joy yetganda — 360px'da ikonka yetarli. */}
        <span className="hidden max-w-[7rem] truncate text-sm font-medium sm:inline">
          {city ?? 'Manzil'}
        </span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            /*
              O'ram `AnimatePresence` DAN TASHQARIDA emas, chunki bu
              komponent butunlay o'zi boshqaradigan kichik qatlam; ammo
              `pointer-events` holatga bog'langan, shuning uchun yopilish
              animatsiyasi davomida ham sahifa bosiladigan bo'lib qoladi.
            */
            <div className="fixed inset-0 z-[75]">
              <AnimatedDrawer
                side="bottom"
                onClose={() => setOpen(false)}
                ariaLabel="Yetkazib berish manzili"
                panelClassName="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-surface bg-white shadow-overlay sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-80 sm:rounded-surface"
              >
                <div className="shrink-0 border-b border-ink-100 px-4 pb-3 pt-2.5">
                  <div className="mx-auto h-1 w-10 rounded-full bg-ink-200 sm:hidden" />
                  <div className="mt-3 flex items-center justify-between gap-2 sm:mt-0">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-ink-900">Yetkazib berish manzili</h2>
                      <p className="mt-0.5 text-xs text-ink-500">Shaharni tanlang — narx shunga qarab hisoblanadi.</p>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      aria-label="Yopish"
                      className={cx('-mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-400', focusRing)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                  {CITIES.map((c) => {
                    const active = c === city;
                    return (
                      <li key={c}>
                        <button
                          type="button"
                          onClick={() => choose(c)}
                          aria-current={active ? 'true' : undefined}
                          className={cx(
                            'flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-control px-3 text-left text-sm transition-colors',
                            active ? 'bg-orange-50 font-semibold text-orange-700' : 'text-ink-700 hover:bg-ink-50',
                            focusRing
                          )}
                        >
                          {c}
                          {active && <Check className="h-4 w-4 shrink-0 text-orange-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div
                  className="shrink-0 border-t border-ink-100 p-4"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  {/*
                    Doimiy saqlash mavjud `addresses` arxitekturasi orqali —
                    yangi jadval yoki ustun QO'SHILMAYDI.
                  */}
                  <a href="/account" className={cx(button('outline', 'md'), 'w-full')}>
                    Manzillarim
                  </a>
                </div>
              </AnimatedDrawer>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
