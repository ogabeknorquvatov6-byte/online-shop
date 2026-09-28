import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Settings } from './types';

type SettingsContextValue = {
  settings: Settings | null;
  loading: boolean;
  /** Soʻrov muvaffaqiyatsiz tugagan boʻlsa true (UI zaxira qiymatlarga oʻtadi). */
  error: boolean;
  refresh: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/*
 * Aniq ustunlar — `select('*')` EMAS. `types.ts` dagi `Settings` shakli
 * bilan bir xil. Doʻkon sozlamalariga kelajakda ichki maydon qoʻshilsa
 * (masalan hisob raqami yoki API kaliti), `*` uni jimgina HAR BIR
 * mijozning brauzeriga yuborardi — sozlamalar ommaviy oʻqiladigan jadval.
 */
/*
 * BITTA QATORDA — `+` bilan BIRLASHTIRILMAYDI.
 *
 * supabase-js natija turini `select()` ga berilgan LITERAL satrdan
 * chiqaradi (template literal type). Ikki boʻlakni `+` bilan qoʻshsak,
 * tur oddiy `string` ga aylanadi va inference buziladi:
 *
 *     TS2352: Conversion of type 'GenericStringError | null' to type
 *             'Settings' may be a mistake…
 *
 * Yaʼni uzunligi uchun qatorni boʻlish tur xavfsizligini yoʻqotadi.
 */
const SETTINGS_SELECT = 'id, store_name, logo_url, phone, email, address, delivery_fee_tashkent, delivery_fee_republic, free_delivery_threshold, instagram_url, telegram_url, facebook_url, youtube_url, updated_at';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    // Ilgari xatolik boʻlsa `loading` abadiy `true` boʻlib qolardi va
    // sozlamalarga bogʻliq bloklar (footer kontaktlari, yetkazib berish
    // narxi) hech qachon koʻrinmasdi. Endi xato aniq belgilanadi va
    // chaqiruvchi zaxira qiymatlarga oʻtadi.
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
