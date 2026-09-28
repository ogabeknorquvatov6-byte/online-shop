/*
 * Soʻnggi qidiruvlar — localStorageʼda, serverga soʻrov yubormasdan.
 * Foydalanuvchi odatda oʻxshash soʻzlarni qayta-qayta qidiradi, shuning
 * uchun bu kichik xotira qidiruv sahifasini sezilarli qulaylashtiradi.
 */

const KEY = 'openshop-recent-searches';
export const RECENT_MAX = 8;

export function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(term: string): string[] {
  const value = term.trim();
  if (value.length < 2) return readRecentSearches();
  const next = [value, ...readRecentSearches().filter((v) => v.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private-browsing rejimida yozib bo'lmasligi mumkin — muhim emas
  }
  return next;
}

export function removeRecentSearch(term: string): string[] {
  const next = readRecentSearches().filter((v) => v !== term);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // e'tiborsiz
  }
  return next;
}

export function clearRecentSearches(): string[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // e'tiborsiz
  }
  return [];
}
