import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { ShieldCheck, User as UserIcon, Ban, CheckCircle2, AlertTriangle, UserX } from 'lucide-react';
import {
  AdminEmpty, AdminError, AdminLoading, AdminPager, AdminSearch, AdminSection, AdminSelect,
  ConfirmModal,
} from '../AdminShared';
import { ADMIN_PAGE_SIZE, pageCount, pageRange, pageSummary, useDebounced } from '../adminPagination';
import { tableWrap, td, th, tr } from '../adminStyles';
import { button, card, cx, focusRing } from '../design';

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  login: string | null;
  phone: string | null;
  role: 'customer' | 'admin';
  is_active: boolean;
  /**
   * `auth.users` da hisob bor, lekin `public.profiles` da qatori yoʻq.
   * Bunday foydalanuvchi ilgari roʻyxatda UMUMAN koʻrinmasdi.
   */
  has_profile: boolean;
  created_at: string;
  /** Filtrga mos JAMI yozuvlar soni (har bir qatorda takrorlanadi). */
  total_count: number;
  /** Profilsiz hisoblar soni — butun baza boʻyicha, filtrdan qatʼiy nazar. */
  orphan_count: number;
};

export function AdminUsers() {
  const { notify } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);
  const [pending, setPending] = useState<{ user: UserRow; action: 'block' | 'unblock' | 'promote' | 'demote' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Har bosilgan harf uchun alohida soʻrov ketmasligi kerak.
  const debouncedSearch = useDebounced(search);

  // Qidiruv yoki filtr oʻzgarsa 1-sahifaga qaytamiz: aks holda 5-sahifada
  // turgan admin filtrni toraytirganda boʻsh roʻyxat koʻrardi.
  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter]);

  /*
   * MANBA ALMASHTIRILDI: `profiles` emas, `auth.users LEFT JOIN profiles`.
   *
   * Ilgari bu sahifa faqat `profiles` ni oʻqirdi. Hisob esa `auth.users`
   * da yaratiladi va profil trigger orqali qoʻshiladi — trigger ishlamay
   * qolsa foydalanuvchi roʻyxatda UMUMAN koʻrinmasdi. Telegram orqali
   * roʻyxatdan oʻtganlar aynan shu sababdan "yoʻqolgan" edi.
   *
   * Endi har bir hisob koʻrinadi; profili yoʻqlari alohida belgilanadi
   * va bir bosishda tiklanadi.
   */
  /*
   * SAHIFALASH SERVERDA — `AdminProducts` / `AdminOrders` bilan bir xil naqsh.
   *
   * Ilgari `rpc('admin_list_users')` BARCHA hisoblarni chegarasiz olardi,
   * qidiruv va filtr esa brauzerda bajarilardi. 50 000 foydalanuvchida bu
   * boʻlimni butunlay ishlatib boʻlmas edi — va butun mijozlar bazasi
   * (email, telefon, login) bitta javobda brauzerga tushardi.
   */
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    let cancelled = false;
    const { from } = pageRange(page);

    supabase
      .rpc('admin_list_users', {
        p_limit: ADMIN_PAGE_SIZE,
        p_offset: from,
        p_search: debouncedSearch.trim() || null,
        p_filter: roleFilter,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error('admin_list_users', err);
          setError(true);
        } else {
          const rows = (data ?? []) as UserRow[];
          setUsers(rows);
          /*
           * `total_count` va `orphan_count` har bir qatorda takrorlanadi
           * (window funksiyasi). Boʻsh sahifada qator yoʻq — u holda 0.
           */
          setTotal(rows[0]?.total_count ?? 0);
          setOrphanCount(rows[0]?.orphan_count ?? 0);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => load(), [load]);

  const totalPages = pageCount(total);

  const repairProfiles = async () => {
    setRepairing(true);
    const { data, error: err } = await supabase.rpc('repair_missing_profiles');
    setRepairing(false);
    if (err) {
      notify(`Tiklab boʻlmadi: ${err.message}`, 'error');
      return;
    }
    const created = ((data ?? []) as { created: boolean }[]).filter((r) => r.created).length;
    notify(created > 0 ? `${created} ta profil tiklandi` : 'Tiklanadigan profil topilmadi', 'success');
    load();
  };

  /*
   * `role` va `is_active` ustunlarini faqat admin oʻzgartira oladi — buni
   * `protect_profile_privileged_fields` triggeri va `admin_update_profiles`
   * policyʼsi taʼminlaydi. Admin panelida bu imkoniyat umuman yoʻq edi,
   * yaʼni migratsiyada tayyorlangan "bloklash" mexanizmi ishlatilmasdan
   * turardi.
   */
  const applyAction = async () => {
    if (!pending) return;
    const { user, action } = pending;
    setBusy(true);
    const patch =
      action === 'block' ? { is_active: false }
      : action === 'unblock' ? { is_active: true }
      : action === 'promote' ? { role: 'admin' }
      : { role: 'customer' };

    const { error: err } = await supabase.from('profiles').update(patch).eq('id', user.id);
    setBusy(false);
    setPending(null);
    if (err) {
      notify(`Amalni bajarib boʻlmadi: ${err.message}`, 'error');
      return;
    }
    notify('Foydalanuvchi yangilandi', 'success');
    load();
  };

  const nameOf = (u: UserRow) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.display_name || 'Ismsiz';

  /*
   * Mijoz tomonidagi `filter` OLIB TASHLANDI.
   *
   * Brauzerda endi FAQAT bitta sahifa bor. Uni yana filtrlash boshqa
   * sahifalardagi mos foydalanuvchilarni yashirar va admin ularni
   * umuman yoʻq deb oʻylardi. Qidiruv va filtr `admin_list_users` ga
   * parametr sifatida beriladi.
   */

  const confirmCopy: Record<string, { title: string; message: (n: string) => string; label: string }> = {
    block: {
      title: 'Foydalanuvchini bloklash',
      message: (n) => `${n} tizimga kira olmaydi va buyurtma bera olmaydi. Keyinroq blokni yechish mumkin.`,
      label: 'Bloklash',
    },
    unblock: {
      title: 'Blokni yechish',
      message: (n) => `${n} yana tizimga kirishi va buyurtma berishi mumkin boʻladi.`,
      label: 'Blokni yechish',
    },
    promote: {
      title: 'Admin huquqini berish',
      message: (n) => `${n} admin paneliga toʻliq kirish huquqiga ega boʻladi: mahsulot, buyurtma va sozlamalarni oʻzgartira oladi.`,
      label: 'Admin qilish',
    },
    demote: {
      title: 'Admin huquqini olib tashlash',
      message: (n) => `${n} oddiy mijozga aylanadi va admin paneliga kira olmaydi.`,
      label: 'Huquqni olib tashlash',
    },
  };

  return (
    <AdminSection
      title="Foydalanuvchilar"
      description={loading ? undefined : `${pageSummary(page, total, users.length)} ta roʻyxatdan oʻtgan foydalanuvchi`}
      actions={
        <>
          <AdminSearch value={search} onChange={setSearch} label="Foydalanuvchi qidirish" placeholder="Ism yoki telefon" />
          <AdminSelect
            value={roleFilter}
            onChange={setRoleFilter}
            label="Rol boʻyicha filtr"
            options={[
              { value: 'all', label: 'Barchasi' },
              { value: 'customer', label: 'Mijozlar' },
              { value: 'admin', label: 'Adminlar' },
              { value: 'blocked', label: 'Bloklanganlar' },
              { value: 'noprofile', label: 'Profilsiz' },
            ]}
          />
        </>
      }
    >
      {/*
        Profilsiz hisoblar — bu jimgina yuz beradigan nosozlik: odam
        ro'yxatdan o'tadi, lekin admin uni ko'rmaydi. Endi u yashirilmaydi,
        aksincha yuqorida ko'rsatiladi va bir bosishda tuzatiladi.
      */}
      {!loading && !error && orphanCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <strong>{orphanCount} ta hisobda profil yoʻq.</strong>{' '}
            Ular roʻyxatdan oʻtgan, lekin profil qatori yaratilmagan — buyurtma bera olmaydi va
            maʼlumotlari koʻrinmaydi.
          </p>
          <button onClick={repairProfiles} disabled={repairing} className={button('primary', 'md')}>
            {repairing ? 'Tiklanmoqda…' : 'Profillarni tiklash'}
          </button>
        </div>
      )}

      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError onRetry={load} />
      ) : users.length === 0 ? (
        <AdminEmpty
          title={debouncedSearch || roleFilter !== 'all' ? 'Foydalanuvchi topilmadi' : 'Hali foydalanuvchi yoʻq'}
          message={
            debouncedSearch || roleFilter !== 'all'
              ? 'Qidiruv yoki filtrni oʻzgartiring.'
              : 'Birinchi roʻyxatdan oʻtgan foydalanuvchi shu yerda koʻrinadi.'
          }
        />
      ) : (
        <>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>Foydalanuvchi</th>
                  <th className={th}>Telefon</th>
                  <th className={th}>Rol</th>
                  <th className={th}>Holat</th>
                  <th className={th}>Roʻyxatdan oʻtgan</th>
                  <th className={cx(th, 'text-right')}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={cx(tr, !u.has_profile && 'bg-amber-50/60')}>
                    <td className={td}>
                      <p className="font-medium text-ink-900">{nameOf(u)}</p>
                      {/* Login — Telegram botda tanlangan, saytga kirish uchun. */}
                      <p className="truncate text-xs text-ink-400">
                        {u.login ? `@${u.login}` : u.email || '—'}
                      </p>
                    </td>
                    <td className={cx(td, 'text-ink-600')}>{u.phone || '—'}</td>
                    <td className={td}>
                      {u.has_profile ? <RoleBadge role={u.role} /> : <NoProfileBadge />}
                    </td>
                    <td className={td}>{u.has_profile && <ActiveBadge active={u.is_active} />}</td>
                    <td className={cx(td, 'whitespace-nowrap text-ink-500')}>
                      {new Date(u.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className={cx(td, 'text-right')}>
                      <UserActions
                        user={u}
                        isSelf={u.id === currentUser?.id}
                        onAction={(action) => setPending({ user: u, action })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={cx(card, 'divide-y divide-ink-100 lg:hidden')}>
            {users.map((u) => (
              <li key={u.id} className={cx('p-3.5', !u.has_profile && 'bg-amber-50/60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{nameOf(u)}</p>
                    <p className="truncate text-xs text-ink-400">
                      {u.login ? `@${u.login}` : u.email || '—'}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {u.phone || '—'} · {new Date(u.created_at).toLocaleDateString('uz-UZ')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {u.has_profile ? (
                        <>
                          <RoleBadge role={u.role} />
                          <ActiveBadge active={u.is_active} />
                        </>
                      ) : (
                        <NoProfileBadge />
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <UserActions user={u} isSelf={u.id === currentUser?.id} onAction={(action) => setPending({ user: u, action })} />
                </div>
              </li>
            ))}
          </ul>

          <AdminPager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {pending && (
        <ConfirmModal
          title={confirmCopy[pending.action].title}
          message={confirmCopy[pending.action].message(nameOf(pending.user))}
          confirmLabel={confirmCopy[pending.action].label}
          busy={busy}
          onConfirm={applyAction}
          onCancel={() => setPending(null)}
        />
      )}
    </AdminSection>
  );
}

function RoleBadge({ role }: { role: 'customer' | 'admin' }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-700">
      <ShieldCheck className="h-3 w-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium text-ink-500">
      <UserIcon className="h-3 w-3" /> Mijoz
    </span>
  );
}

/** `auth.users` da bor, `profiles` da yoʻq — tuzatilishi kerak boʻlgan holat. */
function NoProfileBadge() {
  return (
    <span
      title="Bu hisobda profil qatori yoʻq. Yuqoridagi «Profillarni tiklash» tugmasini bosing."
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800"
    >
      <UserX className="h-3 w-3" /> Profil yoʻq
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Faol</span>
  ) : (
    <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-600">Bloklangan</span>
  );
}

function UserActions({
  user, isSelf, onAction,
}: {
  user: UserRow;
  isSelf: boolean;
  onAction: (a: 'block' | 'unblock' | 'promote' | 'demote') => void;
}) {
  if (isSelf) {
    // Oʻzini bloklab yoki admin huquqidan mahrum qilib, panelga kirishni
    // butunlay yoʻqotib qoʻyish imkoniyati boʻlmasligi kerak.
    return <span className="text-xs text-ink-400">Bu — siz</span>;
  }
  if (!user.has_profile) {
    // Profil qatori yoʻq — `update` 0 qatorga taʼsir qilib, "bajarildi"
    // degan yolgʻon xabar berardi. Avval tiklash kerak.
    return <span className="text-xs text-amber-700">Avval profilni tiklang</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        onClick={() => onAction(user.role === 'admin' ? 'demote' : 'promote')}
        className={cx(button('outline', 'sm'), focusRing)}
      >
        {user.role === 'admin' ? 'Mijoz qilish' : 'Admin qilish'}
      </button>
      <button
        onClick={() => onAction(user.is_active ? 'block' : 'unblock')}
        className={cx(
          button('outline', 'sm'),
          user.is_active ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : 'text-emerald-700 hover:bg-emerald-50'
        )}
      >
        {user.is_active ? (<><Ban className="h-3.5 w-3.5" /> Bloklash</>) : (<><CheckCircle2 className="h-3.5 w-3.5" /> Blokni yechish</>)}
      </button>
    </div>
  );
}
