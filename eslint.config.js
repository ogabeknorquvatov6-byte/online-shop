import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /*
       * Fast Refresh bir fayldan ham komponent, ham boshqa qiymat eksport
       * qilinishini yoqtirmaydi. Barcha hook'lar, sof funksiyalar va uslub
       * konstantalari shu sabab alohida modullarga chiqarildi
       * (uiHooks, cartUtils, productUtils, adminStyles, sections, design...).
       *
       * Bitta istisno — kontekst "accessor" hook'lari (`useCart`, `useAuth` …).
       * React hujjatlarining o'zi ularni Provider bilan bir faylda saqlashni
       * tavsiya qiladi: kontekst, provider va unga kirish yo'li birga turadi.
       * Ularni sun'iy ravishda ikkiga bo'lish kodni faqat chalkashtiradi,
       * shuning uchun bu nomlar ro'yxatga olib qo'yilgan.
       */
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useAuth', 'useCart', 'useFavorites', 'useSettings', 'useToast', 'useRouter',
            /*
             * `migrateLegacyHashUrl` — React render'idan OLDIN, main.tsx da
             * bir marta chaqiriladigan boot funksiyasi. U marshrutizator
             * bilan ajralmas (eski `#/` manzillarini yangisiga o'giradi),
             * shuning uchun alohida faylga chiqarish faqat chalkashtiradi.
             */
            'migrateLegacyHashUrl',
          ],
        },
      ],
      /*
       * `any` YOQILGAN holatda ushlanadi.
       *
       * Ilgari bu qoida o'chirilgan edi va kodda 19 ta `any` to'plangandi —
       * asosan Supabase javoblarida. Ular hech qanday xatoni ushlamaydi:
       * `data.pirce` deb yozilsa ham TypeScript jim turadi va xato faqat
       * ishlab turgan saytda ko'rinadi. Hammasi haqiqiy tiplar bilan
       * almashtirildi (`adapters.ts` dagi `*Row` tiplari + `.returns<T>()`),
       * shuning uchun qoida endi YOQILDI: yangi `any` review'gacha yetmaydi.
       */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    /*
     * Supabase Edge Function'lari — DENO muhitida ishlaydi, brauzer
     * bundle'iga umuman kirmaydi va `tsconfig.app.json` ularni
     * kompilyatsiya qilmaydi (ular `deno check` bilan tekshiriladi).
     *
     * U yerdagi `any` lar asosan Telegram Bot API javoblarida. Ularni
     * tozalash alohida, mustaqil ish — frontend qat'iyligi shu sababli
     * u yerga majburan tatbiq etilmaydi, lekin ogohlantirish sifatida
     * ko'rinib turadi.
     */
    files: ['supabase/functions/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
