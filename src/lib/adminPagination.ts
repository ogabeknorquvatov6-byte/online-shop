import { useEffect, useState } from 'react';

/*
 * Admin roʻyxatlari uchun SERVER TOMONIDA sahifalash.
 *
 * MUAMMO. `AdminProducts` barcha mahsulotlarni BITTA soʻrov bilan olardi:
 *
 *     supabase.from('products').select('*, product_images(*), product_variants(*)')
 *
 * — chegara yoʻq. Har bir mahsulot bilan birga uning BARCHA rasmlari va
 * BARCHA variantlari ham yuklanardi. 100 ta mahsulotda bu sezilmaydi,
 * 5 000 tada esa brauzerga oʻnlab megabayt JSON tushadi: sahifa bir necha
 * soniya qotadi, mobil qurilmada esa yorliq umuman yopilib qolishi mumkin.
 * Qidiruv va filtr ham mijozda bajarilardi — yaʼni maʼlumotni oldin
 * toʻliq yuklab, keyin tashlab yuborardik.
 *
 * YECHIM. Sahifa, qidiruv va filtr SERVERGA beriladi; brauzerga faqat
 * bitta sahifa keladi. Bu modul shu naqshning takrorlanadigan qismini
 * saqlaydi (holat + `range` hisobi + qidiruvni kechiktirish).
 *
 * Alohida `.ts` faylda — komponent emas, shuning uchun Fast Refresh
 * qoidalari buzilmaydi.
 */

export const ADMIN_PAGE_SIZE = 25;

export type PageRange = { from: number; to: number };

/** `page` (1 dan boshlanadi) ni Supabase `.range(from, to)` ga aylantiradi. */
export function pageRange(page: number, size = ADMIN_PAGE_SIZE): PageRange {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * size;
  return { from, to: from + size - 1 };
}

/** Umumiy yozuvlar sonidan sahifalar sonini hisoblaydi (kamida 1). */
export function pageCount(total: number, size = ADMIN_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Koʻrsatiladigan oraliq: "1–25 / 137".
 * Boʻsh roʻyxatda `0` qaytaradi, shunda "1–25 / 0" kabi bemaʼnilik chiqmaydi.
 */
export function pageSummary(page: number, total: number, loaded: number, size = ADMIN_PAGE_SIZE): string {
  if (total <= 0 || loaded <= 0) return '0';
  const { from } = pageRange(page, size);
  return `${from + 1}–${from + loaded} / ${total}`;
}

/**
 * Qidiruv matnini kechiktiradi — har bosilgan harf uchun alohida soʻrov
 * yuborilmasligi kerak. Admin panelida soʻrovlar ogʻir (JOIN + count),
 * shuning uchun kechikish saytdagidan biroz uzunroq.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
