import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PRODUCT_SELECT, adaptProducts, fetchPromoDiscountMap } from './adapters';
import type { Product } from './types';
import { ProductCarousel } from './ProductCarousel';
import { SectionHeader } from './SectionHeader';

/*
 * «Tavsiya etamiz» — boʻsh savat/sevimlilar sahifasi boshi berk koʻcha
 * boʻlib qolmasligi uchun. Mahsulotlar eng koʻp sotilgan va eng koʻp
 * koʻrilganlar orasidan olinadi, yaʼni roʻyxat haqiqiy maʼlumotga tayanadi
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
  subtitle = 'Xaridorlar eng koʻp tanlaydigan mahsulotlar',
  excludeIds,
}: {
  title?: string;
  subtitle?: string;
  excludeIds?: string[];
}) {
  const { products, loading } = useRecommendedProducts(excludeIds);

  // Yuklanish tugadi-yu, hech narsa yoʻq boʻlsa — boʻsh sarlavha qoldirmaymiz.
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
