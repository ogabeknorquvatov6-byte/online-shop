import { useMemo } from 'react';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import type { Category } from '../types';
import { buildCategoryTree, categoryLevels } from '../categoryTree';
import { cx, selectBase } from '../design';

/*
 * MAHSULOT UCHUN KATEGORIYA TANLASH — KETMA-KET.
 *
 * Ilgari bu bitta uzun ochiluvchi ro'yxat edi: butun daraxt chekinish
 * bilan tekislanib, hammasi bitta `<select>` ichiga solinardi. Ikki
 * muammo bor edi:
 *
 *   1. Kategoriyalar ko'payganda ro'yxat o'qib bo'lmas holga keladi.
 *   2. Ikki xil bo'limda bir xil nomli ichki kategoriya bo'lsa
 *      (masalan ikkita "Aksessuarlar"), qaysi biri ekanini ajratib
 *      bo'lmaydi.
 *
 * Endi har daraja O'Z tanlovchisiga ega va keyingisi faqat kerak
 * bo'lganda paydo bo'ladi:
 *
 *   Asosiy kategoriya  [ Telefonlar va planshetlar ▼ ]
 *   Bo'lim             [ Telefon ▼ ]
 *   ✓ Yakuniy kategoriya tanlandi
 *
 * CHUQURLIK CHEKLANMAGAN: tanlovchilar soni daraxtdan kelib chiqadi,
 * shuning uchun admin 4- yoki 5-daraja qo'shsa, kod o'zgarmaydi.
 *
 * Mahsulotga HAR DOIM oxirgi tanlangan kategoriya biriktiriladi.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  /** Tanlangan kategoriya id — yoki bo'sh satr. */
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  /*
   * Darajalarni hisoblash SOF FUNKSIYADA (`categoryLevels`) — u yerda
   * sinaladi, chunki bu yerda sinash uchun DOM muhiti kerak bo'lardi.
   * Mavjud mahsulot tahrirlanganda forma o'zi to'g'ri darajalarni
   * ochib beradi.
   */
  const { levels, trail, isLeaf, orphaned } = useMemo(
    () => categoryLevels(tree, value),
    [tree, value]
  );

  const labelFor = (i: number) => (i === 0 ? 'Asosiy kategoriya' : i === 1 ? 'Boʻlim' : `${i + 1}-daraja`);

  return (
    <div className="space-y-3">
      {orphaned && (
        <div className="flex items-start gap-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Mahsulot roʻyxatda yoʻq kategoriyaga biriktirilgan (nofaol yoki oʻchirilgan). Quyidan
            yangisini tanlang yoki{' '}
            <button
              type="button"
              onClick={() => onChange('')}
              className="font-semibold underline underline-offset-2"
            >
              biriktirishni olib tashlang
            </button>
            .
          </span>
        </div>
      )}

      {levels.map((options, i) => (
        <label key={i} className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-600">{labelFor(i)}</span>
          <select
            value={trail[i]?.id ?? ''}
            onChange={(e) => {
              /*
               * Shu darajada tanlov o'zgarsa — undan PASTDAGI tanlovlar
               * o'z-o'zidan bekor bo'ladi, chunki `trail` yangi
               * qiymatdan qayta hisoblanadi. Qo'lda tozalash kerak emas.
               *
               * Bo'sh tanlansa: ota darajaga qaytamiz (yoki umuman
               * bo'shatamiz) — "yarim tanlangan" holat qolmaydi.
               */
              const next = e.target.value;
              onChange(next || (i > 0 ? trail[i - 1].id : ''));
            }}
            className={cx(selectBase, 'w-full')}
          >
            {/*
              Chuqur darajada "tanlanmagan" boshqa MA'NO anglatadi:
              bo'limni bo'shatish mahsulotni OTA kategoriyaga qoldiradi,
              biriktirishni umuman bekor qilmaydi.
            */}
            <option value="">{i === 0 ? '— Tanlanmagan —' : '— Shu darajada qolsin —'}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ))}

      {/* Tanlangan to'liq yo'l — admin qayerga qo'yayotganini ko'radi. */}
      {trail.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-control bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {trail.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-ink-300" />}
              <span className={i === trail.length - 1 ? 'font-semibold text-ink-900' : ''}>{c.name}</span>
            </span>
          ))}
        </div>
      )}

      {isLeaf && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <Check className="h-3.5 w-3.5" /> Yakuniy kategoriya tanlandi
        </p>
      )}
    </div>
  );
}
