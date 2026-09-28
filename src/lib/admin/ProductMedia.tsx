import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { PRODUCT_IMAGE_SELECT } from '../adapters';
import { useToast } from '../toast';
import type { ProductImage } from '../types';
import {
  UploadCloud, Star, Trash2, ArrowLeft, ArrowRight, Link2, Loader2, ImageOff, Check,
} from 'lucide-react';
import { uploadImage, validateImageFile, deleteImageByUrl } from './upload';
import { AdminLoading } from '../AdminShared';
import { button, cx, focusRing, input as inputClass, skeleton } from '../design';

/*
 * Mahsulot galereyasini boshqarish.
 *
 * Ilgari admin bitta "Rasm URL" maydonidan iborat edi — yaʼni mahsulotga
 * faqat BITTA rasm qoʻyish mumkin edi, garchi `product_images` jadvali
 * cheksiz rasmni qoʻllab-quvvatlasa ham. Endi:
 *   - fayllarni tortib tashlab yoki tanlab yuklash (bir vaqtda bir nechta),
 *   - havola orqali qoʻshish,
 *   - tartibni oʻzgartirish,
 *   - asosiy rasmni belgilash,
 *   - oʻchirish (fayl bucketʼdan ham tozalanadi).
 */

type Row = ProductImage;

export function ProductMediaManager({ productId }: { productId: string }) {
  const { notify } = useToast();
  const [images, setImages] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from('product_images')
      .select(PRODUCT_IMAGE_SELECT)
      .eq('product_id', productId)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) notify(`Rasmlarni yuklab boʻlmadi: ${error.message}`, 'error');
        else setImages((data ?? []) as Row[]);
        setLoading(false);
      });
  }, [productId, notify]);

  useEffect(() => { load(); }, [load]);

  const nextSortOrder = () => (images.length ? Math.max(...images.map((i) => i.sort_order)) + 1 : 0);

  const insertImages = async (urls: string[]) => {
    if (urls.length === 0) return;
    const base = nextSortOrder();
    const hasPrimary = images.some((i) => i.is_primary);
    const rows = urls.map((url, i) => ({
      product_id: productId,
      image_url: url,
      sort_order: base + i,
      // Birinchi rasm avtomatik asosiy boʻladi.
      is_primary: !hasPrimary && i === 0,
    }));
    const { error } = await supabase.from('product_images').insert(rows);
    if (error) {
      notify(`Rasmni saqlab boʻlmadi: ${error.message}`, 'error');
      return;
    }
    load();
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const invalid = list.map(validateImageFile).find(Boolean);
    if (invalid) {
      notify(invalid, 'error');
      return;
    }

    setUploading({ done: 0, total: list.length });
    const urls: string[] = [];
    for (const [i, file] of list.entries()) {
      try {
        const { url } = await uploadImage(file, `products/${productId}`);
        urls.push(url);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Faylni yuklab boʻlmadi', 'error');
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    if (urls.length) {
      await insertImages(urls);
      notify(`${urls.length} ta rasm yuklandi`, 'success');
    }
  };

  const addByUrl = async () => {
    const url = urlValue.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      notify('Havola http:// yoki https:// bilan boshlanishi kerak', 'error');
      return;
    }
    setBusy(true);
    await insertImages([url]);
    setBusy(false);
    setUrlValue('');
  };

  const setPrimary = async (row: Row) => {
    setBusy(true);
    // Bitta asosiy rasm qoidasi serverdagi trigger bilan ham kafolatlangan.
    const { error } = await supabase.from('product_images').update({ is_primary: true }).eq('id', row.id);
    setBusy(false);
    if (error) {
      notify(`Oʻzgartirib boʻlmadi: ${error.message}`, 'error');
      return;
    }
    load();
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const a = images[index];
    const b = images[target];
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from('product_images').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('product_images').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    setBusy(false);
    if (r1.error || r2.error) {
      notify('Tartibni oʻzgartirib boʻlmadi', 'error');
      return;
    }
    load();
  };

  const remove = async (row: Row) => {
    setBusy(true);
    const { error } = await supabase.from('product_images').delete().eq('id', row.id);
    if (error) {
      setBusy(false);
      notify(`Oʻchirib boʻlmadi: ${error.message}`, 'error');
      return;
    }
    // Fayl bizning bucketʼimizda boʻlsa uni ham tozalaymiz (boʻlmasa eʼtiborsiz).
    await deleteImageByUrl(row.image_url);
    setBusy(false);
    notify('Rasm oʻchirildi', 'success');
    load();
  };

  if (loading) return <AdminLoading rows={2} />;

  return (
    <div className="space-y-4">
      {/* Tortib tashlash maydoni */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={cx(
          'rounded-card border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-orange-400 bg-orange-50' : 'border-ink-200 bg-ink-50/50'
        )}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
            <p className="text-sm font-medium text-ink-800">
              Yuklanmoqda… {uploading.done}/{uploading.total}
            </p>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-orange-600 transition-[width] duration-300"
                style={{ width: `${(uploading.done / uploading.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <UploadCloud className="mx-auto h-8 w-8 text-ink-400" />
            <p className="mt-2 text-sm font-medium text-ink-800">
              Rasmlarni shu yerga tortib tashlang
            </p>
            <p className="mt-0.5 text-xs text-ink-500">JPG, PNG, WebP yoki AVIF · 5 MB gacha · bir vaqtda bir nechta</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={cx(button('outline', 'sm'), 'mt-3')}
            >
              Fayl tanlash
            </button>
          </>
        )}
      </div>

      {/* Havola orqali qo'shish */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addByUrl(); }
            }}
            placeholder="yoki rasm havolasini joylashtiring"
            aria-label="Rasm havolasi"
            className={inputClass(false, 'pl-9')}
          />
        </div>
        <button type="button" onClick={addByUrl} disabled={busy || !urlValue.trim()} className={button('outline', 'md')}>
          Qoʻshish
        </button>
      </div>

      {/* Galereya */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ink-200 py-10 text-center">
          <ImageOff className="h-6 w-6 text-ink-300" />
          <p className="text-sm text-ink-500">Hali rasm qoʻshilmagan</p>
          <p className="text-xs text-ink-400">Kamida bitta rasm boʻlmasa, mahsulot katalogda boʻsh koʻrinadi.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <li
              key={img.id}
              className={cx(
                'group relative overflow-hidden rounded-card border-2 bg-white',
                img.is_primary ? 'border-orange-500' : 'border-ink-200'
              )}
            >
              <div className={cx('aspect-square', skeleton)}>
                <img
                  src={img.image_url}
                  alt=""
                  loading="lazy"
                  className="relative h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2'; }}
                />
              </div>

              {img.is_primary && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Check className="h-3 w-3" /> Asosiy
                </span>
              )}

              <div className="flex items-center justify-between gap-1 border-t border-ink-100 p-1.5">
                <div className="flex gap-0.5">
                  <IconAction
                    label="Chapga surish"
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0}
                    icon={ArrowLeft}
                  />
                  <IconAction
                    label="Oʻngga surish"
                    onClick={() => move(index, 1)}
                    disabled={busy || index === images.length - 1}
                    icon={ArrowRight}
                  />
                </div>
                <div className="flex gap-0.5">
                  {!img.is_primary && (
                    <IconAction
                      label="Asosiy qilish"
                      onClick={() => setPrimary(img)}
                      disabled={busy}
                      icon={Star}
                    />
                  )}
                  <IconAction
                    label="Oʻchirish"
                    onClick={() => remove(img)}
                    disabled={busy}
                    icon={Trash2}
                    danger
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-500">
        Asosiy rasm katalog kartochkasida, savatda va buyurtmalar tarixida koʻrsatiladi.
        Qolganlari mahsulot sahifasidagi galereyaga tushadi.
      </p>
    </div>
  );
}

function IconAction({
  label, onClick, disabled, icon: Icon, danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: typeof Star;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'flex h-9 w-9 items-center justify-center rounded-control transition-colors disabled:opacity-30',
        danger ? 'text-ink-400 hover:bg-red-50 hover:text-red-600' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
        focusRing
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
