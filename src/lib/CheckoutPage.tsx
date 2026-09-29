import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCart } from './cart';
import { unitPrice, cartItemKey } from './cartUtils';
import { useAuth } from './auth';
import { useToast } from './toast';
import { useSettings } from './settings';
import { useRouter, Link } from './router';
import { supabase } from './supabase';
import { formatPrice } from './types';
import { quoteDelivery } from './delivery';
import { normalizePhone } from './phone';
import { cartSignature, newCheckoutRequestId, isMissingFunctionError } from './idempotency';
import { useSeo } from './seo';
import {
  Banknote, Check, ChevronLeft, MapPin, Smartphone, Truck, Wallet,
  ShieldCheck, Lock, Package,
} from 'lucide-react';
import { useIsMobile } from './uiHooks';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { OrderReceiptPrinter, type ReceiptData } from './OrderReceiptPrinter';
import { Cube } from './CatalogCubes';
import { CONFIRM, CUBE_FALL, DURATION, EASE, springs } from './motion';
import { button, card, cx, focusRing, input, shell, textarea } from './design';

/*
 * Baza idempotentlik kalitini qoʻllaydimi?
 *
 * Modul darajasida saqlanadi (komponent holatida emas): javob butun
 * sessiya uchun bir xil va sahifadan sahifaga oʻtganda qayta
 * tekshirishning hojati yoʻq. Standart `true` — optimistik: yangi
 * bazada birinchi urinishdayoq toʻgʻri yoʻldan boramiz.
 */
let supportsIdempotencyKey = true;

type PaymentMethod = 'Naqd pul' | 'Click' | 'Payme';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; desc: string; icon: typeof Banknote }[] = [
  { value: 'Naqd pul', label: 'Naqd pul', desc: 'Kuryerga yetkazib berishda toʻlaysiz', icon: Banknote },
  { value: 'Click', label: 'Click', desc: 'Click orqali onlayn toʻlov', icon: Smartphone },
  { value: 'Payme', label: 'Payme', desc: 'Payme orqali onlayn toʻlov', icon: Wallet },
];

// `create_order` RPC postgres xatolarini shu kodlar bilan qaytaradi.
const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Buyurtma berish uchun avval tizimga kiring.',
  ACCOUNT_BLOCKED: 'Hisobingiz bloklangan. Administratsiya bilan bogʻlaning.',
  OUT_OF_STOCK: 'Afsuski, baʼzi mahsulotlar tugab qoldi. Savatni tekshiring.',
  TOO_MANY_ORDERS: 'Juda koʻp buyurtma yubordingiz. Bir necha daqiqadan soʻng urinib koʻring.',
  INVALID_DETAILS: 'Ism, telefon yoki manzil toʻliq kiritilmadi.',
  EMPTY_CART: 'Savatingiz boʻsh.',
  INVALID_QUANTITY: 'Mahsulot miqdori notoʻgʻri.',
  INVALID_PAYMENT_METHOD: 'Toʻlov usuli notoʻgʻri.',
  // Tanlangan variant (rang/xotira) oʻchirilgan yoki nofaol qilingan —
  // savatda esa hamon turibdi.
  INVALID_VARIANT: 'Tanlangan variant endi mavjud emas. Mahsulotni qaytadan tanlang.',
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  note: string;
};

type FieldKey = keyof FormState;

function validate(form: FormState): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (form.name.trim().length < 2) errors.name = 'Ism va familiyangizni kiriting';
  if (normalizePhone(form.phone).length < 9) errors.phone = 'Toʻgʻri telefon raqam kiriting';
  if (form.city.trim().length < 2) errors.city = 'Shaharni kiriting';
  if (form.address.trim().length < 5) errors.address = 'Toʻliq manzilni kiriting (koʻcha, uy)';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Email notoʻgʻri';
  return errors;
}

export function CheckoutPage() {
  const { items, subtotal, count, clearCart } = useCart();
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const isMobile = useIsMobile();

  const [submitting, setSubmitting] = useState(false);
  /*
   * `useRef` — `useState` EMAS.
   *
   * Kalit renderʼga taʼsir qilmaydi va uni oʻzgartirish qayta render
   * talab qilmaydi. Muhimrogʻi: `handleSubmit` ichida darhol oʻqilishi
   * kerak, `useState` esa yangi qiymatni faqat keyingi renderʼda beradi.
   */
  const requestIdRef = useRef<{ signature: string; id: string }>({ signature: '', id: '' });
  const [done, setDone] = useState<ReceiptData | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Naqd pul');

  const [form, setForm] = useState<FormState>({
    name: '', phone: '', email: '', city: 'Toshkent', address: '', note: '',
  });

  useSeo({ title: 'Buyurtmani rasmiylashtirish', description: 'Yetkazib berish manzili va toʻlov usulini tanlang.', noindex: true });

  // Profil maʼlumotlari bilan avtomatik toʻldirish — mijoz bir xil narsani
  // har safar qayta yozmasligi kerak.
  useEffect(() => {
    if (!profile && !user) return;
    // Telefon orqali roʻyxatdan oʻtganlarda `user.email` sunʼiy
    // `<raqam>@telegram.local` boʻladi — uni email maydoniga qoʻymaymiz.
    const realEmail = user?.email && !user.email.endsWith('@telegram.local') ? user.email : '';
    setForm((f) => ({
      ...f,
      name: f.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim(),
      phone: f.phone || profile?.phone || '',
      email: f.email || realEmail,
    }));
  }, [profile, user]);

  const errors = useMemo(() => validate(form), [form]);
  const addressValid = !errors.name && !errors.phone && !errors.city && !errors.address;
  /*
   * Desktopʼda bosqich "tugallandi" belgisi.
   *
   * `touched` ATAYLAB hisobga olinmaydi: bu holat xato koʻrsatish emas,
   * balki "bu boʻlimda kerakli narsa bor" degani. Foydalanuvchi maydonni
   * toʻldirib boʻlishi bilanoq tanga aylanadi — u kursorni boshqa joyga
   * koʻchirishini kutib turish kerak emas.
   */
  const contactDone = !errors.name && !errors.phone && !errors.email;
  const deliveryDone = !errors.city && !errors.address;
  const fieldError = (key: FieldKey) => (touched[key] ? errors[key] : undefined);
  const setField = (key: FieldKey) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const touchAll = () =>
    setTouched({ name: true, phone: true, email: true, city: true, address: true, note: true });

  const delivery = quoteDelivery(settings, subtotal, form.city);
  const total = subtotal + delivery.fee;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return; // ikki marta bosilganda qayta yuborilmasin

    if (!user) {
      notify(ERROR_MESSAGES.AUTH_REQUIRED, 'error');
      navigate('/login');
      return;
    }
    touchAll();
    if (Object.keys(errors).length > 0) {
      notify('Iltimos, majburiy maydonlarni toʻgʻri toʻldiring.', 'error');
      setStep(1);
      return;
    }

    setSubmitting(true);

    /*
     * Idempotentlik kaliti — bitta checkout urinishi uchun bitta UUID.
     * Savat oʻzgarmaguncha va buyurtma yaratilmaguncha OʻZGARMAYDI,
     * shuning uchun tarmoq uzilishidan keyingi qayta urinish dublikat
     * buyurtma yaratmaydi (qarang: lib/idempotency.ts).
     */
    const signature = cartSignature(items);
    if (requestIdRef.current.signature !== signature) {
      requestIdRef.current = { signature, id: newCheckoutRequestId() };
    }
    const checkoutRequestId = requestIdRef.current.id;

    /*
     * Barcha maʼlumot BITTA atomik RPCʼga beriladi.
     *
     * Ilgari shahar/izoh/email buyurtma yaratilgandan keyin alohida
     * `orders.update()` bilan yozilardi — lekin `orders` jadvalida mijoz
     * uchun UPDATE policy yoʻq, shuning uchun bu soʻrov 0 qatorni
     * oʻzgartirib, xato ham qaytarmasdan jimgina yoʻqolardi. Endi bunday
     * "silent failure" yoʻq. Narx ham serverda qayta hisoblanadi — mijoz
     * yuborgan summaga hech qachon ishonilmaydi.
     */
    const baseArgs = {
      p_customer_name: form.name.trim(),
      p_phone: form.phone.trim(),
      p_address: form.address.trim(),
      p_latitude: null,
      p_longitude: null,
      p_items: items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        variant: item.variant ?? null,
        // Variantning narx farqi va ombori serverda AYNAN shu ID boʻyicha
        // tekshiriladi — matnli nomga ishonib boʻlmaydi.
        variant_id: item.variantId ?? null,
      })),
      p_payment_method: paymentMethod,
      p_city: form.city.trim(),
      p_note: form.note.trim() || null,
      p_email: form.email.trim() || null,
    };

    /*
     * Baza hali `p_checkout_request_id` ni bilmasligi mumkin (frontend
     * migratsiyadan oldin chiqib ketgan boʻlsa). Bunday holda PostgREST
     * "funksiya topilmadi" xatosini qaytaradi — ortiqcha nomli argument
     * JIM OʻTKAZIB YUBORILMAYDI. Shuning uchun bir marta kalitsiz qayta
     * urinamiz, natijani esa eslab qolamiz (qarang: lib/idempotency.ts).
     */
    let { data: orderId, error } = supportsIdempotencyKey
      ? await supabase.rpc('create_order', { ...baseArgs, p_checkout_request_id: checkoutRequestId })
      : await supabase.rpc('create_order', baseArgs);

    if (error && supportsIdempotencyKey && isMissingFunctionError(error)) {
      supportsIdempotencyKey = false;
      console.warn(
        'create_order: baza `p_checkout_request_id` ni qoʻllamaydi — ' +
          'migratsiya hali qoʻllanmagan. Kalitsiz qayta urinilmoqda.'
      );
      ({ data: orderId, error } = await supabase.rpc('create_order', baseArgs));
    }

    if (error || !orderId) {
      const code = Object.keys(ERROR_MESSAGES).find((key) => error?.message?.includes(key));
      notify(code ? ERROR_MESSAGES[code] : 'Buyurtmani yaratib boʻlmadi. Qaytadan urinib koʻring.', 'error');
      setSubmitting(false);
      return;
    }

    /*
     * Serverda hisoblangan yakuniy summani oʻqib olamiz — tasdiq
     * ekranida mijozga aynan bazadagi raqam koʻrsatiladi.
     *
     * `status` ham shu yerdan olinadi: tasdiq kartasi holatni TAXMIN
     * QILMASLIGI kerak. Ustunning standart qiymati «Yangi», lekin uni
     * frontendda qattiq yozib qoʻyish — oʻylab topilgan maʼlumot
     * boʻlardi (masalan trigger holatni boshqacha qoʻysa).
     */
    const { data: created } = await supabase
      .from('orders')
      .select('order_number, total_amount, status')
      .eq('id', orderId)
      .maybeSingle();

    // Buyurtma yaratildi — kalit "sarflandi". Keyingi xarid butunlay
    // yangi urinish boʻlgani uchun yangi kalit oladi.
    requestIdRef.current = { signature: '', id: '' };

    /*
     * Savat SURATI — `clearCart()` DAN OLDIN.
     *
     * Tasdiq kartasi haqiqiy pozitsiyalarni koʻrsatadi, savat esa
     * darhol tozalanadi. Suratni keyin olsak, roʻyxat boʻsh chiqardi.
     */
    const purchased = items.map((i) => ({
      key: cartItemKey(i),
      name: i.product.name,
      quantity: i.quantity,
    }));

    clearCart();
    setDone({
      number: created?.order_number || String(orderId).slice(0, 8).toUpperCase(),
      total: Number(created?.total_amount ?? total),
      payment: paymentMethod,
      // Baza javob bermasa — holatni OʻYLAB TOPMAYMIZ, ustun standarti.
      status: created?.status || 'Yangi',
      items: purchased,
    });
    setSubmitting(false);
    notify('Buyurtmangiz qabul qilindi!', 'success');
  };

  /* ── Muvaffaqiyat ekrani ─────────────────────────────────────────── */
  if (done) {
    return (
      /*
       * Yumshoq CHUQURLIK oʻtishi, keskin kesish emas: forma oʻrnini
       * tasdiq egallaydi, lekin sahifa, shell va fon joyida qoladi.
       * Shuning uchun bu yerda faqat opacity + kichik masshtab bor —
       * butun sahifa aylanmaydi, kattalashmaydi va blur boʻlmaydi.
       */
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.38, ease: EASE.standard }}
        className={cx(shell, "py-6 lg:py-10")}
      >
        <div className="mx-auto w-full max-w-md">
          <OrderConfirmedMark />
          <OrderReceiptPrinter data={done} mode="success" />

          {/*
            AMALLAR PRINTERDAN TASHQARIDA va DARHOL ishlaydi.

            Ular animatsiyani KUTMAYDI: chek hali bosilayotgan bo'lsa
            ham foydalanuvchi bosib keta oladi. Bu ataylab — hech kim
            2 sekundlik multfilmni tomosha qilishga majbur emas.
          */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mt-6 flex flex-col gap-2 sm:flex-row"
          >
            {/*
              `sm:flex-1` — ustunli flex'da `flex-1` ning `flex-basis: 0%`
              `h-12` ni bekor qiladi va tugma 23px ga tushib qoladi
              (o'lchangan). Faqat qatorli rejimda qo'llaymiz.
            */}
            <Link to="/account/orders" className={cx(button('primary', 'lg'), 'sm:flex-1')}>
              Buyurtmalarim
            </Link>
            <Link to="/catalog" className={cx(button('outline', 'lg'), 'sm:flex-1')}>
              Xaridni davom ettirish
            </Link>
          </motion.div>

          {done.payment !== 'Naqd pul' && (
            <p className="mt-4 rounded-control bg-orange-50 px-4 py-3 text-xs leading-relaxed text-orange-800">
              Onlayn toʻlov hozircha tasdiqlanmoqda. Toʻlov holati oʻzgarganda buyurtmangiz
              avtomatik yangilanadi — uni «Buyurtmalarim» boʻlimida kuzatib boring.
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  /* ── Boʻsh savat ─────────────────────────────────────────────────── */
  if (items.length === 0) {
    return (
      <div className={cx(shell, 'py-6 lg:py-10')}>
        <div className={cx(card, 'mx-auto max-w-md p-8 text-center')}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-ink-900">Savatingiz boʻsh</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Buyurtma rasmiylashtirish uchun avval mahsulot tanlang.
          </p>
          <Link to="/catalog" className={cx(button('primary', 'md'), 'mt-5')}>
            Katalogga oʻtish
          </Link>
        </div>
      </div>
    );
  }

  const summary = (
    <OrderSummary
      items={items.map((i) => ({
        key: cartItemKey(i),
        name: i.product.name,
        variant: i.variant,
        quantity: i.quantity,
        lineTotal: unitPrice(i) * i.quantity,
      }))}
      subtotal={subtotal}
      deliveryFee={delivery.fee}
      total={total}
      count={count}
    />
  );

  /* ── Mobil: 3 bosqichli sehrgar ──────────────────────────────────── */
  if (isMobile) {
    const steps: { n: 1 | 2 | 3; label: string }[] = [
      { n: 1, label: 'Manzil' },
      { n: 2, label: 'Yetkazish' },
      { n: 3, label: 'Toʻlov' },
    ];

    return (
      <div className="pb-10">
        <div className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 px-4 pt-3 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => (step === 1 ? navigate('/cart') : setStep((s) => (s - 1) as 1 | 2 | 3))}
              aria-label="Orqaga"
              className={cx('-ml-2 flex h-10 w-10 items-center justify-center rounded-control text-ink-500', focusRing)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-semibold text-ink-900">Rasmiylashtirish</h1>
          </div>

          <ol className="mt-3 flex items-center gap-1.5 pb-3">
            {steps.map((s, i) => (
              <li key={s.n} className="flex flex-1 items-center gap-1.5">
                {/*
                  Raqam endi matnda emas, tangada. Tugallangan bosqichda
                  u check-belgiga aylanadi — ya'ni "qaysi bosqichdaman"
                  degan savolga chiziq ham, rang ham, shakl ham javob
                  beradi. Rang YAGONA signal bo'lib qolmaydi (WCAG 1.4.1).
                */}
                <button
                  type="button"
                  onClick={() => s.n < step && setStep(s.n)}
                  disabled={s.n >= step}
                  aria-current={step === s.n ? 'step' : undefined}
                  className={cx(
                    'flex items-center gap-1.5 rounded-sm text-xs font-semibold transition-colors',
                    focusRing,
                    step === s.n ? 'text-orange-700' : step > s.n ? 'text-ink-600' : 'text-ink-500'
                  )}
                >
                  <StepBead n={s.n} done={step > s.n} size="sm" />
                  {s.label}
                </button>
                {i < steps.length - 1 && (
                  <span className={cx('h-px flex-1 transition-colors', step > s.n ? 'bg-orange-400' : 'bg-ink-200')} />
                )}
              </li>
            ))}
          </ol>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: DURATION.ui, ease: EASE.standard }}
              className="space-y-4 px-4 pt-4"
            >
              <SectionTitle icon={MapPin}>Yetkazib berish manzili</SectionTitle>
              <Field label="Ism va familiya" required value={form.name} onChange={setField('name')} onBlur={() => setTouched((t) => ({ ...t, name: true }))} error={fieldError('name')} autoComplete="name" />
              <Field label="Telefon" required value={form.phone} onChange={setField('phone')} onBlur={() => setTouched((t) => ({ ...t, phone: true }))} error={fieldError('phone')} placeholder="+998 90 123 45 67" type="tel" inputMode="tel" autoComplete="tel" />
              <Field label="Shahar / viloyat" required value={form.city} onChange={setField('city')} onBlur={() => setTouched((t) => ({ ...t, city: true }))} error={fieldError('city')} autoComplete="address-level2" />
              <Field label="Manzil" required value={form.address} onChange={setField('address')} onBlur={() => setTouched((t) => ({ ...t, address: true }))} error={fieldError('address')} placeholder="Koʻcha, uy, kvartira" autoComplete="street-address" />
              <Field label="Email" hint="Ixtiyoriy — buyurtma tasdigʻini yuboramiz" value={form.email} onChange={setField('email')} onBlur={() => setTouched((t) => ({ ...t, email: true }))} error={fieldError('email')} type="email" inputMode="email" autoComplete="email" />
              <NoteField id="checkout-note-m" value={form.note} onChange={setField('note')} />

              <button
                type="button"
                onClick={() => {
                  if (addressValid) return setStep(2);
                  touchAll();
                  notify('Majburiy maydonlarni toʻgʻri toʻldiring.', 'error');
                }}
                className={cx(button('primary', 'lg'), 'w-full')}
              >
                Davom etish
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: DURATION.ui, ease: EASE.standard }}
              className="space-y-4 px-4 pt-4"
            >
              <SectionTitle icon={Truck}>Yetkazib berish usuli</SectionTitle>
              <div className="flex items-center gap-3 rounded-card border border-orange-300 bg-orange-50 p-4">
                <Truck className="h-6 w-6 shrink-0 text-orange-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">Kuryer orqali yetkazib berish</p>
                  <p className="truncate text-xs text-ink-500">{form.address}, {form.city}</p>
                </div>
                <span className={cx('shrink-0 text-sm font-semibold', delivery.fee === 0 ? 'text-emerald-600' : 'text-ink-900')}>
                  {delivery.fee === 0 ? 'Bepul' : formatPrice(delivery.fee)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink-500">
                Toshkent boʻylab odatda 1 kun ichida, boshqa hududlarga 2–3 kun ichida yetkaziladi.
                {delivery.freeThreshold > 0 && ` ${formatPrice(delivery.freeThreshold)} dan yuqori buyurtmalarda yetkazib berish bepul.`}
              </p>
              <button type="button" onClick={() => setStep(3)} className={cx(button('primary', 'lg'), 'w-full')}>
                Davom etish
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: DURATION.ui, ease: EASE.standard }}
              className="space-y-4 px-4 pt-4"
            >
              <SectionTitle icon={Wallet}>Toʻlov usulini tanlang</SectionTitle>
              <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} />
              {summary}
              <SubmitButton label="Buyurtmani tasdiqlash" submitting={submitting} onClick={() => handleSubmit()} />
              <TrustNote />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ── Desktop ─────────────────────────────────────────────────────── */
  return (
    <div className={cx(shell, 'py-5 lg:py-8')}>
      <h1 className="text-display-sm">Buyurtmani rasmiylashtirish</h1>
      <p className="mt-1 text-sm text-ink-500">Maʼlumotlarni toʻldiring — buyurtmangiz bir daqiqada tayyor.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <section className={cx(card, 'p-5 sm:p-6')}>
            <SectionTitle icon={MapPin} step={1} done={contactDone}>Kontakt maʼlumotlari</SectionTitle>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Ism va familiya" required value={form.name} onChange={setField('name')} onBlur={() => setTouched((t) => ({ ...t, name: true }))} error={fieldError('name')} autoComplete="name" />
              <Field label="Telefon" required value={form.phone} onChange={setField('phone')} onBlur={() => setTouched((t) => ({ ...t, phone: true }))} error={fieldError('phone')} placeholder="+998 90 123 45 67" type="tel" inputMode="tel" autoComplete="tel" />
              <div className="sm:col-span-2">
                <Field label="Email" hint="Ixtiyoriy — buyurtma tasdigʻini yuboramiz" value={form.email} onChange={setField('email')} onBlur={() => setTouched((t) => ({ ...t, email: true }))} error={fieldError('email')} type="email" inputMode="email" autoComplete="email" />
              </div>
            </div>
          </section>

          <section className={cx(card, 'p-5 sm:p-6')}>
            <SectionTitle icon={Truck} step={2} done={deliveryDone}>Yetkazib berish</SectionTitle>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Shahar / viloyat" required value={form.city} onChange={setField('city')} onBlur={() => setTouched((t) => ({ ...t, city: true }))} error={fieldError('city')} autoComplete="address-level2" />
              <div className="sm:col-span-2">
                <Field label="Manzil" required value={form.address} onChange={setField('address')} onBlur={() => setTouched((t) => ({ ...t, address: true }))} error={fieldError('address')} placeholder="Koʻcha, uy, kvartira" autoComplete="street-address" />
              </div>
              <div className="sm:col-span-2">
                <NoteField id="checkout-note" value={form.note} onChange={setField('note')} />
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-control bg-ink-50 px-3.5 py-2.5 text-xs text-ink-600">
              <Truck className="h-4 w-4 shrink-0 text-orange-600" />
              {delivery.fee === 0
                ? 'Ushbu buyurtma uchun yetkazib berish bepul.'
                : `Yetkazib berish: ${formatPrice(delivery.fee)}${
                    delivery.remainingForFree > 0
                      ? ` — yana ${formatPrice(delivery.remainingForFree)} qoʻshsangiz bepul boʻladi`
                      : ''
                  }`}
            </p>
          </section>

          <section className={cx(card, 'p-5 sm:p-6')}>
            <SectionTitle icon={Wallet} step={3}>Toʻlov usuli</SectionTitle>
            <div className="mt-4">
              <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} />
            </div>
          </section>
        </div>

        <aside className="min-w-0 lg:col-span-1">
          <div className="lg:sticky" style={{ top: 'calc(var(--header-h) + 1rem)' }}>
            {summary}
            <div className="mt-3">
              <SubmitButton label="Buyurtmani tasdiqlash" submitting={submitting} type="submit" />
            </div>
            <TrustNote />
          </div>
        </aside>
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Yordamchi komponentlar.
 *
 * MUHIM: bular ilgari CheckoutPage funksiyasining ICHIDA eʼlon qilingan edi.
 * Har bir renderda (yaʼni har bir bosilgan harfda) React ularni YANGI
 * komponent turi deb hisoblab, butun daraxtni qayta yaratardi — bu keraksiz
 * ish va animatsiyalarning sakrashiga olib kelardi.
 * ──────────────────────────────────────────────────────────────────── */

function SectionTitle({
  icon: Icon, children, step, done,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
  step?: number;
  /** Boʻlim toʻldirilganmi — raqam check-belgiga aylanadi. */
  done?: boolean;
}) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ink-900">
      {step ? (
        <StepBead n={step} done={done} />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-orange-600" />
      )}
      {children}
    </h2>
  );
}

/*
 * ── BOSQICH DOIRASI: TANGA AYLANISHI ────────────────────────────────
 *
 * Doira ikki YUZLI tanga: oldida bosqich raqami, orqasida check-belgi.
 * Bosqich tugallanganda tanga `rotateY` boʻylab 180° aylanadi va
 * ikkinchi yuzi chiqadi.
 *
 * Nega `AnimatePresence` bilan almashtirish EMAS?
 * Almashtirishda eski belgi soʻnib, yangisi paydo boʻlardi — yaʼni
 * ikkita alohida element. Tanga esa BITTA jism: foydalanuvchi "raqam
 * checkʼga aylandi" deb koʻradi, "raqam oʻchib, check chiqdi" deb emas.
 * Buning uchun ikkala yuz ham bir vaqtda DOMʼda turadi va qaysi biri
 * koʻrinishini `backface-visibility` hal qiladi.
 *
 * REDUCED MOTION: aylanish nolga tushadi, lekin burchak baribir 180°
 * boʻladi — yaʼni check-belgi DARHOL va TOʻGʻRI koʻrinadi. Holat
 * animatsiyaga umuman bogʻliq emas.
 */
function StepBead({ n, done, size = 'md' }: { n: number; done?: boolean; size?: 'sm' | 'md' }) {
  const reduce = useReducedMotion();
  const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <span
      className={cx('relative shrink-0', box)}
      style={{ perspective: CONFIRM.beadPerspective }}
      /* Holat matn bilan ham aytiladi — u rangga ham, 3D ga ham bogʻliq emas. */
      aria-label={done ? `${n}-bosqich tugallandi` : `${n}-bosqich`}
      role="img"
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: done ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : springs.soft}
      >
        <span
          style={{ backfaceVisibility: 'hidden' }}
          className={cx(
            'absolute inset-0 flex items-center justify-center rounded-full bg-orange-50 font-bold text-orange-700',
            'text-xs'
          )}
        >
          {n}
        </span>
        <span
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-emerald-700 text-white"
        >
          <Check className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={3} />
        </span>
      </motion.span>
    </span>
  );
}

/*
 * ── TASDIQ BELGISI VA KUB ZARRACHALARI ──────────────────────────────
 *
 * Ilovadagi eng katta lahza: toʻlov oʻtdi. Ikki qatlamdan iborat.
 *
 * 1. CHECK-BELGI `rotateY` boʻylab aylanib keladi (`springs.soft`).
 *    Prujina `snappy` emas: tasdiq shoshilmaydi, u ogʻir va ishonchli
 *    boʻlishi kerak. `soft` oxirida kichik "overshoot" beradi —
 *    belgi joyiga QOʻYILGANDEK tuyuladi.
 *
 * 2. KUB ZARRACHALARI sekin pastga choʻkadi. Bu konfeti EMAS:
 *    konfeti yuqoriga otiladi va tez tarqaydi, bu yerda esa
 *    navigatsiya ikonkasidagi kubning kattaroq nusxalari 2–3 soniya
 *    davomida xotirjam tushadi. Shakl `CatalogCubes` dan keladi —
 *    nusxa koʻchirilgan emas, AYNAN oʻsha element.
 *
 * Hammasi `pointer-events-none`: pastdagi chek va tugmalar birinchi
 * kadrdan boshlab bosiladi. Hech kim animatsiyani kutmaydi.
 */
function OrderConfirmedMark() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mb-2 flex h-44 items-center justify-center overflow-hidden">
      {!reduce && <FallingCubes />}

      <motion.span
        aria-hidden="true"
        initial={reduce ? { opacity: 0 } : { rotateY: CONFIRM.flipFrom, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={
          reduce
            ? { duration: DURATION.ui }
            : { ...springs.soft, delay: CONFIRM.flipDelay, opacity: { duration: DURATION.ui } }
        }
        style={{ transformPerspective: CONFIRM.perspective }}
        className={cx(
          'relative z-10 flex h-16 w-16 items-center justify-center rounded-full',
          'bg-emerald-600 text-white shadow-[0_10px_30px_-10px_rgba(5,150,105,0.85)]'
        )}
      >
        <Check className="h-8 w-8" strokeWidth={3} />
      </motion.span>
    </div>
  );
}

/*
 * Har bir zarrachaning "shaxsiyati" — bir xil harakat sunʼiy koʻrinadi.
 *
 * Qiymatlar QATʼIY, `Math.random()` EMAS. Chek bosilayotganda bu
 * komponent ham qayta render boʻladi; tasodifiy qiymatlarda zarrachalar
 * har kadrда joyini oʻzgartirib, butun harakat "titrab" ketardi.
 * (`OrderReceiptPrinter` dagi `TEAR_PROFILE` ham xuddi shu sababdan
 * qatʼiy.)
 *
 *   x     — boshlangʻich gorizontal siljish (px, markazdan)
 *   size  — kub eni (px): ikonkadagi 7pxʼning kattaroq nusxasi
 *   drift — tushish davomida yon tomonga suzish (px)
 *   rx/ry — butun yoʻl davomidagi burilish (daraja)
 *   slow  — 0…1: `fastest`↔`slowest` oraligʻidagi oʻrni
 *   wait  — 0…1: `spread` oraligʻidagi kechikish
 *
 * `slow` va `wait` — VAQT EMAS, ulush. Haqiqiy soniyalar faqat
 * `CUBE_FALL` tokenidan chiqadi, yaʼni butun yomgʻirning tezligini
 * bitta joydan sozlash mumkin.
 *
 * BURCHAKLAR NEGA ±72° DAN OSHMAYDI.
 *
 * Avval ular ±110…210° edi — yaʼni zarracha yoʻl davomida 90° dan
 * oʻtardi. Kub esa yassi plitka: aynan 90° da u qirrasi bilan turadi
 * va eni nolga tushadi. Brauzerda koʻrilganda zarrachalar ingichka
 * chiziqchalarga aylanib, oddiy konfeti parchalariga oʻxshab
 * qolgandi — yaʼni "kub" degan oʻzak yoʻqolgandi.
 *
 * 72° da plitkaning eni eng kamida cos(72°) ≈ 31% boʻlib qoladi:
 * burilish aniq koʻrinadi, lekin kvadrat hech qachon yoʻqolmaydi.
 * `CatalogCubes` dagi ikonka ham xuddi shu sababdan nozik
 * burchaklarda qoladi.
 */
const FALLING = [
  { x: -132, size: 13, drift: 10, rx: 52, ry: -68, slow: 0.25, wait: 0.0 },
  { x: -96, size: 18, drift: -14, rx: -60, ry: 44, slow: 0.7, wait: 0.42 },
  { x: -72, size: 10, drift: 8, rx: 70, ry: 30, slow: 0.05, wait: 0.75 },
  { x: -44, size: 15, drift: -9, rx: -38, ry: -62, slow: 0.55, wait: 0.12 },
  { x: -18, size: 11, drift: 13, rx: 64, ry: 50, slow: 0.9, wait: 0.6 },
  { x: 8, size: 16, drift: -7, rx: -46, ry: -40, slow: 0.35, wait: 0.28 },
  { x: 30, size: 12, drift: 11, rx: 56, ry: 72, slow: 1.0, wait: 0.05 },
  { x: 58, size: 14, drift: -12, rx: -68, ry: 34, slow: 0.15, wait: 0.85 },
  { x: 84, size: 9, drift: 6, rx: 72, ry: -54, slow: 0.62, wait: 0.5 },
  { x: 108, size: 17, drift: -10, rx: -42, ry: 66, slow: 0.45, wait: 0.2 },
  { x: 134, size: 11, drift: 9, rx: 60, ry: -36, slow: 0.8, wait: 0.68 },
  { x: 156, size: 13, drift: -6, rx: -64, ry: 48, slow: 0.12, wait: 0.35 },
] as const;

/*
 * Rang halqasi — brend rangining uch pogʻonasi.
 *
 * Koʻp rangli konfeti ATAYLAB yoʻq: ilovada bitta brend ohangi bor va
 * nishonlash uni buzmasligi kerak. Chuqurlik ranglar soni bilan emas,
 * oʻlcham va tezlik farqi bilan beriladi.
 */
const CUBE_TONES = ['bg-orange-500', 'bg-orange-400', 'bg-orange-300'] as const;

function FallingCubes() {
  const range = CUBE_FALL.slowest - CUBE_FALL.fastest;

  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center" aria-hidden="true">
      {FALLING.map((c, i) => {
        const duration = CUBE_FALL.fastest + range * c.slow;
        const delay = CONFIRM.flipDelay + CUBE_FALL.spread * c.wait;

        return (
          <motion.span
            key={i}
            className="absolute top-0 block"
            initial={{ x: c.x, y: -c.size, opacity: 0, rotateX: 0, rotateY: 0 }}
            animate={{
              x: c.x + c.drift,
              y: CUBE_FALL.distance,
              // Yumshoq paydo boʻlish va yumshoq soʻnish: zarracha
              // yoʻlning boshida ham, oxirida ham chetga urilib
              // "oʻchgandek" boʻlmasligi kerak.
              opacity: [0, 1, 1, 0],
              rotateX: c.rx,
              rotateY: c.ry,
            }}
            transition={{
              duration,
              delay,
              // Tushish TEKIS: kub pastga tortilmaydi, u havoda suzadi.
              // `EASE.standard` boʻlsa zarrachalar oxirida toʻplanib
              // qolardi — barchasi bir vaqtda pastda turgandek.
              ease: 'linear',
              /*
               * Shaffoflik kadrlari yoʻlning qaysi nuqtasiga toʻgʻri
               * kelishi `CUBE_FALL` dan chiqadi.
               *
               * `duration`/`delay`/`ease` ATAYLAB qayta yozilgan:
               * qiymatga xos (per-key) oʻtish yuqoridagi umumiy
               * oʻtishdan meros olmaydi, uni butunlay almashtiradi.
               * Faqat `times` yozilsa `opacity` standart 0.3s ga
               * tushib, kechikishsiz ishga tushardi.
               */
              opacity: {
                duration,
                delay,
                ease: 'linear',
                times: [0, CUBE_FALL.fadeIn, CUBE_FALL.fadeAt, 1],
              },
            }}
            style={{ transformPerspective: CONFIRM.perspective }}
          >
            <Cube size={c.size} className={CUBE_TONES[i % CUBE_TONES.length]} />
          </motion.span>
        );
      })}
    </div>
  );
}

function OrderSummary({
  items, subtotal, deliveryFee, total, count,
}: {
  items: { key: string; name: string; variant?: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  count: number;
}) {
  return (
    <div className={cx(card, 'p-5')}>
      <h2 className="text-base font-semibold text-ink-900">
        Buyurtma xulosasi <span className="font-normal tabular-nums text-ink-600">({count} dona)</span>
      </h2>
      <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-3">
            <span className="line-clamp-2 text-ink-600">
              {item.name}
              {item.variant && <span className="text-ink-600"> · {item.variant}</span>}
              <span className="tabular-nums text-ink-600"> × {item.quantity}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{formatPrice(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-ink-100 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-500">Mahsulotlar</dt>
          <dd className="font-medium tabular-nums">{formatPrice(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Yetkazib berish</dt>
          <dd className={cx('font-medium tabular-nums', deliveryFee === 0 && 'text-emerald-600')}>
            {deliveryFee === 0 ? 'Bepul' : formatPrice(deliveryFee)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-ink-100 pt-2 text-base">
          <dt className="font-semibold">Jami</dt>
          <dd className="font-bold tabular-nums text-orange-700">{formatPrice(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SubmitButton({
  label, submitting, onClick, type = 'button',
}: {
  label: string;
  submitting: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={submitting}
      aria-busy={submitting}
      className={cx(button('primary', 'lg'), 'w-full')}
    >
      {submitting ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          Yuborilmoqda…
        </>
      ) : (
        <>
          <Lock className="h-4 w-4" /> {label}
        </>
      )}
    </button>
  );
}

function TrustNote() {
  return (
    <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-relaxed text-ink-600">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      Maʼlumotlaringiz faqat buyurtmani yetkazib berish uchun ishlatiladi va uchinchi shaxslarga
      berilmaydi.
    </p>
  );
}

function PaymentPicker({
  value, onChange,
}: {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="sr-only">Toʻlov usuli</legend>
      {PAYMENT_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-card border p-4 transition-colors',
              'focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2',
              active ? 'border-orange-400 bg-orange-50' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <opt.icon className={cx('h-6 w-6 shrink-0', active ? 'text-orange-600' : 'text-ink-400')} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">{opt.label}</span>
              <span className="block text-xs text-ink-500">{opt.desc}</span>
            </span>
            <span
              aria-hidden="true"
              className={cx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                active ? 'border-orange-600' : 'border-ink-300'
              )}
            >
              {active && <span className="h-2.5 w-2.5 rounded-full bg-orange-600" />}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        Kuryer uchun izoh <span className="text-ink-600">(ixtiyoriy)</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Masalan: 2-podyezd, 4-qavat. Kelishdan oldin qoʻngʻiroq qiling."
        className={textarea()}
      />
    </div>
  );
}

function Field({
  label, value, onChange, onBlur, error, hint, required, placeholder, type = 'text', inputMode, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        {label}
        {required && <span className="text-red-600" aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        placeholder={placeholder}
        className={input(!!error)}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-600">{hint}</p>
      ) : null}
    </div>
  );
}
