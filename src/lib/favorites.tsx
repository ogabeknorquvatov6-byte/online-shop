import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap } from './adapters';
import type { Favorite } from './types';

type FavoritesContextValue = {
  favorites: Favorite[];
  favoriteIds: Set<string>;
  /**
   * Sevimlilar soni — to'g'ridan-to'g'ri saqlangan ID'lardan olinadi.
   * Ilgari nishonchalar (header/bottom nav) `favorites.length` ni ishlatardi,
   * ya'ni Supabase javob bergunga qadar 0 ko'rsatib, keyin sakrab o'zgarardi.
   */
  count: number;
  loading: boolean;
  error: boolean;
  toggle: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  retry: () => void;
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

// Sevimlilar Supabase'ga emas, localStorage'ga mahsulot ID massivi sifatida
// saqlanadi — mehmon foydalanuvchi ham sevimli qo'sha oladi (auth talab qilinmaydi).
const KEY = 'openshop-favorites';

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(() => readIds());
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      // localStorage yo'q yoki to'lgan bo'lsa e'tiborsiz qoldiramiz
    }
  }, [ids]);

  // ID ro'yxati o'zgarganda to'liq mahsulot obyektlarini yuklaymiz.
  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setFavorites([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data, error: err }, promoMap] = await Promise.all([
        supabase.from('products').select(PRODUCT_SELECT).in('id', ids),
        fetchPromoDiscountMap(supabase),
      ]);
      if (cancelled) return;
      if (err) {
        setError(true);
        setLoading(false);
        return;
      }
      setError(false);
      const products = adaptProducts(data ?? [], promoMap);
      const byId = new Map(products.map((p) => [p.id, p]));
      setFavorites(
        ids
          .map((id) => ({ id, user_id: '', product_id: id, created_at: '', product: byId.get(id) }))
          .filter((f) => f.product) as Favorite[]
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, reloadKey]);

  const toggle = useCallback((productId: string) => {
    setIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [productId, ...prev]));
  }, []);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo<FavoritesContextValue>(() => {
    const favoriteIds = new Set(ids);
    return {
      favorites,
      favoriteIds,
      count: ids.length,
      loading,
      error,
      toggle,
      retry,
      isFavorite: (productId: string) => favoriteIds.has(productId),
    };
  }, [ids, favorites, loading, error, toggle, retry]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
