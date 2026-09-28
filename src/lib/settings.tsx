import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Settings } from './types';

type SettingsContextValue = {
  settings: Settings | null;
  loading: boolean;
  /** So'rov muvaffaqiyatsiz tugagan bo'lsa true (UI zaxira qiymatlarga o'tadi). */
  error: boolean;
  refresh: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/*
 * Aniq ustunlar — `select('*')` EMAS. `types.ts` dagi `Settings` shakli
 * bilan bir xil. Do'kon sozlamalariga kelajakda ichki maydon qo'shilsa
 * (masalan hisob raqami yoki API kaliti), `*` uni jimgina HAR BIR
 * mijozning brauzeriga yuborardi — sozlamalar ommaviy o'qiladigan jadval.
 */
/*
 * BITTA QATORDA — `+` bilan BIRLASHTIRILMAYDI.
 *
 * supabase-js natija turini `select()` ga berilgan LITERAL satrdan
 * chiqaradi (template literal type). Ikki bo'lakni `+` bilan qo'shsak,
 * tur oddiy `string` ga aylanadi va inference buziladi:
 *
 *     TS2352: Conversion of type 'GenericStringError | null' to type
 *             'Settings' may be a mistake…
 *
 * Ya'ni uzunligi uchun qatorni bo'lish tur xavfsizligini yo'qotadi.
 */
const SETTINGS_SELECT = 'id, store_name, logo_url, phone, email, address, delivery_fee_tashkent, delivery_fee_republic, free_delivery_threshold, instagram_url, telegram_url, facebook_url, youtube_url, updated_at';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    // Ilgari xatolik bo'lsa `loading` abadiy `true` bo'lib qolardi va
    // sozlamalarga bog'liq bloklar (footer kontaktlari, yetkazib berish
    // narxi) hech qachon ko'rinmasdi. Endi xato aniq belgilanadi va
    // chaqiruvchi zaxira qiymatlarga o'tadi.
    const { data, error: err } = await supabase
      .from('store_settings')
      .select(SETTINGS_SELECT)
      .eq('id', true)
      .maybeSingle();
    setError(!!err);
    if (!err) setSettings((data as Settings) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
