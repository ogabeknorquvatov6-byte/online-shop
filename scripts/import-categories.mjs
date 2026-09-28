#!/usr/bin/env node
/*
 * categories.json → Supabase `categories`
 *
 * ISHLATISH
 *   set SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/import-categories.mjs .catalog-src/categories.json
 *
 * XAVFSIZLIK
 *   service_role kaliti FAQAT shu yerda, terminal muhitida ishlatiladi.
 *   Uni hech qachon `.env` ga (VITE_ prefiksi bilan) yozmang — u holda
 *   kalit brauzer bundle'iga tushib, butun bazaga to'liq kirish
 *   imkonini ochib qo'yadi.
 *
 * IDEMPOTENT
 *   `categories.source_id` bo'yicha UPSERT. Skriptni necha marta ishga
 *   tushirsangiz ham dublikat yaratmaydi, faqat yangilaydi.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FILE = process.argv[2] ?? '.catalog-src/categories.json';

if (!URL || !KEY) {
  console.error('XATO: SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY muhit o‘zgaruvchilari kerak.');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Manba nomidagi apostroflarni saytdagi yozuv bilan moslaymiz. */
function cleanName(name) {
  return String(name ?? '').replace(/'/g, '‘').trim();
}

const raw = JSON.parse(readFileSync(FILE, 'utf8'));
const flat = raw.categories_flat ?? [];

if (flat.length === 0) {
  console.error('XATO: categories_flat bo‘sh.');
  process.exit(1);
}

console.log(`Manbada ${flat.length} ta kategoriya.\n`);

/*
 * Ikki bosqichda yozamiz.
 *
 * Sabab: `parent_id` — bu bizning bazadagi UUID, manbadagi butun son emas.
 * Ota-kategoriya hali yozilmagan bo'lishi mumkin, shuning uchun avval
 * hammasini parent'siz kiritamiz, keyin bog'laymiz. Bu tartibga bog'liq
 * xatolarni butunlay yo'q qiladi.
 */

// ── 1-bosqich: barcha kategoriyalar (parent'siz) ──
const idMap = new Map(); // source_id -> uuid

for (const c of flat) {
  const payload = {
    source_id: c.id,
    name: cleanName(c.name_uz),
    slug: c.slug,
    description: '',
    sort_order: c.sort_order ?? 0,
    is_active: c.is_active !== false,
  };

  // `slug` ham unikal — avval source_id bo'yicha, topilmasa slug bo'yicha qidiramiz,
  // shunda qo'lda yaratilgan kategoriyalar dublikat bo'lib ketmaydi.
  const { data: existing } = await db
    .from('categories')
    .select('id')
    .or(`source_id.eq.${c.id},slug.eq.${c.slug}`)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from('categories').update(payload).eq('id', existing.id);
    if (error) {
      console.error(`  ! ${c.slug}: ${error.message}`);
      continue;
    }
    idMap.set(c.id, existing.id);
  } else {
    const { data, error } = await db.from('categories').insert(payload).select('id').single();
    if (error) {
      console.error(`  ! ${c.slug}: ${error.message}`);
      continue;
    }
    idMap.set(c.id, data.id);
  }
}

console.log(`1-bosqich: ${idMap.size} ta kategoriya yozildi.`);

// ── 2-bosqich: ota-bola bog'lanishi ──
let linked = 0;
for (const c of flat) {
  if (!c.parent_id) continue;
  const childId = idMap.get(c.id);
  const parentId = idMap.get(c.parent_id);
  if (!childId || !parentId) continue;

  const { error } = await db.from('categories').update({ parent_id: parentId }).eq('id', childId);
  if (error) console.error(`  ! ${c.slug} parent: ${error.message}`);
  else linked += 1;
}

console.log(`2-bosqich: ${linked} ta bog‘lanish o‘rnatildi.`);

const { count } = await db.from('categories').select('*', { count: 'exact', head: true });
console.log(`\nTayyor. Bazada jami ${count} ta kategoriya.`);
