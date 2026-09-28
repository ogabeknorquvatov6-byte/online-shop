import { card, cx } from './design';

/*
 * Admin jadvallarining umumiy sinflari.
 *
 * Bular `AdminShared.tsx` ichida — komponentlar bilan bir faylda — turardi.
 * Ular oddiy qiymatlar, komponent emas; alohida modulga chiqarilishi
 * Fast Refresh'ni ham to'g'ri ishlatadi, ham bo'limlar orasida jadval
 * ko'rinishi bir xil qolishini ta'minlaydi.
 */

/** Desktop jadval konteyneri — mobilda jadval o'rniga kartochkalar chiqadi. */
export const tableWrap = cx(card, 'hidden overflow-x-auto lg:block');

export const th =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-400';

export const td = 'px-4 py-3 align-middle';

export const tr = 'border-t border-ink-100 transition-colors hover:bg-ink-50';
