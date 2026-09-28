import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Category, Product } from '../types';
import { formatPrice } from '../types';
import { PRODUCT_SELECT, adaptProducts, type ProductRow } from '../adapters';
import { fetchCategories } from '../catalogData';
import { dedupeBrands, normalizeBrandInput } from '../brands';
import { BrandField } from './BrandField';
import { CategoryPicker } from './CategoryPicker';
import { sanitizeOrFilterTerm } from '../search';
import { pageCount, pageRange, pageSummary, useDebounced } from '../adminPagination';
import { useToast } from '../toast';
import { Plus, Pencil, Trash2, ImageOff, AlertTriangle } from 'lucide-react';
import {
  AdminEmpty, AdminError, AdminLoading, AdminModal, AdminPager, AdminSearch, AdminSection, AdminSelect,
  ConfirmModal, FormActions, FormField, FormToggle,
} from '../AdminShared';
import { tableWrap, td, th, tr } from '../adminStyles';
import { ProductMediaManager } from './ProductMedia';
import { ProductVariantsManager } from './ProductVariants';
import { button, card, cx, focusRing } from '../design';
import { Img } from '../Img';

type Row = Product;

export function AdminProducts() {
  const { notify } = useToast();
  const [products, setProducts] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  /*
   * Mavjud brendlar — brend maydonidagi takliflar uchun.
   *
   * ALOHIDA soʻrov: yuqoridagi `products` roʻyxati sahifalangan, yaʼni
   * unda faqat joriy sahifadagi brendlar boʻladi. Takliflar esa BUTUN
   * katalog boʻyicha boʻlishi kerak, aks holda 2-sahifadagi brend
   * "yangi" boʻlib koʻrinadi va dublikat yaratiladi.
   *
   * Faqat bitta ustun tanlanadi, shuning uchun soʻrov yengil.
   */
  const [knownBrands, setKnownBrands] = useState<string[]>([]);

  /*
   * Qidiruv va filtr endi SERVERDA bajariladi (qarang: adminPagination.ts).
   * Ilgari butun katalog brauzerga yuklanib, keyin `Array.filter` bilan
   * saralanardi — bu bir necha ming mahsulotda yorliqni qotirib qoʻyadi.
   */
  const debouncedSearch = useDebounced(search);

  // Filtr oʻzgarsa doim 1-sahifaga qaytamiz: aks holda 5-sahifada turgan
  // admin filtrni torroq qilganda boʻsh roʻyxat koʻrardi.
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    let cancelled = false;
    (async () => {
      const { from, to } = pageRange(page);
      let query = supabase
        .from('products')
        .select(`${PRODUCT_SELECT}, categories(id,name,slug)`, { count: 'exact' });

      const term = sanitizeOrFilterTerm(debouncedSearch);
      if (term) {
        // Foydalanuvchi matni `.or()` sintaksisini buzmasligi uchun
        // tozalanadi — `,` va `(` filtrni butunlay oʻzgartirib yuborardi.
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%`);
      }
      if (statusFilter === 'active') query = query.eq('is_active', true);
      else if (statusFilter === 'inactive') query = query.eq('is_active', false);
      else if (statusFilter === 'out') query = query.lte('stock', 0);

      const [prodRes, cats] = await Promise.all([
        query
          .order('created_at', { ascending: false })
          // Barqaror tartib: bir xil `created_at` li yozuvlar sahifalar
          // orasida takrorlanib/yo'qolib qolmasligi uchun ikkilamchi kalit.
          .order('id', { ascending: true })
          .range(from, to)
          .returns<ProductRow[]>(),
        fetchCategories(true).catch(() => [] as Category[]),
      ]);
      if (cancelled) return;
      if (prodRes.error) {
        setError(true);
        setLoading(false);
        return;
      }
      setProducts(adaptProducts(prodRes.data ?? []));
      setTotal(prodRes.count ?? 0);
      setCategories(cats);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => load(), [load]);

  /* Brendlar roʻyxati — bir marta, sahifalashdan mustaqil. */
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('products')
      .select('brand')
      .not('brand', 'is', null)
      .then(({ data }) => {
        if (cancelled) return;
        setKnownBrands(dedupeBrands((data ?? []).map((r) => r.brand as string)));
      });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (p: Row) => {
    setDeleting(true);
    const { error: err } = await supabase.from('products').delete().eq('id', p.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (err) {
      // Buyurtmalarda ishlatilgan mahsulotni oʻchirishda FK cheklovi boʻlishi mumkin.
      notify(`Oʻchirib boʻlmadi: ${err.message}`, 'error');
      return;
    }
    notify('Mahsulot oʻchirildi', 'success');
    load();
  };

  // Server allaqachon filtrlab bergan — mijozda qayta saralash shart emas.
  const filtered = products;
  const totalPages = pageCount(total);
  const hasFilter = Boolean(search.trim()) || statusFilter !== 'all';

  return (
    <AdminSection
      title="Mahsulotlar"
      description={loading ? undefined : `${total} ta mahsulot${totalPages > 1 ? ` · ${pageSummary(page, total, products.length)}` : ''}`}
      actions={
        <>
          <AdminSearch value={search} onChange={setSearch} label="Mahsulotlarni qidirish" placeholder="Nomi, SKU yoki brend" />
          <AdminSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="Holat boʻyicha filtr"
            options={[
              { value: 'all', label: 'Barchasi' },
              { value: 'active', label: 'Faol' },
              { value: 'inactive', label: 'Nofaol' },
              { value: 'out', label: 'Omborda yoʻq' },
            ]}
          />
          <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
            <Plus className="h-4 w-4" /> Qoʻshish
          </button>
        </>
      }
    >
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : filtered.length === 0 ? (
        <AdminEmpty
          title={hasFilter ? 'Mos mahsulot topilmadi' : 'Hali mahsulot qoʻshilmagan'}
          message={hasFilter ? 'Qidiruv yoki filtrni oʻzgartiring.' : 'Birinchi mahsulotni qoʻshing.'}
          action={
            !hasFilter ? (
              <button onClick={() => { setEditing(null); setShowForm(true); }} className={button('primary', 'md')}>
                <Plus className="h-4 w-4" /> Mahsulot qoʻshish
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>Mahsulot</th>
                  <th className={th}>Kategoriya</th>
                  <th className={th}>Narx</th>
                  <th className={th}>Ombor</th>
                  <th className={th}>Holat</th>
                  <th className={cx(th, 'text-right')}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={tr}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <Thumb url={p.product_images?.[0]?.image_url} />
                        <div className="min-w-0 max-w-xs">
                          <p className="truncate font-medium text-ink-900">{p.name}</p>
                          <p className="truncate text-xs text-ink-400">{p.brand || '—'} · {p.sku || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className={cx(td, 'text-ink-600')}>{p.category?.name || '—'}</td>
                    <td className={td}>
                      <p className="font-medium tabular-nums text-ink-900">{formatPrice(p.price)}</p>
                      {p.old_price != null && (
                        <p className="text-xs tabular-nums text-ink-400 line-through">{formatPrice(p.old_price)}</p>
                      )}
                    </td>
                    <td className={td}><StockCell stock={p.stock} /></td>
                    <td className={td}><StatusPill active={p.status === 'active'} /></td>
                    <td className={cx(td, 'text-right')}>
                      <RowActions
                        onEdit={() => { setEditing(p); setShowForm(true); }}
                        onDelete={() => setConfirmDelete(p)}
                        name={p.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil kartochkalar */}
          <ul className={cx(card, 'divide-y divide-ink-100 lg:hidden')}>
            {filtered.map((p) => (
              <li key={p.id} className="flex gap-3 p-3">
                <Thumb url={p.product_images?.[0]?.image_url} large />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                  <p className="truncate text-xs text-ink-400">{p.category?.name || '—'} · {p.brand || '—'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-ink-900">{formatPrice(p.price)}</span>
                    <StatusPill active={p.status === 'active'} />
                    <StockCell stock={p.stock} compact />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <RowActions
                    onEdit={() => { setEditing(p); setShowForm(true); }}
                    onDelete={() => setConfirmDelete(p)}
                    name={p.name}
                    stacked
                  />
                </div>
              </li>
            ))}
          </ul>

          <AdminPager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories}
          knownBrands={knownBrands}
          // Modal saqlangandan keyin ochiq qoladi (rasm/variant qoʻshish uchun),
          // shuning uchun roʻyxatni yopmasdan yangilaymiz.
          onClose={() => { setShowForm(false); load(); }}
          onSaved={() => load()}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Mahsulotni oʻchirish"
          message={`«${confirmDelete.name}» butunlay oʻchiriladi. Buyurtmalar tarixidagi yozuvlar saqlanib qoladi, lekin mahsulot katalogdan yoʻqoladi.`}
          busy={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </AdminSection>
  );
}

function Thumb({ url, large }: { url?: string; large?: boolean }) {
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-ink-200 bg-ink-50',
        large ? 'h-16 w-16' : 'h-11 w-11'
      )}
    >
      {url ? (
        <Img src={url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
      ) : (
        <ImageOff className="h-4 w-4 text-ink-300" />
      )}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'
      )}
    >
      {active ? 'Faol' : 'Nofaol'}
    </span>
  );
}

function StockCell({ stock, compact }: { stock: number; compact?: boolean }) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" /> Tugagan
      </span>
    );
  }
  return (
    <span className={cx('whitespace-nowrap tabular-nums', stock <= 5 ? 'text-amber-600' : 'text-ink-600', compact && 'text-[11px]')}>
      {compact ? `Ombor: ${stock}` : `${stock} dona`}
    </span>
  );
}

function RowActions({
  onEdit, onDelete, name, stacked,
}: {
  onEdit: () => void;
  onDelete: () => void;
  name: string;
  stacked?: boolean;
}) {
  return (
    <div className={cx('flex gap-1', stacked ? 'flex-col' : 'justify-end')}>
      <button
        onClick={onEdit}
        aria-label={`${name} — tahrirlash`}
        className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900', focusRing)}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onDelete}
        aria-label={`${name} — oʻchirish`}
        className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600', focusRing)}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function ProductForm({
  product, categories, knownBrands, onClose, onSaved,
}: {
  product: Product | null;
  categories: Category[];
  /** Takliflar va registr normallashtirish uchun mavjud brendlar. */
  knownBrands: string[];
  onClose: () => void;
  onSaved: (productId: string) => void;
}) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: product?.name || '',
    slug: product?.slug || '',
    description: product?.description || '',
    price: product?.price?.toString() || '',
    old_price: product?.old_price?.toString() || '',
    brand: product?.brand || '',
    category_id: product?.category_id || '',
    sku: product?.sku || '',
    stock: product?.stock?.toString() ?? '0',
    active: (product?.status ?? 'active') === 'active',
  });
  /*
   * Rasm va variantlar `product_id` ga bogʻlangan, yaʼni ular faqat mahsulot
   * saqlangandan keyin qoʻshilishi mumkin. Shuning uchun yangi mahsulot
   * saqlangach modal yopilmaydi — u tahrirlash rejimiga oʻtadi va admin
   * darhol rasm/variant qoʻsha oladi.
   */
  const [savedId, setSavedId] = useState<string | null>(product?.id ?? null);
  const [tab, setTab] = useState<'general' | 'media' | 'variants'>('general');
  const currentPrice = Number(form.price) || 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Nomini kiriting';
    const price = Number(form.price);
    if (!form.price || !Number.isFinite(price) || price < 0) next.price = 'Toʻgʻri narx kiriting';
    const oldPrice = form.old_price ? Number(form.old_price) : null;
    if (oldPrice != null && (!Number.isFinite(oldPrice) || oldPrice <= price)) {
      next.old_price = 'Eski narx joriy narxdan katta boʻlishi kerak';
    }
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) next.stock = 'Ombor soni manfiy boʻlmasin';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const slug = (form.slug.trim() || slugify(form.name)) || `mahsulot-${Date.now().toString(36)}`;

    /*
     * Dizaynda "Narx" = mijoz toʻlaydigan joriy narx, "Eski narx" =
     * chegirmadan oldingi yuqori narx. Bazada aksincha: `price` = asl narx,
     * `discount_price` = chegirmali narx (va u `price` dan kichik boʻlishi
     * CHECK bilan majburlangan). Shuning uchun teskari moslaymiz.
     */
    const hasDiscount = oldPrice != null && oldPrice > price;
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug,
      description: form.description.trim(),
      price: hasDiscount ? oldPrice : price,
      discount_price: hasDiscount ? price : null,
      /*
       * Saqlashdan oldin registr normallashtiriladi: admin «apple» deb
       * yozgan boʻlsa ham, bazada allaqachon mavjud «Apple» yozilishi
       * ishlatiladi. Mavjud yozuvlar OʻZGARTIRILMAYDI — bu faqat shu
       * saqlanayotgan mahsulotga taalluqli.
       */
      brand: normalizeBrandInput(form.brand, knownBrands),
      category_id: form.category_id || null,
      sku: form.sku.trim() || `SKU-${slug.toUpperCase().slice(0, 18)}-${Date.now().toString(36).toUpperCase()}`,
      stock,
      is_active: form.active,
    };

    let productId = product?.id;
    let saveError: string | null = null;

    if (product) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      saveError = error?.message ?? null;
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single();
      saveError = error?.message ?? null;
      productId = data?.id;
    }

    // Ilgari bu javoblar butunlay eʼtiborsiz qoldirilardi va admin har doim
    // "Mahsulot saqlandi" degan xabarni koʻrardi — hatto saqlanmaganda ham.
    if (saveError || !productId) {
      setSaving(false);
      notify(
        saveError?.includes('duplicate key')
          ? 'Bunday slug yoki SKU allaqachon mavjud. Boshqa qiymat kiriting.'
          : `Saqlab boʻlmadi: ${saveError ?? 'nomaʼlum xato'}`,
        'error'
      );
      return;
    }

    setSaving(false);
    setSavedId(productId);
    notify(product ? 'Mahsulot yangilandi' : 'Mahsulot qoʻshildi — endi rasm va variant qoʻshishingiz mumkin', 'success');
    onSaved(productId);
    if (!product) setTab('media');
  };

  const TABS = [
    { key: 'general' as const, label: 'Asosiy' },
    { key: 'media' as const, label: 'Rasmlar' },
    { key: 'variants' as const, label: 'Variantlar' },
  ];

  return (
    <AdminModal title={product ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'} onClose={onClose} wide>
      <div
        role="tablist"
        aria-label="Mahsulot boʻlimlari"
        className="-mt-1 mb-4 flex gap-1 border-b border-ink-200"
      >
        {TABS.map((t) => {
          const locked = t.key !== 'general' && !savedId;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              disabled={locked}
              title={locked ? 'Avval mahsulotni saqlang' : undefined}
              onClick={() => setTab(t.key)}
              className={cx(
                'border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-300',
                focusRing,
                tab === t.key ? 'border-orange-600 text-orange-700' : 'border-transparent text-ink-500 hover:text-ink-900'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'general' && (
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <FormField label="Nomi" required value={form.name} error={errors.name}
            onChange={(v) => setForm({ ...form, name: v, slug: product ? form.slug : slugify(v) })} />
          <FormField label="Havola (slug)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })}
            hint="Mahsulot manzili: /product/<slug>. Boʻsh qoldirsangiz nomdan hosil qilinadi." />
          <FormField label="Tavsif" value={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea
            hint="Mahsulot sahifasida va qidiruv tavsifida ishlatiladi" />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Joriy narx (soʻm)" required type="number" min={0} value={form.price}
              error={errors.price} onChange={(v) => setForm({ ...form, price: v })} />
            <FormField label="Eski narx (soʻm)" type="number" min={0} value={form.old_price}
              error={errors.old_price} hint="Chegirma koʻrsatish uchun. Joriy narxdan katta boʻlsin."
              onChange={(v) => setForm({ ...form, old_price: v })} />
            {/*
              Erkin matn o'rniga boshqariladigan tanlov: mavjud brendlar
              taklif qilinadi va registr dublikatlari («apple» / «Apple»)
              oldini olinadi. Yangi brend kiritish baribir mumkin.
            */}
            <BrandField
              value={form.brand}
              onChange={(v) => setForm({ ...form, brand: v })}
              brands={knownBrands}
            />
            <FormField label="SKU (artikul)" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })}
              hint="Boʻsh qoldirilsa avtomatik yaratiladi" />
            <div className="sm:col-span-2">
              {/*
                KETMA-KET TANLASH. Ilgari bu bitta uzun ochiluvchi
                ro'yxat edi — butun daraxt chekinish bilan tekislanib,
                hammasi bitta <select> ichiga solinardi. Endi har daraja
                o'z tanlovchisiga ega va keyingisi faqat kerak bo'lganda
                ochiladi (qarang: CategoryPicker).
              */}
              <CategoryPicker
                categories={categories}
                value={form.category_id}
                onChange={(id) => setForm({ ...form, category_id: id })}
              />
            </div>
            <FormField label="Ombordagi soni" type="number" min={0} value={form.stock}
              error={errors.stock} onChange={(v) => setForm({ ...form, stock: v })} />
          </div>

          <FormToggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })}
            label="Saytda koʻrsatilsin (faol)" />

          <FormActions saving={saving} onCancel={onClose} saveLabel={savedId ? 'Saqlash' : 'Saqlash va davom etish'} />
        </form>
      )}

      {tab === 'media' && savedId && <ProductMediaManager productId={savedId} />}

      {tab === 'variants' && savedId && (
        <ProductVariantsManager productId={savedId} basePrice={currentPrice} />
      )}
    </AdminModal>
  );
}
