import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import type { Category } from '../types';
import { CATEGORY_SELECT, invalidateCategories } from '../catalogData';
import { buildCategoryTree, flattenTree, pathToNode, type CategoryNode } from '../categoryTree';
import { useToast } from '../toast';
import { Plus, Pencil, Trash2, ImageOff, GripVertical, FolderPlus } from 'lucide-react';
import {
  AdminEmpty, AdminError, AdminLoading, AdminModal, AdminSection, ConfirmModal,
  FormActions, FormField, FormToggle, ImageUrlField,
} from '../AdminShared';
import { button, card, cx, focusRing, selectBase } from '../design';
import { slugify } from '../slug';
import { Img } from '../Img';


/**
 * Oʻchirishdan oldingi ogohlantirish matni.
 *
 * NEGA ALOHIDA VA NEGA ICHKI BOʻLIMLAR ALOHIDA AYTILADI.
 *
 * Bazada bogʻlanish `parent_id … on delete set null`. Yaʼni ota
 * kategoriya oʻchirilsa, uning ichki boʻlimlari OʻCHMAYDI — ularning
 * `parent_id` si jimgina `null` ga aylanadi va hammasi YUQORI DARAJAGA
 * chiqib ketadi. Tashqaridan bu "katalog oʻz-oʻzidan toʻzib ketdi"
 * boʻlib koʻrinadi, hech qanday xato xabari boʻlmaydi.
 *
 * Ilgari matn faqat mahsulotlar haqida ogohlantirardi, ichki boʻlimlar
 * haqida bir ogʻiz ham yoʻq edi.
 */
function deleteWarning(target: Category, ordered: CategoryNode[]): string {
  const node = ordered.find((n) => n.id === target.id);
  // Faqat BEVOSITA bolalar: chuqurroqdagilar oʻz otasi bilan birga
  // koʻchadi, yaʼni ularning bogʻlanishi buzilmaydi.
  const kids = node?.children.length ?? 0;
  const base = `«${target.name}» oʻchiriladi. Undagi mahsulotlar oʻchmaydi, lekin kategoriyasiz qoladi.`;
  if (kids === 0) return base;
  return (
    `${base}\n\nDIQQAT: ichidagi ${kids} ta boʻlim ham oʻchmaydi — ular ` +
    `yuqori darajaga chiqib ketadi va katalog menyusida alohida ` +
    `kategoriya boʻlib koʻrinadi. Buni orqaga qaytarish uchun har birini ` +
    `qoʻlda qayta biriktirish kerak boʻladi.`
  );
}

export function AdminCategories() {
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * ICHIGA BOʻLIM QOʻSHISH.
   *
   * Ota tanlash imkoni formada boshidan bor edi, lekin u pastda, oddiy
   * roʻyxat ichida turardi: boʻlim yaratish uchun «Kategoriya qoʻshish»
   * bosib, pastga tushib, «Ota-kategoriya» dan toʻgʻrisini topish kerak
   * edi. Yaʼni imkoniyat BOR, lekin uni koʻrish mumkin emas — shuning
   * uchun katalog bir darajali boʻlib qolavergan.
   *
   * Endi har qatorda oʻz tugmasi bor va u otani OLDINDAN toʻldiradi.
   * `null` = oddiy «yuqori daraja» rejimi.
   */
  const [parentFor, setParentFor] = useState<Category | null>(null);

  const openCreate = (parent: Category | null) => {
    setEditing(null);
    setParentFor(parent);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setParentFor(null);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    supabase
      .from('categories')
      .select(CATEGORY_SELECT)
      .order('sort_order')
      .order('name')
      .then(({ data, error: err }) => {
        if (err) setError(true);
        else setCategories((data ?? []) as Category[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  /*
   * Roʻyxatni daraxt tartibiga keltiradi: ota darhol oʻz bolalari
   * bilan ketma-ket keladi. `depth` chekinish uchun, `children`
   * esa "nechta ichki boʻlim" ni koʻrsatish uchun kerak.
   */
  const orderedTree = useMemo(() => flattenTree(buildCategoryTree(categories)), [categories]);

  const afterMutation = () => {
    // Header/bosh sahifa/katalog umumiy cacheʼdan foydalanadi — uni yangilaymiz.
    invalidateCategories();
    load();
  };

  const handleDelete = async (c: Category) => {
    setBusy(true);
    const { error: err } = await supabase.from('categories').delete().eq('id', c.id);
    setBusy(false);
    setConfirmDelete(null);
    if (err) {
      notify(`Oʻchirib boʻlmadi: ${err.message}`, 'error');
      return;
    }
    notify('Kategoriya oʻchirildi', 'success');
    afterMutation();
  };

  const toggleActive = async (c: Category) => {
    const { error: err } = await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
    if (err) {
      notify('Holatni oʻzgartirib boʻlmadi', 'error');
      return;
    }
    afterMutation();
  };

  return (
    <AdminSection
      title="Kategoriyalar"
      description="Katalog tuzilmasi. Tartib raqami kichik boʻlganlari oldinroq koʻrinadi."
      actions={
        <button onClick={() => openCreate(null)} className={button('primary', 'md')}>
          <Plus className="h-4 w-4" /> Kategoriya qoʻshish
        </button>
      }
    >
      {loading ? (
        <AdminLoading rows={4} />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : categories.length === 0 ? (
        <AdminEmpty
          title="Kategoriya yoʻq"
          message="Mahsulotlarni guruhlash uchun kamida bitta kategoriya yarating."
          action={
            <button onClick={() => openCreate(null)} className={button('primary', 'md')}>
              <Plus className="h-4 w-4" /> Kategoriya qoʻshish
            </button>
          }
        />
      ) : (
        /*
          IERARXIK ROʻYXAT.

          Ilgari bu tekis `categories.map(...)` edi: ichma-ich
          kategoriyalar paydo boʻlgach, admin qaysi boʻlim qaysi
          boʻlimning ichida ekanini ROʻYXATDAN umuman koʻra olmasdi —
          buni bilish uchun har birini ochib, "Ota-kategoriya" maydoniga
          qarash kerak edi. Endi daraxt tartibida, chekinish bilan
          chiziladi va har bir qatorda nechta bolasi borligi koʻrinadi.
        */
        <ul className={cx(card, 'divide-y divide-ink-100')}>
          {orderedTree.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3" style={{ paddingLeft: 12 + c.depth * 22 }}>
              <span className="hidden w-8 shrink-0 items-center gap-1 text-xs tabular-nums text-ink-400 sm:flex">
                <GripVertical className="h-3.5 w-3.5" />
                {c.sort_order}
              </span>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-ink-200 bg-ink-50">
                {c.image_url ? (
                  <Img src={c.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                ) : (
                  <ImageOff className="h-4 w-4 text-ink-300" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
                  {c.depth > 0 && <span aria-hidden="true" className="text-ink-300">└</span>}
                  {c.name}
                </p>
                <p className="truncate text-xs text-ink-400">
                  /{c.slug}
                  {c.children.length > 0 && ` · ${c.children.length} ta ichki boʻlim`}
                </p>
              </div>
              <button
                onClick={() => toggleActive(c)}
                aria-label={`${c.name} — ${c.is_active ? 'nofaol qilish' : 'faollashtirish'}`}
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  focusRing,
                  c.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                )}
              >
                {c.is_active ? 'Faol' : 'Nofaol'}
              </button>
              {/*
                Ichiga bo'lim qo'shish — ayni shu qatordan. Ota shu yerda
                belgilanadi, ya'ni admin «Ota-kategoriya» ro'yxatidan
                to'g'risini izlab topishi shart emas.
              */}
              <button
                onClick={() => openCreate(c)}
                aria-label={`${c.name} ichiga boʻlim qoʻshish`}
                title="Ichiga boʻlim qoʻshish"
                className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-500 hover:bg-orange-50 hover:text-orange-700', focusRing)}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setEditing(c); setParentFor(null); setShowForm(true); }}
                aria-label={`${c.name} — tahrirlash`}
                className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-500 hover:bg-ink-100 hover:text-ink-900', focusRing)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(c)}
                aria-label={`${c.name} — oʻchirish`}
                className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600', focusRing)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <CategoryForm
          category={editing}
          parentFor={parentFor}
          all={categories}
          onClose={closeForm}
          onSaved={() => { closeForm(); afterMutation(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Kategoriyani oʻchirish"
          message={deleteWarning(confirmDelete, orderedTree)}
          busy={busy}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </AdminSection>
  );
}

function CategoryForm({
  category, parentFor, all, onClose, onSaved,
}: {
  category: Category | null;
  /**
   * Roʻyxatdagi qatordan «ichiga boʻlim qoʻshish» bosilganda — oʻsha
   * ota. Faqat YANGI yozuv uchun; tahrirlashda eʼtiborga olinmaydi.
   */
  parentFor: Category | null;
  /** Ota tanlash uchun — barcha mavjud kategoriyalar. */
  all: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: category?.name || '',
    slug: category?.slug || '',
    description: category?.description || '',
    image_url: category?.image_url || '',
    sort_order: category?.sort_order?.toString() ?? '0',
    is_active: category?.is_active ?? true,
    /*
     * Ota-kategoriya. Ustun bazada boshidan bor edi, lekin admin uni
     * HECH QACHON oʻrnatmasdi — shu sababli doʻkonda ierarxiya yaratish
     * mumkin emas edi va butun katalog bir darajali boʻlib qolgandi.
     * `''` = yuqori daraja (bazada `null`).
     *
     * Yangi yozuvda `parentFor` ustun turadi — admin aynan oʻsha
     * kategoriyaning ichiga boʻlim qoʻshmoqchi.
     */
    parent_id: category?.parent_id || parentFor?.id || '',
  });

  /*
   * Tanlash mumkin boʻlgan otalar: daraxtdagi hamma tugun, LEKIN
   * tahrirlanayotgan kategoriyaning oʻzi va uning avlodlari bundan
   * mustasno (halqa hosil boʻlmasligi uchun).
   */
  const parentOptions = useMemo(() => {
    const tree = buildCategoryTree(all);
    const blocked = new Set<string>();
    if (category) {
      blocked.add(category.id);
      const path = pathToNode(tree, category.id);
      const self = path.length > 0 ? path[path.length - 1] : null;
      const collect = (n: CategoryNode) => {
        blocked.add(n.id);
        n.children.forEach(collect);
      };
      if (self) collect(self);
    }
    return flattenTree(tree).filter((n) => !blocked.has(n.id));
  }, [all, category]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Nomini kiriting';
    const order = Number(form.sort_order);
    if (!Number.isInteger(order)) next.sort_order = 'Butun son kiriting';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      sort_order: order,
      is_active: form.is_active,
      // Boʻsh tanlov = yuqori daraja. Bazada bu `null` boʻlishi shart:
      // boʻsh satr `uuid` ustuniga yozilmaydi va xatoga olib keladi.
      parent_id: form.parent_id || null,
    };
    const { error } = category
      ? await supabase.from('categories').update(payload).eq('id', category.id)
      : await supabase.from('categories').insert(payload);
    setSaving(false);

    if (error) {
      notify(
        error.message.includes('duplicate key')
          ? 'Bu slug band. Boshqa havola kiriting.'
          : `Saqlab boʻlmadi: ${error.message}`,
        'error'
      );
      return;
    }
    notify(category ? 'Kategoriya yangilandi' : 'Kategoriya qoʻshildi', 'success');
    onSaved();
  };

  return (
    <AdminModal
      title={
        category
          ? 'Kategoriyani tahrirlash'
          : parentFor
            ? `«${parentFor.name}» ichida yangi boʻlim`
            : 'Yangi kategoriya'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSave} noValidate className="space-y-4">
        {/*
          Qayerga qo'shilayotgani FORMA BOSHIDA aytiladi. «Ota-kategoriya»
          maydoni pastda turadi va admin uni ko'rmasdan saqlab yuborishi
          mumkin edi — natijada bo'lim yuqori darajaga tushib qolardi.
        */}
        {!category && parentFor && (
          <p className="flex items-center gap-2 rounded-control bg-orange-50 px-3 py-2 text-xs text-orange-800">
            <FolderPlus className="h-3.5 w-3.5 shrink-0" />
            <span>
              Bu boʻlim <strong className="font-semibold">{parentFor.name}</strong> ichiga
              qoʻshiladi. Rasm, tavsif va tartibi alohida boʻladi.
            </span>
          </p>
        )}

        <FormField label="Nomi" required value={form.name} error={errors.name}
          onChange={(v) => setForm({ ...form, name: v, slug: category ? form.slug : slugify(v) })} />
        <FormField label="Havola (slug)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })}
          hint="Manzil: /category/<slug>" />
        <FormField label="Tavsif" value={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />

        {/*
          OTA-KATEGORIYA — ierarxiyaning yagona boshqaruv nuqtasi.

          Ro'yxatdan kategoriyaning O'ZI va uning barcha avlodlari
          chiqarib tashlanadi: aks holda "A ning otasi B, B ning otasi A"
          kabi halqa hosil bo'lardi va daraxt qurishda cheksiz rekursiya
          yuzaga kelardi. (`categoryTree.ts` bunday halqadan himoyalangan,
          lekin uni umuman YARATIB bo'lmasligi to'g'riroq.)
        */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Ota-kategoriya</span>
          <select
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            className={selectBase + ' w-full'}
          >
            <option value="">— Yuqori daraja —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {' '.repeat(o.depth * 4)}
                {o.depth > 0 ? '└ ' : ''}
                {o.name}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-ink-400">
            Boʻsh qoldirilsa — asosiy menyuda yuqori daraja sifatida chiqadi.
          </span>
        </label>

        <ImageUrlField label="Rasm URL" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
        <FormField label="Tartib raqami" type="number" value={form.sort_order} error={errors.sort_order}
          onChange={(v) => setForm({ ...form, sort_order: v })} hint="Kichik raqam oldinroq koʻrinadi" />
        <FormToggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Saytda koʻrsatilsin" />
        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </AdminModal>
  );
}
