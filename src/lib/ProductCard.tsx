import { Link } from './router';
import { createPortal } from 'react-dom';
import {
  Heart, ShoppingCart, Check, WifiOff, RotateCw, Plus, Minus, Star, Eye, TrendingUp, ChevronRight,
} from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, AnimatePresence, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { Product } from './types';
import { formatPrice, discountPercent, hasSellablePrice } from './types';
import { useCart } from './cart';
import { cartItemKey, maxQuantityFor, quantityForProduct } from './cartUtils';
import { useFavorites } from './favorites';
import { useToast } from './toast';
import { AnimatedNumber } from './AnimatedNumber';
import { AnimatedButton, StaggerGroup, StaggerItem, ResponsiveModal } from './AnimatedPrimitives';
import { Img } from './Img';
import { DURATION, EASE, SHINE, TILT, springOptions } from './motion';
import { button, card, cx, discountBadge, focusRing, skeleton } from './design';
import { hasSelectableVariants, socialProof, stockState } from './productUtils';
import { useFlight } from './flightContext';

/*
 * ── SAVAT AMALI — UCHALA KIRISH NUQTASI UCHUN BITTA KOMPONENT ───────
 *
 * Mahsulotni savatga qoʻshish uchta joydan mumkin: grid kartochkasi,
 * Spotlight va tezkor koʻrish. Ilgari uchalasi ham OʻZ tugmasini
 * yozgandi va uchalasi ham bir xil ikkita xatoga yoʻl qoʻyardi:
 *
 *   1. Variantli mahsulotni VARIANTSIZ qoʻshib yuborardi — savatga
 *      rangi va xotirasi koʻrsatilmagan pozitsiya tushardi.
 *   2. "Savatda" yozuvi 1.4 soniya turib yoʻqolardi, yaʼni karta
 *      savatda nima borligini AYTMASDI — faqat "bosildi" deb
 *      javob berardi.
 *
 * Endi holatlar shu yerda, bitta joyda hal qilinadi va uchalasi ham
 * bir xil qoidaga boʻysunadi.
 */
type CartActionProps = {
  product: Product;
  /** Uchish animatsiyasi boshlanadigan element (odatda rasm). */
  flyFrom?: RefObject<HTMLElement | null>;
  /** `card` — kartochkadagi 44px; `lg` — kengroq joylardagi 48px. */
  size?: 'card' | 'lg';
  /** Boʻsh holatdagi tugma koʻrinishi. Spotlight toʻq fonda — toʻldirilgan. */
  tone?: 'outline' | 'primary';
  /** Havolaga oʻtilganda yopilishi kerak boʻlgan oyna (tezkor koʻrish). */
  onNavigate?: () => void;
  className?: string;
};

function CartAction({
  product, flyFrom, size = 'card', tone = 'outline', onNavigate, className,
}: CartActionProps) {
  const { items, addItem, updateQuantity } = useCart();
  const { notify } = useToast();
  const fly = useFlight();

  const stock = stockState(product.stock);
  const purchasable = hasSellablePrice(product.price);
  const image = product.product_images?.[0]?.image_url;

  /*
   * Kartadagi son — `quantityForProduct`, yaʼni shu mahsulotning
   * BARCHA pozitsiyalari yigʻindisi. Aynan shu qiymat savat sahifasida
   * ham koʻrinadi (u ham bir xil pozitsiyalarni qoʻshadi), shuning
   * uchun ikkala ekran hech qachon turlicha son koʻrsatmaydi.
   */
  const qty = quantityForProduct(items, product.id);
  const lines = items.filter((i) => i.product.id === product.id);
  const variants = hasSelectableVariants(product);

  const btnSize = size === 'card' ? 'card' : 'lg';
  /*
   * Tanlagich balandligi "Savatga" tugmasi bilan AYNAN teng
   * (`buttonSize.card` = 44px, `lg` = 48px). Ular bir-birini
   * almashtiradi — farq boʻlsa savatga qoʻshgan zahoti karta
   * balandligi sakrardi.
   */
  const height = size === 'card' ? 'h-11' : 'h-12';

  /* ── Sotib boʻlmaydigan holatlar ─────────────────────────────── */
  if (!purchasable || stock === 'out') {
    return (
      <button
        type="button"
        disabled
        className={cx(button('outline', btnSize), 'w-full bg-ink-50 text-ink-500', className)}
      >
        {purchasable ? 'Sotuvda yoʻq' : 'Narxi aniqlanmagan'}
      </button>
    );
  }

  /* ── Variantli mahsulot: tanlov mahsulot sahifasida ──────────── */
  if (variants) {
    return (
      <Link
        to={`/product/${product.slug}`}
        onClick={onNavigate}
        className={cx(
          button(qty > 0 ? 'outline' : tone, btnSize),
          'relative z-10 w-full',
          // Savatda bor holatida tugma "yashil xabar"ga aylanadi, lekin
          // amal oʻsha-oʻsha: variant tanlash uchun sahifaga oʻtish.
          qty > 0 && 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
          className
        )}
      >
        {qty > 0 ? (
          <>
            <Check className="h-4 w-4 shrink-0" />
            Savatda · <AnimatedNumber value={qty} className="tabular-nums" />
          </>
        ) : (
          <>
            Variantni tanlash
            <ChevronRight className="h-4 w-4 shrink-0" />
          </>
        )}
      </Link>
    );
  }

  /* ── Variantsiz, savatda bor: haqiqiy son bilan stepper ──────── */
  const line = lines.length === 1 ? lines[0] : null;
  if (qty > 0 && line) {
    const key = cartItemKey(line);
    // Chegara XOM `stock` emas: variantning oʻz ombori va serverdagi
    // 50 donalik chegara ham shu funksiyada hisobga olingan.
    const max = maxQuantityFor(product, line.variantId);
    const atMax = qty >= max;

    return (
      <div
        role="group"
        aria-label={`${product.name} — savatda ${qty} dona`}
        className={cx(
          'relative z-10 flex items-center overflow-hidden rounded-control',
          /*
           * Chegara `border` EMAS, `ring-inset`.
           *
           * `border` element ICHIDAN 1px yeydi: 44px konteynerda
           * tugmalar uchun atigi 42px qoladi. `ring` esa layoutga
           * umuman tegmaydi — u element ustiga chiziladi. Natijada
           * chegara koʻrinadi, "−" va "+" esa toʻliq 44×44 boʻlib,
           * barmoq nishoni talabini buzmaydi.
           */
          'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
          height,
          className
        )}
      >
        <AnimatedButton
          sink="flat"
          type="button"
          onClick={() => updateQuantity(key, qty - 1)}
          aria-label={qty === 1 ? 'Savatdan olib tashlash' : 'Bittaga kamaytirish'}
          className={cx('flex h-full w-11 shrink-0 items-center justify-center', focusRing)}
        >
          <Minus className="h-4 w-4" />
        </AnimatedButton>

        <span className="flex flex-1 items-center justify-center gap-1.5 text-sm font-semibold">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <AnimatedNumber value={qty} className="tabular-nums" />
        </span>

        <AnimatedButton
          sink="flat"
          type="button"
          onClick={() => updateQuantity(key, qty + 1)}
          disabled={atMax}
          aria-label="Bittaga koʻpaytirish"
          className={cx(
            'flex h-full w-11 shrink-0 items-center justify-center',
            atMax && 'text-ink-400',
            focusRing
          )}
        >
          <Plus className="h-4 w-4" />
        </AnimatedButton>
      </div>
    );
  }

  /* ── Bir nechta pozitsiya (variantsiz mahsulotda kutilmaydi) ──── */
  if (qty > 0) {
    return (
      <Link
        to="/cart"
        onClick={onNavigate}
        className={cx(
          button('outline', btnSize),
          'relative z-10 w-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
          className
        )}
      >
        <Check className="h-4 w-4 shrink-0" />
        Savatda · <AnimatedNumber value={qty} className="tabular-nums" />
      </Link>
    );
  }

  /* ── Boʻsh holat: "Savatga" + uchish animatsiyasi ─────────────── */
  return (
    <AnimatedButton
      sink="flat"
      type="button"
      onClick={() => {
        addItem(product);
        fly('cart', flyFrom?.current ?? null, image);
        notify(`${product.name} savatga qoʻshildi`, 'success');
      }}
      aria-label={`${product.name} — savatga qoʻshish`}
      className={cx(
        'relative z-10 w-full',
        button(tone, btnSize),
        // Tugmaning qalinligi: oq tugmada neytral yon tomon, toʻldirilgan
        // tugmada brend rangining toʻqrogʻi.
        tone === 'outline' ? 'shadow-press-ink' : 'shadow-press-sm',
        className
      )}
    >
      <Plus className="h-4 w-4" /> Savatga
    </AnimatedButton>
  );
}

export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const { toggle, isFavorite } = useFavorites();
  const { notify } = useToast();
  const reduce = useReducedMotion();
  const fly = useFlight();
  const [quickOpen, setQuickOpen] = useState(false);
  /*
   * Sevimliga qoʻshilganda bir marta chiqadigan halqa. Hisoblagich —
   * boolean emas: ketma-ket bosilganda animatsiya qayta boshlanishi
   * uchun `key` har safar yangi boʻlishi kerak.
   */
  const [favPulse, setFavPulse] = useState(0);
  /*
   * Uchish boshlanadigan nuqtalar.
   *
   * `mediaRef` — mahsulot rasmi: savatga AYNAN mahsulot tushadi.
   * `favBtnRef` — yurakcha tugmasi: sevimlilarga AYNAN yurakcha uchadi.
   * Ikki harakat ikki xil joydan boshlanadi va shu sababli ular
   * bir-biriga oʻxshamaydi.
   */
  const mediaRef = useRef<HTMLDivElement>(null);
  const favBtnRef = useRef<HTMLButtonElement>(null);

  /*
   * ── KARTANING 3D BURILISHI ────────────────────────────────────────
   *
   * Nishon qiymatlar oddiy motion valueʼda turadi va ular prujina
   * orqali oʻqiladi. Yaʼni bitta mexanizm ikkita ishni bajaradi:
   * kuzatishda kichik "kechikish" (karta ogʻir jismdek his qilinadi)
   * va qoʻyib yuborilganda `springs.snappy` bilan joyiga qaytish.
   * Alohida "qaytish" animatsiyasi yozish shart emas — nishonni 0 ga
   * qoʻyish kifoya.
   *
   * REACT RENDERI YOʻQ: `motion value` toʻgʻridan-toʻgʻri DOMʼga
   * yoziladi. Katalogda 40 ta karta boʻlishi mumkin — har bir
   * `pointermove` da setState chaqirilsa sahifa qotib qolardi.
   */
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, springOptions.snappy);
  const rotateY = useSpring(tiltY, springOptions.snappy);

  const tiltFrom = (el: HTMLElement, clientX: number, clientY: number) => {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    // Markazga nisbatan −0.5 … +0.5 oraligʻi.
    const dx = (clientX - r.left) / r.width - 0.5;
    const dy = (clientY - r.top) / r.height - 0.5;
    // Kursor TEPADA boʻlsa karta tepasi orqaga egilishi kerak, yaʼni
    // `rotateX` ishorasi `dy` ga teskari. Aks holda harakat "notoʻgʻri
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
  // Narxi belgilanmagan mahsulotni savatga qoʻshib boʻlmaydi — aks holda
  // mijoz "0 soʻm" ga buyurtma bermoqchi boʻlib, serverdan xato oladi.
  const purchasable = hasSellablePrice(product.price);
  const inStock = stock !== 'out' && purchasable;
  const fav = isFavorite(product.id);
  const saving = product.old_price != null ? product.old_price - product.price : 0;

  const handleFav = () => {
    // Mukofot faqat QOʻSHILGANDA. Olib tashlash — neytral harakat va
    // uni nishonlash notoʻgʻri signal berardi.
    if (!fav) {
      if (!reduce) setFavPulse((n) => n + 1);
      fly('fav', favBtnRef.current);
    }
    // Holat animatsiyadan MUSTAQIL — u darhol oʻzgaradi.
    toggle(product.id);
    notify(fav ? 'Sevimlilardan olib tashlandi' : 'Sevimlilarga qoʻshildi', 'info');
  };

  return (
    /*
     * ── TILT QATLAMI ─────────────────────────────────────────────────
     *
     * Burilish AYNAN shu tashqi qatlamda, `<article>` da emas.
     *
     * Sabab: karta hoverʼda 4px koʻtariladi va bu Tailwind sinfi bilan
     * qilingan (`xl:hover:-translate-y-1`). Motion esa transformni
     * INLINE `style` ga yozadi, inline style esa sinfdan ustun —
     * yaʼni burilishni `<article>` ga qoʻysak, koʻtarilish jimgina
     * oʻlardi. Ikki qatlamda ikkala transform bir-biriga qoʻshiladi:
     * tashqisi buradi, ichkisi koʻtaradi.
     *
     * `transformPerspective` — alohida `perspective` beruvchi ota
     * element yaratmaslik uchun: Motion uni elementning OʻZ
     * transformiga qoʻshadi. Bitta qoʻshimcha div yetarli.
     *
     * SENSORLI QURILMADA barmoq KUZATILMAYDI, faqat bosish payti
     * burchak olinadi. Katalogda barmoqning harakati deyarli har doim
     * SCROLL — uni kuzatsak, roʻyxatni surganda kartalar qiyshayib
     * ketardi. Bosilganda esa burilish "bosdim" degan javob boʻladi;
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
          // Chuqurlik: karta hoverʼda BIR OZ koʻtariladi va soyasi kuchayadi.
          // `-translate-y-1` — atigi 4px; maqsad "sakrash" emas, qoʻlga
          // olinadigandek his. Transform faqat `xl` da (sichqoncha bor joyda),
          // shuning uchun sensorli qurilmalarda hech qanday qoʻshimcha
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
              // Geometriya `discountBadgeSize.sm` bilan AYNAN bir xil:
              // ikkalasi bitta ustunda birin-ketin turadi va oʻlchami
              // farq qilsa qatorlar tekislanmay qolardi.
              <span className="rounded-md bg-ink-900 px-1.5 py-0.5 text-xs font-semibold leading-5 text-white">
                Yangi
              </span>
            )}
          </div>

          {!inStock && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink-900/[0.78] py-1.5 text-center text-xs font-semibold text-white backdrop-blur-[2px]">
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
               * TEGINISH MAYDONI 44px, KOʻRINADIGAN DOIRA esa 32px.
               *
               * Bu ikkisi ilgari bitta element edi: 44pxʼlik oq doira
               * kartochka rasmi ustida turardi. Haqiqiy brauzerda koʻrilganda
               * (390px, katalog) u kartochkadagi ENG BALAND ovozli element
               * boʻlib chiqdi — mahsulot rasmidan ham koʻzga tashlanardi.
               *
               * Yechim ikkalasini ajratish: tugmaning OʻZI shaffof va
               * 44px (barmoq uchun), ichidagi doira esa 32px (koʻz uchun).
               * Yaʼni qulaylik ham, vizual xotirjamlik ham saqlanadi —
               * biri ikkinchisiga qurbon qilinmaydi.
               */
              'absolute right-0.5 top-0.5 z-10 flex h-11 w-11 items-center justify-center rounded-full xl:right-1 xl:top-1 xl:h-10 xl:w-10',
              focusRing,
              // DIQQAT: "hover boʻlganda koʻrinadi" faqat `xl` dan boshlanadi.
              //
              // Bu qoida ikki marta tuzatilgan. Avval u `sm` (640px) da
              // edi — oʻshanda BARCHA planshetlarda tugma koʻrinmay
              // qolgandi. Keyin `lg` (1024px) ga koʻchirildi — lekin
              // 1024px hamon sensorli (iPad Pro landscape). Endi `xl`:
              // hoverʼga bogʻliq bezak faqat sichqoncha deyarli aniq
              // boʻlgan kenglikda yoqiladi. Hover hech qachon yagona
              // yoʻl emas.
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
                  // 90% + blursiz: 85% da blur rasmni bir oz yumshatardi, lekin
                  // har kartochkada bitta qatlam turardi. Shaffofmaslikni
                  // bir pogʻona oshirish ayni natijani tekinga beradi.
                  : 'bg-white/90 text-ink-500 shadow-[0_1px_3px_rgba(23,20,17,0.18)] group-hover:text-orange-600'
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
              // `backdrop-blur` OLIB TASHLANDI: fon 95% shaffofmas, yaʼni
              // orqadan atigi 5% oʻtadi va blur koʻzga umuman
              // koʻrinmaydi. Narxi esa haqiqiy — har bir kartochkada
              // alohida kompozitsiya qatlami (katalogda 40 ta).
              'bg-white/95 text-xs font-semibold text-ink-800 shadow-card',
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

        {/* Ichki toʻldirish 10px — dizayndagi kartochka zichligi. */}
        <div className="flex flex-1 flex-col p-2.5">
          {product.brand && (
            /*
              `ink-500`, ILGARI `ink-400` edi.

              Oʻlchandi: `ink-400` (#a3a09a) oq fonda 2.6:1 — AA (4.5:1)
              dan ancha past, yaʼni brend nomi amalda "yarim koʻrinadigan"
              matn edi. `ink-500` (#78756e) 4.6:1 beradi va iyerarxiya
              saqlanadi: u hamon nomdan ochiqroq.
            */
            <p className="line-clamp-1 text-xs font-medium uppercase tracking-[0.04em] text-ink-600">
              {product.brand}
            </p>
          )}

          {/*
            Stretched link — kartaning butun yuzasi bosiladi, lekin DOMʼda
            bitta oddiy havola.

            `min-h-[2.4rem]` OLIB TASHLANDI. U bir qatorli nomlarda boʻsh
            ikkinchi qator qoldirardi va kartochka ichida sabab koʻrsatib
            boʻlmaydigan tirqish hosil qilardi. Qatorlar baribir tekis
            turadi, chunki narx bloki `mt-auto` bilan pastga bosiladi.
          */}
          <h3 className="mt-1 text-sm font-medium leading-snug text-ink-900">
            <Link
              to={`/product/${product.slug}`}
              className={cx('line-clamp-2 rounded-sm before:absolute before:inset-0 before:content-[""]', focusRing)}
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
              className="mt-1.5 flex items-center gap-1 text-xs leading-none text-ink-500"
              aria-label={
                product.reviews_count > 0
                  ? `Reyting ${product.rating} / 5, ${product.reviews_count} ta sharh`
                  : `Reyting ${product.rating} / 5`
              }
            >
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-semibold tabular-nums text-ink-700">{product.rating.toFixed(1)}</span>
              {product.reviews_count > 0 && (
                <span className="tabular-nums text-ink-600">({product.reviews_count})</span>
              )}
            </p>
          )}

          <div className="mt-auto pt-2">
            {/*
              NARX — shisha panelsiz.

              Ilgari chegirmali kartochkada narx `glassPanel('brand')`
              ichiga olinardi. Dizayn uni olib tashladi va sabab bor:
              tejash haqidagi xabarni PANEL emas, aniq jumla beradi
              ("N soʻm tejaysiz"). Panel esa 2×N to'rda takrorlanib,
              kartochkalarni bir-biridan ajratib turadigan oq yuzani
              parchalab yuborardi.
            */}
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-base font-bold tracking-tight tabular-nums text-ink-900">
                {formatPrice(product.price)}
              </span>
              {product.old_price != null && (
                // `ink-500` — brend nomi bilan ayni sabab: `ink-400` 2.6:1.
                <span className="text-xs tabular-nums text-ink-600 line-through">
                  {formatPrice(product.old_price)}
                </span>
              )}
            </div>

            {/*
              "N soʻm tejaysiz" — chegirma FOIZI emas, SUMMASI.
              Foiz nishonda allaqachon bor (rasm ustida); bu yerda esa
              xaridor uchun haqiqiy maʼnoga ega boʻlgan raqam turadi.
            */}
            {discount != null && saving > 0 && (
              <p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-700">
                {formatPrice(saving)} tejaysiz
              </p>
            )}

            {/*
              Ombor holati ranglari AA uchun bir pogʻona toʻqlashtirildi
              (oʻlchandi, oq fonda):
                emerald-600 3.8:1 → emerald-700 5.5:1
                amber-600   3.2:1 → amber-700   4.8:1
                ink-400     2.6:1 → ink-500     4.6:1
              Bu ranglar dizayn palitrasida allaqachon bor — yangi
              qiymat kiritilmadi.
            */}
            <p
              className={cx(
                'mt-1 flex items-center gap-1 text-xs font-medium',
                !purchasable ? 'text-ink-500'
                  : stock === 'in' ? 'text-emerald-700'
                  : stock === 'low' ? 'text-amber-700'
                  : 'text-ink-500'
              )}
            >
              {!purchasable ? (
                <>Narxi aniqlanmagan</>
              ) : stock === 'in' ? (
                <><Check className="h-3 w-3 shrink-0" /> Sotuvda bor</>
              ) : stock === 'low' ? (
                <>Kam qoldi — {product.stock} dona</>
              ) : (
                <>Vaqtincha mavjud emas</>
              )}
            </p>

            {/*
              Amal — `CartAction` da. Karta endi savatdagi HAQIQIY sonni
              koʻrsatadi (1.4 soniyalik "Savatda" fleshi emas), shuning
              uchun bu yerda holat saqlanmaydi: yagona manba — `useCart`.
            */}
            <CartAction product={product} flyFrom={mediaRef} size="card" className="mt-2" />
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
   * Standart 0 — chunki grid koʻp sahifada ekran ostida turadi (bosh sahifada
   * banner va kategoriyalardan keyin). Agar hamma joyda 4 ta qilib qoʻyilsa,
   * bitta sahifada 8–9 ta "high priority" rasm paydo boʻladi va brauzer
   * uchun ustuvorlik oʻz maʼnosini yoʻqotadi — LCP rasm navbatda qolib
   * ketadi. Shuning uchun grid ekranning eng tepasida boʻlgan sahifalarda
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
 * SPOTLIGHT — boʻlimning "bosh" mahsuloti uchun kattalashtirilgan karta.
 *
 * Nega alohida komponent?
 *
 * Bosh sahifa uzoq vaqt bir xil ritmda edi: grid → karusel → grid →
 * karusel. Har bir blok bir xil oʻlchamdagi kartalardan iborat boʻlgani
 * uchun sahifa "tekis" koʻrinardi va koʻz hech qayerga tayanmasdi.
 *
 * Spotlight shu ritmni sindiradi: bitta mahsulot boshqalardan sezilarli
 * kattaroq boʻlib, boʻlimga vizual "sarlavha" boʻlib xizmat qiladi.
 * Maʼlumot oʻsha-oʻsha — faqat ierarxiya boshqacha.
 *
 * Matn rasm USTIDA, pastdan qorayadigan parda bilan — shuning uchun
 * kompozitsiya jurnaldagi kabi koʻrinadi, katalog qatoridek emas.
 */
export function SpotlightCard({
  product,
  priority,
  /**
   * Chegirma nishonining oʻlchami.
   *
   * Aksiya "sahna" kartasida nishon blokning ASOSIY xabari, shuning
   * uchun u kattalashadi. Ilgari sahna kartasi oʻz nishonini ustidan
   * qoʻshardi va natijada ikkita bir xil `−N%` yonma-yon turardi.
   */
  discountSize = 'md',
}: {
  product: Product;
  priority?: boolean;
  discountSize?: 'md' | 'xl';
}) {
  const reduce = useReducedMotion();
  /* Uchish AYNAN rasmdan boshlansin — grid kartochkasidagi kabi. */
  const mediaRef = useRef<HTMLDivElement>(null);

  const image = product.product_images?.[0]?.image_url;
  const discount = discountPercent(product.price, product.old_price);
  const sold = socialProof(product.sales_count);

  return (
    <article
      ref={mediaRef}
      className={cx(
        'group relative isolate flex h-full min-h-[20rem] flex-col justify-end overflow-hidden rounded-surface bg-ink-900',
        // Shisha qirra — karta toʻq tasma ustida "kesilgan boʻlak"dek
        // koʻrinadi. Blur YOʻQ: karta rasm bilan toʻlgan, orqasida
        // koʻrinadigan narsa qolmaydi.
        'shadow-glass ring-1 ring-inset ring-white/10',
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
        <span className={discountBadge(discountSize, 'absolute left-4 top-4 z-10')}>−{discount}%</span>
      )}

      <div className="relative p-5 sm:p-6">
        {product.brand && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">
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
          <span className="text-display-md tabular-nums text-white">{formatPrice(product.price)}</span>
          {product.old_price != null && (
            <span className="text-sm tabular-nums text-white/60 line-through">
              {formatPrice(product.old_price)}
            </span>
          )}
        </div>

        {/*
          Amal grid kartochkasi bilan AYNI komponentdan — shu sababli
          variantli mahsulot bu yerda ham variantsiz qoʻshilmaydi va
          savatdagi son bir xil koʻrinadi.

          `tone="primary"` — Spotlight foni toʻq (`ink-900`) va oq
          konturli tugma u yerda "oʻchgan" boʻlib koʻrinardi.
        */}
        <CartAction product={product} flyFrom={mediaRef} size="lg" tone="primary" className="mt-4" />
      </div>
    </article>
  );
}

/**
 * Tezkor koʻrish oynasining ichki qismi.
 *
 * Faqat HAQIQIY maʼlumot koʻrsatiladi: reyting `rating > 0` boʻlsa,
 * sharhlar soni `reviews_count > 0` boʻlsa, eski narx faqat chegirma
 * mavjud boʻlganda. Hech qanday oʻylab topilgan qiymat yoʻq.
 */
function QuickViewBody({ product, onClose }: { product: Product; onClose: () => void }) {
  const { toggle, isFavorite } = useFavorites();
  const { notify } = useToast();
  const reduce = useReducedMotion();
  const fly = useFlight();
  /* Tezkor koʻrish ichidan ham xuddi shu ikki harakat ishlaydi. */
  const qvMediaRef = useRef<HTMLDivElement>(null);
  const qvFavRef = useRef<HTMLButtonElement>(null);

  const image = product.product_images?.[0]?.image_url;
  const discount = discountPercent(product.price, product.old_price);
  const stock = stockState(product.stock);
  const purchasable = hasSellablePrice(product.price);
  const fav = isFavorite(product.id);

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
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
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
            <span className="text-display-md leading-none tabular-nums text-ink-900">
              {formatPrice(product.price)}
            </span>
            {product.old_price != null && (
              <span className="text-sm tabular-nums text-ink-600 line-through">
                {formatPrice(product.old_price)}
              </span>
            )}
          </div>
          {discount != null && product.old_price != null && (
            <p className="mt-2 inline-flex items-center rounded-full bg-orange-700 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
              −{discount}% · {formatPrice(product.old_price - product.price)} tejaysiz
            </p>
          )}
        </div>

        <p
          className={cx(
            'mt-2 flex items-center gap-1 text-xs font-medium',
            !purchasable ? 'text-ink-500'
              : stock === 'in' ? 'text-emerald-700'
              : stock === 'low' ? 'text-amber-700'
              : 'text-ink-500'
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
            {/*
              Karta va Spotlight bilan AYNI komponent: variantli mahsulot
              bu yerda ham jimgina variantsiz qoʻshilmaydi, savatdagi son
              esa uchala joyda bir xil koʻrinadi.
            */}
            <CartAction
              product={product}
              flyFrom={qvMediaRef}
              size="lg"
              tone="primary"
              onNavigate={onClose}
              className="flex-1"
            />
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

/** Katalog/bosh sahifa uchun standart mahsulot gridʼi — bitta joyda belgilangan. */
export const productGridClass =
  // `tab:gap-5` — planshetda kartalar orasidagi havo koʻproq. Ustunlar
  // soni oʻzgarmaydi (3), lekin kompozitsiya ancha erkin nafas oladi.
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 tab:gap-5 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5';

/**
 * Yon paneli BOR sahifalar uchun grid (katalog, kategoriya).
 *
 * Nega alohida? Chunki `tab` dan boshlab chapda 208pxʼlik filtr ustuni
 * paydo boʻladi va qolgan kenglik keskin kamayadi. Oʻsha joyda odatdagi
 * 3 ustun qoldirilsa, karta eni 163pxʼgacha tushib ketardi — yaʼni
 * 430pxʼlik TELEFONDAGIDAN ham tor. Oʻlchandi va aynan shunday boʻlgan.
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
        {/* Balandlik HAQIQIY tugma bilan bir xil (`buttonSize.card` = 44px),
            aks holda yuklanish tugagach kartochka sakrardi (CLS). */}
        <div className={cx('h-11 w-full rounded-control', skeleton)} />
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
 * keladi (boʻsh savat, natijasiz katalog, xatolik). `h3` boʻlganda
 * ierarxiya `h1 → h3` boʻlib sakrardi: skrinrider foydalanuvchisi
 * sarlavhalar boʻyicha yurganda oradagi daraja yoʻqolgandek tuyuladi va
 * u "bir boʻlim oʻtkazib yubordimmi?" deb oʻylaydi (WCAG 1.3.1).
 *
 * Boshqa darajada kerak boʻlsa `headingLevel` bilan koʻrsatiladi —
 * masalan kabinet ichidagi boʻlim ichida.
 */
type HeadingLevel = 'h2' | 'h3';

/**
 * BOʻSH HOLAT ILLYUSTRATSIYASI — halqa, ichida suzuvchi obʼekt.
 *
 * Kompozitsiya 404 sahifasida tugʻilgan edi: oʻrtadagi "nol" — raqam
 * emas, HALQA, ichida esa yoʻqolgan paket suzib turadi. Bu doʻkonning
 * "hech narsa yoʻq" holatidagi oʻz tili boʻlib qoldi, lekin u faqat
 * bitta sahifada yashardi — savat, sevimlilar va qidiruv esa neytral
 * kulrang doira koʻrsatardi. Yaʼni ayni bitta hodisa ilovada ikki xil
 * gapirardi.
 *
 * Endi bu — yagona manba. 404 ham, `EmptyState` ham SHU komponentni
 * chaqiradi; farq faqat oʻlcham va fon ohangida.
 *
 * Harakat CSS animatsiyasi bilan (`animate-spin-slow`, `animate-float`),
 * Motion bilan EMAS — 404'dagi bilan bir xil sabab:
 *  1. Bular cheksiz sekin sikllar, JS kadr hisoblashi ortiqcha.
 *  2. `prefers-reduced-motion` ni `index.css` dagi global qoida
 *     allaqachon hal qiladi (davomiylik 0.01ms ga tushadi), yaʼni
 *     shartni har bir chaqiruv joyida takrorlash va uni unutib
 *     qoʻyish imkoni yoʻq. Statik holatda kompozitsiya toʻgʻri
 *     koʻrinadi: halqa ham, obʼekt ham oʻz joyida qoladi.
 */
export function EmptyIllustration({
  icon,
  tone = 'light',
  size = 'md',
}: {
  icon: ReactNode;
  /** `dark` — faqat toʻq (`ink-900`) yuzalar uchun: 404, aksiya bloki. */
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
   * Ikkilamchi chiqish yoʻli.
   *
   * Ilgari xato holatida YAGONA harakat "Qayta urinish" edi. Agar sabab
   * vaqtinchalik boʻlmasa (masalan sahifa yoki mahsulot umuman yoʻq),
   * foydalanuvchi shu tugmani bosaverib berk koʻchada qolardi. Endi
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
