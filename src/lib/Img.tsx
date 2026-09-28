import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cx, skeleton } from './design';

/*
 * Sayt boʻylab yagona rasm komponenti.
 *
 * Ilgari har bir joyda oddiy `<img>` yozilardi va natijada:
 *   • bir joyda skeleton bor, boshqasida yoʻq;
 *   • buzuq havolada baʼzan boʻsh oq quti, baʼzan brauzerning
 *     "sinuq rasm" ikonkasi chiqardi;
 *   • `loading`/`decoding` atributlari tasodifiy qoʻyilgandi.
 *
 * Bu komponent uchala holatni bitta joyda hal qiladi.
 *
 * CLS (layout shift) haqida:
 * konteynerga HAR DOIM aspect-ratio beriladi, shuning uchun rasm
 * yuklanmasidan oldin ham joy band boʻladi va kontent sakramaydi.
 * Bu sekin internetda eng sezilarli farqni beradi.
 */

/*
 * Supabase Storage server tomonida rasm oʻlchamini oʻzgartira oladi
 * (`/render/image/...`), LEKIN bu Pro tarifni talab qiladi. Bepul
 * tarifda u xato qaytaradi va rasmlar UMUMAN koʻrinmay qoladi.
 *
 * Shuning uchun standart boʻyicha OʻCHIQ. Pro tarifga oʻtsangiz
 * `.env` ga `VITE_SUPABASE_IMAGE_TRANSFORM=true` qoʻshsangiz —
 * srcset avtomatik yoqiladi va hech qanday kod oʻzgarmaydi.
 *
 * Bepul tarifda ham rasmlar baribir yengil: admin yuklashda ular
 * WebPʼga oʻgirilib, 1600px gacha kichraytiriladi (lib/admin/upload.ts).
 */
const TRANSFORM_ENABLED = import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM === 'true';
const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';
const WIDTHS = [320, 480, 640, 960, 1280];

function isStorageUrl(url: string): boolean {
  return url.includes(OBJECT_MARKER);
}

function transformUrl(url: string, width: number): string {
  return `${url.replace(OBJECT_MARKER, RENDER_MARKER)}?width=${width}&resize=contain&quality=78`;
}

/** Faqat oʻz Storageʼimizdagi rasmlar uchun srcset; tashqi havolalarga tegilmaydi. */
function buildSrcSet(src: string): string | undefined {
  if (!TRANSFORM_ENABLED || !isStorageUrl(src)) return undefined;
  return WIDTHS.map((w) => `${transformUrl(src, w)} ${w}w`).join(', ');
}

/**
 * `fetchpriority` atributi — kichik harflarda.
 *
 * React 18 camelCase `fetchPriority` ni TANIMAYDI: konsolga ogohlantirish
 * yozadi va atributni DOMʼga umuman qoʻymaydi. Yaʼni LCP rasmi uchun
 * moʻljallangan ustuvorlik hech qachon ishlamagan — bosh sahifadagi
 * banner va mahsulot galereyasi ham shu ahvolda edi.
 *
 * Kichik harfli nomaʼlum atributni React oʻzgarishsiz oʻtkazadi.
 * (React 19 ga oʻtilganda hammasini `fetchPriority` ga qaytarish mumkin.)
 */
export function fetchPriorityAttr(priority: boolean): { fetchpriority: 'high' | 'auto' } {
  return { fetchpriority: priority ? 'high' : 'auto' };
}

export type ImgProps = {
  src: string | null | undefined;
  alt: string;
  /** Konteyner sinflari (aspect-ratio, radius, fon). */
  className?: string;
  /** `<img>` ning oʻz sinflari (object-fit, transform va h.k.). */
  imgClassName?: string;
  /**
   * LCP rasmi uchun `true`: darhol yuklanadi va yuqori ustuvorlik oladi.
   * Sahifada 1–2 tadan koʻp boʻlmasin, aks holda mazmuni yoʻqoladi.
   */
  priority?: boolean;
  /** Responsive `sizes` — srcset yoqilganda brauzerga kerak boʻladi. */
  sizes?: string;
  /** Rasm yoʻq yoki buzuq boʻlsa koʻrsatiladigan matn. */
  fallbackLabel?: string;
  /** Buzuq rasm oʻrniga koʻrsatiladigan ikonka oʻlchami. */
  iconClassName?: string;
};

export function Img({
  src,
  alt,
  className,
  imgClassName,
  priority = false,
  sizes,
  fallbackLabel,
  iconClassName = 'h-8 w-8',
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  /*
   * `src` oʻzgarganda holat tozalanadi.
   *
   * Galereyada bitta buzuq rasm ochilsa `failed` true boʻlib qolar va
   * KEYINGI (butun) rasmlar ham "yuklanmadi" ikonkasi bilan koʻrsatilardi,
   * chunki holat hech qachon qayta oʻrnatilmasdi. Bu React hujjatlaridagi
   * "props oʻzgarganda holatni toʻgʻrilash" naqshi — effekt emas, shuning
   * uchun ortiqcha render boʻlmaydi.
   */
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setLoaded(false);
    setFailed(false);
  }

  const hasSrc = !!src?.trim();
  const showImage = hasSrc && !failed;

  /*
   * KESHDAGI RASM MUAMMOSI.
   *
   * Rasm brauzer keshida boʻlsa, u React `onLoad` ni ulgurmasidan oldin
   * yuklanib boʻlishi mumkin — hodisa umuman kelmaydi. Natijada `loaded`
   * doim `false` qolib, rasm `opacity-0` bilan KOʻRINMAY qolardi: takroriy
   * tashrifda katalog boʻm-boʻsh koʻrinardi. Shuning uchun element DOMga
   * qoʻshilgan zahoti `complete` bayrogʻini oʻzimiz tekshiramiz.
   */
  const attachImg = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  };

  return (
    <div className={cx('relative overflow-hidden bg-ink-50', className)}>
      {/* Skeleton faqat haqiqiy yuklanish paytida — bo'sh holatda emas. */}
      {showImage && !loaded && <div className={cx('absolute inset-0', skeleton)} aria-hidden="true" />}

      {/*
        `showImage && src` — `src!` O'RNIGA.
        `showImage` allaqachon `src` bo'shligini tekshiradi, lekin TypeScript
        buni oraliq mantiqiy o'zgaruvchi orqali kuza olmaydi. Shartga `src` ni
        qo'shsak, u shu tarmoqda `string` sifatida toraytiriladi — natijada
        `!` kerak emas va tekshiruv haqiqiy bo'lib qoladi.
      */}
      {showImage && src ? (
        <img
          ref={attachImg}
          src={src}
          srcSet={buildSrcSet(src)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          {...fetchPriorityAttr(priority)}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx(
            'h-full w-full transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName ?? 'object-cover'
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-300">
          <ImageOff className={iconClassName} aria-hidden="true" />
          {fallbackLabel && <span className="text-[11px]">{fallbackLabel}</span>}
        </div>
      )}
    </div>
  );
}
