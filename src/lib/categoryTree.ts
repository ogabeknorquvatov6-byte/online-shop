import { useMemo } from 'react';
import type { Category } from './types';
import { useCategories } from './catalogData';

/*
 * KATEGORIYA DARAXTI — YAGONA HAQIQAT MANBAI.
 *
 * Baza kategoriyalarni TEKIS roʻyxat sifatida saqlaydi va ierarxiyani
 * `parent_id` orqali ifodalaydi. Bu yerda oʻsha tekis roʻyxat bir marta
 * daraxtga aylantiriladi va uni desktop mega-menyu, mobil toʻliq ekranli
 * navigatsiya hamda admin bir xil koʻrinishda ishlatadi.
 *
 * Nega alohida qatlam:
 *   - Ilgari daraxt QURILMAS edi. `parent_id` ustuni bor edi, lekin uni
 *     hech kim oʻqimasdi — barcha yuzalar kategoriyalarni tekis roʻyxat
 *     deb koʻrsatardi.
 *   - Har bir yuza oʻzi guruhlashni boshlasa, ular muqarrar ravishda
 *     bir-biridan farq qila boshlaydi (biri nofaol kategoriyani
 *     koʻrsatadi, boshqasi yoʻq; biri tartibni boshqacha qoʻyadi).
 *
 * MUHIM: BREND — KATEGORIYA EMAS.
 * `products.brand` alohida ustun va katalogda alohida filtr sifatida
 * ishlaydi. Xiaomi/Samsung/Apple kabi qiymatlarni kategoriya daraxtiga
 * qoʻshish maʼlumot modelini buzadi — ular faset boʻlib qolishi kerak.
 */

export type CategoryNode = Category & {
  children: CategoryNode[];
  /** 0 = yuqori daraja. Koʻrsatishda chuqurlikni bilish uchun. */
  depth: number;
};

/**
 * Tekis roʻyxatdan daraxt quradi.
 *
 * Himoya choralari (baza maʼlumoti har doim ham ideal emas):
 *   - `parent_id` mavjud boʻlmagan kategoriyaga ishora qilsa, tugun
 *     YOʻQOLMAYDI — u yuqori darajaga koʻtariladi. Aks holda admin
 *     ota-kategoriyani oʻchirgach, bola kategoriyalar butun saytdan
 *     jimgina gʻoyib boʻlardi.
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

  // Tsiklni uzish: ildizdan yetib boʻlmaydigan tugunlar ham koʻrsatilsin.
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

/** Daraxtdagi barcha tugunlarni tekis roʻyxatga yoyadi. */
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
 * Tugungacha boʻlgan yoʻl: [ota, bola, nevara].
 * Qidiruvda "Telefonlar → Smartfonlar → …" koʻrsatish uchun.
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
 * Nomi boʻyicha qidiradi va har bir natija bilan birga uning toʻliq
 * yoʻlini qaytaradi.
 *
 * Faqat NOM boʻyicha: tavsif boʻyicha qidirish aloqasiz natijalarni
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
  // Aniqroq moslik (nomi qidiruv soʻzi bilan BOSHLANADIGAN) yuqorida.
  out.sort((a, b) => {
    const as = a.node.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
    const bs = b.node.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
    return as - bs || a.node.name.localeCompare(b.node.name);
  });
  return out.slice(0, limit);
}

/** Daraxtda haqiqiy ierarxiya bormi (yaʼni hech boʻlmasa bitta bola). */
export function hasNesting(roots: CategoryNode[]): boolean {
  return roots.some((r) => r.children.length > 0);
}

/**
 * Tanlangan kategoriyalarni butun PASTKI DARAXTIGA yoyadi:
 * natijada tanlanganlarning oʻzi + ularning barcha avlodlari qaytadi.
 *
 * Nima uchun kerak:
 *   Mahsulot faqat BITTA kategoriyaga bogʻlanadi (`products.category_id`)
 *   va u odatda eng pastki (barg) kategoriya boʻladi. Yaʼni "Telefonlar
 *   va planshetlar" ota-kategoriyasida `category_id` bilan toʻgʻridan-
 *   toʻgʻri bogʻlangan bironta mahsulot BOʻLMAYDI — ular "Smartfonlar"
 *   bolasida turadi. Aniq moslik boʻyicha qidirilsa, ota-kategoriya
 *   sahifasi boʻsh chiqadi va navigatsiyada "oʻlik" tugun paydo boʻladi.
 *
 * Muhim xususiyatlar:
 *   - Natija TAKRORLANMAYDI (`Set`), shuning uchun `.in(...)` soʻroviga
 *     bir xil id ikki marta tushmaydi va mahsulot dublikat boʻlmaydi.
 *   - Daraxtda topilmagan id (masalan kategoriya endigina oʻchirilgan)
 *     baribir natijaga kiritiladi: soʻrov shunchaki 0 qator qaytaradi,
 *     bu esa "hamma narsani koʻrsatish"dan xavfsizroq.
 *   - Halqa (cycle) boʻlsa ham toʻxtaydi — har bir tugun bir marta
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
 * Admin mahsulotga kategoriya biriktirayotganda har daraja oʻz
 * `<select>` iga ega: avval asosiy kategoriya, keyin boʻlim, keyin
 * undan ham ichkarisi. Bu funksiya oʻsha darajalarni hisoblaydi.
 *
 * Qaytadi:
 *   `levels`   — har bir tanlovchi uchun variantlar. Birinchisi hamisha
 *                ildizlar; keyingisi faqat tanlangan tugunning BOLALARI
 *                boʻlsa qoʻshiladi, yaʼni ortiqcha boʻsh tanlovchi
 *                chiqmaydi.
 *   `trail`    — tanlovgacha boʻlgan toʻliq yoʻl (navigatsiya izi uchun).
 *   `isLeaf`   — tanlangan tugun eng pastki daraja (bolasi yoʻq).
 *   `orphaned` — id berilgan, lekin daraxtda TOPILMADI. Bu jimgina
 *                yuzaga keladigan holat: roʻyxat faqat FAOL
 *                kategoriyalarni oladi, shuning uchun nofaol qilingan
 *                kategoriyaga biriktirilgan mahsulot «tanlanmagan»
 *                boʻlib koʻrinadi — aslida esa eski bogʻlanish
 *                saqlanib turadi. Chaqiruvchi buni koʻrsatishi shart.
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
 * bu yerda qoʻshimcha soʻrov yoʻq — faqat xotiradagi roʻyxat qayta
 * shakllantiriladi.
 */
export function useCategoryTree() {
  const { categories, loading, error } = useCategories();
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  return { tree, flat: categories, loading, error, nested: hasNesting(tree) };
}
