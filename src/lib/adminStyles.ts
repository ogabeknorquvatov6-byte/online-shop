import { card, cx } from './design';

/*
 * Admin jadvallarining umumiy sinflari.
 *
 * Bular `AdminShared.tsx` ichida — komponentlar bilan bir faylda — turardi.
 * Ular oddiy qiymatlar, komponent emas; alohida modulga chiqarilishi
 * Fast Refreshʼni ham toʻgʻri ishlatadi, ham boʻlimlar orasida jadval
 * koʻrinishi bir xil qolishini taʼminlaydi.
 */

/** Desktop jadval konteyneri — mobilda jadval oʻrniga kartochkalar chiqadi. */
export const tableWrap = cx(card, 'hidden overflow-x-auto lg:block');

export const th =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-400';

export const td = 'px-4 py-3 align-middle';

export const tr = 'border-t border-ink-100 transition-colors hover:bg-ink-50';
