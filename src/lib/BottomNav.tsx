import { Link, useRouter } from './router';
import { Home, LayoutGrid, Heart, ShoppingCart, User } from 'lucide-react';
import { useCart } from './cart';
import { useFavorites } from './favorites';
import { useAuth } from './auth';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedBadge } from './AnimatedNumber';
import { countBadge, cx, focusRingInset } from './design';
import { springs } from './motion';
import { CatalogCubes } from './CatalogCubes';
import { CatalogNavSheet } from './CatalogNavSheet';
import { useState } from 'react';

/*
 * Past boʻyli landshaft telefonlar uchun ixcham variant. Tailwind sinf
 * nomlarini manba matnidan TOʻLIQ HOLDA topadi, shuning uchun bu variantlar
 * shablon ichida yigʻilmaydi — pastda toʻgʻridan-toʻgʻri yozilgan.
 */

type NavItem = {
  icon: typeof Home;
  label: string;
  path: string;
  active: boolean;
  badge?: number;
};

/*
 * Element sinflari va ichki qismi ikki joyda kerak: katalog TUGMA,
 * qolganlari HAVOLA. Markup nusxalanmasligi uchun ular shu yerda
 * bir marta taʼriflanadi — aks holda ikki tarmoq vaqt oʻtishi bilan
 * bir-biridan farq qila boshlaydi.
 */
const navItemClass = cx(
  // gap-1: bead ikonka oʻramidan 4px chiqib turadi, shuning uchun
  // yorliqqa qoʻshimcha joy kerak.
  'relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 py-1.5',
  // Bosishga tezkor javob — mobil navigatsiyada hover yoʻq.
  'transition-transform duration-150 ease-standard active:scale-95',
  focusRingInset,
  '[@media(max-height:500px)_and_(orientation:landscape)]:min-h-0 [@media(max-height:500px)_and_(orientation:landscape)]:flex-row [@media(max-height:500px)_and_(orientation:landscape)]:gap-1.5 [@media(max-height:500px)_and_(orientation:landscape)]:py-1'
);

function NavIcon({ item, reduce }: { item: NavItem; reduce: boolean | null }) {
  return (
    <motion.span
      className={cx(
        'relative flex h-6 w-6 items-center justify-center',
        '[@media(max-height:500px)_and_(orientation:landscape)]:h-5 [@media(max-height:500px)_and_(orientation:landscape)]:w-5'
      )}
      // Faol element bir oz YUQORIGA koʻtariladi — "bead" panel yuzasidan
      // chiqib turgandek tuyuladi.
      animate={{ scale: item.active ? 1.04 : 1, y: item.active ? -2 : 0 }}
      transition={reduce ? { duration: 0 } : springs.snappy}
    >
      {/*
        BEAD — faol tabning belgisi. `layoutId` tufayli u tablar orasida
        siljiydi, shuning uchun almashish uzluksiz harakatga aylanadi.
        Nur uchun alohida `blur` qatlami yo'q — rangli `box-shadow`
        xuddi shu natijani beradi va qo'shimcha qatlam yaratmaydi.
      */}
      {item.active && (
        <motion.span
          layoutId="bottom-nav-bead"
          aria-hidden="true"
          className="absolute h-8 w-8 rounded-full bg-orange-600 shadow-[0_2px_10px_rgba(234,97,0,0.45)]"
          transition={reduce ? { duration: 0 } : springs.snappy}
        />
      )}

      {/*
        Katalog — imzoli o'zaro ta'sir: 4 ta kvadrat ikonkadan ajralib
        chiqadi. Qolgan tablar odatdagi lucide ikonkasida qoladi — agar
        HAR BIR tab o'z effektiga ega bo'lsa, hech biri imzoli bo'lmaydi.
      */}
      {item.path === '/catalog' ? (
        <span className="relative">
          <CatalogCubes active={item.active} />
        </span>
      ) : (
        <item.icon
          // `relative` shart: bead absolyut, ikonka undan keyin kelgani
          // uchun ustida chiziladi.
          className={cx('relative h-5 w-5 transition-colors', item.active ? 'text-white' : 'text-ink-400')}
          strokeWidth={item.active ? 2.3 : 1.9}
        />
      )}

      {item.badge ? (
        <AnimatedBadge value={item.badge} className={cx(countBadge.overlay, '-right-2.5 -top-1.5')} />
      ) : null}
    </motion.span>
  );
}

/*
 * PLATFORMA — faol tab OSTIDAGI yumshoq nur.
 *
 * Ikonka ortidagi "bead" allaqachon qaysi tab faolligini aytadi. Bu
 * qatlam boshqa savolga javob beradi: beadʼdan tushayotgan yorugʻlik
 * panel yuzasiga TUSHADI, yaʼni tab yuzadan biroz koʻtarilib turgandek
 * koʻrinadi. Aynan shu narsa panelga chuqurlik beradi.
 *
 * OʻZ `layoutId` i bor — bead bilan BIR XIL emas. Ikkalasi turli
 * balandlikda va turli kenglikda: bitta id berilsa Motion ularni bitta
 * element deb hisoblab, oʻrtada choʻzilgan oraliq holat chizardi.
 *
 * Nur `blur` bilan, alohida rangli soya bilan emas: bu yerda kerak
 * boʻlgani — aniq qirrasiz yumshoq dog', `box-shadow` esa har doim
 * oʻz shaklining konturini saqlaydi.
 */
function NavPlatform({ reduce }: { reduce: boolean | null }) {
  return (
    <motion.span
      layoutId="bottom-nav-platform"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-3 bottom-0.5 h-1.5 rounded-full bg-orange-500/60 blur-[4px]"
      transition={reduce ? { duration: 0 } : springs.snappy}
    />
  );
}

function NavLabel({ item }: { item: NavItem }) {
  return (
    <span
      className={cx(
        /*
          12px — shkaladagi eng kichik qadam (ilgari 10px, shkalada
          yoʻq qiymat).

          Rang ham oʻzgardi: `ink-400` oq fonda 2.6:1 berardi va bu
          ilovadagi eng koʻp koʻriladigan besh yozuv edi. `ink-600`
          bilan 7.5:1. Faol holat `orange-700` — `orange-600` oq
          fonda 3.4:1, yaʼni u ham oʻtmasdi.
        */
        'text-xs font-medium leading-none',
        item.active ? 'text-orange-700' : 'text-ink-600',
        '[@media(max-height:500px)_and_(orientation:landscape)]:hidden'
      )}
    >
      {item.label}
    </span>
  );
}

export function BottomNav() {
  const { route } = useRouter();
  const { count } = useCart();
  const { count: favCount } = useFavorites();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const name = route.match.name;
  const [catalogOpen, setCatalogOpen] = useState(false);

  const items = [
    { icon: Home, label: 'Bosh sahifa', path: '/', active: name === 'home' },
    { icon: LayoutGrid, label: 'Katalog', path: '/catalog', active: name === 'catalog' || name === 'category' },
    { icon: Heart, label: 'Sevimlilar', path: '/favorites', active: name === 'favorites', badge: favCount || undefined },
    { icon: ShoppingCart, label: 'Savat', path: '/cart', active: name === 'cart' || name === 'checkout', badge: count || undefined },
    {
      icon: User,
      label: 'Profil',
      path: user ? '/account' : '/login',
      active: name === 'account' || name === 'login',
    },
  ];

  return (
    <>
    <nav
      /*
       * `tab:hidden` — 820px dan boshlab header oʻzi toʻliq navigatsiya
       * beradi (savat, sevimlilar, profil), shuning uchun pastki panel
       * ortiqcha boʻlib qoladi va ekran balandligini bekorga yeydi.
       * Ilgari u 1023px gacha turardi.
       *
       * DIQQAT: bu chegara `<main>` dagi `tab:pb-0` va ProductPageʼdagi
       * yopishqoq CTA (`tab:hidden`) bilan BIRGA oʻzgarishi shart —
       * aks holda panel yoʻq joyda boʻsh joy qoladi yoki CTA havoda osilib
       * turadi.
       */
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-ink-200 bg-white/95 backdrop-blur-md tab:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Asosiy navigatsiya"
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          /*
           * KATALOG — havola emas, TUGMA.
           *
           * Qolgan tablar sahifaga oʻtadi; katalog esa toʻliq ekranli
           * navigatsiyani ochadi, chunki telefonda kategoriya tanlash
           * koʻp bosqichli jarayon va uni alohida sahifaga aylantirsak
           * har bosqich brauzer tarixiga tushib ketardi.
           *
           * Butun katalog sahifasiga oʻtish yoʻli yoʻqolmadi — u
           * varaqning pastida ("Butun katalogni koʻrish").
           */
          if (item.path === '/catalog') {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setCatalogOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={catalogOpen}
                aria-label="Katalog"
                aria-current={item.active ? 'page' : undefined}
                className={navItemClass}
              >
                {item.active && <NavPlatform reduce={reduce} />}
                <NavIcon item={item} reduce={reduce} />
                <NavLabel item={item} />
              </button>
            );
          }
          return (
          <Link
            key={item.label}
            to={item.path}
            /*
             * Mobilda uchish animatsiyalarining nishonlari. Headerʼdagi
             * nusxalari `tab` dan pastda yashiringan boʻladi va
             * `findVisibleTarget` aynan koʻrinib turganini tanlaydi.
             */
            {...(item.path === '/cart' ? { 'data-cart-target': '' } : {})}
            {...(item.path === '/favorites' ? { 'data-favorites-target': '' } : {})}
            aria-current={item.active ? 'page' : undefined}
            aria-label={item.badge ? `${item.label} (${item.badge} ta)` : item.label}
            className={navItemClass}
          >
            {item.active && <NavPlatform reduce={reduce} />}
            <NavIcon item={item} reduce={reduce} />
            <NavLabel item={item} />
          </Link>
          );
        })}
      </div>
    </nav>

      <CatalogNavSheet open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </>
  );
}
