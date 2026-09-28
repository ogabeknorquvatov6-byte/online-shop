export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

/** Mahsulot bilan birga keladigan qisqartirilgan kategoriya ma'lumoti. */
export type CategoryRef = Pick<Category, 'id' | 'name' | 'slug'>;

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  old_price: number | null;
  brand: string | null;
  category_id: string | null;
  sku: string | null;
  stock: number;
  sales_count: number;
  rating: number;
  reviews_count: number;
  is_new: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  /*
   * Bog'liq kategoriyaning FAQAT ko'rsatish uchun kerakli qismi.
   *
   * Ilgari bu `Category | null` deb e'lon qilingan edi, lekin mahsulot
   * so'rovlari kategoriyaning hamma ustunini olmaydi (`categories(id,
   * name, slug)`). Ya'ni tip haqiqatdan kengroq bo'lgan va `adapters.ts`
   * uni `as any` bilan majburan kiritishga majbur edi — endi tip
   * haqiqatga mos, majburlash ham kerak emas.
   */
  category?: CategoryRef | null;
  product_images?: ProductImage[];
  product_variants?: ProductVariant[];
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
  /** Katalog kartochkasida va buyurtma tarixida ishlatiladigan asosiy rasm. */
  is_primary?: boolean;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  /** 'color' | 'storage' | 'size' | ixtiyoriy boshqa guruh nomi. */
  type: string;
  value: string;
  sort_order: number;
  /** Ko'rsatiladigan nom (bo'sh bo'lsa `value` ishlatiladi). */
  label?: string | null;
  /** Rang namunasi uchun HEX kod, masalan `#1d1d1f`. */
  color_code?: string | null;
  /** Shu variant tanlanganda ko'rsatiladigan rasm. */
  image_url?: string | null;
  /** NULL = alohida ombor yuritilmaydi (mahsulotning umumiy qoldig'i). */
  stock?: number | null;
  /** Asosiy narxga qo'shiladigan farq (manfiy ham bo'lishi mumkin). */
  price_adjustment?: number | null;
  is_active?: boolean;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  button_text: string | null;
  button_link: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discount_percentage: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type Order = {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  city: string | null;
  address: string | null;
  payment_method: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  variant: string | null;
  variant_id?: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  // Production sxemadan qo'shimcha (ichki foydalanish uchun, UI'ga ta'sir qilmaydi)
  is_active?: boolean;
};

/**
 * Mahsulot sharhi (`product_reviews`, migratsiya 20260913000000).
 *
 * `author_name` va `verified_purchase` — SERVER to'ldiradigan nusxa
 * maydonlari. Ular mijozdan qabul qilinmaydi: `profiles` jadvalini
 * begona foydalanuvchi o'qiy olmagani uchun ism sharh yozilgan paytda
 * trigger orqali qatorning o'ziga yoziladi.
 */
export type ProductReview = {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  body: string;
  author_name: string;
  verified_purchase: boolean;
  created_at: string;
  updated_at: string;
};

export type Favorite = {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
  product?: Product;
};

export type Address = {
  id: string;
  user_id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  zip: string | null;
  is_default: boolean;
  created_at: string;
};

export type Settings = {
  id: number;
  store_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  delivery_fee_tashkent: number;
  delivery_fee_republic: number;
  free_delivery_threshold: number;
  instagram_url: string | null;
  telegram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  updated_at: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  /** Foydalanuvchiga ko'rinadigan variant matni, masalan "Qora / 256 GB". */
  variant?: string;
  /**
   * Tanlangan variantning ID'si. Narx farqi va ombor tekshiruvi SERVERDA
   * shu ID bo'yicha bajariladi — matnli nomga tayanib bo'lmaydi.
   */
  variantId?: string;
};

// Production `orders.status` ustunida to'g'ridan-to'g'ri shu o'zbekcha
// qiymatlarni saqlaydi (kalitlar ham, ko'rsatiladigan matn ham bir xil).
export const ORDER_STATUS_LABELS: Record<string, string> = {
  'Yangi': 'Yangi',
  'Qabul qilindi': 'Qabul qilindi',
  'Tayyorlanmoqda': 'Tayyorlanmoqda',
  'Yetkazilmoqda': 'Yetkazilmoqda',
  'Yetkazildi': 'Yetkazildi',
  'Bekor qilindi': 'Bekor qilindi',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  'Yangi': 'bg-blue-100 text-blue-700',
  'Qabul qilindi': 'bg-indigo-100 text-indigo-700',
  'Tayyorlanmoqda': 'bg-amber-100 text-amber-700',
  'Yetkazilmoqda': 'bg-purple-100 text-purple-700',
  'Yetkazildi': 'bg-green-100 text-green-700',
  'Bekor qilindi': 'bg-red-100 text-red-700',
};

const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU');

/** Narxi belgilanmagan (0 yoki manfiy) mahsulot sotuvga tayyor emas. */
export function hasSellablePrice(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  // Narxi kiritilmagan mahsulot uchun "0 so'm" deb yozish mijozni chalg'itadi
  // (bepul deb tushunilishi mumkin) — buning o'rniga aniq matn beramiz.
  if (value <= 0) return 'Narxi kelishiladi';
  return NUMBER_FORMAT.format(Math.round(value)) + ' soʻm';
}

/**
 * Ming ajratuvchi bilan oddiy son — NARX EMAS.
 *
 * Sotuvlar soni, ko'rishlar, sharhlar uchun. Narx formatlovchilaridan
 * ataylab ajratilgan: ularda "so'm", "Narxi kelishiladi" kabi pulga xos
 * mantiq bor va u sanoq uchun noto'g'ri bo'lardi.
 */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return NUMBER_FORMAT.format(Math.round(value));
}

/**
 * Narx, valyuta belgisisiz (narx slayderi yorliqlari).
 *
 * Hozircha `formatCount` bilan bir xil natija beradi, lekin nomi
 * chaqiruv joyida NIMA ekanini aytadi va narx formati kelajakda
 * o'zgarsa (masalan "mln" qisqartmasi) sanoqqa tegmaydi.
 */
export function formatPriceShort(value: number | null | undefined): string {
  return formatCount(value);
}

/*
 * O'ZBEKCHA OY NOMLARI — QO'LDA.
 *
 * `toLocaleDateString('uz-UZ', { month: 'long' })` oy nomini BERMAYDI.
 * O'lchandi: 2026-09-21 uchun natija «2026 M09 21» — ICU'da o'zbek oy
 * nomlari yo'q va u "M09" degan texnik belgiga tushib qoladi.
 * Buyurtma kartalarida bu «2026 M09 21 23:44» bo'lib chiqardi: na
 * o'zbekcha, na o'qiladigan.
 *
 * Bu ma'lumot TO'QIB CHIQARILMAGAN — bu shunchaki to'g'ri tarjima.
 */
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
] as const;

/**
 * Buyurtma sanasi: «21-sentabr, 2026 · 23:44».
 *
 * Yaroqsiz sanada bo'sh satr qaytaradi — «Invalid Date» hech qachon
 * ekranga chiqmaydi.
 */
export function formatOrderDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
  if (!withTime) return date;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} · ${hh}:${mm}`;
}

/**
 * Chegirma foizi.
 *
 * Ikkala narx ham musbat bo'lishi shart va natija 1..99 oralig'iga
 * cheklanadi: bazadagi noto'g'ri kiritilgan qiymat (masalan narx 0)
 * kartada "−100%" degan ishonchsiz nishonchani chiqarib yuborardi.
 */
export function discountPercent(price: number, oldPrice: number | null): number | null {
  if (!hasSellablePrice(price) || !hasSellablePrice(oldPrice)) return null;
  if ((oldPrice as number) <= price) return null;
  const percent = Math.round((1 - price / (oldPrice as number)) * 100);
  if (percent < 1) return null;
  return Math.min(percent, 99);
}
