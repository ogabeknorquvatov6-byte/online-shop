import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap } from './adapters';
import type { CartItem, Product } from './types';
import { cartItemKey, maxQuantityFor, sanitizeStoredCart, unitPrice } from './cartUtils';

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  /** Savat localStorageʼdan oʻqilgunga qadar true (SSR-siz ham bir kadr kerak). */
  hydrated: boolean;
  /**
   * Savat bazaga qarab tekshirilganda oʻzgargan/olib tashlangan pozitsiyalar
   * haqidagi bir martalik xabar. UI uni koʻrsatib, keyin `clearNotice()` qiladi.
   */
  notice: string | null;
  clearNotice: () => void;
  addItem: (product: Product, quantity?: number, variant?: string, variantId?: string) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = 'openshop_cart';

function readStoredItems(): CartItem[] {
  try {
    // `localStorage` ga MUROJAATNING OʻZI ham xato berishi mumkin: baʼzi
    // brauzerlarda "barcha cookieʼlarni bloklash" yoqilganda unga kirish
    // `SecurityError` otadi. Shuning uchun `getItem` ham try ichida.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeStoredCart(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const revalidated = useRef(false);

  useEffect(() => {
    setItems(readStoredItems());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // boʻsh boshlangʻich holat saqlangan savatni oʻchirib yubormasin
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage yo'q, to'lgan yoki private-browsing rejimida bloklangan
      // bo'lishi mumkin (ayniqsa mobil Safari) — bunday holatda xatoni yutib
      // yuboramiz, aks holda butun ilova oq ekranga qotib qoladi.
    }
  }, [items, hydrated]);

  /*
   * Savat localStorageʼda MAHSULOT NUSXASI bilan saqlanadi, yaʼni narx,
   * qoldiq va hatto mahsulotning mavjudligi vaqt oʻtishi bilan eskiradi.
   * Ilgari mijoz bir hafta oldingi narxni koʻrib turib checkoutda boshqa
   * summa olardi (server narxni qayta hisoblaydi). Shu sababli savat bir
   * marta — ilova ochilganda — bazaga solishtirib yangilanadi.
   */
  useEffect(() => {
    if (!hydrated || revalidated.current) return;
    revalidated.current = true;
    const ids = [...new Set(readStoredItems().map((i) => i.product.id))];
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const [{ data, error }, promoMap] = await Promise.all([
        supabase.from('products').select(PRODUCT_SELECT).in('id', ids),
        fetchPromoDiscountMap(supabase),
      ]);
      // Tarmoq xatosi boʻlsa savatni OʻZGARTIRMAYMIZ — offline foydalanuvchining
      // savatini boʻshatib yuborish eng yomon variant boʻlardi.
      if (cancelled || error || !data) return;

      const fresh = new Map(adaptProducts(data, promoMap).map((p) => [p.id, p]));
      let removed = 0;
      let priceChanged = 0;
      let clamped = 0;

      setItems((prev) => {
        const next: CartItem[] = [];
        for (const item of prev) {
          const p = fresh.get(item.product.id);
          if (!p || p.status !== 'active') {
            removed += 1;
            continue;
          }
          if (p.stock <= 0) {
            removed += 1;
            continue;
          }
          // Tanlangan variant oʻchirilgan/nofaol boʻlsa, pozitsiyani ham
          // olib tashlaymiz — aks holda server `INVALID_VARIANT` qaytaradi.
          if (item.variantId) {
            const variant = p.product_variants?.find((v) => v.id === item.variantId);
            if (!variant || variant.is_active === false || (variant.stock != null && variant.stock <= 0)) {
              removed += 1;
              continue;
            }
          }
          if (p.price !== item.product.price) priceChanged += 1;
          const qty = Math.min(item.quantity, maxQuantityFor(p, item.variantId));
          if (qty !== item.quantity) clamped += 1;
          next.push({ ...item, product: p, quantity: qty });
        }
        return next;
      });

      const parts: string[] = [];
      if (removed) parts.push(`${removed} ta mahsulot sotuvda yoʻq`);
      if (priceChanged) parts.push('narxlar yangilandi');
      if (clamped) parts.push('miqdor omborga moslashtirildi');
      if (parts.length) setNotice(`Savat yangilandi: ${parts.join(', ')}.`);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const addItem = useCallback((product: Product, quantity = 1, variant?: string, variantId?: string) => {
    setItems((prev) => {
      const max = maxQuantityFor(product, variantId);
      const key = cartItemKey({ product, variant, variantId });
      const idx = prev.findIndex((i) => cartItemKey(i) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], product, quantity: Math.min(next[idx].quantity + quantity, max) };
        return next;
      }
      return [...prev, { product, quantity: Math.min(quantity, max), variant, variantId }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => cartItemKey(i) !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => cartItemKey(i) !== key);
      return prev.map((i) =>
        cartItemKey(i) === key
          ? { ...i, quantity: Math.min(quantity, maxQuantityFor(i.product, i.variantId)) }
          : i
      );
    });
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    const subtotal = items.reduce((s, i) => s + unitPrice(i) * i.quantity, 0);
    return {
      items, count, subtotal, hydrated, notice,
      clearNotice, addItem, removeItem, updateQuantity, clearCart,
    };
  }, [items, hydrated, notice, clearNotice, addItem, removeItem, updateQuantity, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
