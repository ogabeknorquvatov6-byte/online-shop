import { useEffect, useId, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { cx, focusRing, input as inputCls, popSurface } from '../design';
import { isNewBrand, matchExistingBrand, suggestBrands } from '../brands';

/*
 * BREND MAYDONI — erkin matn emas, boshqariladigan tanlov.
 *
 * Ilgari bu oddiy `<input>` edi. Brend `products.brand` da matn boʻlib
 * saqlangani uchun har bir admin uni oʻzicha yozardi va katalogdagi
 * brend filtrida "Apple", "apple", "APPLE" alohida variantlar boʻlib
 * chiqardi — bitta brend uch marta.
 *
 * Endi maydon mavjud brendlarni taklif qiladi va registr farqini oʻzi
 * hal qiladi. Lekin u YOPIQ roʻyxat emas: yangi brend kiritish
 * toʻsilmaydi, shunchaki bu ataylab qilinadigan harakatga aylanadi
 * («+ "OnePlus" qoʻshish»).
 *
 * Maʼlumot bazasi oʻzgarmaydi — brendlar mahsulotlardan oʻqiladi,
 * alohida jadval yaratilmaydi.
 */
export function BrandField({
  value,
  onChange,
  brands,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Bazadagi mavjud brendlar (mahsulotlardan yigʻilgan). */
  brands: string[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = suggestBrands(value, brands);
  const canAdd = isNewBrand(value, brands);
  const exactMatch = matchExistingBrand(value, brands);

  /* Tashqariga bosilganda roʻyxat yopiladi. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (brand: string) => {
    onChange(brand);
    setOpen(false);
  };

  /*
   * Fokus yoʻqolganda registr NORMALLASHTIRILADI: admin "apple" deb
   * yozsa ham, bazada allaqachon bor "Apple" saqlanadi. Yangi brend
   * boʻlsa — yozilishi oʻzgarmaydi.
   */
  const handleBlur = () => {
    if (exactMatch && exactMatch !== value) onChange(exactMatch);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">
        Brend
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Masalan: Apple"
        className={inputCls()}
      />

      {/* Mavjud brend tanlangani — jimgina tasdiq. */}
      {exactMatch && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
          <Check className="h-3.5 w-3.5" /> Mavjud brend
        </p>
      )}

      {open && (options.length > 0 || canAdd) && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className={cx(popSurface, 'absolute z-20 mt-1 max-h-56 w-full overflow-y-auto p-1')}
        >
          {options.map((b, i) => (
            <li key={b}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                // `onMouseDown` — `onBlur` dan OLDIN ishlaydi, aks holda
                // roʻyxat bosilishidan avval yopilib ketardi.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(b);
                }}
                className={cx(
                  'flex w-full items-center justify-between rounded-control px-2.5 py-2 text-left text-sm',
                  i === active ? 'bg-ink-100 text-ink-900' : 'text-ink-700 hover:bg-ink-50',
                  focusRing
                )}
              >
                {b}
                {matchExistingBrand(value, [b]) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            </li>
          ))}

          {canAdd && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(value.trim());
                }}
                className={cx(
                  'flex w-full items-center gap-1.5 rounded-control px-2.5 py-2 text-left text-sm font-medium text-orange-700 hover:bg-orange-50',
                  focusRing
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                «{value.trim()}» brendini qoʻshish
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
