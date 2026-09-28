import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { PRODUCT_VARIANT_SELECT } from '../adapters';
import { useToast } from '../toast';
import type { ProductVariant } from '../types';
import { formatPrice } from '../types';
import { Plus, Trash2, Palette, Loader2, UploadCloud, X } from 'lucide-react';
import { uploadImage } from './upload';
import { AdminLoading } from '../AdminShared';
import { button, cx, focusRing, input as inputClass, selectBase } from '../design';
import { Img } from '../Img';

/*
 * Variant (rang / xotira / o'lcham) boshqaruvi.
 *
 * Sxemada `product_variants` faqat (type, value) juftligini saqlardi va
 * admin panelida uni tahrirlash imkoni UMUMAN yo'q edi — variantlar faqat
 * baza orqali qo'lda kiritilishi mumkin edi. Endi har bir variantning
 * ko'rsatiladigan nomi, rang kodi, o'z rasmi, alohida ombori va narx farqi
 * bor; narx farqi buyurtma yaratilganda serverda qayta hisoblanadi.
 */

const TYPES = [
  { value: 'color', label: 'Rang' },
  { value: 'storage', label: 'Xotira' },
  { value: 'size', label: 'Oʻlcham' },
  { value: 'other', label: 'Boshqa' },
];

const EMPTY = {
  type: 'color',
  value: '',
  label: '',
  color_code: '#111111',
  image_url: '',
  stock: '',
  price_adjustment: '0',
};

export function ProductVariantsManager({ productId, basePrice }: { productId: string; basePrice: number }) {
  const { notify } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from('product_variants')
      .select(PRODUCT_VARIANT_SELECT)
      .eq('product_id', productId)
      .order('type')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) notify(`Variantlarni yuklab boʻlmadi: ${error.message}`, 'error');
        else setVariants((data ?? []) as ProductVariant[]);
        setLoading(false);
      });
  }, [productId, notify]);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.value.trim()) next.value = 'Qiymatni kiriting (masalan «Qora»)';
    if (form.stock.trim() && (!Number.isInteger(Number(form.stock)) || Number(form.stock) < 0)) {
      next.stock = 'Butun, manfiy boʻlmagan son';
    }
    if (!Number.isFinite(Number(form.price_adjustment))) next.price_adjustment = 'Son kiriting';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const sameType = variants.filter((v) => v.type === form.type);
    const { error } = await supabase.from('product_variants').insert({
      product_id: productId,
      type: form.type,
      value: form.value.trim(),
      label: form.label.trim() || null,
      color_code: form.type === 'color' ? form.color_code : null,
      image_url: form.image_url.trim() || null,
      stock: form.stock.trim() ? Number(form.stock) : null,
      price_adjustment: Number(form.price_adjustment) || 0,
      sort_order: sameType.length ? Math.max(...sameType.map((v) => v.sort_order)) + 1 : 0,
      is_active: true,
    });
    setBusy(false);

    if (error) {
      notify(
        error.message.includes('duplicate key') || error.message.includes('product_variants_unique_value')
          ? 'Bu turdagi shunday qiymat allaqachon mavjud.'
          : `Saqlab boʻlmadi: ${error.message}`,
        'error'
      );
      return;
    }
    setForm({ ...EMPTY, type: form.type });
    notify('Variant qoʻshildi', 'success');
    load();
  };

  const patch = async (id: string, values: Partial<ProductVariant>) => {
    setBusy(true);
    const { error } = await supabase.from('product_variants').update(values).eq('id', id);
    setBusy(false);
    if (error) {
      notify(`Oʻzgartirib boʻlmadi: ${error.message}`, 'error');
      return;
    }
    load();
  };

  const remove = async (v: ProductVariant) => {
    setBusy(true);
    const { error } = await supabase.from('product_variants').delete().eq('id', v.id);
    setBusy(false);
    if (error) {
      notify(`Oʻchirib boʻlmadi: ${error.message}`, 'error');
      return;
    }
    notify('Variant oʻchirildi', 'success');
    load();
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadImage(file, `variants/${productId}`);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Rasmni yuklab boʻlmadi', 'error');
    } finally {
      setUploading(false);
    }
  };

  const grouped = TYPES.map((t) => ({
    ...t,
    items: variants.filter((v) => v.type === t.value),
  })).filter((g) => g.items.length > 0);

  // Sxemada belgilanmagan turlar ham ko'rinishi kerak.
  const knownTypes = new Set(TYPES.map((t) => t.value));
  const otherGroups = [...new Set(variants.map((v) => v.type))]
    .filter((t) => !knownTypes.has(t))
    .map((t) => ({ value: t, label: t, items: variants.filter((v) => v.type === t) }));

  if (loading) return <AdminLoading rows={2} />;

  return (
    <div className="space-y-5">
      {/* Mavjud variantlar */}
      {variants.length === 0 ? (
        <p className="rounded-card border border-dashed border-ink-200 py-8 text-center text-sm text-ink-500">
          Variant qoʻshilmagan. Mahsulot bitta koʻrinishda sotiladi.
        </p>
      ) : (
        <div className="space-y-4">
          {[...grouped, ...otherGroups].map((group) => (
            <section key={group.value}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{group.label}</h4>
              <ul className="divide-y divide-ink-100 rounded-card border border-ink-200">
                {group.items.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 p-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-ink-200"
                      style={v.color_code && !v.image_url ? { backgroundColor: v.color_code } : undefined}
                    >
                      {v.image_url ? (
                        <Img src={v.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                      ) : !v.color_code ? (
                        <Palette className="h-4 w-4 text-ink-300" />
                      ) : null}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{v.label || v.value}</p>
                      <p className="truncate text-xs text-ink-500">
                        {v.stock != null ? `Ombor: ${v.stock} dona` : 'Umumiy ombordan'}
                        {(v.price_adjustment ?? 0) !== 0 && (
                          <>
                            {' · '}
                            {(v.price_adjustment ?? 0) > 0 ? '+' : '−'}
                            {formatPrice(Math.abs(v.price_adjustment ?? 0))}
                            {basePrice > 0 && ` → ${formatPrice(Math.max(0, basePrice + (v.price_adjustment ?? 0)))}`}
                          </>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => patch(v.id, { is_active: !(v.is_active ?? true) })}
                      disabled={busy}
                      className={cx(
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        focusRing,
                        v.is_active === false
                          ? 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      )}
                    >
                      {v.is_active === false ? 'Nofaol' : 'Faol'}
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(v)}
                      disabled={busy}
                      aria-label={`${v.label || v.value} — oʻchirish`}
                      className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600', focusRing)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Yangi variant */}
      <form onSubmit={add} noValidate className="rounded-card border border-ink-200 p-4">
        <h4 className="text-sm font-semibold text-ink-900">Yangi variant</h4>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="variant-type" className="mb-1.5 block text-xs font-medium text-ink-600">Tur</label>
            <select
              id="variant-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={cx(selectBase, 'w-full')}
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <Field
            label="Qiymat"
            required
            value={form.value}
            error={errors.value}
            onChange={(v) => setForm({ ...form, value: v })}
            placeholder={form.type === 'color' ? 'Qora' : form.type === 'storage' ? '256 GB' : 'M'}
          />

          <Field
            label="Koʻrsatiladigan nom"
            value={form.label}
            onChange={(v) => setForm({ ...form, label: v })}
            hint="Boʻsh qoldirilsa qiymat ishlatiladi"
          />

          {form.type === 'color' && (
            <div>
              <label htmlFor="variant-color" className="mb-1.5 block text-xs font-medium text-ink-600">Rang kodi</label>
              <div className="flex items-center gap-2">
                <input
                  id="variant-color"
                  type="color"
                  value={form.color_code}
                  onChange={(e) => setForm({ ...form, color_code: e.target.value })}
                  className={cx('h-11 w-14 shrink-0 cursor-pointer rounded-control border border-ink-200 bg-white p-1', focusRing)}
                />
                <input
                  type="text"
                  value={form.color_code}
                  onChange={(e) => setForm({ ...form, color_code: e.target.value })}
                  aria-label="Rang kodi (HEX)"
                  className={inputClass(false, 'font-mono')}
                />
              </div>
            </div>
          )}

          <Field
            label="Ombor (ixtiyoriy)"
            type="number"
            value={form.stock}
            error={errors.stock}
            onChange={(v) => setForm({ ...form, stock: v })}
            hint="Boʻsh = mahsulotning umumiy qoldigʻi"
          />

          <Field
            label="Narx farqi (soʻm)"
            type="number"
            value={form.price_adjustment}
            error={errors.price_adjustment}
            onChange={(v) => setForm({ ...form, price_adjustment: v })}
            hint={
              basePrice > 0 && Number(form.price_adjustment)
                ? `Yakuniy narx: ${formatPrice(Math.max(0, basePrice + Number(form.price_adjustment)))}`
                : 'Manfiy ham boʻlishi mumkin'
            }
          />
        </div>

        {/* Variant rasmi */}
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-medium text-ink-600">Variant rasmi (ixtiyoriy)</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {form.image_url ? (
              <span className="relative">
                <img src={form.image_url} alt="" className="h-16 w-16 rounded-control border border-ink-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image_url: '' })}
                  aria-label="Rasmni olib tashlash"
                  className={cx('absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-white', focusRing)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className={button('outline', 'sm')}
            >
              {uploading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…</>) : (<><UploadCloud className="h-4 w-4" /> Rasm yuklash</>)}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Rasm qoʻshilsa, mijoz shu variantni tanlaganda galereya avtomatik oʻsha rasmga oʻtadi.
          </p>
        </div>

        <button type="submit" disabled={busy} className={cx(button('secondary', 'md'), 'mt-4')}>
          <Plus className="h-4 w-4" /> Variantni qoʻshish
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, required, placeholder, type = 'text', hint, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  hint?: string;
  error?: string;
}) {
  const id = `variant-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={inputClass(!!error)}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
