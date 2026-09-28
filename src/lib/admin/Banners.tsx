import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Banner } from '../types';
import { adaptBanner, type BannerRow } from '../adapters';
import { useToast } from '../toast';
import { Plus, Pencil, Trash2, ImageOff } from 'lucide-react';
import {
  AdminEmpty, AdminError, AdminLoading, AdminModal, AdminSection, ConfirmModal,
  FormActions, FormField, FormToggle, ImageUrlField,
} from '../AdminShared';
import { button, card, cx, focusRing } from '../design';
import { Img } from '../Img';

const BANNER_SELECT = 'id, title, description, image_url, button_text, destination, is_active, sort_order, created_at';

export function AdminBanners() {
  const { notify } = useToast();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    supabase.from('banners').select(BANNER_SELECT).order('sort_order').returns<BannerRow[]>().then(({ data, error: err }) => {
      if (err) setError(true);
      else setBanners((data ?? []).map(adaptBanner));
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (b: Banner) => {
    setBusy(true);
    const { error: err } = await supabase.from('banners').delete().eq('id', b.id);
    setBusy(false);
    setConfirmDelete(null);
    if (err) {
      notify(`Oʻchirib boʻlmadi: ${err.message}`, 'error');
      return;
    }
    notify('Banner oʻchirildi', 'success');
    load();
  };

  const toggleActive = async (b: Banner) => {
    const { error: err } = await supabase.from('banners').update({ is_active: !b.is_active }).eq('id', b.id);
    if (err) {
      notify('Holatni oʻzgartirib boʻlmadi', 'error');
      return;
    }
    load();
  };

  return (
    <AdminSection
      title="Bosh sahifa bannerlari"
      description="Bosh sahifadagi slayder. Faqat faol bannerlar koʻrsatiladi."
      actions={
        <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
          <Plus className="h-4 w-4" /> Banner qoʻshish
        </button>
      }
    >
      {loading ? (
        <AdminLoading rows={3} />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : banners.length === 0 ? (
        <AdminEmpty
          title="Banner yoʻq"
          message="Banner qoʻshilmasa, bosh sahifada standart sarlavha bloki koʻrsatiladi."
          action={
            <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
              <Plus className="h-4 w-4" /> Banner qoʻshish
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {banners.map((b) => (
            <li key={b.id} className={cx(card, 'flex flex-col gap-3 p-3 sm:flex-row sm:items-center')}>
              <span className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-100 sm:h-16 sm:w-28">
                {b.image_url ? (
                  <Img src={b.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                ) : (
                  <ImageOff className="h-5 w-5 text-ink-300" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{b.title}</p>
                {b.subtitle && <p className="line-clamp-1 text-xs text-ink-500">{b.subtitle}</p>}
                <p className="mt-0.5 truncate text-xs text-ink-400">
                  {b.button_text || 'Batafsil'} → {b.button_link || '/catalog'} · tartib {b.sort_order}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => toggleActive(b)}
                  aria-label={`${b.title} — ${b.is_active ? 'nofaol qilish' : 'faollashtirish'}`}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    focusRing,
                    b.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  )}
                >
                  {b.is_active ? 'Faol' : 'Nofaol'}
                </button>
                <button
                  onClick={() => { setEditing(b); setShowForm(true); }}
                  aria-label={`${b.title} — tahrirlash`}
                  className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-500 hover:bg-ink-100 hover:text-ink-900', focusRing)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(b)}
                  aria-label={`${b.title} — oʻchirish`}
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
        <BannerForm banner={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Bannerni oʻchirish"
          message={`«${confirmDelete.title}» banneri oʻchiriladi.`}
          busy={busy}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </AdminSection>
  );
}

function BannerForm({
  banner, onClose, onSaved,
}: {
  banner: Banner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: banner?.title || '',
    subtitle: banner?.subtitle || '',
    image_url: banner?.image_url || '',
    button_text: banner?.button_text || 'Katalogni koʻrish',
    button_link: banner?.button_link || '/catalog',
    is_active: banner?.is_active ?? true,
    sort_order: banner?.sort_order?.toString() ?? '0',
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Sarlavhani kiriting';
    // Banner havolasi ilova ichidagi marshrut bo'lishi kerak (`/catalog`).
    // Tashqi manzil `Link` orqali ochilganda ilova ichida qidiriladi va
    // foydalanuvchi 404 sahifasiga tushadi.
    if (form.button_link.trim() && !form.button_link.trim().startsWith('/')) {
      next.button_link = 'Havola «/» bilan boshlanishi kerak (masalan /catalog)';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    // Dizayn subtitle/button_link ishlatadi, bazada description/destination.
    const payload = {
      title: form.title.trim(),
      description: form.subtitle.trim(),
      image_url: form.image_url.trim(),
      button_text: form.button_text.trim() || 'Batafsil',
      destination: form.button_link.trim() || '/catalog',
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = banner
      ? await supabase.from('banners').update(payload).eq('id', banner.id)
      : await supabase.from('banners').insert(payload);
    setSaving(false);

    if (error) {
      notify(`Saqlab boʻlmadi: ${error.message}`, 'error');
      return;
    }
    notify(banner ? 'Banner yangilandi' : 'Banner qoʻshildi', 'success');
    onSaved();
  };

  return (
    <AdminModal title={banner ? 'Bannerni tahrirlash' : 'Yangi banner'} onClose={onClose} wide>
      <form onSubmit={handleSave} noValidate className="space-y-4">
        <FormField label="Sarlavha" required value={form.title} error={errors.title}
          onChange={(v) => setForm({ ...form, title: v })} />
        <FormField label="Qoʻshimcha matn" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} textarea />
        <ImageUrlField label="Rasm URL" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })}
          hint="Keng format tavsiya etiladi (masalan 1600×700). Matn rasm ustiga tushadi." />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tugma matni" value={form.button_text} onChange={(v) => setForm({ ...form, button_text: v })} />
          <FormField label="Tugma havolasi" value={form.button_link} error={errors.button_link}
            onChange={(v) => setForm({ ...form, button_link: v })} hint="Masalan /catalog yoki /promotions" />
          <FormField label="Tartib raqami" type="number" value={form.sort_order}
            onChange={(v) => setForm({ ...form, sort_order: v })} />
        </div>
        <FormToggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Bosh sahifada koʻrsatilsin" />
        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </AdminModal>
  );
}
