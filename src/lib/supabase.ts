import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    /*
     * PKCE — ataylab, `implicit` emas.
     *
     * `implicit` oqimida Supabase OAuthʼdan qaytishda tokenlarni URL
     * HASHʼiga yozadi (`#access_token=…`). Bu ikki sababdan yomon:
     *   1. Token brauzer tarixida va `Referer` da qolib ketadi;
     *   2. Ilova hash-marshrutda ishlagan davrda token marshrutni
     *      butunlay yoʻq qilardi (endi marshrutlar History APIʼda,
     *      lekin 1-sabab kuchida qolmoqda).
     * PKCE esa qisqa muddatli `?code=…` parametridan foydalanadi.
     */
    flowType: 'pkce',
  },
});
