import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';
import { loginToEmail, phoneToLoginEmail, looksLikePhone } from './login';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /** `identifier` — Telegram botda tanlangan login yoki telefon raqami. */
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  /** Google OAuth — brauzerni provayder sahifasiga yoʻnaltiradi. */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Supabase'ning inglizcha xato xabarlarini oʻzbekchaga oʻgiramiz.
const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Login yoki parol notoʻgʻri.',
  'Email not confirmed': 'Hisob hali tasdiqlanmagan.',
  'Password should be at least 6 characters': 'Parol kamida 6 ta belgidan iborat boʻlsin.',
  'For security purposes, you can only request this after 60 seconds':
    'Xavfsizlik uchun 60 soniyadan keyin qayta urinib koʻring.',
  'Too many requests': 'Juda koʻp urinish. Birozdan soʻng qayta urinib koʻring.',
};

function mapError(message: string): string {
  if (AUTH_ERRORS[message]) return AUTH_ERRORS[message];
  const partial = Object.keys(AUTH_ERRORS).find((k) => message.includes(k));
  if (partial) return AUTH_ERRORS[partial];
  if (/network|fetch/i.test(message)) return 'Tarmoq xatosi. Internet ulanishini tekshiring.';
  return message;
}

const BLOCKED_MESSAGE = 'Hisobingiz bloklangan. Administrator bilan bogʻlaning.';

// `profiles` jadvali: id, display_name, phone, role, is_active
// + moslashuv migratsiyasidan: first_name, last_name, avatar_url
type RawProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'customer' | 'admin';
  is_active: boolean;
  created_at: string;
};

const PROFILE_SELECT = 'id, first_name, last_name, phone, avatar_url, role, is_active, created_at';

function toProfile(row: RawProfileRow): Profile {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    avatar_url: row.avatar_url,
    is_admin: row.role === 'admin',
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * `getSession()` va `onAuthStateChange` mount paytida deyarli bir vaqtda
   * ishga tushadi va ikkalasi ham profilni yuklaydi. Ular turli tezlikda
   * tugagani uchun ESKI javob YANGI javobdan keyin kelib, `profile` ni
   * eskirgan qiymatga qaytarib qoʻyishi mumkin edi (masalan admin boʻlgan
   * foydalanuvchi bir zumga oddiy mijozga aylanardi). Har bir yuklashga
   * tartib raqami beramiz va faqat eng oxirgisini qabul qilamiz.
   */
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const id = ++requestId.current;
    let { data } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', uid).maybeSingle();

    /*
     * 3-QAVAT KAFOLAT: profilni oʻzi tiklash.
     *
     * Profil odatda `handle_new_user` triggeri orqali yaratiladi. Lekin
     * trigger oʻchib qolishi yoki jimgina xato berishi mumkin (oʻtmishda
     * shunday boʻlgan) — natijada foydalanuvchi tizimga kiradi-yu,
     * profili yoʻq: ismi koʻrinmaydi, buyurtma bera olmaydi, admin
     * paneli ochilmaydi va uni bazada topib ham boʻlmaydi.
     *
     * Bu ayniqsa Google orqali kirganlar uchun muhim — u yerda bot
     * tomonidagi zaxira yoʻq.
     *
     * `profile_insert_own` policyʼsi faqat `id = auth.uid()` ga ruxsat
     * beradi, `force_default_profile_privileges` triggeri esa role/
     * is_active ni majburan sukutga qaytaradi — yaʼni bu yerdan
     * imtiyoz olib boʻlmaydi.
     */
    if (!data) {
      const { error: insertError } = await supabase.from('profiles').insert({ id: uid });
      // Boshqa tab bir vaqtda yaratib ulgurgan boʻlishi mumkin (23505) —
      // bu xato emas, shunchaki qayta oʻqiymiz.
      if (!insertError || insertError.code === '23505') {
        ({ data } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', uid).maybeSingle());
      } else {
        console.error('Profilni yaratib boʻlmadi', insertError);
      }
    }

    const mapped = data ? toProfile(data as RawProfileRow) : null;
    if (id !== requestId.current || !mounted.current) return mapped;
    setProfile(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    let settled = false;

    const applySession = async (next: Session | null) => {
      setSession(next);
      if (next?.user) {
        const p = await loadProfile(next.user.id);
        // Foydalanuvchi tizimga kirgan holatda bloklangan boʻlsa, sessiyani
        // shu yerda ham tugatamiz — aks holda u eski sessiya bilan cheksiz
        // ishlab yuraverardi (RPCʼlar xato qaytarsa-da, UI ochiq qolardi).
        if (p && p.is_active === false) {
          await supabase.auth.signOut();
          if (mounted.current) {
            setSession(null);
            setProfile(null);
          }
        }
      } else if (mounted.current) {
        setProfile(null);
      }
      if (mounted.current) setLoading(false);
      settled = true;
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!settled) applySession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  /*
   * Kirish — Telegram botda tanlangan LOGIN va parol bilan.
   *
   * Hisoblar ikki xil ichki emailga ega boʻlishi mumkin:
   *   - yangi (bot v2)  : `<login>@telegram.local`
   *   - eski hisoblar   : `<telefon raqami>@telegram.local`
   * Shuning uchun avval login sifatida urinamiz; muvaffaqiyatsiz boʻlsa va
   * kiritilgan matn telefonga oʻxshasa, raqam varianti bilan qayta urinamiz.
   * Bu eski foydalanuvchilarni yoʻqotmaslik uchun kerak.
   */
  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const value = identifier.trim();
      if (!value) return { error: 'Loginni kiriting.' };

      const attempt = (email: string) => supabase.auth.signInWithPassword({ email, password });

      let { data, error } = await attempt(loginToEmail(value));

      if (error && looksLikePhone(value)) {
        ({ data, error } = await attempt(phoneToLoginEmail(value)));
      }

      if (error) return { error: mapError(error.message) };

      if (data.user) {
        const p = await loadProfile(data.user.id);
        if (p && p.is_active === false) {
          await supabase.auth.signOut();
          setProfile(null);
          setSession(null);
          return { error: BLOCKED_MESSAGE };
        }
      }
      return { error: null };
    },
    [loadProfile]
  );

  /*
   * Google OAuth. Brauzer Google sahifasiga ketadi va `redirectTo` orqali
   * qaytadi; sessiyani `detectSessionInUrl` oʻzi ilib oladi va
   * `onAuthStateChange` profilni yuklaydi.
   *
   * `redirectTo` ATAYLAB faqat `origin` — aniq sahifa emas.
   *
   * Supabase qaytish manzillarini oq roʻyxat boʻyicha tekshiradi
   * (Dashboard → Authentication → URL Configuration). Bu yerga
   * `origin + pathname` yozilsa, roʻyxatga kiritilmagan HAR BIR yoʻlda
   * kirish jim ravishda ishlamay qoladi. Foydalanuvchini oʻzi turgan
   * sahifaga qaytarish uchun avval Supabase'da wildcard qoʻshish kerak —
   * bu kod oʻzgarishi emas, konfiguratsiya oʻzgarishi.
   */
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    });
    return { error: error ? mapError(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAdmin: profile?.is_admin ?? false,
      signIn,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signInWithGoogle, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
