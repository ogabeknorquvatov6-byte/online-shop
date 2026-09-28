/** @type {import('tailwindcss').Config} */

/*
 * Design system tokens (single source of truth for the visual language).
 *
 * Principles the rest of the UI is built on:
 *  - ONE brand hue (warm orange) used sparingly, for actions and state only.
 *  - A slightly warm neutral ramp so large white surfaces don't read as clinical.
 *  - A restrained radius scale: controls 8px, cards 12px, large surfaces 16px.
 *    Nothing is a pill except badges/chips.
 *  - Two elevations total. Cards rest flat with a hairline border and only
 *    lift on hover; overlays get the single heavier shadow.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /*
       * `tab` (820px) — PLANSHET uchun alohida chegara.
       *
       * Ilova uzoq vaqt ikki qatlamdan iborat edi: mobil (`<lg`) va
       * desktop (`lg+`). Natijada 768–1023px oralig'idagi barcha
       * planshetlar "katta telefon" sifatida ko'rinardi: pastda mobil
       * navigatsiya, headerda esa savat/sevimlilar tugmalari umuman yo'q.
       *
       * 820px tanlandi, chunki aynan shu kenglikdan boshlab header
       * bir vaqtning o'zida logotip, qidiruv VA uchta amal tugmasini
       * siqilmasdan sig'dira oladi. 768px (iPad portret) uchun bu hali
       * tor — u mobil kompozitsiyada qoladi.
       *
       * MUHIM: `tab` faqat NAVIGATSIYA va KOMPOZITSIYA chegarasi.
       * Teginish nishonlari (44px) va hover'ga bog'liq bo'lgan hamma
       * narsa avvalgidek `lg` da qoladi — planshet sensorli qurilma va
       * u yerda barmoq o'lchami o'zgarmaydi.
       */
      screens: {
        tab: '820px',
      },
      colors: {
        // Brand — used for primary actions, active state and price accents.
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6100',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // The whole app already speaks in `orange-*`; we redefine that ramp to
        // the brand ramp instead of sprinkling a second, competing palette
        // through the codebase. `brand-*`, `primary-*` and `orange-*` are one
        // and the same colour — there is only ever one brand hue on screen.
        orange: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6100',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6100',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Warm-tinted neutrals. Subtle, but it is what stops the UI reading
        // like an untouched Tailwind template. As with `orange` above we also
        // redefine `gray` to the same ramp, so the hundreds of existing
        // `gray-*` utilities pick up the warmer neutrals instead of leaving
        // two competing greys on screen.
        gray: {
          50: '#f8f8f7',
          100: '#f1f1ef',
          200: '#e6e5e2',
          300: '#d3d1cd',
          400: '#a3a09a',
          500: '#78756e',
          600: '#57544e',
          700: '#403e39',
          800: '#292825',
          900: '#181716',
          950: '#0e0e0d',
        },
        ink: {
          50: '#f8f8f7',
          100: '#f1f1ef',
          200: '#e6e5e2',
          300: '#d3d1cd',
          400: '#a3a09a',
          500: '#78756e',
          600: '#57544e',
          700: '#403e39',
          800: '#292825',
          900: '#181716',
        },
      },
      borderRadius: {
        // control = buttons/inputs/chips, card = product & content cards,
        // surface = drawers, sheets, hero.
        control: '0.5rem',
        card: '0.75rem',
        surface: '1rem',
      },
      boxShadow: {
        // Exactly two elevations, plus a focus ring token.
        card: '0 1px 2px 0 rgb(24 23 22 / 0.04), 0 4px 16px -6px rgb(24 23 22 / 0.10)',
        overlay: '0 8px 40px -12px rgb(24 23 22 / 0.28)',
        /*
         * `glass` — ELEVATSIYA EMAS, uchinchi daraja ham emas.
         *
         * Yuqoridagi ikkitasi elementni sahifadan KO'TARADI. Bu esa
         * butunlay ichkariga qaraydi: tepada ingichka oq yorug'lik,
         * pastda ingichka qorong'ulik. Natijada yuza qog'ozdan emas,
         * yupqa shishadan kesilgandek ko'rinadi — u hech qayerga
         * ko'tarilmaydi, shunchaki o'z qirrasi borligini bildiradi.
         *
         * Shu sababli u "ikkita elevatsiya" qoidasini buzmaydi:
         * `glass` ni `card` yoki `overlay` bilan birga ishlatish ham
         * mumkin, chunki ular boshqa savolga javob beradi.
         */
        glass:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.7), inset 0 -1px 0 0 rgb(24 23 22 / 0.05)',
        /*
         * `brand` — BREND RANGIDAGI NUR, neytral soya emas.
         *
         * `card` va `overlay` qora soyalar: ular elementni yuzadan
         * ko'taradi. Bu esa to'q sariq va u boshqa narsani aytadi —
         * element O'ZI yorug'lik tarqatayotgandek, ya'ni "muhrlangan"
         * bo'lib ko'rinadi. Chegirma nishoni uchun aynan shu kerak:
         * u ma'lumot emas, E'LON.
         *
         * Qiymat `SpotlightCard` dan olindi — u yerda allaqachon
         * qo'lda yozilgan edi va aynan shu ko'rinish to'g'ri deb
         * tanlangandi. Endi u uchala chegirma nishoni uchun ham
         * bitta joyda turadi.
         */
        brand: '0 4px 14px -4px rgb(234 97 0 / 0.9)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // Display sizes for section headings / hero, with baked-in tracking.
        'display-sm': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-lg': ['2.75rem', { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      maxWidth: {
        shell: '1440px',
      },
      spacing: {
        // Several components already used `h-4.5` / `w-4.5`, which silently
        // did nothing because 4.5 is not on Tailwind's default scale. It is a
        // genuinely useful icon size between 16px and 20px, so we define it.
        4.5: '1.125rem',
        5.5: '1.375rem',
      },
      transitionTimingFunction: {
        // Matches EASE.standard in src/lib/motion.ts so CSS and Motion agree.
        standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        /*
         * Atrof-muhit ("ambient") harakatlari — 404 sahifasidagi halqa va
         * suzuvchi paket.
         *
         * Nega CSS, Motion emas?
         *  1. Bular cheksiz sekin sikllar. CSS animatsiyasi kompozitor
         *     oqimida ishlaydi, JS esa hech qanday kadr hisoblamaydi —
         *     24 soniyalik aylanish uchun JS ortiqcha.
         *  2. `prefers-reduced-motion` ni `index.css` dagi global blok
         *     allaqachon hal qiladi (barcha animatsiya davomiyligini
         *     0.01ms ga tushiradi). Ya'ni shartni komponentda takrorlash
         *     kerak emas va uni "unutib qo'yish" ham mumkin emas.
         */
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        /*
         * Hero banner uchun juda sekin "tirik kadr".
         *
         * Amplituda ataylab kichik (4%): maqsad — rasm butunlay
         * qotib qolmasin, lekin harakat sezilmasin. Bu scroll'ga
         * bog'lanmagan, shuning uchun scroll hodisalari va layout
         * hisob-kitoblari umuman yo'q — faqat bitta `transform`.
         */
        'hero-drift': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'hero-drift': 'hero-drift 24s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
