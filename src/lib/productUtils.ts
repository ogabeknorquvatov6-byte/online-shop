/**
 * Ombor holatini bitta joyda hal qilamiz — mahsulot kartasi ham, mahsulot
 * sahifasi ham, admin ro'yxati ham AYNAN shu chegaralarga tayanadi, aks
 * holda "kam qoldi" belgisi joyiga qarab turlicha chiqib qolardi.
 */
import { formatCount, type ProductReview } from './types';

export function stockState(stock: number): 'out' | 'low' | 'in' {
  if (stock <= 0) return 'out';
  if (stock <= 5) return 'low';
  return 'in';
}

/*
 * IJTIMOIY ISBOT — "shuncha marta sotib olingan".
 *
 * `products.sales_count` bazada allaqachon bor va bosh sahifadagi "Xit
 * mahsulotlar" bo'limini saralash uchun ishlatiladi, lekin mijozga hech
 * qayerda KO'RSATILMASDI. Ya'ni ilova eng ishonarli ma'lumotini o'zida
 * yashirib turardi.
 *
 * ── NEGA 10 DAN PAST BO'LSA HECH NARSA ────────────────────────────
 *
 * Bu ostona xavfsizlik uchun emas, ISHONCH uchun. "3 marta sotib
 * olingan" degan yozuv ijtimoiy isbot BERMAYDI — u aksincha, mahsulot
 * deyarli sotilmayotganini e'lon qiladi va xaridni to'xtatadi. Hech
 * narsa yozmaslik esa neytral: o'quvchi hech qanday xulosa chiqarmaydi.
 *
 * Shuning uchun ostona va matn shu yerda — ikkala chaqiruv joyi
 * (Spotlight va mahsulot sahifasi) bir xil qoidaga bo'ysunishi va
 * kelajakda ular ajralib ketmasligi kerak.
 */
const SOCIAL_PROOF_MIN = 10;

export function socialProof(salesCount: number | null | undefined): string | null {
  if (typeof salesCount !== 'number' || !Number.isFinite(salesCount)) return null;
  if (salesCount < SOCIAL_PROOF_MIN) return null;
  return `${formatCount(salesCount)} marta sotib olingan`;
}

export type ReviewStats = { rating: number; count: number };

/**
 * Sharhlar ro'yxatidan o'rtacha baho va son.
 *
 * `ProductReviews.tsx` DAN AJRATILGAN: u komponentlar fayli, undan
 * komponent bo'lmagan qiymat eksport qilinsa Vite'ning Fast Refresh'i
 * modul holatini saqlay olmaydi (`react-refresh/only-export-components`).
 * Bu — sof mantiq, shuning uchun uning joyi shu yerda.
 *
 * YAXLITLASH BIR KASR XONAGACHA — bu tasodif emas: `products.rating`
 * ustuni `numeric(2,1)` va bazadagi trigger ham aynan shunday
 * yaxlitlaydi (migratsiya 20260913000000). Ikkalasi bir xil bo'lmasa,
 * sharh yuborilgan lahzada ekrandagi raqam bir xil, sahifa
 * yangilangandan keyin boshqacha ko'rinardi.
 */
export function summarizeReviews(list: ProductReview[]): ReviewStats {
  if (list.length === 0) return { rating: 0, count: 0 };
  const sum = list.reduce((acc, r) => acc + r.rating, 0);
  return { rating: Math.round((sum / list.length) * 10) / 10, count: list.length };
}
