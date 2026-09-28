import { createContext, useContext } from 'react';

/*
 * "Uchish" konteksti — komponentdan ALOHIDA modulda.
 *
 * Sabab `uiHooks.ts` dagi bilan bir xil: Vite'ning Fast Refresh
 * mexanizmi bitta fayldan ham komponent, ham komponent bo'lmagan qiymat
 * eksport qilinsa modul holatini saqlab qola olmaydi. Shuning uchun
 * kontekst va hook shu yerda, provider esa `flight.tsx` da.
 */

/**
 * Uchish turi.
 *
 * `cart` va `fav` ATAYLAB ikki xil harakat — bir animatsiyaning ikki
 * rangi emas:
 *   cart — jismoniy: mahsulot rasmi savatga TUSHADI (pastga tortiladi).
 *   fav  — hissiy: yurakcha yengil yoy chizib ko'tariladi va so'nadi.
 */
export type FlightKind = 'cart' | 'fav';

/**
 * Uchishni boshlaydi.
 *
 * `origin` — boshlanish to'rtburchagi (odatda mahsulot rasmi).
 * `imageSrc` faqat `cart` uchun kerak; `fav` o'z yurakchasini chizadi.
 *
 * `prefers-reduced-motion` yoqilgan bo'lsa yoki nishon ekranda
 * bo'lmasa, uchish o'tkazib yuboriladi. Chaqiruvchi tomonda shart
 * yozish SHART EMAS — va holat baribir darhol yangilanadi, chunki
 * animatsiya hech narsani kutib turmaydi.
 */
export type FlyFn = (
  kind: FlightKind,
  origin: HTMLElement | null,
  imageSrc?: string | null
) => void;

export const FlightContext = createContext<FlyFn>(() => {});

export function useFlight(): FlyFn {
  return useContext(FlightContext);
}
