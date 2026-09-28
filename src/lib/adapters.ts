// Production (`openshop`) sxemasi bilan dizayn (`project`) kutayotgan
// `types.ts` shakllari orasidagi koʻprik. Bu fayl faqat DATA MOSLASHUVI
// uchun — JSX/komponentlarga tegilmagan.

import type { Product, Banner, Promotion, CategoryRef } from './types';

const PRODUCT_SELECT = '*, product_images(*), product_variants(*)';

// products soʻrovlariga shu maydonni qoʻshing:
// supabase.from('products').select(PRODUCT_SELECT)...
export { PRODUCT_SELECT };

/*
 * Aniq ustunlar roʻyxatlari — `select('*')` OʻRNIGA.
 *
 * `*` ikki jihatdan zararli:
 *   1. Kod ishlatmaydigan ustunlar ham har soʻrovda tarmoqdan tortiladi.
 *   2. Jadvalga kelajakda ustun qoʻshilsa (ichki izoh, xarid narxi,
 *      tahliliy maydon), u JIMGINA barcha mijozlarga yuborila boshlaydi.
 *      Bu ortiqcha trafik va ehtimoliy maʼlumot sizishi — hech kim
 *      buni ataylab qilmaydi, shunchaki `*` shunday ishlaydi.
 *
 * Roʻyxatlar pastdagi `*Row` tiplari va `types.ts` shakllariga mos.
 */
export const BANNER_SELECT =
  'id, title, description, image_url, button_text, destination, is_active, sort_order, created_at';

export const PROMOTION_SELECT =
  'id, name, description, discount_percent, starts_at, ends_at, is_active, created_at';

export const PRODUCT_IMAGE_SELECT = 'id, product_id, image_url, sort_order, is_primary';

export const PRODUCT_VARIANT_SELECT =
  'id, product_id, type, value, sort_order, label, color_code, image_url, stock, price_adjustment, is_active';

export type ProductRow = {
  id: string; name: string; slug: string; description: string;
  price: number; discount_price: number | null;
  brand: string; category_id: string | null; sku: string; stock: number;
  sales_count: number; rating: number; reviews_count: number;
  is_active: boolean; created_at: string;
  warranty?: string | null;
  image_url?: string | null;
  product_images?: {
    id: string; product_id: string; image_url: string; sort_order: number; is_primary?: boolean;
  }[];
  product_variants?: {
    id: string; product_id: string; type: string; value: string; sort_order: number;
    label?: string | null; color_code?: string | null; image_url?: string | null;
    stock?: number | null; price_adjustment?: number | null; is_active?: boolean;
  }[];
  /*
   * Supabase `select('*, categories(*)')` da bogʻliq jadval nomi bilan
   * keladi. Toʻliq `Category` boʻlmasligi mumkin (soʻrovda faqat bir
   * nechta ustun tanlansa), shuning uchun `Partial` emas — aniq roʻyxat.
   */
  categories?: CategoryRef | null;
};

const NEW_THRESHOLD_MS = 14 * 24 * 3600 * 1000; // 14 kun

export function adaptProduct(row: ProductRow, promoDiscountPercent?: number | null): Product {
  const promoPrice = promoDiscountPercent ? row.price * (1 - promoDiscountPercent / 100) : null;
  const candidates = [row.discount_price, promoPrice].filter((v): v is number => v != null && v > 0);
  const effectivePrice = candidates.length ? Math.min(...candidates) : row.price;
  const hasDiscount = effectivePrice < row.price;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: effectivePrice,
    old_price: hasDiscount ? row.price : null,
    brand: row.brand,
    category_id: row.category_id,
    sku: row.sku,
    stock: row.stock,
    sales_count: row.sales_count ?? 0,
    rating: row.rating ?? 0,
    reviews_count: row.reviews_count ?? 0,
    is_new: Date.now() - new Date(row.created_at).getTime() < NEW_THRESHOLD_MS,
    status: row.is_active ? 'active' : 'inactive',
    // Boʻsh satr `null` ga keltiriladi — chaqiruv joyi faqat bitta
    // shartni ("bormi?") tekshirsin, ikkitasini emas.
    warranty: row.warranty?.trim() || null,
    created_at: row.created_at,
    updated_at: row.created_at,
    category: row.categories ?? null,
    // Asosiy rasm har doim birinchi: katalog kartochkasi, savat va
    // buyurtmalar tarixi roʻyxatning [0] elementini oladi.
    product_images: [...(row.product_images ?? [])].sort(
      (a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false) || a.sort_order - b.sort_order
    ),
    product_variants: row.product_variants ?? [],
  };
}

export function adaptProducts(rows: ProductRow[], promoMap?: Record<string, number>): Product[] {
  return rows.map((r) => adaptProduct(r, promoMap?.[r.id]));
}

export type BannerRow = {
  id: string; title: string; description: string; image_url: string;
  button_text: string; destination: string; is_active: boolean;
  sort_order: number; created_at: string;
};

export function adaptBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.description || null,
    image_url: row.image_url || null,
    button_text: row.button_text || null,
    button_link: row.destination || null,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

export type PromotionRow = {
  id: string; name: string; discount_percent: number; description?: string | null;
  starts_at: string; ends_at: string | null; is_active: boolean; created_at: string;
};

export function adaptPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    title: row.name,
    description: row.description || null,
    discount_percentage: row.discount_percent,
    start_date: row.starts_at,
    end_date: row.ends_at,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

// Faol promo-chegirmalarni product_id -> discount_percent shaklida oladi.
// Boʻsh xato holatida ham boʻsh map qaytaradi (chegirma yoʻq deb hisoblanadi).
export async function fetchPromoDiscountMap(supabase: import('@supabase/supabase-js').SupabaseClient): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('active_promotion_discounts');
  const map: Record<string, number> = {};
  (data ?? []).forEach((row: { product_id: string; discount_percent: number }) => {
    map[row.product_id] = row.discount_percent;
  });
  return map;
}
