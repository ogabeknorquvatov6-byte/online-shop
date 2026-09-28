/**
 * Ombor holatini bitta joyda hal qilamiz — mahsulot kartasi ham, mahsulot
 * sahifasi ham, admin roʻyxati ham AYNAN shu chegaralarga tayanadi, aks
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
 * mahsulotlar" boʻlimini saralash uchun ishlatiladi, lekin mijozga hech
 * qayerda KOʻRSATILMASDI. Yaʼni ilova eng ishonarli maʼlumotini oʻzida
 * yashirib turardi.
 *
 * ── NEGA 10 DAN PAST BOʻLSA HECH NARSA ────────────────────────────
 *
 * Bu ostona xavfsizlik uchun emas, ISHONCH uchun. "3 marta sotib
 * olingan" degan yozuv ijtimoiy isbot BERMAYDI — u aksincha, mahsulot
 * deyarli sotilmayotganini eʼlon qiladi va xaridni toʻxtatadi. Hech
 * narsa yozmaslik esa neytral: oʻquvchi hech qanday xulosa chiqarmaydi.
 *
 * Shuning uchun ostona va matn shu yerda — ikkala chaqiruv joyi
 * (Spotlight va mahsulot sahifasi) bir xil qoidaga boʻysunishi va
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
 * Sharhlar roʻyxatidan oʻrtacha baho va son.
 *
 * `ProductReviews.tsx` DAN AJRATILGAN: u komponentlar fayli, undan
 * komponent boʻlmagan qiymat eksport qilinsa Vite'ning Fast Refreshʼi
 * modul holatini saqlay olmaydi (`react-refresh/only-export-components`).
 * Bu — sof mantiq, shuning uchun uning joyi shu yerda.
 *
 * YAXLITLASH BIR KASR XONAGACHA — bu tasodif emas: `products.rating`
 * ustuni `numeric(2,1)` va bazadagi trigger ham aynan shunday
 * yaxlitlaydi (migratsiya 20260913000000). Ikkalasi bir xil boʻlmasa,
 * sharh yuborilgan lahzada ekrandagi raqam bir xil, sahifa
 * yangilangandan keyin boshqacha koʻrinardi.
 */
export function summarizeReviews(list: ProductReview[]): ReviewStats {
  if (list.length === 0) return { rating: 0, count: 0 };
  const sum = list.reduce((acc, r) => acc + r.rating, 0);
  return { rating: Math.round((sum / list.length) * 10) / 10, count: list.length };
}
