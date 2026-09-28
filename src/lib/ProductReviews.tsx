import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BadgeCheck, Loader2, MessageSquare, Star, Trash2 } from 'lucide-react';
import { supabase } from './supabase';
import { Link } from './router';
import { useAuth } from './auth';
import { useToast } from './toast';
import { formatOrderDate, type ProductReview } from './types';
import { AnimatedButton, ResponsiveModal, StaggerGroup, StaggerItem } from './AnimatedPrimitives';
import { EmptyState, ErrorState } from './ProductCard';
import { summarizeReviews, type ReviewStats } from './productUtils';
import { badge, badgeTone, button, cx, focusRing, skeleton, textarea } from './design';
import { STAR, springs } from './motion';

/*
 * MAHSULOT SHARHLARI.
 *
 * Baza tomoni: `supabase/migrations/20260913000000_product_reviews.sql`.
 * Oʻrtacha reyting va sharhlar soni U YERDA, trigger orqali hisoblanadi —
 * bu komponent ularni HECH QACHON oʻzi yozmaydi, faqat koʻrsatadi.
 *
 * ── BITTA SOʻROV, BITTA MANBA ─────────────────────────────────────
 *
 * Mahsulotning BARCHA sharhlari bir marta yuklanadi. Undan keyin:
 *   • roʻyxat            — shu massivdan
 *   • "Yana koʻrsatish"  — shu massivdan (qayta soʻrov YOʻQ)
 *   • "mening sharhim"   — shu massivdan topiladi
 *   • yangi reyting/son  — shu massivdan hisoblanadi
 *
 * Alohida "mening sharhim bormi?" soʻrovi ATAYLAB yoʻq: RLS oʻqishga
 * ruxsat bergani uchun u baribir shu roʻyxatda boʻladi va ikkinchi
 * soʻrov faqat kechikish qoʻshardi.
 *
 * Sharhlar soni bitta mahsulotda oʻnlab boʻladi, yuz minglab emas —
 * shuning uchun sahifalash (pagination) shart emas va u faqat
 * murakkablik qoʻshardi.
 */

/** Boshida shuncha sharh koʻrsatiladi, qolgani "Yana koʻrsatish" bilan. */
const VISIBLE_STEP = 5;

/** Faqat KOʻRSATISH uchun yulduzchalar qatori. */
export function StarRating({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} aria-label={`Reyting ${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cx(
            'h-3.5 w-3.5 shrink-0',
            n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-ink-100 text-ink-200'
          )}
        />
      ))}
    </span>
  );
}

/*
 * YULDUZCHA TANLAGICH.
 *
 * `role="radiogroup"` + `role="radio"` — bu aynan "bir nechtadan bittasi"
 * tanlovi. Oddiy tugmalar qatori boʻlganda skrinrider ularni bogʻliq
 * boʻlmagan beshta tugma deb oʻqirdi va foydalanuvchi nechta yulduzcha
 * tanlanganini bilmasdi.
 *
 * Klaviatura: har bir yulduzcha alohida fokus oladi (`tabIndex`
 * boshqarilmaydi) — bu sodda va 5 ta element uchun yetarli.
 */
function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(0);
  // Kursor ostidagi qiymat tanlanganidan ustun — foydalanuvchi bosishdan
  // OLDIN natijani koʻradi.
  const shown = hover || value;

  return (
    <div role="radiogroup" aria-label="Baho" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} yulduzcha`}
          disabled={disabled}
          onClick={() => onChange(n)}
          onPointerEnter={() => !disabled && setHover(n)}
          onPointerLeave={() => setHover(0)}
          onFocus={() => !disabled && setHover(n)}
          onBlur={() => setHover(0)}
          animate={{ scale: !reduce && n <= shown && shown > 0 ? STAR.active : 1 }}
          transition={reduce ? { duration: 0 } : springs.snappy}
          className={cx('rounded-sm p-0.5 disabled:cursor-not-allowed', focusRing)}
        >
          <Star
            className={cx(
              'h-7 w-7 transition-colors duration-150',
              n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-ink-100 text-ink-300'
            )}
          />
        </motion.button>
      ))}
    </div>
  );
}

export function ProductReviews({
  productId,
  onStatsChange,
}: {
  productId: string;
  /** Sahifadagi reyting va sharhlar soni shu orqali yangilanadi. */
  onStatsChange?: (stats: ReviewStats) => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const reduce = useReducedMotion();

  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  /* Forma tegilganidan keyingina xato koʻrsatiladi. */
  const [touched, setTouched] = useState(false);
  /*
   * Oʻchirish TASDIQ SOʻRAYDI.
   *
   * Sharh — foydalanuvchi qoʻlda yozgan matn va uni tiklab boʻlmaydi.
   * "Yangilash" tugmasi yonida turgan bir tegishli tugma tasodifan
   * bosilsa, mehnat izsiz yoʻqolardi. Shuning uchun oraga dialog
   * qoʻyilgan — `AccountPage` dagi manzil oʻchirish bilan AYNAN bir xil
   * naqsh (`ResponsiveModal` + `danger`/`outline` juftligi).
   */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /*
   * `onStatsChange` REF ORQALI chaqiriladi, bogʻliqlik sifatida emas.
   *
   * Aks holda `load` uning identifikatoriga bogʻlanardi va chaqiruvchi
   * uni JSX ichida oʻrinda yozgan zahoti (`onStatsChange={(s) => ...}`)
   * har renderda yangi funksiya paydo boʻlardi: `load` yangilanadi →
   * effekt qayta ishlaydi → `setReviews` → yangi render → yana yangi
   * funksiya. Yaʼni CHEKSIZ soʻrovlar halqasi.
   *
   * Hozir `ProductPage` barqaror `setReviewStats` ni uzatadi va muammo
   * koʻrinmaydi — lekin bu chaqiruvchining ehtiyotkorligiga bogʻliq
   * boʻlib qolardi. Ref bilan bogʻliqlik butunlay yoʻqoladi.
   */
  const statsCb = useRef(onStatsChange);
  useEffect(() => {
    statsCb.current = onStatsChange;
  });

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase
      .from('product_reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) {
      setFailed(true);
      setReviews(null);
      return;
    }
    const list = (data ?? []) as ProductReview[];
    setReviews(list);
    statsCb.current?.(summarizeReviews(list));
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(
    () => (user ? (reviews ?? []).find((r) => r.user_id === user.id) ?? null : null),
    [reviews, user]
  );

  /*
   * Forma oʻz sharhim bilan OLDINDAN toʻldiriladi.
   *
   * `mine?.id` ga bogʻlangan: roʻyxat qayta yuklanganda obyekt yangi
   * boʻladi, lekin id oʻzgarmaydi — shuning uchun foydalanuvchi
   * yozayotgan matn har yuklanishda ustidan yozilib ketmaydi.
   */
  useEffect(() => {
    if (!mine) return;
    setRating(mine.rating);
    setBody(mine.body);
  }, [mine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmed = body.trim();
  const bodyTooShort = trimmed.length < 10;
  const invalid = rating < 1 || bodyTooShort;

  const submit = async () => {
    setTouched(true);
    if (invalid || !user || saving) return;
    setSaving(true);

    /*
     * UPSERT — "yuborish" ham, "yangilash" ham AYNI amal.
     *
     * Bazada `unique (product_id, user_id)` bor, shuning uchun ikkinchi
     * marta yozilganda yangi qator YARATILMAYDI, mavjudi yangilanadi.
     * Frontend "bu yangimi yoki tahrirmi?" degan savolni umuman
     * bermaydi — bu qaror bazada, bitta joyda yashaydi.
     */
    const { error } = await supabase.from('product_reviews').upsert(
      { product_id: productId, user_id: user.id, rating, body: trimmed },
      { onConflict: 'product_id,user_id' }
    );

    setSaving(false);
    if (error) {
      notify('Sharhni saqlab boʻlmadi. Qayta urinib koʻring.', 'error');
      return;
    }
    notify(mine ? 'Sharhingiz yangilandi' : 'Sharhingiz uchun rahmat!', 'success');
    // Roʻyxat qayta oʻqiladi — reyting va son SHUNDAN hisoblanadi, yaʼni
    // ekrandagi qiymat har doim koʻrinib turgan sharhlarga mos keladi.
    await load();
  };

  const remove = async () => {
    if (!mine || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('product_reviews').delete().eq('id', mine.id);
    setDeleting(false);
    setConfirmOpen(false);

    if (error) {
      notify('Sharhni oʻchirib boʻlmadi. Qayta urinib koʻring.', 'error');
      return;
    }
    /*
     * Forma QOʻLDA tozalanadi.
     *
     * Oldindan toʻldirish effekti `mine?.id` ga bogʻlangan va `mine`
     * endi `null` — yaʼni u ishlamaydi va eski matn maydonda qolib
     * ketardi. Foydalanuvchi sharhini oʻchirgani holda uning matnini
     * koʻrib turishi chalkash boʻlardi.
     */
    setRating(0);
    setBody('');
    setTouched(false);
    notify('Sharhingiz oʻchirildi', 'info');
    await load();
  };

  if (failed) {
    /*
     * `showHomeLink={false}` — foydalanuvchi allaqachon OʻZI xohlagan
     * sahifada turibdi va uni bosh sahifaga yuborish yordam emas,
     * yoʻqotish boʻlardi. Faqat sharhlar bloki ishlamadi, mahsulotning
     * qolgan hamma narsasi joyida.
     */
    return (
      <ErrorState
        message="Sharhlarni yuklab boʻlmadi"
        onRetry={() => void load()}
        headingLevel="h3"
        showHomeLink={false}
      />
    );
  }

  if (reviews === null) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className={cx('h-3 w-32 rounded', skeleton)} />
            <div className={cx('h-3 w-full rounded', skeleton)} />
            <div className={cx('h-3 w-2/3 rounded', skeleton)} />
          </div>
        ))}
      </div>
    );
  }

  const shown = expanded ? reviews : reviews.slice(0, VISIBLE_STEP);
  const hidden = reviews.length - shown.length;

  return (
    <div className="space-y-6">
      {reviews.length === 0 ? (
        <EmptyState
          title="Hali sharhlar yoʻq"
          message="Birinchi boʻlib fikr bildiring!"
          icon={<MessageSquare className="h-6 w-6" />}
          headingLevel="h3"
        />
      ) : (
        <>
          <StaggerGroup className="space-y-5">
            {shown.map((r) => (
              <StaggerItem key={r.id}>
                <article className="border-b border-ink-100 pb-5 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {/* Ism bo'sh bo'lsa neytral matn. Bu TARJIMA masalasi,
                        shuning uchun bazada emas, shu yerda hal qilinadi. */}
                    <span className="text-sm font-semibold text-ink-900">
                      {r.author_name.trim() || 'Mijoz'}
                    </span>
                    {r.verified_purchase && (
                      <span className={cx(badge, badgeTone.success)}>
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Xarid tasdiqlangan
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <StarRating value={r.rating} />
                    <span className="text-xs text-ink-600">{formatOrderDate(r.created_at, false)}</span>
                  </div>

                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{r.body}</p>
                </article>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className={cx(button('outline', 'md'), 'w-full sm:w-auto')}
            >
              Yana {hidden} ta sharhni koʻrsatish
            </button>
          )}
        </>
      )}

      {/* ── Forma ──────────────────────────────────────────────── */}
      <div className="rounded-card border border-ink-200 bg-ink-50/50 p-4 sm:p-5">
        {!user ? (
          <p className="text-sm text-ink-600">
            Sharh qoldirish uchun{' '}
            <Link to="/login" className={cx('font-semibold text-orange-700 hover:underline', focusRing)}>
              tizimga kiring
            </Link>
            .
          </p>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-ink-900">
              {mine ? 'Sharhingizni tahrirlash' : 'Fikringizni bildiring'}
            </h3>

            <div className="mt-3">
              <StarPicker value={rating} onChange={setRating} disabled={saving} />
              {touched && rating < 1 && (
                <p className="mt-1.5 text-xs text-red-600">Bahoni tanlang.</p>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="review-body" className="mb-1.5 block text-xs font-medium text-ink-600">
                Sharhingiz
              </label>
              <textarea
                id="review-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={saving}
                placeholder="Mahsulot haqidagi taassurotingiz — kamida 10 ta belgi"
                className={textarea(touched && bodyTooShort)}
              />
              {/*
                Chegara bazadagi CHECK bilan BIR XIL (10 belgi). Agar u
                faqat serverda bo'lsa, foydalanuvchi uzun matn yozib
                yuborgach tushunarsiz xato olardi.
              */}
              {touched && bodyTooShort && (
                <p className="mt-1.5 text-xs text-red-600">
                  Kamida 10 ta belgi yozing ({trimmed.length}/10).
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
            <AnimatedButton
              sink="flat"
              type="button"
              onClick={() => void submit()}
              disabled={saving || deleting}
              className={button('primary', 'md')}
            >
              {saving ? (
                <>
                  <motion.span
                    aria-hidden="true"
                    animate={reduce ? undefined : { rotate: 360 }}
                    transition={reduce ? undefined : { duration: 0.9, ease: 'linear', repeat: Infinity }}
                    className="flex"
                  >
                    <Loader2 className="h-4 w-4" />
                  </motion.span>
                  Saqlanmoqda…
                </>
              ) : mine ? (
                'Yangilash'
              ) : (
                'Yuborish'
              )}
            </AnimatedButton>

              {/*
                O'chirish FAQAT sharh mavjud bo'lganda ko'rinadi va
                asosiy amaldan uzoqroqda, `ghost` ko'rinishida turadi:
                u yerda bo'lishi kerak, lekin ko'zni tortmasligi kerak.
                Qizil rang faqat hover/fokusda paydo bo'ladi — tinch
                holatda tugma "xavfli" deb baqirmaydi.
              */}
              {mine && (
                <AnimatedButton
                  sink="flat"
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={saving || deleting}
                  aria-label="Sharhimni oʻchirish"
                  className={button('ghost', 'md', 'hover:bg-red-50 hover:text-red-600')}
                >
                  <Trash2 className="h-4 w-4" />
                  Oʻchirish
                </AnimatedButton>
              )}
            </div>
          </>
        )}
      </div>

      {/*
        Tasdiq dialogi — `AccountPage` dagi manzil o'chirish bilan bir xil
        naqsh. Portal KERAK EMAS: sahifani o'rab turgan `pageVariants`
        faqat `opacity` ni animatsiya qiladi, ya'ni hech qanday transform
        `position: fixed` uchun yangi "containing block" yaratmaydi.
      */}
      <AnimatePresence>
        {confirmOpen && (
          <ResponsiveModal title="Sharhni oʻchirish" onClose={() => setConfirmOpen(false)}>
            <p className="text-sm leading-relaxed text-ink-600">
              Sharhingiz butunlay oʻchiriladi va uni tiklab boʻlmaydi. Davom etasizmi?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => void remove()}
                disabled={deleting}
                className={button('danger', 'md')}
              >
                {deleting ? 'Oʻchirilmoqda…' : 'Oʻchirish'}
              </button>
              <button onClick={() => setConfirmOpen(false)} className={button('outline', 'md')}>
                Bekor qilish
              </button>
            </div>
          </ResponsiveModal>
        )}
      </AnimatePresence>
    </div>
  );
}
