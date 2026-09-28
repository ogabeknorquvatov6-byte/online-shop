/*
 * Bosh sahifadagi boʻlimlarga "yumshoq" oʻtish.
 *
 * Menyudagi «Aksiya», «Xit mahsulotlar», «Yangi kelganlar» tugmalari alohida
 * sahifaga OLIB BORMAYDI — ular bosh sahifadagi tegishli boʻlimga silliq
 * scroll qiladi va boʻlimni bir zumga ajratib koʻrsatadi. SPA holati
 * saqlanadi, sahifa qayta yuklanmaydi.
 *
 * Boshqa sahifadan bosilganda: avval bosh sahifaga oʻtamiz, soʻng HomePage
 * maʼlumotlarni yuklab boʻlgach kutib turgan boʻlimga scroll qilamiz —
 * shuning uchun "pending" qiymat modul darajasida saqlanadi.
 */

export const SECTION = {
  promo: 'aksiya',
  bestsellers: 'xit-mahsulotlar',
  fresh: 'yangi-kelganlar',
} as const;

export type SectionId = (typeof SECTION)[keyof typeof SECTION];

let pending: SectionId | null = null;

export function requestSection(id: SectionId) {
  pending = id;
}

export function consumeSection(): SectionId | null {
  const value = pending;
  pending = null;
  return value;
}

export function hasPendingSection() {
  return pending !== null;
}

/**
 * Boʻlimni koʻrinishga olib keladi. Sticky header balandligi CSS
 * oʻzgaruvchisidan olinadi, shuning uchun sarlavha header ostida
 * qolib ketmaydi.
 */
export function scrollToSection(id: SectionId, behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById(id);
  if (!el) return false;

  const headerVar = getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim();
  // `--header-h` remʼda beriladi; pxʼga oʻgiramiz.
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const headerPx = headerVar.endsWith('rem') ? parseFloat(headerVar) * rem : parseFloat(headerVar) || 0;

  const top = el.getBoundingClientRect().top + window.scrollY - headerPx - 12;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : behavior });
  return true;
}
