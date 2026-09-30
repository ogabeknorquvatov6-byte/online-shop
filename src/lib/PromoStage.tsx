import { Link } from './router';
import { ArrowRight, Clock, Flame } from 'lucide-react';
import type { Product, Promotion } from './types';
import { formatPrice, discountPercent } from './types';
import { ProductCard, SpotlightCard } from './ProductCard';
import { CountdownTimer } from './CountdownTimer';
import { SectionHeader } from './SectionHeader';
import { AuroraBackground } from './AuroraBackground';
import { PromoCubes } from './PromoCubes';
import { SECTION } from './sections';
import { button, cx, darkBand, shell } from './design';
import { stockState } from './productUtils';

/*
 * ── AKSIYA "SAHNA" BLOKI ────────────────────────────────────────────
 *
 * Ilgari bu oddiy toʻq karta edi: sarlavha + taymer + mahsulot
 * karuseli. Barcha aksiya mahsulotlari bir xil oʻlchamda turardi va
 * blok "yana bitta boʻlim" boʻlib koʻrinardi.
 *
 * Endi unda IERARXIYA bor: eng katta chegirmali mahsulot sahna
 * kartasiga chiqadi, qolganlari uning yonida ixcham qatorda turadi.
 * Xaridor blokka qaraganda birinchi navbatda ENG YAXSHI taklifni
 * koʻradi, tasodifiy birinchi mahsulotni emas.
 */

/**
 * Sahna uchun mahsulot: sotuvda BOR va chegirmasi eng katta.
 *
 * `stock` sharti muhim — sotuvda yoʻq mahsulotni blokning eng katta
 * yuzasiga chiqarish xaridorni bekorga umidlantiradi. Chegirma foizi
 * `discountPercent` orqali, yaʼni kartochkadagi nishon bilan AYNI
 * hisob (qayta yozilmaydi).
 */
function pickStageProduct(products: Product[]): Product | null {
  let best: Product | null = null;
  let bestPercent = 0;
  for (const p of products) {
    if (stockState(p.stock) === 'out') continue;
    const percent = discountPercent(p.price, p.old_price);
    if (percent == null) continue;
    if (percent > bestPercent) {
      bestPercent = percent;
      best = p;
    }
  }
  return best;
}

export function PromoStage({
  promo, products, highlighted, expired, onExpire,
}: {
  promo: Promotion;
  products: Product[];
  highlighted: boolean;
  /** Taymer foydalanuvchi sahifada turganda nolga yetdi. */
  expired: boolean;
  onExpire: () => void;
}) {
  const stage = pickStageProduct(products);
  const rest = products.filter((p) => p.id !== stage?.id);

  return (
    <section
      id={SECTION.promo}
      aria-labelledby="promo-heading"
      className={cx(
        // Chetdan-chetga toʻq tasma — "Hozir trendda" bilan bir xil
        // yuza, lekin mazmuni boshqa: u eʼtibor, bu esa taklif.
        darkBand,
        'scroll-mt-28 transition-shadow duration-500',
        highlighted && 'ring-2 ring-inset ring-orange-500'
      )}
    >
      <AuroraBackground />
      {/* Kublar faqat taymer ishlayotganda — yakunlangan aksiyada blok
          sokin boʻlishi kerak, bayram emas. */}
      {!expired && <PromoCubes />}

      <div className={cx(shell, 'py-8 md:py-12')}>
        {expired ? (
          <PromoFinished />
        ) : (
          <>
            {/*
              Kompyuterda sarlavha+taymer chapda (0.9fr), sahna kartasi
              oʻngda (1.1fr) — karta kengroq, chunki u blokning asosiy
              mazmuni. Telefon va planshetda ular ustma-ust.
            */}
            <div className="lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10">
              <div className="min-w-0">
                <SectionHeader
                  id="promo-heading"
                  eyebrow="Aksiya"
                  eyebrowIcon={Flame}
                  title={promo.title}
                  subtitle={promo.description?.trim() || undefined}
                  actionHref="/promotions"
                  actionLabel="Barchasini koʻrish"
                  tone="onDark"
                  titleSize="lg"
                />

                {/*
                  Taymer FAQAT haqiqiy `end_date` dan. Sana boʻlmasa
                  `CountdownTimer` hech narsa chizmaydi — soxta
                  shoshilinchlik yaratilmaydi.
                */}
                {promo.end_date && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                      Tugashiga qoldi
                    </p>
                    <div className="mt-2">
                      <CountdownTimer endDate={promo.end_date} onExpire={onExpire} tone="light" />
                    </div>
                  </div>
                )}
              </div>

              {stage && (
                <div className="mt-6 lg:mt-0">
                  <StageCard product={stage} />
                </div>
              )}
            </div>

            {/*
              Qolgan aksiya mahsulotlari. Telefon: suriladigan qator;
              planshet 3, kompyuter 5 ustun — sahna kartasi allaqachon
              eʼtiborni olgani uchun bu yerda oddiy toʻr yetarli.
            */}
            {rest.length > 0 && (
              <div className="no-scrollbar snap-x-start -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 tab:mx-0 tab:grid tab:grid-cols-3 tab:gap-5 tab:overflow-visible tab:px-0 lg:-mx-8 lg:px-8 xl:grid-cols-5">
                {rest.map((p) => (
                  <div key={p.id} className="w-[10.25rem] shrink-0 tab:w-auto">
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Sahna kartasi — eng katta chegirma.
 *
 * `SpotlightCard` ning oʻzi ishlatiladi: u allaqachon toʻq fonda
 * rasm+parda+narx kompozitsiyasini beradi va savat amali ham oʻsha
 * `CartAction` dan keladi. Bu yerda faqat ikkita farq bor: chegirma
 * nishoni kattalashadi va tejaladigan SUMMA qoʻshiladi — foiz emas,
 * aynan soʻm, chunki aksiya blokining xabari shu.
 */
function StageCard({ product }: { product: Product }) {
  const saving = product.old_price != null ? product.old_price - product.price : 0;

  return (
    <div className="relative">
      {/*
        Chegirma nishoni `SpotlightCard` ning OʻZIDA chiziladi, faqat
        kattaroq oʻlchamda. Ilgari bu yerda ikkinchi nishon
        qoʻshilardi va natijada bitta kartada ikkita bir xil `−N%`
        yonma-yon turardi (brauzerda koʻrildi).
      */}
      <SpotlightCard product={product} priority discountSize="xl" />

      {saving > 0 && (
        <span className="absolute bottom-4 right-4 z-10 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold tabular-nums text-white">
          {formatPrice(saving)} tejaysiz
        </span>
      )}
    </div>
  );
}

/**
 * Taymer nolga yetgan lahza.
 *
 * Foydalanuvchi sahifada turganda aksiya tugashi mumkin. Oʻshanda
 * kartalarni oʻsha holda qoldirish — narxlar hali ham amal qiladi
 * degan yolgʻon vaʼda. Shuning uchun blok mazmuni almashadi.
 *
 * KEYINGI yuklanishda bu blok UMUMAN chizilmaydi (`HomePage` dagi
 * `showPromo` sharti), yaʼni bu holat faqat oʻsha bitta lahza uchun.
 */
function PromoFinished() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink-300"
      >
        <Clock className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-white">Aksiya yakunlandi</p>
        <p className="mt-0.5 text-sm text-ink-300">Narxlar odatiy holatga qaytdi.</p>
      </div>
      <Link to="/catalog" className={cx(button('primary', 'md'), 'shrink-0')}>
        Katalogga oʻtish <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
