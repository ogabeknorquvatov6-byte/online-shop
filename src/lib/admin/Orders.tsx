import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Order } from '../types';
import { formatPrice, ORDER_STATUS_LABELS } from '../types';
import { useToast } from '../toast';
import { Eye, ImageOff, Phone, MapPin, StickyNote, CreditCard } from 'lucide-react';
import { OrderStatusBadge } from '../AdminPage';
import {
  AdminEmpty, AdminError, AdminLoading, AdminModal, AdminPager, AdminSearch, AdminSection, AdminSelect,
} from '../AdminShared';
import { pageCount, pageRange, pageSummary, useDebounced } from '../adminPagination';
import { sanitizeOrFilterTerm } from '../search';
import { tableWrap, td, th, tr } from '../adminStyles';
import { card, cx, focusRing, selectBase } from '../design';
import { Img } from '../Img';

const ORDER_SELECT =
  '*, total:total_amount, customer_phone:phone, order_items(*, price:unit_price)';

export function AdminOrders() {
  const { notify } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  /*
   * Qidiruv va filtr SERVERDA — `AdminProducts` dagi naqsh bilan bir xil.
   *
   * ILGARI NIMA XATO EDI. So'rov `.limit(200)` bilan cheklangan, qidiruv
   * esa brauzerda `Array.filter` orqali bajarilardi. Bu shunchaki sekin
   * emas — JIMGINA NOTO'G'RI edi: 201-buyurtma admin uchun UMUMAN
   * mavjud emasdek ko'rinardi. Sahifalash ham, "yana yuklash" tugmasi
   * ham yo'q, hech qanday ogohlantirish ham yo'q. Admin buyurtma
   * yo'qolgan deb o'ylardi — do'kon uchun bu eng yomon xatolardan biri.
   */
  const debouncedSearch = useDebounced(search);

  // Filtr o'zgarsa 1-sahifaga qaytamiz: aks holda 5-sahifadagi admin
  // filtrni torroq qilganda bo'sh ro'yxat ko'rardi.
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    let cancelled = false;
    (async () => {
      const { from, to } = pageRange(page);
      let query = supabase.from('orders').select(ORDER_SELECT, { count: 'exact' });

      const term = sanitizeOrFilterTerm(debouncedSearch);
      if (term) {
        // Foydalanuvchi matni `.or()` sintaksisini buzmasligi uchun
        // tozalanadi (`,` va `(` filtrni butunlay o'zgartirib yuborardi).
        query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, count, error: err } = await query
        .order('created_at', { ascending: false })
        // Barqaror tartib: bir xil `created_at` li buyurtmalar sahifalar
        // orasida takrorlanib yoki yo'qolib qolmasligi uchun.
        .order('id', { ascending: true })
        .range(from, to);

      if (cancelled) return;
      if (err) setError(true);
      else {
        setOrders((data ?? []) as Order[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => load(), [load]);

  const totalPages = pageCount(total);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(true);
    // Oddiy update EMAS — stockni xavfsiz qaytarish/band qilish uchun
    // `set_order_status()` RPC ishlatiladi (admin-only, atomik).
    const { error: err } = await supabase.rpc('set_order_status', { p_order_id: id, p_status: status });
    setUpdating(false);
    if (err) {
      notify(
        err.message?.includes('OUT_OF_STOCK')
          ? 'Omborda yetarli mahsulot yoʻq — bu buyurtmani qayta faollashtirib boʻlmaydi.'
          : `Statusni oʻzgartirib boʻlmadi: ${err.message}`,
        'error'
      );
      return;
    }
    notify(`Status «${ORDER_STATUS_LABELS[status] ?? status}» ga oʻzgartirildi`, 'success');
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    setDetail((d) => (d && d.id === id ? { ...d, status } : d));
  };

  /*
   * Mijoz tomonidagi `filter` OLIB TASHLANDI — u endi noto'g'ri bo'lardi:
   * brauzerda faqat BITTA sahifa bor, ya'ni filtrlash natijani yana
   * qisqartirib, boshqa sahifalardagi mos buyurtmalarni yashirardi.
   * Qidiruv va status filtri yuqorida serverga berilgan.
   */
  return (
    <AdminSection
      title="Buyurtmalar"
      description={loading ? undefined : `${pageSummary(page, total, orders.length)} ta buyurtma`}
      actions={
        <>
          <AdminSearch value={search} onChange={setSearch} label="Buyurtmalarni qidirish" placeholder="Raqam, ism yoki telefon" />
          <AdminSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="Status boʻyicha filtr"
            options={[
              { value: 'all', label: 'Barcha statuslar' },
              ...Object.keys(ORDER_STATUS_LABELS).map((k) => ({ value: k, label: ORDER_STATUS_LABELS[k] })),
            ]}
          />
        </>
      }
    >
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : orders.length === 0 ? (
        <AdminEmpty
          title={debouncedSearch || statusFilter !== 'all' ? 'Mos buyurtma topilmadi' : 'Hali buyurtma yoʻq'}
          message={
            debouncedSearch || statusFilter !== 'all'
              ? 'Qidiruv yoki filtrni oʻzgartiring.'
              : 'Birinchi buyurtma kelganda u shu yerda koʻrinadi.'
          }
        />
      ) : (
        <>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>Buyurtma</th>
                  <th className={th}>Mijoz</th>
                  <th className={th}>Sana</th>
                  <th className={th}>Summa</th>
                  <th className={th}>Toʻlov</th>
                  <th className={th}>Status</th>
                  <th className={cx(th, 'text-right')}>Amal</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={tr}>
                    <td className={cx(td, 'font-medium text-ink-900')}>№ {o.order_number}</td>
                    <td className={td}>
                      <p className="text-ink-700">{o.customer_name || '—'}</p>
                      <p className="text-xs text-ink-400">{o.customer_phone || '—'}</p>
                    </td>
                    <td className={cx(td, 'whitespace-nowrap text-ink-500')}>
                      {new Date(o.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className={cx(td, 'font-medium tabular-nums text-ink-900')}>{formatPrice(o.total)}</td>
                    <td className={cx(td, 'text-xs text-ink-500')}>{o.payment_method || '—'}</td>
                    <td className={td}><OrderStatusBadge status={o.status} /></td>
                    <td className={cx(td, 'text-right')}>
                      <button
                        onClick={() => setDetail(o)}
                        aria-label={`${o.order_number} — batafsil`}
                        className={cx('flex h-10 w-10 items-center justify-center rounded-control text-ink-500 hover:bg-ink-100 hover:text-ink-900', focusRing)}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={cx(card, 'divide-y divide-ink-100 lg:hidden')}>
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setDetail(o)}
                  className={cx('flex w-full items-center justify-between gap-3 p-3.5 text-left active:bg-ink-50', focusRing)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">№ {o.order_number}</p>
                    <p className="truncate text-xs text-ink-500">
                      {o.customer_name || '—'} · {new Date(o.created_at).toLocaleDateString('uz-UZ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink-900">{formatPrice(o.total)}</p>
                    <div className="mt-1"><OrderStatusBadge status={o.status} /></div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <AdminPager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {detail && (
        <AdminModal title={`Buyurtma № ${detail.order_number}`} onClose={() => setDetail(null)} wide>
          <div className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info icon={Phone} label="Mijoz">
                {detail.customer_name || '—'}
                {detail.customer_phone && (
                  <a href={`tel:${detail.customer_phone.replace(/\s/g, '')}`} className={cx('ml-2 rounded-sm font-medium text-orange-700 hover:underline', focusRing)}>
                    {detail.customer_phone}
                  </a>
                )}
              </Info>
              <Info icon={CreditCard} label="Toʻlov">
                {detail.payment_method || '—'}
              </Info>
              <Info icon={MapPin} label="Manzil">
                {[detail.city, detail.address].filter(Boolean).join(', ') || '—'}
              </Info>
              {detail.note && (
                <Info icon={StickyNote} label="Kuryer uchun izoh">{detail.note}</Info>
              )}
            </dl>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Mahsulotlar</h3>
              <ul className="mt-2 space-y-2 border-t border-ink-100 pt-3">
                {detail.order_items?.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ink-50">
                      {item.image_url ? (
                        <Img src={item.image_url} alt="" className="h-full w-full" iconClassName="h-4 w-4" />
                      ) : (
                        <ImageOff className="h-4 w-4 text-ink-300" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-ink-800">{item.product_name}</span>
                      <span className="text-xs text-ink-400">
                        {item.variant ? `${item.variant} · ` : ''}{item.quantity} × {formatPrice(item.price)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <dl className="space-y-1.5 border-t border-ink-100 pt-3 text-sm">
              {detail.subtotal != null && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Mahsulotlar</dt>
                  <dd className="tabular-nums">{formatPrice(Number(detail.subtotal))}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Yetkazib berish</dt>
                <dd className="tabular-nums">
                  {Number(detail.delivery_fee) > 0 ? formatPrice(Number(detail.delivery_fee)) : 'Bepul'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base">
                <dt className="font-semibold">Jami</dt>
                <dd className="font-bold tabular-nums text-orange-700">{formatPrice(detail.total)}</dd>
              </div>
            </dl>

            <div className="border-t border-ink-100 pt-4">
              <label htmlFor="admin-order-status" className="mb-1.5 block text-xs font-medium text-ink-600">
                Statusni oʻzgartirish
              </label>
              <select
                id="admin-order-status"
                value={detail.status}
                disabled={updating}
                onChange={(e) => updateStatus(detail.id, e.target.value)}
                className={cx(selectBase, 'w-full')}
              >
                {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-400">
                «Bekor qilindi» tanlansa, mahsulotlar omborga avtomatik qaytariladi.
              </p>
            </div>
          </div>
        </AdminModal>
      )}
    </AdminSection>
  );
}

function Info({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-0.5 text-ink-800">{children}</dd>
    </div>
  );
}
