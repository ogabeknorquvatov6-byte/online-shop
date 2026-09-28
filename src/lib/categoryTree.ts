import { useMemo } from 'react';
import type { Category } from './types';
import { useCategories } from './catalogData';

/*
 * KATEGORIYA DARAXTI — YAGONA HAQIQAT MANBAI.
 *
 * Baza kategoriyalarni TEKIS ro'yxat sifatida saqlaydi va ierarxiyani
 * `parent_id` orqali ifodalaydi. Bu yerda o'sha tekis ro'yxat bir marta
 * daraxtga aylantiriladi va uni desktop mega-menyu, mobil to'liq ekranli
 * navigatsiya hamda admin bir xil ko'rinishda ishlatadi.
 *
 * Nega alohida qatlam:
 *   - Ilgari daraxt QURILMAS edi. `parent_id` ustuni bor edi, lekin uni
 *     hech kim o'qimasdi — barcha yuzalar kategoriyalarni tekis ro'yxat
 *     deb ko'rsatardi.
 *   - Har bir yuza o'zi guruhlashni boshlasa, ular muqarrar ravishda
 *     bir-biridan farq qila boshlaydi (biri nofaol kategoriyani
 *     ko'rsatadi, boshqasi yo'q; biri tartibni boshqacha qo'yadi).
 *
 * MUHIM: BREND — KATEGORIYA EMAS.
 * `products.brand` alohida ustun va katalogda alohida filtr sifatida
 * ishlaydi. Xiaomi/Samsung/Apple kabi qiymatlarni kategoriya daraxtiga
 * qo'shish ma'lumot modelini buzadi — ular faset bo'lib qolishi kerak.
 */

export type CategoryNode = Category & {
  children: CategoryNode[];
  /** 0 = yuqori daraja. Ko'rsatishda chuqurlikni bilish uchun. */
  depth: number;
};

/**
 * Tekis ro'yxatdan daraxt quradi.
 *
 * Himoya choralari (baza ma'lumoti har doim ham ideal emas):
 *   - `parent_id` mavjud bo'lmagan kategoriyaga ishora qilsa, tugun
 *     YO'QOLMAYDI — u yuqori darajaga ko'tariladi. Aks holda admin
 *     ota-kategoriyani o'chirgach, bola kategoriyalar butun saytdan
 *     jimgina g'oyib bo'lardi.
 *   - Tsikl (a → b → a) cheksiz rekursiyaga olib kelmaydi: har bir
 *     tugun faqat bir marta joylashtiriladi.
 */
export function buildCategoryTree(flat: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const c of flat) byId.set(c.id, { ...c, children: [], depth: 0 });

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node); // yetim yoki yuqori daraja
  }

  // Tsiklni uzish: ildizdan yetib bo'lmaydigan tugunlar ham ko'rsatilsin.
  const seen = new Set<string>();
  const setDepth = (nodes: CategoryNode[], depth: number) => {
    for (const n of nodes) {
      if (seen.has(n.id)) {
        n.children = [];
        continue;
      }
      seen.add(n.id);
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);

  const orphans = [...byId.values()].filter((n) => !seen.has(n.id));
  for (const o of orphans) {
    o.depth = 0;
    o.children = [];
    roots.push(o);
    seen.add(o.id);
  }

  return roots;
}

/** Daraxtdagi barcha tugunlarni tekis ro'yxatga yoyadi. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Tugungacha bo'lgan yo'l: [ota, bola, nevara].
 * Qidiruvda "Telefonlar → Smartfonlar → …" ko'rsatish uchun.
 */
export function pathToNode(nodes: CategoryNode[], id: string): CategoryNode[] {
  const walk = (list: CategoryNode[], trail: CategoryNode[]): CategoryNode[] | null => {
    for (const n of list) {
      const next = [...trail, n];
      if (n.id === id) return next;
      const found = walk(n.children, next);
      if (found) return found;
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

/**
 * Nomi bo'yicha qidiradi va har bir natija bilan birga uning to'liq
 * yo'lini qaytaradi.
 *
 * Faqat NOM bo'yicha: tavsif bo'yicha qidirish aloqasiz natijalarni
 * olib keladi va foydalanuvchi nima uchun chiqqanini tushunmaydi.
 */
export function searchCategories(
  roots: CategoryNode[],
  query: string,
  limit = 20
): { node: CategoryNode; path: CategoryNode[] }[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const out: { node: CategoryNode; path: CategoryNode[] }[] = [];
  const walk = (list: CategoryNode[], trail: CategoryNode[]) => {
    for (const n of list) {
      const next = [...trail, n];
      if (n.name.toLocaleLowerCase().includes(q)) out.push({ node: n, path: next });
      walk(n.children, next);
    }
  };
  walk(roots, []);
  // Aniqroq moslik (nomi qidiruv so'zi bilan BOSHLANADIGAN) yuqorida.
  out.sort((a, b) => {
    const as = a.node.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
    const bs = b.node.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
    return as - bs || a.node.name.localeCompare(b.node.name);
  });
  return out.slice(0, limit);
}

/** Daraxtda haqiqiy ierarxiya bormi (ya'ni hech bo'lmasa bitta bola). */
export function hasNesting(roots: CategoryNode[]): boolean {
  return roots.some((r) => r.children.length > 0);
}

/**
 * Tanlangan kategoriyalarni butun PASTKI DARAXTIGA yoyadi:
 * natijada tanlanganlarning o'zi + ularning barcha avlodlari qaytadi.
 *
 * Nima uchun kerak:
 *   Mahsulot faqat BITTA kategoriyaga bog'lanadi (`products.category_id`)
 *   va u odatda eng pastki (barg) kategoriya bo'ladi. Ya'ni "Telefonlar
 *   va planshetlar" ota-kategoriyasida `category_id` bilan to'g'ridan-
 *   to'g'ri bog'langan bironta mahsulot BO'LMAYDI — ular "Smartfonlar"
 *   bolasida turadi. Aniq moslik bo'yicha qidirilsa, ota-kategoriya
 *   sahifasi bo'sh chiqadi va navigatsiyada "o'lik" tugun paydo bo'ladi.
 *
 * Muhim xususiyatlar:
 *   - Natija TAKRORLANMAYDI (`Set`), shuning uchun `.in(...)` so'roviga
 *     bir xil id ikki marta tushmaydi va mahsulot dublikat bo'lmaydi.
 *   - Daraxtda topilmagan id (masalan kategoriya endigina o'chirilgan)
 *     baribir natijaga kiritiladi: so'rov shunchaki 0 qator qaytaradi,
 *     bu esa "hamma narsani ko'rsatish"dan xavfsizroq.
 *   - Halqa (cycle) bo'lsa ham to'xtaydi — har bir tugun bir marta
 *     qayta ishlanadi.
 */
export function expandWithDescendants(roots: CategoryNode[], selectedIds: string[]): string[] {
  if (selectedIds.length === 0) return [];

  const byId = new Map<string, CategoryNode>();
  const index = (nodes: CategoryNode[]) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      index(n.children);
    }
  };
  index(roots);

  const out = new Set<string>();
  const walk = (node: CategoryNode) => {
    if (out.has(node.id)) return; // halqadan himoya
    out.add(node.id);
    for (const child of node.children) walk(child);
  };

  for (const id of selectedIds) {
    const node = byId.get(id);
    if (node) walk(node);
    else out.add(id); // daraxtda yo'q — o'zini qoldiramiz
  }

  return [...out];
}

/**
 * KETMA-KET TANLOVCHILAR uchun darajalar.
 *
 * Admin mahsulotga kategoriya biriktirayotganda har daraja o'z
 * `<select>` iga ega: avval asosiy kategoriya, keyin bo'lim, keyin
 * undan ham ichkarisi. Bu funksiya o'sha darajalarni hisoblaydi.
 *
 * Qaytadi:
 *   `levels`   — har bir tanlovchi uchun variantlar. Birinchisi hamisha
 *                ildizlar; keyingisi faqat tanlangan tugunning BOLALARI
 *                bo'lsa qo'shiladi, ya'ni ortiqcha bo'sh tanlovchi
 *                chiqmaydi.
 *   `trail`    — tanlovgacha bo'lgan to'liq yo'l (navigatsiya izi uchun).
 *   `isLeaf`   — tanlangan tugun eng pastki daraja (bolasi yo'q).
 *   `orphaned` — id berilgan, lekin daraxtda TOPILMADI. Bu jimgina
 *                yuzaga keladigan holat: ro'yxat faqat FAOL
 *                kategoriyalarni oladi, shuning uchun nofaol qilingan
 *                kategoriyaga biriktirilgan mahsulot «tanlanmagan»
 *                bo'lib ko'rinadi — aslida esa eski bog'lanish
 *                saqlanib turadi. Chaqiruvchi buni ko'rsatishi shart.
 */
export function categoryLevels(
  roots: CategoryNode[],
  selectedId: string
): { levels: CategoryNode[][]; trail: CategoryNode[]; isLeaf: boolean; orphaned: boolean } {
  const trail = selectedId ? pathToNode(roots, selectedId) : [];
  const levels: CategoryNode[][] = [roots];
  for (const node of trail) {
    if (node.children.length > 0) levels.push(node.children);
  }
  return {
    levels,
    trail,
    isLeaf: trail.length > 0 && trail[trail.length - 1].children.length === 0,
    orphaned: Boolean(selectedId) && trail.length === 0,
  };
}

/**
 * Daraxtni bir marta quradigan hook.
 *
 * `useCategories()` allaqachon jarayon davomida keshlanadi, shuning uchun
 * bu yerda qo'shimcha so'rov yo'q — faqat xotiradagi ro'yxat qayta
 * shakllantiriladi.
 */
export function useCategoryTree() {
  const { categories, loading, error } = useCategories();
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  return { tree, flat: categories, loading, error, nested: hasNesting(tree) };
}
