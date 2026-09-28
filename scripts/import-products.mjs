#!/usr/bin/env node
/*
 * out/products.json → Supabase (products + product_images + product_variants)
 *
 * ISHLATISH
 *   node scripts/import-products.mjs out/products.json
 *   node scripts/import-products.mjs out/products.json --dry     # yozmasdan tekshirish
 *
 * MUHIM: manbada HAR BIR RANG ALOHIDA MAHSULOT
 *   openshop.uz da Samsung changyutgichning oq va qizil rangi — ikki
 *   xil ID, ikki xil sahifa. Bizda esa rang — variant.
 *   Shuning uchun skript mahsulotlarni `model_key` (nomdan rang so'zi
 *   olib tashlangan) bo'yicha GURUHLAYDI: guruhning birinchisi asosiy
 *   mahsulot bo'ladi, qolganlari uning rang variantlariga aylanadi.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FILE = process.argv[2] ?? 'out/products.json';
const DRY = process.argv.includes('--dry');

if (!DRY && (!URL || !KEY)) {
  console.error('XATO: SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY kerak (yoki --dry ishlating).');
  process.exit(1);
}

const db = DRY ? null : createClient(URL, KEY, { auth: { persistSession: false } });

/* ─────────────────────────────────────────────────────────────
 * Ranglar lug'ati
 * ───────────────────────────────────────────────────────────── */
const COLORS = [
  // uz
  ['oq', 'Oq', '#f5f5f5'], ['qora', 'Qora', '#1c1c1e'], ['qizil', 'Qizil', '#d32f2f'],
  ['kulrang', 'Kulrang', '#8e8e93'], ['kumushrang', 'Kumushrang', '#c7c7cc'],
  ["ko'k", 'Ko‘k', '#1e6fd9'], ['kok', 'Ko‘k', '#1e6fd9'], ['yashil', 'Yashil', '#2e9e5b'],
  ['sariq', 'Sariq', '#f5c518'], ['pushti', 'Pushti', '#f48fb1'], ['binafsha', 'Binafsha', '#7e57c2'],
  ["to'q sariq", 'To‘q sariq', '#ef6c00'], ['jigarrang', 'Jigarrang', '#795548'],
  ['tilla', 'Tilla', '#d4af37'], ['bej', 'Bej', '#e8dcc8'],
  // en
  ['white', 'Oq', '#f5f5f5'], ['black', 'Qora', '#1c1c1e'], ['red', 'Qizil', '#d32f2f'],
  ['gray', 'Kulrang', '#8e8e93'], ['grey', 'Kulrang', '#8e8e93'], ['silver', 'Kumushrang', '#c7c7cc'],
  ['blue', 'Ko‘k', '#1e6fd9'], ['green', 'Yashil', '#2e9e5b'], ['yellow', 'Sariq', '#f5c518'],
  ['pink', 'Pushti', '#f48fb1'], ['purple', 'Binafsha', '#7e57c2'], ['orange', 'To‘q sariq', '#ef6c00'],
  ['brown', 'Jigarrang', '#795548'], ['gold', 'Tilla', '#d4af37'], ['beige', 'Bej', '#e8dcc8'],
  ['titanium', 'Titan', '#8a8d8f'], ['graphite', 'Grafit', '#4a4a4a'], ['midnight', 'Tungi', '#191970'],
  // ru
  ['белый', 'Oq', '#f5f5f5'], ['черный', 'Qora', '#1c1c1e'], ['чёрный', 'Qora', '#1c1c1e'],
  ['красный', 'Qizil', '#d32f2f'], ['серый', 'Kulrang', '#8e8e93'], ['серебристый', 'Kumushrang', '#c7c7cc'],
  ['синий', 'Ko‘k', '#1e6fd9'], ['голубой', 'Ko‘k', '#1e6fd9'], ['зеленый', 'Yashil', '#2e9e5b'],
  ['зелёный', 'Yashil', '#2e9e5b'], ['желтый', 'Sariq', '#f5c518'], ['розовый', 'Pushti', '#f48fb1'],
  ['фиолетовый', 'Binafsha', '#7e57c2'], ['коричневый', 'Jigarrang', '#795548'], ['золотой', 'Tilla', '#d4af37'],
];

// Uzun nomlarni oldin tekshiramiz ("to'q sariq" > "sariq").
const COLOR_PATTERNS = [...COLORS].sort((a, b) => b[0].length - a[0].length);

/** Nomdan rangni ajratib oladi: {label, code} yoki null. */
function detectColor(text) {
  const t = ` ${String(text ?? '').toLowerCase()} `;
  for (const [needle, label, code] of COLOR_PATTERNS) {
    if (t.includes(` ${needle} `) || t.includes(`(${needle})`) || t.includes(`, ${needle}`)) {
      return { label, code };
    }
  }
  return null;
}

/**
 * `model_key` — rang so'zlari va ortiqcha belgilar olib tashlangan nom.
 * Shu kalit bo'yicha bir mahsulotning ranglari birlashtiriladi.
 *
 * `aggressive` = true bo'lganda oxiridagi MODEL KODI ham olib tashlanadi.
 *
 * Nega bu kerak va nega standart bo'yicha O'CHIQ:
 * openshop.uz da rang ko'pincha model kodining o'ziga kirib ketgan —
 *   VCC5620X37 = Qizil,  VCC5610X3W = Oq
 * Ya'ni faqat "Qizil"/"Oq" so'zlarini olib tashlash yetarli emas, ular
 * baribir ikki xil kalit beradi. Kodni ham olib tashlasak birlashadi,
 * LEKIN shu bilan birga HAQIQATAN boshqa modellarni ham (masalan
 * VCC4520 va VCC5620) noto'g'ri birlashtirib yuborish xavfi paydo bo'ladi.
 *
 * Noto'g'ri birlashtirish — ma'lumot YO'QOLISHI (ikki mahsulot bittaga
 * aylanadi, biri narxi bilan yo'qoladi). Ajratib qoldirish esa faqat
 * "ranglar alohida kartada" degani — zarari kam. Shuning uchun standart
 * xavfsiz variant tanlangan; `--merge-colors` bilan yoqasiz va natijani
 * hisobotdan tekshirasiz.
 */
function modelKey(name, aggressive = false) {
  let s = String(name ?? '').toLowerCase();
  for (const [needle] of COLOR_PATTERNS) {
    s = s.replaceAll(needle, ' ');
  }
  s = s
    .replace(/[(),|]/g, ' ')
    .replace(/\brang\b|\bcolor\b|\bцвет\b/g, ' ')
    .replace(/[^a-z0-9а-яёЀ-ӿ\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (aggressive) {
    // Harf+raqam aralash tokenlar — bu model kodlari (vcc5620x37, sm-a546e).
    s = s
      .split(' ')
      .filter((tok) => !(/[a-z]/.test(tok) && /\d/.test(tok)))
      .join(' ')
      .trim();
  }
  return s;
}

function slugify(s, fallback) {
  const out = String(s ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return out || fallback;
}

/* ─────────────────────────────────────────────────────────────
 * Kategoriya xaritasi
 * ───────────────────────────────────────────────────────────── */
/*
 * Manbadagi kategoriya ID'lari (openshop.uz raqamlari) bizning
 * `categories.json` dagi ID'lar bilan MOS EMAS — ular boshqa tizim.
 * Shuning uchun `category_map.json` qo'lda to'ldiriladi:
 *   { "36": "changyutgichlar", "12": "smartfonlar" }
 * Kalit — manbadagi eng chuqur kategoriya ID'si, qiymat — bizdagi slug.
 *
 * Xarita topilmasa mahsulot kategoriyasiz import qilinadi (yo'qolmaydi),
 * va skript oxirida moslanmagan ID'lar ro'yxatini chiqaradi.
 */
const MAP_FILE = 'category_map.json';
const categoryMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};

function sourceCategoryId(p) {
  return p.subsubcategory_id ?? p.subcategory_id ?? p.category_id ?? null;
}

/* ─────────────────────────────────────────────────────────────
 * O'qish va guruhlash
 * ───────────────────────────────────────────────────────────── */
if (!existsSync(FILE)) {
  console.error(`XATO: "${FILE}" topilmadi.`);
  console.error('Avval katalogni yig‘ing:  python scrape_openshop.py --download-images');
  process.exit(1);
}

const all = JSON.parse(readFileSync(FILE, 'utf8'));
// Bir mahsulot bir necha tilda bo'lishi mumkin — o'zbekchasini olamiz.
const products = all.filter((p) => (p.lang ?? 'uz') === 'uz' && p.name && p.price);

console.log(`Manbada ${all.length} yozuv, ulardan ${products.length} tasi yaroqli (uz, nomi va narxi bor).\n`);

const MERGE = process.argv.includes('--merge-colors');

const groups = new Map();
for (const p of products) {
  // Brend ham kalitga kiradi: turli brendlarning bir xil nomli
  // mahsulotlari (masalan "Simsiz quloqchin") birlashib ketmasin.
  const brandKey = String(p.brand ?? '').toLowerCase().trim();
  const key = `${brandKey}::${modelKey(p.name, MERGE) || `id-${p.source_id}`}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

const merged = [...groups.values()].filter((g) => g.length > 1);
console.log(
  `${groups.size} ta mahsulot ` +
    (MERGE
      ? `(--merge-colors YOQILGAN: ${merged.length} guruh birlashtirildi).`
      : '(ranglar ALOHIDA — birlashtirish uchun --merge-colors qo‘shing).')
);

// Birlashtirish natijasini KO'RSATAMIZ, shunda noto'g'ri guruhlash
// jimgina o'tib ketmaydi.
if (merged.length > 0) {
  console.log('\nBirlashtirilgan guruhlar (tekshiring!):');
  for (const g of merged.slice(0, 10)) {
    console.log(`  • ${g.length} ta: ${g.map((x) => x.name).join('  |  ')}`);
  }
  if (merged.length > 10) console.log(`  … va yana ${merged.length - 10} ta guruh`);
}
console.log('');

/* ─────────────────────────────────────────────────────────────
 * Import
 * ───────────────────────────────────────────────────────────── */
const unmapped = new Set();
let ok = 0;
let failed = 0;

for (const [key, variants] of groups) {
  // Eng ko'p rasmli yozuv asosiy bo'ladi — sahifa boyroq ko'rinadi.
  variants.sort((a, b) => (b.images?.length ?? 0) - (a.images?.length ?? 0));
  const base = variants[0];

  const srcCat = sourceCategoryId(base);
  const catSlug = srcCat != null ? categoryMap[String(srcCat)] : null;
  if (srcCat != null && !catSlug) unmapped.add(String(srcCat));

  let categoryId = null;
  if (catSlug && !DRY) {
    const { data } = await db.from('categories').select('id').eq('slug', catSlug).maybeSingle();
    categoryId = data?.id ?? null;
  }

  // Rang variantlari: har bir manba yozuvi — bitta rang.
  const colorVariants = variants
    .map((v, i) => {
      const detected = detectColor(v.color ?? v.name);
      if (!detected) return null;
      return {
        source_id: v.source_id,
        value: detected.label,
        label: detected.label,
        color_code: detected.code,
        image_url: v.images?.[0] ?? null,
        // Manbada har bir rang alohida mahsulot bo'lgani uchun narx farqi
        // bo'lishi mumkin — uni asosiy narxdan hisoblaymiz.
        price_adjustment: Number(v.price ?? 0) - Number(base.price ?? 0),
        stock: v.in_stock === false ? 0 : null,
        sort_order: i,
      };
    })
    .filter(Boolean);

  const payload = {
    source_id: base.source_id,
    name: base.name,
    slug: slugify(base.slug || base.name, `mahsulot-${base.source_id}`),
    sku: base.sku || `OS-${base.source_id}`,
    brand: base.brand ?? '',
    description: base.description ?? '',
    specs: base.specs ?? {},
    warranty: base.warranty ?? null,
    price: Number(base.price ?? 0),
    old_price: base.old_price != null ? Number(base.old_price) : null,
    // Manba `in_stock` beradi, aniq qoldiq emas. Sotuvda bo'lsa boshlang'ich
    // qiymat qo'yamiz — admin keyin aniq sonini kiritadi.
    stock: base.in_stock === false ? 0 : 10,
    category_id: categoryId,
    model_key: key,
    images: (base.images ?? []).slice(0, 10),
    variants: colorVariants,
    is_active: true,
  };

  if (DRY) {
    if (ok < 3) console.log(JSON.stringify({ ...payload, description: `${(payload.description || '').slice(0, 80)}…` }, null, 2));
    ok += 1;
    continue;
  }

  const { error } = await db.rpc('import_product', { p: payload });
  if (error) {
    console.error(`  ! ${base.name}: ${error.message}`);
    failed += 1;
  } else {
    ok += 1;
    if (ok % 25 === 0) console.log(`  ${ok}/${groups.size}`);
  }
}

console.log(`\nTayyor: ${ok} ta muvaffaqiyatli, ${failed} ta xato.`);

if (unmapped.size > 0) {
  const stub = Object.fromEntries([...unmapped].sort((a, b) => a - b).map((id) => [id, '']));
  writeFileSync('category_map.suggested.json', JSON.stringify(stub, null, 2), 'utf8');
  console.log(`\nDIQQAT: ${unmapped.size} ta manba kategoriyasi moslanmagan.`);
  console.log('`category_map.suggested.json` yaratildi — slug‘larni to‘ldiring,');
  console.log('faylni `category_map.json` deb nomlang va skriptni qayta ishga tushiring.');
}
