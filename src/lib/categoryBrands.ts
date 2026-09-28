import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { dedupeBrands } from './brands';
import { expandWithDescendants, type CategoryNode } from './categoryTree';

/*
 * KATEGORIYADAGI BRENDLAR.
 *
 * Katalog navigatsiyasining oxirgi bosqichi:
 *
 *   Kategoriya → Boʻlim → BREND → Mahsulotlar
 *
 * MUHIM — BREND KATEGORIYA EMAS.
 *
 * Brend navigatsiyada bosqich boʻlib koʻrinadi, lekin bazada u
 * `products.brand` ustuni boʻlib qoladi. Tanlanganda `categories`
 * jadvaliga hech narsa yozilmaydi — shunchaki katalog FILTRI bilan
 * ochiladi: `/category/<slug>?brand=<nom>`.
 *
 * Yaʼni "Apple" nomli kategoriya YARATILMAYDI. Agar yaratilsa, bir xil
 * mahsulot ikki joyda (kategoriya va brend) turib qolardi va maʼlumot
 * modeli buzilardi.
 *
 * Roʻyxat BUTUN PASTKI DARAXT boʻyicha yigʻiladi: "Telefonlar va
 * planshetlar" ichidagi brendlar uning "Telefon" boʻlimidagi
 * mahsulotlardan ham keladi.
 */

export type CategoryBrand = {
  name: string;
  /** Shu brenddagi mahsulotlar soni — haqiqiy hisob, taxmin emas. */
  count: number;
};

/**
 * Tayyor roʻyxatni hisoblash — soʻrov natijasidan mustaqil, sinaladigan.
 *
 * Registr dublikatlari birlashtiriladi ("apple" va "Apple" — bitta
 * brend), keyin har biri uchun HAQIQIY son hisoblanadi.
 */
export function countBrands(raw: string[]): CategoryBrand[] {
  const clean = raw.map((b) => b.trim()).filter(Boolean);
  const counted = dedupeBrands(clean).map((name) => ({
    name,
    count: clean.filter((b) => b.toLocaleLowerCase() === name.toLocaleLowerCase()).length,
  }));
  // Koʻp mahsulotli brend yuqorida; teng boʻlsa alifbo tartibida.
  counted.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return counted;
}

/*
 * KESH — desktop mega-menyu uchun SHART.
 *
 * Mobil varaqda brendlar bosish bilan ochiladi, yaʼni bitta soʻrov.
 * Desktopda esa panel SICHQONCHA TEGIShI bilan almashadi: foydalanuvchi
 * roʻyxat boʻylab yurganda sekundiga oʻnlab kategoriya faollashadi va
 * keshsiz har biri alohida soʻrov yuborardi.
 *
 * Kesh jarayon davomida yashaydi (sahifa yangilanganda tozalanadi) va
 * `in-flight` vaʼdalarni ham saqlaydi — yaʼni bir kategoriya uchun
 * ikkita parallel soʻrov ketmaydi.
 */
const cache = new Map<string, CategoryBrand[]>();
const inFlight = new Map<string, Promise<CategoryBrand[]>>();

function loadBrands(key: string, ids: string[]): Promise<CategoryBrand[]> {
  const hit = inFlight.get(key);
  if (hit) return hit;

  /*
   * `Promise.resolve(...)` SHART: Supabase soʻrov quruvchisi `PromiseLike`
   * (faqat `.then`), haqiqiy `Promise` emas — `catch` yoʻq. Uni oʻrab
   * olmasak, quyidagi xato ushlovchi umuman yozib boʻlmasdi.
   */
  const p = Promise.resolve(
    supabase
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .in('category_id', ids)
      .not('brand', 'is', null)
  )
    .then(({ data }) => {
      const list = countBrands((data ?? []).map((r) => (r.brand as string) || ''));
      cache.set(key, list);
      inFlight.delete(key);
      return list;
    })
    .catch(() => {
      /*
       * Xato KESHLANMAYDI — keyingi tegishda qayta urinib koʻriladi.
       * Aks holda bitta tarmoq uzilishi brendlarni sessiya oxirigacha
       * yoʻqotardi.
       */
      inFlight.delete(key);
      return [] as CategoryBrand[];
    });

  inFlight.set(key, p);
  return p;
}

/**
 * Berilgan kategoriya (va uning avlodlari) ichidagi brendlar.
 *
 * `null` kategoriya berilsa — hech narsa yuklanmaydi.
 */
export function useCategoryBrands(node: CategoryNode | null, tree: CategoryNode[]) {
  const id = node?.id ?? null;
  /*
   * Keshdagi qiymat DARHOL qaytariladi — qayta tegilganda skelet
   * miltillamaydi. Bu shunchaki optimizatsiya emas: hover bilan
   * boshqariladigan panelda miltillash interfeysni "shovqinli" qiladi.
   */
  const [brands, setBrands] = useState<CategoryBrand[]>(() => (id ? cache.get(id) ?? [] : []));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !node) {
      setBrands([]);
      setLoading(false);
      return;
    }

    const cached = cache.get(id);
    if (cached) {
      setBrands(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Avvalgi kategoriyaning brendlari yangisi ostida turib qolmasin.
    setBrands([]);
    setLoading(true);

    loadBrands(id, expandWithDescendants(tree, [id])).then((list) => {
      if (cancelled) return;
      setBrands(list);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, node, tree]);

  return { brands, loading };
}
