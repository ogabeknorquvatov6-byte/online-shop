import { supabase } from '../supabase';

/*
 * Rasm yuklash.
 *
 * `images` bucketʼi 20260816020000 migratsiyasida yaratilgan: ochiq oʻqish,
 * yozish esa faqat admin uchun (RLS). Ilgari admin panelida faqat "Rasm URL"
 * maydoni bor edi, yaʼni bucket umuman ishlatilmasdi va admin rasmni
 * qayerdadir alohida joylashtirishi kerak edi.
 */

const BUCKET = 'images';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export type UploadResult = { url: string; path: string };

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) {
    return `«${file.name}» — qoʻllab-quvvatlanmaydigan format. JPG, PNG, WebP yoki AVIF yuklang.`;
  }
  if (file.size > MAX_SIZE) {
    return `«${file.name}» juda katta (${(file.size / 1024 / 1024).toFixed(1)} MB). Chegara — 5 MB.`;
  }
  return null;
}

function safeName(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'image';
  // Vaqt + tasodifiy qism: bir xil nomli fayllar bir-birini almashtirmasin.
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/*
 * Yuklashdan OLDIN siqish.
 *
 * Nega bu eng muhim optimizatsiya:
 * telefondan olingan surat odatda 3–5 MB va 4000px kenglikda boʻladi.
 * Saytda esa u eng kattasi 1200px joyda koʻrsatiladi. Yaʼni mijoz
 * mobil internetda oʻnlab barobar ortiqcha trafik yuklaydi.
 *
 * Brauzerdagi canvas orqali oʻlchamni kamaytirib, WebPʼga oʻgiramiz —
 * bu odatda hajmni 70–85% ga qisqartiradi. Supabase'ning server
 * tomonidagi rasm transformatsiyasi Pro tarifni talab qiladi, bu yechim
 * esa HAR QANDAY tarifda ishlaydi va hech narsa qoʻshimcha toʻlanmaydi.
 */
const MAX_DIMENSION = 1600; // saytdagi eng katta koʻrsatish joyidan ~1.3×
const WEBP_QUALITY = 0.82; // koʻz ilgʻamaydigan yoʻqotish, sezilarli yutuq

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Ba'zi brauzerlar ayrim formatlarni qo'llab-quvvatlamaydi — pastga tushamiz.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Rasmni oʻqib boʻlmadi'));
      img.src = url;
    });
  } finally {
    // `img.src` allaqachon oʻqilgan; URLʼni boʻshatamiz.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Rasmni kichraytirib WebPʼga oʻgiradi.
 * Muvaffaqiyatsiz boʻlsa yoki foyda bermasa — ASL faylni qaytaradi.
 * Yaʼni bu qadam hech qachon yuklashni buzmaydi.
 */
export async function compressImage(file: File): Promise<{ file: File; savedBytes: number }> {
  // Animatsiyali GIF canvas orqali oʻtkazilsa harakati yoʻqoladi — tegmaymiz.
  if (file.type === 'image/gif' || !canUseCanvas()) return { file, savedBytes: 0 };

  try {
    const bitmap = await loadBitmap(file);
    const sw = 'width' in bitmap ? bitmap.width : 0;
    const sh = 'height' in bitmap ? bitmap.height : 0;
    if (!sw || !sh) return { file, savedBytes: 0 };

    const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, savedBytes: 0 };
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if ('close' in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );

    // WebP qoʻllab-quvvatlanmasa `toBlob` null yoki PNG qaytaradi.
    if (!blob || blob.type !== 'image/webp') return { file, savedBytes: 0 };
    // Siqilgan variant kattaroq boʻlsa (masalan allaqachon optimallashgan
    // kichik rasm) — asl faylni qoldiramiz.
    if (blob.size >= file.size) return { file, savedBytes: 0 };

    const converted = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
      type: 'image/webp',
      lastModified: Date.now(),
    });
    return { file: converted, savedBytes: file.size - converted.size };
  } catch {
    // Har qanday nosozlikda asl fayl bilan davom etamiz.
    return { file, savedBytes: 0 };
  }
}

export async function uploadImage(file: File, folder = 'products'): Promise<UploadResult> {
  const validation = validateImageFile(file);
  if (validation) throw new Error(validation);

  const { file: optimized } = await compressImage(file);
  const ext = optimized.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase();

  const path = `${folder}/${safeName(file.name, ext)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, {
    cacheControl: '31536000',
    upsert: false,
    contentType: optimized.type,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Bucketʼdan faylni oʻchiradi. URL bizning bucketʼimizga tegishli
 * boʻlmasa (masalan tashqi havola) hech narsa qilinmaydi.
 */
export async function deleteImageByUrl(url: string): Promise<void> {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
