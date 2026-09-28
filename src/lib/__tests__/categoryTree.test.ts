import { describe, it, expect } from 'vitest';
import {
  buildCategoryTree,
  flattenTree,
  pathToNode,
  searchCategories,
  hasNesting,
  expandWithDescendants,
  categoryLevels,
} from '../categoryTree';
import type { Category } from '../types';

/*
 * Kategoriya daraxti — katalogning butun navigatsiyasi shu utilitalarga
 * tayanadi (desktop mega-menyu, mobil drill-down, admin ro'yxati va
 * eng muhimi: ota-kategoriya sahifasida qaysi mahsulotlar chiqishi).
 *
 * Bu yerda ATAYLAB chegaraviy holatlar tekshiriladi — yetim tugun,
 * halqa, o'zini ota qilib olgan tugun. Ularning hammasi haqiqiy
 * bazada bo'lishi mumkin (admin ota-kategoriyani o'chirsa yoki
 * noto'g'ri ko'chirsa) va ularning har biri ilova butunlay oq ekran
 * bo'lib qolishiga olib kelishi mumkin edi.
 */

let seq = 0;
function cat(name: string, parent_id: string | null = null, extra: Partial<Category> = {}): Category {
  seq += 1;
  return {
    id: extra.id ?? `id-${name}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    description: null,
    image_url: null,
    parent_id,
    sort_order: extra.sort_order ?? seq,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

describe('buildCategoryTree', () => {
  it('nests children under their parent', () => {
    const tree = buildCategoryTree([cat('Root'), cat('Child', 'id-Root')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Root');
    expect(tree[0].children.map((c) => c.name)).toEqual(['Child']);
  });

  it('assigns depth by level', () => {
    const tree = buildCategoryTree([
      cat('L0'),
      cat('L1', 'id-L0'),
      cat('L2', 'id-L1'),
      cat('L3', 'id-L2'),
    ]);
    const flat = flattenTree(tree);
    expect(flat.map((n) => [n.name, n.depth])).toEqual([
      ['L0', 0], ['L1', 1], ['L2', 2], ['L3', 3],
    ]);
  });

  it('supports unlimited depth (depth 6 survives)', () => {
    const rows = [cat('D0')];
    for (let i = 1; i <= 6; i += 1) rows.push(cat(`D${i}`, `id-D${i - 1}`));
    const deepest = flattenTree(buildCategoryTree(rows)).find((n) => n.name === 'D6');
    expect(deepest?.depth).toBe(6);
  });

  /*
   * Yetim tugun — admin ota-kategoriyani o'chirganda yuzaga keladi.
   * Bola YO'QOLMASLIGI kerak, aks holda mahsulotlari bilan birga
   * butun shoxcha saytdan jimgina g'oyib bo'lardi.
   */
  it('promotes orphans to root instead of dropping them', () => {
    const tree = buildCategoryTree([cat('Lost', 'id-DoesNotExist')]);
    expect(tree.map((n) => n.name)).toEqual(['Lost']);
    expect(tree[0].depth).toBe(0);
  });

  it('does not hang or drop nodes when a cycle exists', () => {
    // A → B → A
    const a = cat('A', 'id-B');
    const b = cat('B', 'id-A');
    const tree = buildCategoryTree([a, b]);
    const names = flattenTree(tree).map((n) => n.name).sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('treats a self-parented node as a root', () => {
    const tree = buildCategoryTree([cat('Self', 'id-Self')]);
    expect(tree.map((n) => n.name)).toEqual(['Self']);
  });

  it('returns an empty tree for empty input', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe('pathToNode', () => {
  it('returns the full ancestor chain', () => {
    const tree = buildCategoryTree([cat('Root'), cat('Mid', 'id-Root'), cat('Leaf', 'id-Mid')]);
    expect(pathToNode(tree, 'id-Leaf').map((n) => n.name)).toEqual(['Root', 'Mid', 'Leaf']);
  });

  it('returns an empty path for an unknown id', () => {
    expect(pathToNode(buildCategoryTree([cat('Root')]), 'nope')).toEqual([]);
  });
});

describe('searchCategories', () => {
  const tree = buildCategoryTree([
    cat('Telefonlar'),
    cat('Smartfonlar', 'id-Telefonlar'),
    cat('Aksessuarlar'),
  ]);

  it('matches nested categories and reports their path', () => {
    const [hit] = searchCategories(tree, 'smart');
    expect(hit.node.name).toBe('Smartfonlar');
    expect(hit.path.map((n) => n.name)).toEqual(['Telefonlar', 'Smartfonlar']);
  });

  it('ranks prefix matches above mid-string matches', () => {
    const ranked = searchCategories(
      buildCategoryTree([cat('Fonar'), cat('Telefon')]),
      'fon'
    );
    expect(ranked[0].node.name).toBe('Fonar');
  });

  it('returns nothing for a blank query', () => {
    expect(searchCategories(tree, '   ')).toEqual([]);
  });
});

describe('hasNesting', () => {
  it('is false for a flat list and true once a child exists', () => {
    expect(hasNesting(buildCategoryTree([cat('A'), cat('B')]))).toBe(false);
    expect(hasNesting(buildCategoryTree([cat('A'), cat('B', 'id-A')]))).toBe(true);
  });
});

/*
 * Bu blok eng muhimi: ota-kategoriya sahifasida mahsulotlar
 * ko'rinishi aynan shunga bog'liq. Mahsulot faqat BARG kategoriyaga
 * biriktiriladi, shuning uchun ota `category_id` bo'yicha aniq moslik
 * bilan qidirilsa, sahifa bo'sh chiqadi.
 */
describe('expandWithDescendants', () => {
  const rows = [
    cat('Telefonlar'),
    cat('Smartfonlar', 'id-Telefonlar'),
    cat('Apple', 'id-Smartfonlar'),
    cat('Maishiy'),
  ];
  const tree = buildCategoryTree(rows);

  it('includes the whole subtree for a root', () => {
    expect(expandWithDescendants(tree, ['id-Telefonlar']).sort()).toEqual(
      ['id-Apple', 'id-Smartfonlar', 'id-Telefonlar'].sort()
    );
  });

  it('includes deeper descendants from a mid-level node', () => {
    expect(expandWithDescendants(tree, ['id-Smartfonlar']).sort()).toEqual(
      ['id-Apple', 'id-Smartfonlar'].sort()
    );
  });

  it('returns only itself for a leaf', () => {
    expect(expandWithDescendants(tree, ['id-Apple'])).toEqual(['id-Apple']);
  });

  it('does not leak unrelated branches', () => {
    expect(expandWithDescendants(tree, ['id-Telefonlar'])).not.toContain('id-Maishiy');
  });

  it('never returns duplicates when selections overlap', () => {
    const ids = expandWithDescendants(tree, ['id-Telefonlar', 'id-Smartfonlar', 'id-Apple']);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('keeps an unknown id so the query narrows instead of widening', () => {
    // Xavfsizlik: noma'lum id "hammasini ko'rsat" ga aylanmasligi kerak.
    expect(expandWithDescendants(tree, ['ghost'])).toEqual(['ghost']);
  });

  it('returns an empty list for an empty selection', () => {
    expect(expandWithDescendants(tree, [])).toEqual([]);
  });
});

/*
 * KETMA-KET TANLOVCHILAR (`categoryLevels`).
 *
 * Bu mantiq admin mahsulotga kategoriya biriktirayotganda ishlaydi va
 * uni brauzerda sinash mumkin emas: hozirgi bazada ierarxiya yo'q
 * (hamma kategoriya ildiz), ya'ni ikkinchi tanlovchi UMUMAN
 * chizilmaydi. Shuning uchun chuqurlik shu yerda — sintetik daraxtda —
 * qo'riqlanadi.
 */
describe('categoryLevels', () => {
  //  Telefonlar ─┬─ Telefon ──┬─ Flagman
  //              │            └─ Byudjet
  //              └─ Planshet
  //  Noutbooklar
  const nested = () => buildCategoryTree([
    cat('Telefonlar'),
    cat('Telefon', 'id-Telefonlar'),
    cat('Flagman', 'id-Telefon'),
    cat('Byudjet', 'id-Telefon'),
    cat('Planshet', 'id-Telefonlar'),
    cat('Noutbooklar'),
  ]);

  it('tanlovsiz — faqat bitta tanlovchi (ildizlar)', () => {
    const { levels, trail, isLeaf, orphaned } = categoryLevels(nested(), '');
    expect(levels).toHaveLength(1);
    expect(levels[0].map((n) => n.name)).toEqual(['Telefonlar', 'Noutbooklar']);
    expect(trail).toEqual([]);
    expect(isLeaf).toBe(false);
    expect(orphaned).toBe(false);
  });

  it('bolalari bor kategoriya tanlansa — keyingi tanlovchi ochiladi', () => {
    const { levels, isLeaf } = categoryLevels(nested(), 'id-Telefonlar');
    expect(levels).toHaveLength(2);
    expect(levels[1].map((n) => n.name)).toEqual(['Telefon', 'Planshet']);
    // Hali yakuniy emas — ichida bo'limlar bor.
    expect(isLeaf).toBe(false);
  });

  it('uchinchi daraja tanlansa — uchta tanlovchi boʻladi', () => {
    const { levels, trail } = categoryLevels(nested(), 'id-Telefon');
    expect(levels).toHaveLength(3);
    expect(levels[2].map((n) => n.name)).toEqual(['Flagman', 'Byudjet']);
    expect(trail.map((n) => n.name)).toEqual(['Telefonlar', 'Telefon']);
  });

  /* Barg tanlanganda ORTIQCHA bo'sh tanlovchi chiqmasligi kerak. */
  it('barg tanlansa — ortiqcha boʻsh tanlovchi qoʻshilmaydi', () => {
    const { levels, isLeaf, trail } = categoryLevels(nested(), 'id-Flagman');
    expect(levels).toHaveLength(3);
    expect(isLeaf).toBe(true);
    expect(trail.map((n) => n.name)).toEqual(['Telefonlar', 'Telefon', 'Flagman']);
  });

  it('tekis daraxtda ildiz tanlansa — bitta tanlovchi va u yakuniy', () => {
    const flat = buildCategoryTree([cat('Aksesuvarlar'), cat('Noutbooklar')]);
    const { levels, isLeaf } = categoryLevels(flat, 'id-Aksesuvarlar');
    expect(levels).toHaveLength(1);
    expect(isLeaf).toBe(true);
  });

  /*
   * ENG MUHIM HOLAT. Ro'yxat faqat FAOL kategoriyalarni oladi, ya'ni
   * mahsulot nofaol qilingan kategoriyaga biriktirilgan bo'lsa id
   * daraxtda topilmaydi. Bu jimgina o'tib ketsa, admin
   * "biriktirilmagan" deb o'ylab saqlaydi va eski bog'lanish
   * ko'rinmas holda saqlanib qolaveradi.
   */
  it('daraxtda yoʻq id — `orphaned` bayrogʻini koʻtaradi', () => {
    const { orphaned, trail, levels } = categoryLevels(nested(), 'id-Ochirilgan');
    expect(orphaned).toBe(true);
    expect(trail).toEqual([]);
    // Tanlovchi baribir chiziladi — admin yangisini tanlay olsin.
    expect(levels).toHaveLength(1);
  });

  it('boʻsh id yetim hisoblanmaydi', () => {
    expect(categoryLevels(nested(), '').orphaned).toBe(false);
  });
});
