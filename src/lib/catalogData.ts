import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Category } from './types';

/*
 * Kategoriyalar bir necha joyda kerak bo'ladi: header navigatsiyasi, bosh
 * sahifa, katalog filtri, mobil menyu. Ilgari har bir komponent o'zi
 * alohida so'rov yuborardi — bitta sahifa ochilishida bir xil ro'yxat
 * 3-4 marta tarmoqdan olinardi. Bu yerda jarayon davomida saqlanadigan
 * yengil cache va "in-flight" so'rovni birlashtirish bor.
 */

/*
 * Aniq ustunlar ro'yxati — `select('*')` EMAS.
 *
 * `*` ikki jihatdan yomon: (1) kod ishlatmaydigan ustunlarni ham tarmoqdan
 * tortadi; (2) jadvalga kelajakda ustun qo'shilsa (masalan ichki izoh yoki
 * narx tahlili), u JIMGINA barcha mijozlarga yuborila boshlaydi —
 * ortiqcha trafik va ehtimoliy ma'lumot sizishi. Ro'yxat `types.ts` dagi
 * `Category` shakli bilan bir xil.
 */
export const CATEGORY_SELECT =
  'id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at';

let cache: Category[] | null = null;
let inFlight: Promise<Category[]> | null = null;

export async function fetchCategories(force = false): Promise<Category[]> {
  if (!force && cache) return cache;
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    const { data, error } = await supabase
      .from('categories')
      .select(CATEGORY_SELECT)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (error) throw error;
    cache = (data ?? []) as Category[];
    return cache;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Admin panelda kategoriya o'zgartirilganda saqlangan ro'yxatni bekor qiladi. */
export function invalidateCategories() {
  cache = null;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(() => cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (cache) {
      setCategories(cache);
      setLoading(false);
      return;
    }
    fetchCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading, error };
}
