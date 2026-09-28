import { Link } from './router';
import { createPortal } from 'react-dom';
import { Heart, ShoppingCart, Check, WifiOff, RotateCw, Plus, Star, Eye, TrendingUp } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { Product } from './types';
import { formatPrice, discountPercent, hasSellablePrice } from './types';
import { useCart } from './cart';
import { useFavorites } from './favorites';
import { useToast } from './toast';
import { AnimatedButton, StaggerGroup, StaggerItem, ResponsiveModal } from './AnimatedPrimitives';
import { Img } from './Img';
import { DURATION, EASE, SHINE, TILT, springOptions } from './motion';
import { button, card, cx, discountBadge, focusRing, glassPanel, skeleton } from './design';
import { socialProof, stockState } from './productUtils';
import { useFlight } from './flightContext';

export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const { addItem } = useCart();
  const { toggle, isFavorite } = useFavorites();
  const { notify } = useToast();
  const reduce = useReducedMotion();
  const fly = useFlight();
  const [added, setAdded] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  /*
   * Sevimliga qo'shilganda bir marta chiqadigan halqa. Hisoblagich —
   * boolean emas: ketma-ket bosilganda animatsiya qayta boshlanishi
   * uchun `key` har safar yangi bo'lishi kerak.
   */
  const [favPulse, setFavPulse] = useState(0);
  /*
   * Uchish boshlanadigan nuqtalar.
   *
   * `mediaRef` — mahsulot rasmi: savatga AYNAN mahsulot tushadi.
   * `favBtnRef` — yurakcha tugmasi: sevimlilarga AYNAN yurakcha uchadi.
   * Ikki harakat ikki xil joydan boshlanadi va shu sababli ular
   * bir-biriga o'xshamaydi.
   */
  const mediaRef = useRef<HTMLDivElement>(null);
  const favBtnRef = useRef<HTMLButtonElement>(null);

  /*
   * ── KARTANING 3D BURILISHI ────────────────────────────────────────
   *
   * Nishon qiymatlar oddiy motion value'da turadi va ular prujina
   * orqali o'qiladi. Ya'ni bitta mexanizm ikkita ishni bajaradi:
   * kuzatishda kichik "kechikish" (karta og'ir jismdek his qilinadi)
   * va qo'yib yuborilganda `springs.snappy` bilan joyiga qaytish.
   * Alohida "qaytish" animatsiyasi yozish shart emas — nishonni 0 ga
   * qo'yish kifoya.
   *
   * REACT RENDERI YO'Q: `motion value` to'g'ridan-to'g'ri DOM'ga
   * yoziladi. Katalogda 40 ta karta bo'lishi mumkin — har bir
   * `pointermove` da setState chaqirilsa sahifa qotib qolardi.
   */
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, springOptions.snappy);
  const rotateY = useSpring(tiltY, springOptions.snappy);

  const tiltFrom = (el: HTMLElement, clientX: number, clientY: number) => {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    // Markazga nisbatan −0.5 … +0.5 oralig'i.
    const dx = (clientX - r.left) / r.width - 0.5;
    const dy = (clientY - r.top) / r.height - 0.5;
    // Kursor TEPADA bo'lsa karta tepasi orqaga egilishi kerak, ya'ni
    // `rotateX` ishorasi `dy` ga teskari. Aks holda harakat "noto'g'ri
    // tomonga" ketayotgandek tuyuladi.
    tiltX.set(-dy * 2 * TILT.max);
    tiltY.set(dx * 2 * TILT.max);
  };
  const tiltRest = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  const image = product.product_images?.[0]?.image_url;
  const discount = discountPercent(product.price, product.old_price);
  const stock = stockState(product.stock);
  // Narxi belgilanmagan mahsulotni savatga qo'shib bo'lmaydi — aks holda
  // mijoz "0 so'm" ga buyurtma bermoqchi bo'lib, serverdan xato oladi.
  const purchasable = hasSellablePrice(product.price);
  const inStock = stock !== 'out' && purchasable;
  const fav = isFavorite(product.id);

  const handleAdd = () => {
    if (!inStock) return;
    // Savat holati DARHOL yangilanadi — animatsiya hech narsani kutmaydi.
    addItem(product);
    setAdded(true);
    fly('cart', mediaRef.current, image);
    notify(`${product.name} savatga qoʻshildi`, 'success');
    setTimeout(() => setAdded(false), 1400);
  };

  const handleFav = () => {
    // Mukofot faqat QO'SHILGANDA. Olib tashlash — neytral harakat va
    // uni nishonlash noto'g'ri signal berardi.
    if (!fav) {
      if (!reduce) setFavPulse((n) => n + 1);
      fly('fav', favBtnRef.current);
    }
    // Holat animatsiyadan MUSTAQIL — u darhol o'zgaradi.
    toggle(product.id);
    notify(fav ? 'Sevimlilardan olib tashlandi' : 'Sevimlilarga qoʻshildi', 'info');
  };

  return (
    /*
     * ── TILT QATLAMI ─────────────────────────────────────────────────
     *
     * Burilish AYNAN shu tashqi qatlamda, `<article>` da emas.
     *
     * Sabab: karta hover'da 4px ko'tariladi va bu Tailwind sinfi bilan
     * qilingan (`xl:hover:-translate-y-1`). Motion esa transformni
     * INLINE `style` ga yozadi, inline style esa sinfdan ustun —
     * ya'ni burilishni `<article>` ga qo'ysak, ko'tarilish jimgina
     * o'lardi. Ikki qatlamda ikkala transform bir-biriga qo'shiladi:
     * tashqisi buradi, ichkisi ko'taradi.
     *
     * `transformPerspective` — alohida `perspective` beruvchi ota
     * element yaratmaslik uchun: Motion uni elementning O'Z
     * transformiga qo'shadi. Bitta qo'shimcha div yetarli.
     *
     * SENSORLI QURILMADA barmoq KUZATILMAYDI, faqat bosish payti
     * burchak olinadi. Katalogda barmoqning harakati deyarli har doim
     * SCROLL — uni kuzatsak, ro'yxatni surganda kartalar qiyshayib
     * ketardi. Bosilganda esa burilish "bosdim" degan javob bo'ladi;
     * scroll boshlansa brauzer `pointercancel` yuboradi va karta
     * prujina bilan joyiga qaytadi.
     */
    <motion.div
      className="h-full"
      style={reduce ? undefined : { transformPerspective: TILT.perspective, rotateX, rotateY }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch') tiltFrom(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') tiltFrom(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerUp={tiltRest}
      onPointerCancel={tiltRest}
      onPointerLeave={tiltRest}
    >
      {/*
        Kartaning butun yuzasi ilgari bitta <a> ichida edi, sevimli va savat
        tugmalari esa uning ICHIDA turardi. Bu HTML jihatdan noto'g'ri
        (interaktiv element havola ichida) va skrinriderlar uchun chalkash.
        Endi karta — oddiy <article>, havola esa faqat rasm/matnni qoplaydigan
        "stretched link", tugmalar undan yuqorida (z-10) alohida turadi.
      */}
      <article
        className={cx(
          card,
          'group relative flex h-full flex-col overflow-hidden',
          // Chuqurlik: karta hover'da BIR OZ ko'tariladi va soyasi kuchayadi.
          // `-translate-y-1` — atigi 4px; maqsad "sakrash" emas, qo'lga
          // olinadigandek his. Transform faqat `xl` da (sichqoncha bor joyda),
          // shuning uchun sensorli qurilmalarda hech qanday qo'shimcha
          // kompozitsiya qatlami yaratilmaydi.
          'transition-[border-color,box-shadow,transform] duration-200 ease-standard',
          'hover:border-ink-300 hover:shadow-card xl:hover:-translate-y-1 xl:hover:shadow-overlay',
          'focus-within:border-orange-300 focus-within:shadow-card',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0'
        )}
      >
        <div className="relative" ref={mediaRef}>
          {/*
            Skeleton, xato holati va lazy-loading `Img` ichida — shu sababli
            bu yerda uchta alohida holat kuzatilmaydi. `sizes` brauzerga
            kartaning haqiqiy kengligini aytadi: mobilda ekranning yarmi,
            desktopda grid ustuni.
          */}
          <Img
            src={image}
            alt={product.name}
            priority={priority}
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            fallbackLabel="Rasm yoʻq"
            className="aspect-square"
            imgClassName={cx(
              'object-cover transition-transform duration-300 ease-standard',
              !reduce && 'group-hover:scale-[1.04]',
              !inStock && 'opacity-60 saturate-[0.35]'
            )}
          />

          {/*
            ── BIR MARTALIK YORUG'LIK ────────────────────────────────────
            Karta ekranga BIRINCHI MARTA kirganda rasm ustidan diagonal
            nur sirg'alib o'tadi — "yangi tovar yoritildi" degan qisqa
            ishora. `once: true`, ya'ni scroll qilib qaytganda takrorlanmaydi
            va katalog "chaqnab" turmaydi.

            Element rasm qutisi bilan bir xil o'lchamda va `x` −100% dan
            +100% gacha suriladi — shuning uchun nur butun kenglikni
            KAFOLATLI kesib o'tadi. Agar element rasmdan tor bo'lganda
            foizlar O'Z eniga nisbatan hisoblanib, nur o'rtada to'xtab
            qolardi.

            Chetga chiqqan qismini `<article>` dagi `overflow-hidden`
            kesadi — qo'shimcha kesuvchi qatlam kerak emas.

            `opacity` UMUMAN animatsiya qilinmaydi va bu ataylab:
            boshida ham, oxirida ham element rasm qutisidan butunlay
            tashqarida, ya'ni allaqachon ko'rinmaydi. Yumshoq kirish va
            chiqish gradientning O'ZIDAN keladi — chetlari shaffof
            (38% va 62%). Bitta animatsiya qilinadigan qiymat yetarli
            bo'lsa, ikkinchisini qo'shishning ma'nosi yo'q.

            Diagonal burchak ham gradientda (105deg): `rotate` bilan
            qilinsa, Motion uni `x` bilan bitta transformga birlashtirib,
            nurning yo'nalishini ham burib yuborardi.
          */}
          {!reduce && (
            <motion.span
              aria-hidden="true"
              initial={{ x: '-100%' }}
              whileInView={{ x: '100%' }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: SHINE.duration, delay: SHINE.delay, ease: SHINE.ease }}
              className="pointer-events-none absolute inset-0 z-[1] block"
              style={{
                backgroundImage:
                  'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)',
              }}
            />
          )}

          {/* Nishonchalar — chapdan pastga, hech qachon bir-birining ustiga tushmaydi */}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
            {discount != null && <span className={discountBadge('sm')}>−{discount}%</span>}
            {product.is_new && discount == null && (
              <span className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[11px] font-semibold leading-5 text-white">
                Yangi
              </span>
            )}
          </div>

          {!inStock && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink-900/70 py-1.5 text-center text-[11px] font-semibold text-white backdrop-blur-[2px]">
              {purchasable ? 'Sotuvda yoʻq' : 'Narxi aniqlanmagan'}
            </div>
          )}

          <motion.button
            ref={favBtnRef}
            type="button"
            onClick={handleFav}
            whileTap={reduce ? undefined : { scale: 0.85 }}
            transition={{ duration: DURATION.micro, ease: EASE.standard }}
            aria-pressed={fav}
            aria-label={fav ? `${product.name} — sevimlilardan olib tashlash` : `${product.name} — sevimlilarga qoʻshish`}
            className={cx(
              /*
               * TEGINISH MAYDONI 44px, KO'RINADIGAN DOIRA esa 32px.
               *
               * Bu ikkisi ilgari bitta element edi: 44px'lik oq doira
               * kartochka rasmi ustida turardi. Haqiqiy brauzerda ko'rilganda
               * (390px, katalog) u kartochkadagi ENG BALAND ovozli element
               * bo'lib chiqdi — mahsulot rasmidan ham ko'zga tashlanardi.
               *
               * Yechim ikkalasini ajratish: tugmaning O'ZI shaffof va
               * 44px (barmoq uchun), ichidagi doira esa 32px (ko'z uchun).
               * Ya'ni qulaylik ham, vizual xotirjamlik ham saqlanadi —
               * biri ikkinchisiga qurbon qilinmaydi.
               */
              'absolute right-0.5 top-0.5 z-10 flex h-11 w-11 items-center justify-center rounded-full xl:right-1 xl:top-1 xl:h-10 xl:w-10',
              focusRing,
              // DIQQAT: "hover bo'lganda ko'rinadi" faqat `xl` dan boshlanadi.
              //
              // Bu qoida ikki marta tuzatilgan. Avval u `sm` (640px) da
              // edi — o'shanda BARCHA planshetlarda tugma ko'rinmay
              // qolgandi. Keyin `lg` (1024px) ga ko'chirildi — lekin
              // 1024px hamon sensorli (iPad Pro landscape). Endi `xl`:
              // hover'ga bog'liq bezak faqat sichqoncha deyarli aniq
              // bo'lgan kenglikda yoqiladi. Hover hech qachon yagona
              // yo'l emas.
              !fav && 'xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100'
            )}
          >
            {/* Ko'rinadigan qism — 32px. Soya yumshatilgan: rasm ustidagi
                element o'zini eslatib tursin, lekin baqirmasin. */}
            <span
              className={cx(
                'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200',
                fav
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white/85 text-ink-500 shadow-[0_1px_3px_rgba(23,20,17,0.18)] backdrop-blur-sm group-hover:text-orange-600'
              )}
            >
              <Heart className={cx('h-4 w-4', fav && 'fill-current')} />

              {/*
                Bitta kengayuvchi halqa — "qabul qilindi" degan qisqa tasdiq.
                Zarrachalar (particles) ATAYLAB yo'q: ular bu o'lchamdagi
                tugmada shovqin bo'lib qolardi va har bosishda takrorlanadi.
                Halqa `pointer-events-none` va 420ms ichida yo'qoladi.
                Endi u KO'RINADIGAN doira bilan bir xil o'lchamda.
              */}
              <AnimatePresence>
                {favPulse > 0 && (
                  <motion.span
                    key={favPulse}
                    aria-hidden="true"
                    initial={{ opacity: 0.55, scale: 0.6 }}
                    animate={{ opacity: 0, scale: 1.9 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.42, ease: EASE.standard }}
                    className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-orange-500"
                  />
                )}
              </AnimatePresence>
            </span>
          </motion.button>

          {/*
            TEZKOR KO'RISH — faqat `xl` (1280px+) da.

            Planshet va telefonda ATAYLAB yo'q: u yerda hover yo'q va
            tugma doim ochiq turishi kerak bo'lardi — bu esa kartani
            chalkashtiradi. Sensorli qurilmada mahsulot sahifasiga
            to'g'ridan-to'g'ri o'tish baribir tezroq.

            Klaviatura uchun `focus-visible` bilan ham ochiladi, ya'ni
            funksiya faqat sichqonchaga bog'liq emas.
          */}
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${product.name} — tezkor koʻrish`}
            className={cx(
              'absolute inset-x-2 bottom-2 z-10 hidden h-9 items-center justify-center gap-1.5 rounded-control',
              'bg-white/95 text-xs font-semibold text-ink-800 shadow-card backdrop-blur-sm',
              'transition-[opacity,transform] duration-200 ease-standard hover:bg-white',
              'xl:flex xl:translate-y-1 xl:opacity-0',
              'xl:group-hover:translate-y-0 xl:group-hover:opacity-100',
              'xl:focus-visible:translate-y-0 xl:focus-visible:opacity-100',
              focusRing
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Tezkor koʻrish
          </button>
        </div>

        <div className="flex flex-1 flex-col p-3">
          {product.brand && (
            <p className="line-clamp-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">{product.brand}</p>
          )}

          {/* Stretched link — kartaning butun yuzasi bosiladi, lekin DOM'da bitta oddiy havola */}
          <h3 className="mt-1 text-[13px] font-medium leading-snug text-ink-900 sm:text-sm">
            <Link
              to={`/product/${product.slug}`}
              className={cx('line-clamp-2 min-h-[2.4rem] rounded-sm before:absolute before:inset-0 before:content-[""]', focusRing)}
            >
              {product.name}
            </Link>
          </h3>

          {/*
            Reyting HAQIQIY `products.rating` ustunidan keladi (0–5, migratsiya
            `20260825000000`). Ustun bor edi, lekin kartochkada umuman
            ko'rsatilmasdi. Reyting 0 bo'lsa — hech narsa chizilmaydi: bo'sh
            yulduzlar "yomon mahsulot" degan noto'g'ri signal beradi, holbuki
            bu shunchaki "hali baholanmagan" degani.
          */}
          {product.rating > 0 && (
            <p
              className="mt-1.5 flex items-center gap-1 text-[11px] leading-none text-ink-500"
              aria-label={
                product.reviews_count > 0
                  ? `Reyting ${product.rating} / 5, ${product.reviews_count} ta sharh`
                  : `Reyting ${product.rating} / 5`
              }
            >
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-semibold tabular-nums text-ink-700">{product.rating.toFixed(1)}</span>
              {product.reviews_count > 0 && (
                <span className="tabular-nums text-ink-400">({product.reviews_count})</span>
              )}
            </p>
          )}

          <div className="mt-auto pt-2.5">
            {/*
              CHEGIRMA BOR kartochkada narx o'z yuzasiga ko'chadi —
              mahsulot sahifasidagi `glassPanel('brand')` ning ixcham
              nusxasi (`p-4` emas, `p-2`).

              Chegirmasiz kartochkada panel ATAYLAB yo'q. Agar u hamma
              joyda bo'lsa, "bu yerda tejash bor" degan signal yo'qolardi:
              grid'da 40 ta bir xil panel — bu shunchaki yangi fon rangi,
              urg'u emas. Panel faqat aytadigan gapi bor kartochkada
              paydo bo'lgani uchun ko'z unga tushadi.

              Faqat narx + eski narx qatori o'raladi. Ombor holati
              (`Sotuvda bor` / `Kam qoldi`) panel TASHQARISIDA qoladi —
              u boshqa turdagi ma'lumot va uni narx bilan bitta yuzaga
              qo'yish ikkalasini ham susaytirardi.
            */}
            <div
              className={cx(
                'flex flex-wrap items-baseline gap-x-2 gap-y-0.5',
                discount != null && glassPanel('brand', 'p-2')
              )}
            >
              <span className="text-[15px] font-bold tracking-tight text-ink-900 sm:text-base">
                {formatPrice(product.price)}
              </span>
              {product.old_price != null && (
                <span className="text-xs text-ink-400 line-through">{formatPrice(product.old_price)}</span>
              )}
            </div>

            <p
              className={cx(
                'mt-1.5 flex items-center gap-1 text-[11px] font-medium',
                !purchasable ? 'text-ink-400' : stock === 'in' ? 'text-emerald-600' : stock === 'low' ? 'text-amber-600' : 'text-ink-400'
              )}
            >
              {!purchasable ? (
                <>Narxi aniqlanmagan</>
              ) : stock === 'in' ? (
                <><Check className="h-3 w-3" /> Sotuvda bor</>
              ) : stock === 'low' ? (
                <>Kam qoldi — {product.stock} dona</>
              ) : (
                <>Vaqtincha mavjud emas</>
              )}
            </p>

            {/*
              `sink="flat"` — botish bor, ostidagi soya YO'Q.
              `lifted` variantidagi soya tugmadan pastda, `top-full` da
              chiziladi; bu yerda esa tugma kartochkaning eng pastki
              elementi va undan keyin atigi 12px to'ldirish bor — soya
              kartochka chegarasiga taqalib, kesilib qolardi.
              Ayni mantiq `ProductPage` dagi stepper tugmalarida ham.
            */}
            <AnimatedButton
              sink="flat"
              type="button"
              onClick={handleAdd}
              disabled={!inStock}
              aria-label={`${product.name} — savatga qoʻshish`}
              className={cx(
                // z-10 shart: stretched link kartaning ustini qoplaydi.
                'relative z-10 mt-2.5 w-full',
                added
                  ? button('success', 'card')
                  : button('outline', 'card')
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {added ? (
                  <motion.span
                    key="added"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5"
                  >
                    <Check className="h-4 w-4" /> Savatda
                  </motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> Savatga
                  </motion.span>
                )}
              </AnimatePresence>
            </AnimatedButton>
          </div>
        </div>

        {/*
          PORTAL — bu shart, qulaylik uchun emas.

          Kartochkalar `AnimatedSection` ichida turadi, u esa `y: 20` ni
          animatsiya qiladi va elementda `transform` qoldiradi. Transform
          esa o'z ichidagi BARCHA `position: fixed` elementlar uchun
          "containing block" yaratadi — modal fon (`fixed inset-0`)
          viewport'ni emas, o'sha bo'limni qoplab qolardi.

          Shuning uchun dialog `document.body` ga chiqariladi. Aynan shu
          yechim `ImageGallery` dagi lightbox'da ham qo'llanilgan.
        */}
        {createPortal(
          <AnimatePresence>
            {quickOpen && (
              <ResponsiveModal onClose={() => setQuickOpen(false)} title={product.name} size="wide">
                <QuickViewBody product={product} onClose={() => setQuickOpen(false)} />
              </ResponsiveModal>
            )}
          </AnimatePresence>,
          document.body
        )}
      </article>
    </motion.div>
  );
}

/**
 * Grid wrapper that staggers ProductCard children in on mount.
 * Only the first STAGGER_CAP items animate — the rest mount instantly so
 * large catalog pages stay fast.
 */
const STAGGER_CAP = 10;

export function ProductGrid({
  products,
  className,
  priorityCount = 0,
}: {
  products: Product[];
  className?: string;
  /**
   * Nechta birinchi kartochka rasmi darhol (eager, high priority) yuklansin.
   *
   * Standart 0 — chunki grid ko'p sahifada ekran ostida turadi (bosh sahifada
   * banner va kategoriyalardan keyin). Agar hamma joyda 4 ta qilib qo'yilsa,
   * bitta sahifada 8–9 ta "high priority" rasm paydo bo'ladi va brauzer
   * uchun ustuvorlik o'z ma'nosini yo'qotadi — LCP rasm navbatda qolib
   * ketadi. Shuning uchun grid ekranning eng tepasida bo'lgan sahifalarda
   * (katalog, qidiruv) chaqiruv joyida ochiq belgilanadi.
   */
  priorityCount?: number;
}) {
  return (
    <StaggerGroup className={className}>
      {products.map((p, i) =>
        i < STAGGER_CAP ? (
          <StaggerItem key={p.id} className="h-full">
            <ProductCard product={p} priority={i < priorityCount} />
          </StaggerItem>
        ) : (
          <div key={p.id} className="h-full">
            <ProductCard product={p} />
          </div>
        )
      )}
    </StaggerGroup>
  );
}

/**
 * SPOTLIGHT — bo'limning "bosh" mahsuloti uchun kattalashtirilgan karta.
 *
 * Nega alohida komponent?
 *
 * Bosh sahifa uzoq vaqt bir xil ritmda edi: grid → karusel → grid →
 * karusel. Har bir blok bir xil o'lchamdagi kartalardan iborat bo'lgani
 * uchun sahifa "tekis" ko'rinardi va ko'z hech qayerga tayanmasdi.
 *
 * Spotlight shu ritmni sindiradi: bitta mahsulot boshqalardan sezilarli
 * kattaroq bo'lib, bo'limga vizual "sarlavha" bo'lib xizmat qiladi.
 * Ma'lumot o'sha-o'sha — faqat ierarxiya boshqacha.
 *
 * Matn rasm USTIDA, pastdan qorayadigan parda bilan — shuning uchun
 * kompozitsiya jurnaldagi kabi ko'rinadi, katalog qatoridek emas.
 */
export function SpotlightCard({ product, priority }: { product: Product; priority?: boolean }) {
  const { addItem } = useCart();
  const { notify } = useToast();
  const reduce = useReducedMotion();

  const image = product.product_images?.[0]?.image_url;
  const discount = discountPercent(product.price, product.old_price);
  const stock = stockState(product.stock);
  const purchasable = hasSellablePrice(product.price);
  const inStock = stock !== 'out' && purchasable;
  const sold = socialProof(product.sales_count);

  return (
    <article
      className={cx(
        'group relative isolate flex h-full min-h-[20rem] flex-col justify-end overflow-hidden rounded-surface bg-ink-900',
        'transition-shadow duration-300 ease-standard hover:shadow-overlay'
      )}
    >
      <Img
        src={image}
        alt={product.name}
        priority={priority}
        sizes="(min-width: 1280px) 33vw, (min-width: 820px) 40vw, 92vw"
        fallbackLabel="Rasm yoʻq"
        className="absolute inset-0 -z-10 h-full w-full"
        imgClassName={cx(
          'h-full w-full object-cover transition-transform duration-500 ease-standard',
          !reduce && 'group-hover:scale-[1.06]'
        )}
      />
      {/* Parda — matn har qanday rasm ustida o'qilishi uchun. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-ink-900 via-ink-900/60 to-ink-900/5"
      />

      {discount != null && (
        <span className={discountBadge('md', 'absolute left-4 top-4')}>−{discount}%</span>
      )}

      <div className="relative p-5 sm:p-6">
        {product.brand && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-300">
            {product.brand}
          </p>
        )}

        <h3 className="mt-2 text-display-sm text-white">
          <Link
            to={`/product/${product.slug}`}
            className={cx('line-clamp-2 rounded-sm before:absolute before:inset-0 before:content-[""]', focusRing)}
          >
            {product.name}
          </Link>
        </h3>

        {product.rating > 0 && (
          <p
            className="mt-2 flex items-center gap-1 text-xs text-white/70"
            aria-label={`Reyting ${product.rating} / 5`}
          >
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-semibold tabular-nums text-white">{product.rating.toFixed(1)}</span>
            {product.reviews_count > 0 && (
              <span className="tabular-nums text-white/50">({product.reviews_count})</span>
            )}
          </p>
        )}

        {/*
          Ijtimoiy isbot — faqat YUQORI E'TIBOR joylarida.

          Oddiy grid kartochkasiga bu qator QO'SHILMAYDI: 40 ta kartada
          takrorlangan bir xil jumla ma'no bermay qoladi va shovqinga
          aylanadi. Spotlight esa bo'limda bitta — u yerda bu qator
          o'qiladi.

          Ikonka `TrendingUp`, chunki ilovada u allaqachon "Eng ko'p
          sotilgan" ma'nosida ishlatiladi (bosh sahifadagi "Xit
          mahsulotlar" bo'limi), o'sha bo'lim esa aynan shu
          `sales_count` bo'yicha saralanadi.
        */}
        {sold && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/70">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-orange-300" aria-hidden="true" />
            {sold}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-2xl font-bold tracking-tight text-white">{formatPrice(product.price)}</span>
          {product.old_price != null && (
            <span className="text-sm text-white/50 line-through">{formatPrice(product.old_price)}</span>
          )}
        </div>

        {/*
          `sink="flat"`, `lifted` emas — Spotlight fonida (`ink-900`)
          qora kontakt soyasi umuman ko'rinmaydi, faqat bekorga qatlam
          yaratardi. Bosilish javobi esa qolgan ikkita "Savatga"
          tugmasi bilan bir xil.
        */}
        <AnimatedButton
          sink="flat"
          type="button"
          onClick={() => {
            if (!inStock) return;
            addItem(product);
            notify(`${product.name} savatga qoʻshildi`, 'success');
          }}
          disabled={!inStock}
          aria-label={`${product.name} — savatga qoʻshish`}
          // `z-10` — stretched link ustida turishi uchun. (`relative` ni
          // `AnimatedButton` ning o'zi qo'shadi.)
          className={cx('z-10 mt-4', button('primary', 'md'))}
        >
          <Plus className="h-4 w-4" /> Savatga
        </AnimatedButton>
      </div>
    </article>
  );
}

/**
 * Tezkor ko'rish oynasining ichki qismi.
 *
 * Faqat HAQIQIY ma'lumot ko'rsatiladi: reyting `rating > 0` bo'lsa,
 * sharhlar soni `reviews_count > 0` bo'lsa, eski narx faqat chegirma
 * mavjud bo'lganda. Hech qanday o'ylab topilgan qiymat yo'q.
 */
function QuickViewBody({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCart();
  const { toggle, isFavorite } = useFavorites();
  const { notify } = useToast();
  const reduce = useReducedMotion();
  const fly = useFlight();
  const [added, setAdded] = useState(false);
  /* Tezkor ko'rish ichidan ham xuddi shu ikki harakat ishlaydi. */
  const qvMediaRef = useRef<HTMLDivElement>(null);
  const qvFavRef = useRef<HTMLButtonElement>(null);

  const image = product.product_images?.[0]?.image_url;
  const discount = discountPercent(product.price, product.old_price);
  const stock = stockState(product.stock);
  const purchasable = hasSellablePrice(product.price);
  const inStock = stock !== 'out' && purchasable;
  const fav = isFavorite(product.id);

  const handleAdd = () => {
    if (!inStock) return;
    addItem(product);
    setAdded(true);
    fly('cart', qvMediaRef.current, image);
    notify(`${product.name} savatga qoʻshildi`, 'success');
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div ref={qvMediaRef} className="relative overflow-hidden rounded-card bg-ink-50">
        <Img
          src={image}
          alt={product.name}
          sizes="(min-width: 640px) 20rem, 90vw"
          fallbackLabel="Rasm yoʻq"
          className="aspect-square"
          imgClassName="object-cover"
        />
        {discount != null && (
          <span className={discountBadge('sm', 'absolute left-2 top-2')}>−{discount}%</span>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        {/* Brend — sayt bo'ylab bir xil "urg'u chizig'i" uslubi. */}
        {product.brand && (
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700">
            <span aria-hidden="true" className="h-px w-5 shrink-0 bg-orange-400/70" />
            <span className="line-clamp-1">{product.brand}</span>
          </p>
        )}

        {product.rating > 0 && (
          <p
            className="mt-1.5 flex items-center gap-1 text-xs leading-none text-ink-500"
            aria-label={
              product.reviews_count > 0
                ? `Reyting ${product.rating} / 5, ${product.reviews_count} ta sharh`
                : `Reyting ${product.rating} / 5`
            }
          >
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-semibold tabular-nums text-ink-700">{product.rating.toFixed(1)}</span>
            {product.reviews_count > 0 && (
              <span className="tabular-nums text-ink-400">({product.reviews_count} ta sharh)</span>
            )}
          </p>
        )}

        {/* Narx — mahsulot sahifasidagi kabi o'z yuzasida, bir xil ierarxiya. */}
        <div
          className={cx(
            'mt-3.5 rounded-card border p-3.5',
            discount != null ? 'border-orange-200 bg-orange-50/60' : 'border-ink-200 bg-ink-50/70'
          )}
        >
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-2xl font-bold leading-none tracking-tight text-ink-900">
              {formatPrice(product.price)}
            </span>
            {product.old_price != null && (
              <span className="text-sm text-ink-400 line-through">{formatPrice(product.old_price)}</span>
            )}
          </div>
          {discount != null && product.old_price != null && (
            <p className="mt-2 inline-flex items-center rounded-full bg-orange-700 px-2.5 py-1 text-[11px] font-semibold text-white">
              −{discount}% · {formatPrice(product.old_price - product.price)} tejaysiz
            </p>
          )}
        </div>

        <p
          className={cx(
            'mt-2 flex items-center gap-1 text-xs font-medium',
            !purchasable ? 'text-ink-400' : stock === 'in' ? 'text-emerald-600' : stock === 'low' ? 'text-amber-600' : 'text-ink-400'
          )}
        >
          {!purchasable ? (
            <>Narxi aniqlanmagan</>
          ) : stock === 'in' ? (
            <><Check className="h-3.5 w-3.5" /> Sotuvda bor</>
          ) : stock === 'low' ? (
            <>Kam qoldi — {product.stock} dona</>
          ) : (
            <>Sotuvda yoʻq</>
          )}
        </p>

        {product.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-500">{product.description}</p>
        )}

        <div className="mt-auto space-y-2 pt-5">
          <div className="flex gap-2">
            {/* Tezkor ko'rish oynasida ham `flat`: tugma yonidagi yurakcha
                bilan bitta qatorda turadi, ostida soya uchun joy yo'q. */}
            <AnimatedButton
              sink="flat"
              type="button"
              onClick={handleAdd}
              disabled={!inStock}
              className={cx(
                'flex-1',
                added ? button('success', 'lg') : button('primary', 'lg')
              )}
            >
              {added ? (<><Check className="h-4 w-4" /> Savatda</>) : (<><ShoppingCart className="h-4 w-4" /> Savatga</>)}
            </AnimatedButton>
            <motion.button
              ref={qvFavRef}
              type="button"
              onClick={() => {
                if (!fav) fly('fav', qvFavRef.current);
                toggle(product.id);
                notify(fav ? 'Sevimlilardan olib tashlandi' : 'Sevimlilarga qoʻshildi', 'info');
              }}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              transition={{ duration: DURATION.micro, ease: EASE.standard }}
              aria-pressed={fav}
              aria-label={fav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qoʻshish'}
              className={cx(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-control border transition-colors',
                fav ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-ink-200 text-ink-500 hover:border-ink-300',
                focusRing
              )}
            >
              <Heart className={cx('h-5 w-5', fav && 'fill-current')} />
            </motion.button>
          </div>

          <Link
            to={`/product/${product.slug}`}
            onClick={onClose}
            className={cx(button('outline', 'lg'), 'w-full')}
          >
            Toʻliq sahifani ochish
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Katalog/bosh sahifa uchun standart mahsulot grid'i — bitta joyda belgilangan. */
export const productGridClass =
  // `tab:gap-5` — planshetda kartalar orasidagi havo ko'proq. Ustunlar
  // soni o'zgarmaydi (3), lekin kompozitsiya ancha erkin nafas oladi.
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 tab:gap-5 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5';

/**
 * Yon paneli BOR sahifalar uchun grid (katalog, kategoriya).
 *
 * Nega alohida? Chunki `tab` dan boshlab chapda 208px'lik filtr ustuni
 * paydo bo'ladi va qolgan kenglik keskin kamayadi. O'sha joyda odatdagi
 * 3 ustun qoldirilsa, karta eni 163px'gacha tushib ketardi — ya'ni
 * 430px'lik TELEFONDAGIDAN ham tor. O'lchandi va aynan shunday bo'lgan.
 *
 * Shuning uchun bu yerda ustunlar soni yon panel hisobga olingan holda
 * qayta taqsimlanadi:
 *   820–1023  → 2 ustun (~275px karta)
 *   1024–1279 → 3 ustun (~243px)
 *   1280+     → 4 ustun (~275px)
 */
export const productGridWithSidebarClass =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 tab:grid-cols-2 tab:gap-5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4';

export function ProductCardSkeleton() {
  return (
    <div className={cx(card, 'flex flex-col overflow-hidden')} aria-hidden="true">
      <div className={cx('aspect-square', skeleton)} />
      <div className="space-y-2 p-3">
        <div className={cx('h-2.5 w-1/3 rounded', skeleton)} />
        <div className={cx('h-3.5 w-full rounded', skeleton)} />
        <div className={cx('h-3.5 w-2/3 rounded', skeleton)} />
        <div className={cx('h-5 w-1/2 rounded', skeleton)} />
        {/*
          Balandlik HAQIQIY tugma bilan bir xil bo'lishi shart: `buttonSize.card`
          = `h-11 lg:h-9`. Ilgari bu yerda qat'iy `h-9` turardi va mobil/planshet
          ko'rinishida yuklanish tugagach har bir kartochka 8px sakrardi (CLS).
        */}
        <div className={cx('h-11 w-full rounded-control xl:h-9', skeleton)} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? productGridClass}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/*
 * Sarlavha darajasi `h2` — ilgari `h3` edi.
 *
 * Bu komponentlar deyarli har doim sahifaning `<h1>` idan KEYIN darhol
 * keladi (bo'sh savat, natijasiz katalog, xatolik). `h3` bo'lganda
 * ierarxiya `h1 → h3` bo'lib sakrardi: skrinrider foydalanuvchisi
 * sarlavhalar bo'yicha yurganda oradagi daraja yo'qolgandek tuyuladi va
 * u "bir bo'lim o'tkazib yubordimmi?" deb o'ylaydi (WCAG 1.3.1).
 *
 * Boshqa darajada kerak bo'lsa `headingLevel` bilan ko'rsatiladi —
 * masalan kabinet ichidagi bo'lim ichida.
 */
type HeadingLevel = 'h2' | 'h3';

/**
 * BO'SH HOLAT ILLYUSTRATSIYASI — halqa, ichida suzuvchi ob'ekt.
 *
 * Kompozitsiya 404 sahifasida tug'ilgan edi: o'rtadagi "nol" — raqam
 * emas, HALQA, ichida esa yo'qolgan paket suzib turadi. Bu do'konning
 * "hech narsa yo'q" holatidagi o'z tili bo'lib qoldi, lekin u faqat
 * bitta sahifada yashardi — savat, sevimlilar va qidiruv esa neytral
 * kulrang doira ko'rsatardi. Ya'ni ayni bitta hodisa ilovada ikki xil
 * gapirardi.
 *
 * Endi bu — yagona manba. 404 ham, `EmptyState` ham SHU komponentni
 * chaqiradi; farq faqat o'lcham va fon ohangida.
 *
 * Harakat CSS animatsiyasi bilan (`animate-spin-slow`, `animate-float`),
 * Motion bilan EMAS — 404'dagi bilan bir xil sabab:
 *  1. Bular cheksiz sekin sikllar, JS kadr hisoblashi ortiqcha.
 *  2. `prefers-reduced-motion` ni `index.css` dagi global qoida
 *     allaqachon hal qiladi (davomiylik 0.01ms ga tushadi), ya'ni
 *     shartni har bir chaqiruv joyida takrorlash va uni unutib
 *     qo'yish imkoni yo'q. Statik holatda kompozitsiya to'g'ri
 *     ko'rinadi: halqa ham, ob'ekt ham o'z joyida qoladi.
 */
export function EmptyIllustration({
  icon,
  tone = 'light',
  size = 'md',
}: {
  icon: ReactNode;
  /** `dark` — faqat to'q (`ink-900`) yuzalar uchun: 404, aksiya bloki. */
  tone?: 'light' | 'dark';
  /** `lg` — sahifani egallaydigan holat (404); `md` — blok ichidagi. */
  size?: 'md' | 'lg';
}) {
  const dark = tone === 'dark';
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative flex shrink-0 items-center justify-center',
        size === 'lg' ? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40' : 'h-20 w-20'
      )}
    >
      {/* Halqa. Chetidagi bitta urg'u yoyi tufayli aylanish seziladi,
          lekin bezovta qilmaydi. */}
      <span
        className={cx(
          'absolute inset-0 animate-spin-slow rounded-full',
          size === 'lg' ? 'border-[3px]' : 'border-2',
          dark ? 'border-white/15 border-t-orange-500' : 'border-orange-100 border-t-orange-400'
        )}
      />
      {/* Suzuvchi ob'ekt — halqaning "ichida yo'qolgan" narsa. */}
      <span
        className={cx(
          'flex animate-float items-center justify-center rounded-xl ring-1',
          size === 'lg' ? 'h-11 w-11 sm:h-14 sm:w-14 lg:h-16 lg:w-16' : 'h-12 w-12',
          dark
            ? 'bg-orange-500/15 text-orange-400 ring-orange-500/25'
            : 'bg-orange-50 text-orange-500 ring-orange-100'
        )}
      >
        {icon}
      </span>
    </span>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  headingLevel: Heading = 'h2',
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: HeadingLevel;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.ui, ease: EASE.standard }}
      className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-200 bg-white px-6 py-12 text-center"
    >
      {/*
        Illyustratsiya 404 sahifasi bilan BIR XIL komponentdan keladi —
        savat, sevimlilar va qidiruv endi bo'shligini bir xil tilda
        aytadi. Ilgari bu yerda statik doira turardi va 404 dagi halqa
        faqat o'sha bitta sahifada yashardi.
      */}
      <EmptyIllustration icon={icon ?? <ShoppingCart className="h-6 w-6" />} />
      <Heading className="mt-4 text-base font-semibold text-ink-900">{title}</Heading>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/** Tarmoq/Supabase xatosi uchun qayta urinish imkoni bilan holat. */
export function ErrorState({
  message = "Maʼlumotlarni yuklab boʻlmadi",
  onRetry,
  headingLevel: Heading = 'h2',
  showHomeLink = true,
}: {
  message?: string;
  onRetry: () => void;
  headingLevel?: HeadingLevel;
  /**
   * Ikkilamchi chiqish yo'li.
   *
   * Ilgari xato holatida YAGONA harakat "Qayta urinish" edi. Agar sabab
   * vaqtinchalik bo'lmasa (masalan sahifa yoki mahsulot umuman yo'q),
   * foydalanuvchi shu tugmani bosaverib berk ko'chada qolardi. Endi
   * doimo bosh sahifaga qaytish mumkin.
   */
  showHomeLink?: boolean;
}) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.ui, ease: EASE.standard }}
      className={cx(card, 'flex flex-col items-center justify-center px-6 py-12 text-center')}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500 ring-8 ring-red-50/50">
        <WifiOff className="h-6 w-6" />
      </div>
      <Heading className="mt-4 text-base font-semibold text-ink-900">{message}</Heading>
      {/*
        Matn ataylab sababni QAT'IY aytmaydi: bu holat tarmoq uzilishida
        ham, serverdagi xatoda ham chiqadi. Ilgari u har doim "internetni
        tekshiring" derdi va server 500 qaytarganda foydalanuvchini
        o'z Wi-Fi'sini qayta yoqishga yo'llardi.
      */}
      <p className="mt-1 max-w-sm text-sm text-ink-500">
        Ulanishni tekshiring yoki birozdan soʻng qayta urinib koʻring.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button onClick={onRetry} className={button('primary', 'md')}>
          <RotateCw className="h-4 w-4" /> Qayta urinish
        </button>
        {showHomeLink && (
          <Link to="/" className={button('outline', 'md')}>
            Bosh sahifa
          </Link>
        )}
      </div>
    </motion.div>
  );
}
