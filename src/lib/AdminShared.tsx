import { useId, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RotateCw, Search } from 'lucide-react';
import { ResponsiveModal } from './AnimatedPrimitives';
import { button, card, cx, focusRing, input, selectBase, skeleton, textarea as textareaClass } from './design';

/*
 * Admin panelidagi takrorlanuvchi naqshlar. Ilgari har bir bo'lim
 * (mahsulotlar, kategoriyalar, bannerlar, aksiyalar, buyurtmalar,
 * foydalanuvchilar) o'z jadval sarlavhasini, bo'sh holatini, yuklanish
 * skeletini va tasdiqlash oynasini qaytadan yozardi — natijada ular
 * bir-biridan sezilarli farq qilardi.
 */

export function AdminSection({
  title, description, actions, children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AdminSearch({
  value, onChange, placeholder = 'Qidirish…', label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={input(false, 'pl-9')}
      />
    </div>
  );
}

export function AdminSelect({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={selectBase}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function AdminLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cx('h-16 rounded-card', skeleton)} />
      ))}
    </div>
  );
}

export function AdminEmpty({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-3.5 text-sm font-semibold text-ink-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AdminError({ message = 'Maʼlumotlarni yuklab boʻlmadi', onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className={cx(card, 'flex flex-col items-center justify-center px-6 py-10 text-center')}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-3.5 text-sm font-semibold text-ink-900">{message}</h3>
      <button onClick={onRetry} className={cx(button('outline', 'sm'), 'mt-4')}>
        <RotateCw className="h-4 w-4" /> Qayta urinish
      </button>
    </div>
  );
}

export function AdminModal({
  title, onClose, children, wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {/*
        `wide` faqat desktop kengligini oshiradi. Ilgari bu yerdan tayyor
        CSS sinflari uzatilardi va ular mobil pastki varaqning joylashuv
        sinflarini bekor qilib, oynani ekrandan yo'qotib yuborardi.
      */}
      <ResponsiveModal title={title} onClose={onClose} size={wide ? 'wide' : 'md'}>
        {children}
      </ResponsiveModal>
    </AnimatePresence>
  );
}

export function ConfirmModal({
  title, message, confirmLabel = 'Oʻchirish', busy, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AdminModal title={title} onClose={onCancel}>
      {/*
        `whitespace-pre-line` — xabar ikki xatboshidan iborat bo'lishi
        mumkin (kategoriya o'chirishdagi qo'shimcha ogohlantirish kabi).
        Usiz `\n\n` yig'ilib ketib, ogohlantirish asosiy matnga yopishib
        qolardi va ko'zga tashlanmasdi.
      */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">{message}</p>
      <div className="mt-5 flex gap-2">
        <button onClick={onConfirm} disabled={busy} className={button('danger', 'md')}>
          {busy ? 'Bajarilmoqda…' : confirmLabel}
        </button>
        <button onClick={onCancel} className={button('outline', 'md')}>Bekor qilish</button>
      </div>
    </AdminModal>
  );
}

/** Modal ichidagi forma tugmalari — barcha admin formalarda bir xil. */
export function FormActions({ saving, onCancel, saveLabel = 'Saqlash' }: { saving: boolean; onCancel: () => void; saveLabel?: string }) {
  return (
    <div className="flex gap-2 border-t border-ink-100 pt-4">
      <button type="submit" disabled={saving} className={button('primary', 'md')}>
        {saving ? 'Saqlanmoqda…' : saveLabel}
      </button>
      <button type="button" onClick={onCancel} className={button('outline', 'md')}>Bekor qilish</button>
    </div>
  );
}

export function FormField({
  label, value, onChange, required, type = 'text', textarea, placeholder, hint, error, min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  textarea?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  min?: number;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={textareaClass(!!error)}
        />
      ) : (
        <input
          id={id}
          type={type}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={input(!!error)}
        />
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          focusRing,
          checked ? 'bg-orange-600' : 'bg-ink-300'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          )}
        />
      </button>
      {label}
    </label>
  );
}

/** Rasm URL maydoni + jonli oldindan ko'rish (buzuq havolani darhol ko'rsatadi). */
export function ImageUrlField({
  label, value, onChange, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <FormField label={label} value={value} onChange={onChange} placeholder="https://…" hint={hint} />
      {value.trim() && (
        <div className="mt-2 flex items-center gap-3">
          <img
            src={value}
            alt=""
            className="h-20 w-20 rounded-control border border-ink-200 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.25'; }}
            onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
          />
          <p className="text-xs text-ink-400">Oldindan koʻrish. Rasm chiqmasa, havolani tekshiring.</p>
        </div>
      )}
    </div>
  );
}


/*
 * Admin ro'yxatlari uchun sahifalash boshqaruvi.
 *
 * Ataylab MINIMAL: "Oldingi / N / Keyingi". Admin panelida sahifa
 * raqamlarining uzun lentasi hech qanday foyda bermaydi — bo'lim
 * qidiruv va filtr bilan ishlatiladi, sahifalar orasida sakrash
 * emas. Bitta sahifa bo'lsa umuman ko'rsatilmaydi.
 */
export function AdminPager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const btn = 'inline-flex h-10 items-center gap-1.5 rounded-control border border-ink-200 px-3.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent';

  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Sahifalar">
      <button
        type="button"
        className={cx(btn, focusRing)}
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft className="h-4 w-4" /> Oldingi
      </button>

      {/*
        `aria-live` — sahifa almashganda skrinrider yangi holatni o'qiydi.
        Busiz klaviatura foydalanuvchisi "Keyingi" ni bosgach hech qanday
        javob eshitmaydi va nima o'zgarganini bilmaydi.
      */}
      <span className="text-sm tabular-nums text-ink-500" aria-live="polite">
        {page} / {totalPages}
      </span>

      <button
        type="button"
        className={cx(btn, focusRing)}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Keyingi <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
