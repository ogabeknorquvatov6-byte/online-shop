import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
// @ts-expect-error — sof JS plugin, tip deklaratsiyasi yo'q (build-time yordamchi).
import { seoAssets } from './scripts/seo-assets.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  /*
   * `appType: 'spa'` (standart) — dev-server ham, `vite preview` ham
   * noma'lum yo'llarda `index.html` qaytaradi. Bu History API marshrutlari
   * uchun SHART: `/product/iphone-15` ni to'g'ridan-to'g'ri ochganda yoki
   * F5 bosganda server bu faylni topa olmaydi.
   *
   * PRODUKSIYADA ham xuddi shu qoida kerak. Repozitoriyda ikkala keng
   * tarqalgan platforma uchun konfiguratsiya bor:
   *   — Netlify / Cloudflare Pages → `public/_redirects`
   *   — Vercel                     → `vercel.json`
   * Nginx/Apache uchun: `try_files $uri /index.html;`
   */
  appType: 'spa',
  plugins: [react(), seoAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Bitta 580 kB lik bundle o'rniga barqaror vendor bo'laklari: kutubxonalar
    // deyarli o'zgarmaydi, shuning uchun ilova kodi yangilanganda ular
    // brauzer keshida qolib, takroriy tashriflar sezilarli tez ochiladi.
    // (Admin paneli allaqachon App.tsx da React.lazy orqali ajratilgan.)
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['motion/react'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
