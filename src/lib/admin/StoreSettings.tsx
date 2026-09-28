import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSettings } from '../settings';
import { useToast } from '../toast';
import { formatPrice } from '../types';
import { Store, Truck, Share2, Info } from 'lucide-react';
import { AdminError, AdminLoading, AdminSection, FormField } from '../AdminShared';
import { button, card, cx } from '../design';

export function AdminSettings() {
  const { settings, loading, error, refresh } = useSettings();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    store_name: '', phone: '', email: '', address: '',
    delivery_fee_tashkent: '', delivery_fee_republic: '', free_delivery_threshold: '',
    instagram_url: '', telegram_url: '', facebook_url: '', youtube_url: '',
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      store_name: settings.store_name || '',
      phone: settings.phone || '',
      email: settings.email || '',
      address: settings.address || '',
      delivery_fee_tashkent: String(settings.delivery_fee_tashkent ?? 0),
      delivery_fee_republic: String(settings.delivery_fee_republic ?? 0),
      free_delivery_threshold: String(settings.free_delivery_threshold ?? 0),
      instagram_url: settings.instagram_url || '',
      telegram_url: settings.telegram_url || '',
      facebook_url: settings.facebook_url || '',
      youtube_url: settings.youtube_url || '',
    });
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.store_name.trim()) next.store_name = 'Do‘kon nomini kiriting';
    for (const key of ['delivery_fee_tashkent', 'delivery_fee_republic', 'free_delivery_threshold'] as const) {
      const n = Number(form[key]);
      if (!Number.isFinite(n) || n < 0) next[key] = 'Manfiy bo‘lmagan son kiriting';
    }
    for (const key of ['instagram_url', 'telegram_url', 'facebook_url', 'youtube_url'] as const) {
      const v = form[key].trim();
      if (v && !/^https?:\/\//i.test(v)) next[key] = 'Havola http:// yoki https:// bilan boshlansin';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Email noto‘g‘ri';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const { error: err } = await supabase
      .from('store_settings')
      .update({
        store_name: form.store_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        delivery_fee_tashkent: Number(form.delivery_fee_tashkent),
        delivery_fee_republic: Number(form.delivery_fee_republic),
        free_delivery_threshold: Number(form.free_delivery_threshold),
        instagram_url: form.instagram_url.trim(),
        telegram_url: form.telegram_url.trim(),
        facebook_url: form.facebook_url.trim(),
        youtube_url: form.youtube_url.trim(),
      })
      .eq('id', true);
    setSaving(false);

    // Ilgari bu javob e'tiborsiz qoldirilardi va admin RLS tufayli hech narsa
    // saqlanmagan bo'lsa ham "Sozlamalar saqlandi" degan xabarni ko'rardi.
    if (err) {
      notify(`Saqlab bo‘lmadi: ${err.message}`, 'error');
      return;
    }
    notify('Sozlamalar saqlandi', 'success');
    refresh();
  };

  if (loading) return <AdminLoading rows={3} />;
  if (error || !settings) return <AdminError message="Sozlamalarni yuklab bo‘lmadi" onRetry={refresh} />;

  const threshold = Number(form.free_delivery_threshold) || 0;

  return (
    <AdminSection title="Do‘kon sozlamalari" description="Bu qiymatlar saytda va buyurtma hisob-kitobida ishlatiladi.">
      <form onSubmit={handleSave} noValidate className="max-w-3xl space-y-5">
        <Panel icon={Store} title="Asosiy ma’lumotlar">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Do‘kon nomi" required value={form.store_name} error={errors.store_name}
              onChange={(v) => setForm({ ...form, store_name: v })} hint="Header, footer va sahifa sarlavhasida ko‘rinadi" />
            <FormField label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+998 71 200 00 00" />
            <FormField label="Email" type="email" value={form.email} error={errors.email}
              onChange={(v) => setForm({ ...form, email: v })} />
            <FormField label="Manzil" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          </div>
        </Panel>

        <Panel icon={Truck} title="Yetkazib berish">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Toshkent (so‘m)" type="number" min={0} value={form.delivery_fee_tashkent}
              error={errors.delivery_fee_tashkent} onChange={(v) => setForm({ ...form, delivery_fee_tashkent: v })} />
            <FormField label="Viloyatlar (so‘m)" type="number" min={0} value={form.delivery_fee_republic}
              error={errors.delivery_fee_republic} onChange={(v) => setForm({ ...form, delivery_fee_republic: v })} />
            <FormField label="Bepul yetkazish chegarasi" type="number" min={0} value={form.free_delivery_threshold}
              error={errors.free_delivery_threshold} onChange={(v) => setForm({ ...form, free_delivery_threshold: v })}
              hint="0 = aksiya yo‘q" />
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-control bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
            {threshold > 0
              ? `Hozir: ${formatPrice(threshold)} dan yuqori buyurtmalarda yetkazib berish bepul. Bu narx savat, checkout va buyurtma summasida bir xil qo‘llanadi — hisob-kitob serverda bajariladi.`
              : 'Bepul yetkazib berish aksiyasi o‘chirilgan. Narx savat, checkout va buyurtma summasida bir xil qo‘llanadi.'}
          </p>
        </Panel>

        <Panel icon={Share2} title="Ijtimoiy tarmoqlar">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Instagram" value={form.instagram_url} error={errors.instagram_url}
              onChange={(v) => setForm({ ...form, instagram_url: v })} placeholder="https://instagram.com/…" />
            <FormField label="Telegram" value={form.telegram_url} error={errors.telegram_url}
              onChange={(v) => setForm({ ...form, telegram_url: v })} placeholder="https://t.me/…" />
            <FormField label="Facebook" value={form.facebook_url} error={errors.facebook_url}
              onChange={(v) => setForm({ ...form, facebook_url: v })} placeholder="https://facebook.com/…" />
            <FormField label="YouTube" value={form.youtube_url} error={errors.youtube_url}
              onChange={(v) => setForm({ ...form, youtube_url: v })} placeholder="https://youtube.com/…" />
          </div>
          <p className="mt-2 text-xs text-ink-400">Bo‘sh qoldirilgan tarmoq footerda umuman ko‘rsatilmaydi.</p>
        </Panel>

        <button type="submit" disabled={saving} className={button('primary', 'lg')}>
          {saving ? 'Saqlanmoqda…' : 'Sozlamalarni saqlash'}
        </button>
      </form>
    </AdminSection>
  );
}

function Panel({ icon: Icon, title, children }: { icon: typeof Store; title: string; children: React.ReactNode }) {
  return (
    <section className={cx(card, 'p-5')}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Icon className="h-4 w-4 text-orange-600" /> {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}
