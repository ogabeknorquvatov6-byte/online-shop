import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap } from './adapters';
import type { Product } from './types';
import { ProductCarousel } from './ProductCarousel';
import { SectionHeader } from './SectionHeader';

/*
 * «Tavsiya etamiz» — bo'sh savat/sevimlilar sahifasi boshi berk ko'cha
 * bo'lib qolmasligi uchun. Mahsulotlar eng ko'p sotilgan va eng ko'p
 * ko'rilganlar orasidan olinadi, ya'ni ro'yxat haqiqiy ma'lumotga tayanadi
 * (soxta "tavsiya" emas).
 */

const LIMIT = 12;

function useRecommendedProducts(excludeIds: string[] = []) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const key = excludeIds.slice().sort().join(',');

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const exclude = key ? key.split(',').filter(Boolean) : [];
      let query = supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .gt('stock', 0)
        .order('sales_count', { ascending: false })
        .order('view_count', { ascending: false })
        .limit(LIMIT + exclude.length);

      if (exclude.length) query = query.not('id', 'in', `(${exclude.join(',')})`);

      const [{ data, error }, promoMap] = await Promise.all([query, fetchPromoDiscountMap(supabase)]);
      if (cancelled) return;
      if (error || !data) {
        setProducts([]);
        setLoading(false);
        return;
      }
      setProducts(adaptProducts(data, promoMap).slice(0, LIMIT));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => load(), [load]);

  return { products, loading };
}

export function RecommendationCarousel({
  title = 'Tavsiya etamiz',
  subtitle = 'Xaridorlar eng ko‘p tanlaydigan mahsulotlar',
  excludeIds,
}: {
  title?: string;
  subtitle?: string;
  excludeIds?: string[];
}) {
  const { products, loading } = useRecommendedProducts(excludeIds);

  // Yuklanish tugadi-yu, hech narsa yo'q bo'lsa — bo'sh sarlavha qoldirmaymiz.
  if (!loading && products.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="recommended-heading">
      <SectionHeader id="recommended-heading" title={title} subtitle={subtitle} />
      <div className="mt-4">
        <ProductCarousel
          products={products}
          loading={loading}
          seeAllHref="/bestsellers"
          seeAllLabel="Xit sotuvlar"
          ariaLabel="Tavsiya etilgan mahsulotlar"
          skeletonCount={4}
        />
      </div>
    </section>
  );
}
