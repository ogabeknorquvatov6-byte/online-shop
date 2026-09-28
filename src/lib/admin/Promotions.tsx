import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import type { Promotion } from '../types';
import { PROMOTION_SELECT, adaptPromotion, type PromotionRow } from '../adapters';
import { useDebounced } from '../adminPagination';
import { sanitizeOrFilterTerm } from '../search';
import { useToast } from '../toast';
import { Plus, Pencil, Trash2, Search, CalendarDays } from 'lucide-react';
import {
  AdminEmpty, AdminError, AdminLoading, AdminModal, AdminSection, ConfirmModal,
  FormActions, FormField, FormToggle,
} from '../AdminShared';
import { button, card, checkboxBase, cx, focusRing, input } from '../design';

type PickerProduct = { id: string; name: string };

/*
 * Tanlagichda bir vaqtda ko'rsatiladigan MAKSIMAL mahsulot soni.
 * Admin qidiruv orqali toraytiradi — butun katalogni ko'rish shart emas.
 */
const PICKER_LIMIT = 50;

export function AdminPromotions() {
  const { notify } = useToast();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Promotion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    supabase
      .from('promotions')
      .select(PROMOTION_SELECT)
      .order('created_at', { ascending: false })
      .returns<PromotionRow[]>()
      .then(({ data, error: err }) => {
        if (err) setError(true);
        else setPromos((data ?? []).map(adaptPromotion));
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (p: Promotion) => {
    setBusy(true);
    const { error: err } = await supabase.from('promotions').delete().eq('id', p.id);
    setBusy(false);
    setConfirmDelete(null);
    if (err) {
      notify(`Oʻchirib boʻlmadi: ${err.message}`, 'error');
      return;
    }
    notify('Aksiya oʻchirildi', 'success');
    load();
  };

  const toggleActive = async (p: Promotion) => {
    const { error: err } = await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id);
    if (err) {
      notify('Holatni oʻzgartirib boʻlmadi', 'error');
      return;
    }
    load();
  };

  const isExpired = (p: Promotion) => !!p.end_date && new Date(p.end_date) < new Date();

  return (
    <AdminSection
      title="Aksiyalar"
      description="Tanlangan mahsulotlarga foizli chegirma. Narx mijozga avtomatik qayta hisoblanadi."
      actions={
        <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
          <Plus className="h-4 w-4" /> Aksiya qoʻshish
        </button>
      }
    >
      {loading ? (
        <AdminLoading rows={3} />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : promos.length === 0 ? (
        <AdminEmpty
          title="Aksiya yoʻq"
          message="Aksiya yaratsangiz, u bosh sahifada va «Aksiyalar» boʻlimida koʻrinadi."
          action={
            <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
              <Plus className="h-4 w-4" /> Aksiya qoʻshish
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {promos.map((p) => (
            <li key={p.id} className={cx(card, 'flex flex-wrap items-center gap-3 p-4')}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-orange-50 text-sm font-bold text-orange-700">
                −{p.discount_percentage}%
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{p.title}</p>
                  {isExpired(p) && (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">
                      Muddati tugagan
                    </span>
                  )}
                </div>
                {p.description && <p className="line-clamp-1 text-xs text-ink-500">{p.description}</p>}
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {p.start_date ? new Date(p.start_date).toLocaleDateString('uz-UZ') : '—'}
                  {' → '}
                  {p.end_date ? new Date(p.end_date).toLocaleDateString('uz-UZ') : 'muddatsiz'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => toggleActive(p)}
                  aria-label={`${p.title} — ${p.is_active ? 'toʻxtatish' : 'yoqish'}`}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    focusRing,
                    p.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  )}
                >
                  {p.is_active ? 'Faol' : 'Nofaol'}
                </button>
                <button
                  onClick={() => { setEditing(p); setShowForm(true); }}
                  aria-label={`${p.title} — tahrirlash`}
                  className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-500 hover:bg-ink-100 hover:text-ink-900', focusRing)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(p)}
                  aria-label={`${p.title} — oʻchirish`}
                  className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600', focusRing)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <PromotionForm promotion={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Aksiyani oʻchirish"
          message={`«${confirmDelete.title}» oʻchiriladi va unga bogʻlangan chegirmalar bekor boʻladi.`}
          busy={busy}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </AdminSection>
  );
}

function PromotionForm({
  promotion, onClose, onSaved,
}: {
  promotion: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  /** Tanlangan, lekin joriy qidiruv natijasida bo'lmagan mahsulotlar. */
  const [selectedDetails, setSelectedDetails] = useState<PickerProduct[]>([]);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [pickerError, setPickerError] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: promotion?.title || '',
    description: promotion?.description || '',
    discount: promotion?.discount_percentage?.toString() || '10',
    start_date: promotion?.start_date ? promotion.start_date.slice(0, 10) : '',
    end_date: promotion?.end_date ? promotion.end_date.slice(0, 10) : '',
    is_active: promotion?.is_active ?? true,
  });

  /*
   * MAHSULOT TANLAGICH — QIDIRUV SERVERDA.
   *
   * ILGARI NIMA XATO EDI: butun faol katalog bitta so'rov bilan brauzerga
   * yuklanardi (`select('id, name').eq('is_active', true)` — chegarasiz),
   * keyin qidiruv mijozda `Array.filter` bilan bajarilardi. 100 ta
   * mahsulotda sezilmaydi; 5 000 tada esa modal ochilishi bir necha
   * soniya qotadi va tarmoqqa ortiqcha megabaytlar ketadi. Ya'ni admin
   * paneli aynan biznes o'sganda ishlamay qolardi.
   *
   * ENDI: har qidiruvda serverdan eng ko'pi bilan `PICKER_LIMIT` ta
   * natija olinadi. Bo'sh qidiruvda ham ro'yxat cheklangan — modal
   * ochilishi doimiy tezlikda qoladi.
   */
  useEffect(() => {
    if (!promotion) return;
    supabase
      .from('promotion_products')
      .select('product_id')
      .eq('promotion_id', promotion.id)
      .returns<{ product_id: string }[]>()
      .then(({ data }) => setSelected((data ?? []).map((r) => r.product_id)));
  }, [promotion]);

  // Har bosilgan harf uchun alohida so'rov ketmasligi kerak.
  const debouncedQuery = useDebounced(query);

  useEffect(() => {
    let cancelled = false;
    setPickerLoading(true);
    setPickerError(false);

    let request = supabase.from('products').select('id, name').eq('is_active', true);
    const term = sanitizeOrFilterTerm(debouncedQuery);
    if (term) request = request.ilike('name', `%${term}%`);

    request
      .order('name')
      .limit(PICKER_LIMIT)
      .returns<PickerProduct[]>()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setPickerError(true);
        else setProducts(data ?? []);
        setPickerLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  /*
   * TANLANGANLAR DOIM KO'RINADI.
   *
   * Server faqat qidiruvga mos yozuvlarni qaytaradi. Busiz allaqachon
   * belgilangan mahsulot qidiruv natijasidan tushib qolar va admin uni
   * ko'ra ham, belgisini olib tashlay ham olmasdi — tanlov esa jimgina
   * saqlanib qolaverardi. Shuning uchun tanlanganlar alohida yuklanadi
   * va ro'yxat boshida ko'rsatiladi.
   */
  useEffect(() => {
    const missing = selected.filter((id) => !products.some((p) => p.id === id));
    if (missing.length === 0) return;
    let cancelled = false;
    supabase
      .from('products')
      .select('id, name')
      .in('id', missing)
      .returns<PickerProduct[]>()
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        setSelectedDetails((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...data.filter((p) => !seen.has(p.id))];
        });
      });
    return () => { cancelled = true; };
  }, [selected, products]);

  const visible = useMemo(() => {
    const chosen = selected
      .map((id) => products.find((p) => p.id === id) ?? selectedDetails.find((p) => p.id === id))
      .filter((p): p is PickerProduct => Boolean(p));
    const chosenIds = new Set(chosen.map((p) => p.id));
    return [...chosen, ...products.filter((p) => !chosenIds.has(p.id))];
  }, [products, selected, selectedDetails]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Sarlavhani kiriting';
    const discount = Number(form.discount);
    // Bazadagi CHECK: discount_percent 1..99 oralig'ida bo'lishi shart.
    if (!Number.isInteger(discount) || discount < 1 || discount > 99) {
      next.discount = 'Chegirma 1 dan 99 gacha butun son boʻlsin';
    }
    if (form.start_date && form.end_date && new Date(form.end_date) < new Date(form.start_date)) {
      next.end_date = 'Tugash sanasi boshlanishdan keyin boʻlsin';
    }
    if (selected.length === 0) next.products = 'Kamida bitta mahsulot tanlang';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.title.trim(),
      description: form.description.trim(),
      discount_percent: discount,
      ends_at: form.end_date ? new Date(form.end_date).toISOString() : null,
      is_active: form.is_active,
    };
    // `starts_at` NOT NULL — bo'sh bo'lsa kalitni yubormaymiz, DB default ishlaydi.
    if (form.start_date) payload.starts_at = new Date(form.start_date).toISOString();

    let promoId = promotion?.id;
    let err: string | null = null;
    if (promotion) {
      const res = await supabase.from('promotions').update(payload).eq('id', promotion.id);
      err = res.error?.message ?? null;
    } else {
      const res = await supabase.from('promotions').insert(payload).select('id').single();
      err = res.error?.message ?? null;
      promoId = res.data?.id;
    }

    if (err || !promoId) {
      setSaving(false);
      notify(`Saqlab boʻlmadi: ${err ?? 'nomaʼlum xato'}`, 'error');
      return;
    }

    const del = await supabase.from('promotion_products').delete().eq('promotion_id', promoId);
    if (del.error) {
      setSaving(false);
      notify(`Mahsulotlar roʻyxatini yangilab boʻlmadi: ${del.error.message}`, 'error');
      return;
    }
    const ins = await supabase
      .from('promotion_products')
      .insert(selected.map((pid) => ({ promotion_id: promoId, product_id: pid })));
    setSaving(false);
    if (ins.error) {
      notify(`Mahsulotlarni bogʻlab boʻlmadi: ${ins.error.message}`, 'error');
      return;
    }

    notify(promotion ? 'Aksiya yangilandi' : 'Aksiya yaratildi', 'success');
    onSaved();
  };

  return (
    <AdminModal title={promotion ? 'Aksiyani tahrirlash' : 'Yangi aksiya'} onClose={onClose} wide>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <FormField label="Sarlavha" required value={form.title} error={errors.title}
          onChange={(v) => setForm({ ...form, title: v })} />
        <FormField label="Tavsif" value={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Chegirma (%)" required type="number" min={1} value={form.discount}
            error={errors.discount} onChange={(v) => setForm({ ...form, discount: v })} />
          <FormField label="Boshlanish sanasi" type="date" value={form.start_date}
            onChange={(v) => setForm({ ...form, start_date: v })} hint="Boʻsh = darhol" />
          <FormField label="Tugash sanasi" type="date" value={form.end_date} error={errors.end_date}
            onChange={(v) => setForm({ ...form, end_date: v })} hint="Boʻsh = muddatsiz" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600">
              Mahsulotlar <span className="text-red-500" aria-hidden="true">*</span>
            </span>
            <span className="text-xs text-ink-400">{selected.length} ta tanlandi</span>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mahsulot qidirish"
              aria-label="Aksiya uchun mahsulot qidirish"
              className={input(false, 'pl-9')}
            />
          </div>

          <div className={cx('max-h-56 overflow-y-auto rounded-control border p-1', errors.products ? 'border-red-400' : 'border-ink-200')}>
            {pickerLoading && visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-ink-400">Yuklanmoqda…</p>
            ) : pickerError ? (
              <p role="alert" className="px-2 py-6 text-center text-xs text-red-600">
                Mahsulotlarni yuklab boʻlmadi. Qidiruvni oʻzgartirib qayta urinib koʻring.
              </p>
            ) : visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-ink-400">
                {query.trim() ? 'Mos mahsulot topilmadi' : 'Faol mahsulot yoʻq'}
              </p>
            ) : (
              visible.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() =>
                      setSelected((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                    }
                    className={checkboxBase}
                  />
                  <span className="line-clamp-1">{p.name}</span>
                </label>
              ))
            )}
          </div>
          {errors.products && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.products}</p>}
        </div>

        <FormToggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Aksiya faol" />
        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </AdminModal>
  );
}
