// Centralized animation system (Section 36/40 of spec).
// Single source of truth for durations, easings and shared variants so every
// component in the app moves with the same "voice". Keep this file the only
// place that defines raw timing numbers.

export const EASE = {
  standard: [0.22, 1, 0.36, 1] as const, // premium "ease-out" feel
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const DURATION = {
  micro: 0.14, // button press feedback
  ui: 0.22, // small UI state changes
  drawer: 0.3, // drawers / sheets
  page: 0.2, // route/page transitions
  hero: 0.6, // hero slider
  shine: 1.1, // rasm ustidan bir marta oʻtadigan yorugʻlik
  stagger: 0.04, // per-item stagger step
};

export const springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.6 },
  soft: { type: 'spring', stiffness: 300, damping: 30, mass: 0.7 },
  drawer: { type: 'spring', stiffness: 340, damping: 34, mass: 0.8 },
};

/*
 * `useSpring()` uchun bir xil prujinalar, lekin `type` kalitisiz.
 *
 * Yuqoridagi `springs` obyektlari `transition={...}` propiga beriladi va
 * u yerda `type: 'spring'` MAJBURIY. `useSpring()` esa `SpringOptions`
 * kutadi — unda `type` maydoni umuman yoʻq va uni uzatish TypeScript
 * xatosi beradi. Qiymatlar YANGI EMAS: ular oʻsha-oʻsha `springs` dan
 * olinadi, yaʼni ikkita haqiqat manbai paydo boʻlmaydi.
 */
export const springOptions = {
  snappy: {
    stiffness: springs.snappy.stiffness,
    damping: springs.snappy.damping,
    mass: springs.snappy.mass,
  },
  soft: {
    stiffness: springs.soft.stiffness,
    damping: springs.soft.damping,
    mass: springs.soft.mass,
  },
} as const;

/*
 * ── 3D QATLAM ───────────────────────────────────────────────────────
 *
 * Kartaning barmoq/kursor ostida nozik burilishi. Qiymatlar shu yerda
 * turadi — komponent ichida "5 daraja" yoki "900px" degan sehrli raqam
 * qolmasligi kerak, aks holda har bir yangi 3D element oʻz burchagini
 * oʻylab topadi va tizim tarqoq boʻlib ketadi.
 */
export const TILT = {
  /**
   * Maksimal burilish (daraja).
   *
   * 5° — yuqori chegara. Kattaroq qiymatda kartadagi matn qiyshayib
   * oʻqilishi qiyinlashadi va "oʻyinchoq" taʼsiri paydo boʻladi;
   * kichikroqda harakat umuman sezilmaydi.
   */
  max: 5,
  /**
   * `perspective()` — 3D chuqurlik kuchi.
   *
   * Qiymat ATAYLAB katta ("uzoq kamera"). Kichik perspektiva (200–400px)
   * `CatalogCubes` dagi 7pxʼlik kub uchun toʻgʻri, lekin 200pxʼlik
   * kartani choʻzib yuboradi: yaqin qirra boʻrtib, uzoq qirra
   * torayib qoladi.
   */
  perspective: 900,
} as const;

/**
 * Sharh yulduzchasi — tanlash paytidagi javob.
 *
 * Baho berish sanoqli marta bajariladigan amal va u "bosildi" degan
 * aniq javob talab qiladi. Shuning uchun yulduzcha `tapScale` kabi
 * KICHRAYMAYDI, aksincha kattalashadi: tanlov qoʻshildi, olib
 * tashlanmadi.
 */
export const STAR = {
  /** Kursor/barmoq ostidagi va tanlangan yulduzchaning oʻlchami. */
  active: 1.18,
} as const;

/** Rasm ustidan BIR MARTA sirgʻaladigan yorugʻlik chizigʻi. */
export const SHINE = {
  duration: DURATION.shine,
  /**
   * Karta koʻringandan keyin kichik pauza.
   *
   * Kechikishsiz yorugʻlik `StaggerItem` ning kirish harakati bilan
   * bir vaqtda oʻynaydi va ikkalasi bir-birini yutib yuboradi.
   */
  delay: 0.18,
  /**
   * Yorugʻlik uchun `EASE.standard` EMAS, balki tekis tezlik.
   *
   * Tezlanish/sekinlanish nurni "toʻxtab qolgandek" koʻrsatadi: ease-out
   * bilan u rasmning oʻng yarmida sudralib qoladi (oʻlchandi — oxirgi
   * 25% masofani butun vaqtning yarmida bosib oʻtdi). Haqiqiy yorugʻlik
   * aksi yuzadan bir tekis oʻtadi. `skeleton` dagi `shimmer` ham aynan
   * shu sababdan tekis.
   */
  ease: 'linear',
} as const;

/*
 * ── Harakatning uch darajasi ────────────────────────────────────────
 *
 * Yangi raqamlar EMAS — yuqoridagi `DURATION` qiymatlariga nom berilgan
 * xolos. Maqsad: komponent yozayotganda "qancha millisekund?" degan
 * savol oʻrniga "bu qanday darajadagi harakat?" degan savol berilsin.
 * Shunda butun ilova bir xil ritmda harakatlanadi.
 *
 *   MICRO     — bosishga javob. Foydalanuvchi kutmaydi.
 *               tugma, ikonka, chip, nishoncha.
 *   COMPONENT — element holatini oʻzgartiradi.
 *               karta, drawer, dropdown, modal, karusel.
 *   STORY     — hikoya qiladi. Faqat sanoqli joyda.
 *               hero kirishi, buyurtma tasdiqlanishi, 404.
 *
 * STORY darajasi HECH QACHON foydalanuvchini kutishga majburlamaydi:
 * mazmun darhol oʻqiladigan boʻladi, animatsiya esa uning ustidan
 * oʻynaydi.
 */
export const MOTION = {
  micro: { duration: DURATION.micro, ease: EASE.standard },
  component: { duration: DURATION.drawer, ease: EASE.standard },
  story: { duration: DURATION.hero, ease: EASE.standard },
} as const;

/*
 * ── BUYURTMA TASDIGʻI ───────────────────────────────────────────────
 *
 * Ilovadagi eng katta lahza. Shu sababli bu yerdagi qiymatlar boshqa
 * hech qayerda ishlatilmaydi — ular ATAYLAB "bir martalik".
 */
export const CONFIRM = {
  /**
   * Check-belgi qaysi burchakdan aylanib keladi (daraja).
   *
   * −110° — 90° dan KATTA, yaʼni belgi avval ORQA tomoni bilan turadi
   * va aylanish davomida "ochiladi". Aynan 90° dan boshlansa, belgi
   * qirrasidan ochilib, oddiy `scaleX` ga oʻxshab qolardi.
   */
  flipFrom: -110,
  /** Sahifa oʻrnashib olsin — flip shundan keyin boshlanadi (s). */
  flipDelay: 0.12,
  /**
   * Belgi uchun "kamera" masofasi.
   *
   * `TILT.perspective` (900) dan ancha yaqin: u 200pxʼlik kartaga
   * moʻljallangan, bu yerdagi belgi esa 64px. Bir xil perspektivada
   * kichik element deyarli tekis aylanardi va 3D umuman sezilmasdi.
   */
  perspective: 520,
  /** Bosqich doirasi (24px "tanga") — undan ham yaqinroq kamera. */
  beadPerspective: 240,
} as const;

/**
 * Tasdiq lahzasida tushadigan kub zarrachalari.
 *
 * Bu KONFETI EMAS. Konfeti yuqoriga otiladi, tez va tartibsiz tarqaydi.
 * Bu yerda esa navigatsiya ikonkasidagi kubning kattaroq nusxalari
 * sekin pastga CHOʻKADI va soʻnadi — ilovaning oʻz "kub" tilida
 * gapiradigan xotirjam nishonlash.
 */
export const CUBE_FALL = {
  count: 12,
  /** Tushish masofasi (px). */
  distance: 150,
  /** Eng tez zarracha (s). */
  fastest: 2.2,
  /** Eng sekin zarracha (s) — 3 soniya "sekin choʻkish" chegarasi. */
  slowest: 3.4,
  /** Oxirgi zarracha shuncha kechroq boshlanadi (s). */
  spread: 0.55,
  /**
   * Yoʻlning qaysi ulushida toʻliq koʻrinadi va qachon soʻna boshlaydi.
   *
   * Vaqt EMAS, ULUSH: har bir zarracha oʻz davomiyligiga nisbatan
   * hisoblanadi. Shu sababli tez va sekin zarrachalar bir xil ritmda
   * paydo boʻlib, bir xil ritmda yoʻqoladi.
   */
  fadeIn: 0.14,
  fadeAt: 0.58,
} as const;

/*
 * ── AURORA: SEKIN HARAKATLANUVCHI TUMAN ─────────────────────────────
 *
 * Hero va aksiya blokidagi nur dogʻlari ilgari qimirlamas edi. Ular
 * endi juda sekin suzadi — maqsad diqqatni tortish EMAS, balki toʻq
 * yuzani "tirik" qilish.
 */
export const AURORA = {
  /**
   * Asosiy sikl (s) — gorizontal suzish.
   *
   * 13s: 12 soniyadan tez boʻlsa harakat SEZILA boshlaydi va matn
   * oʻqiyotgan odamni chalgʻitadi; 18 soniyadan sekin boʻlsa sahifada
   * bir daqiqa turgan foydalanuvchi uni umuman payqamaydi.
   */
  base: 13,
  /**
   * Vertikal va masshtab sikllarining gorizontalga nisbati.
   *
   * ATAYLAB butun son EMAS (1.32 va 0.95). Nisbat butun boʻlsa uchala
   * oʻq bir vaqtda boshlangʻich nuqtaga qaytadi va koʻz takrorlanishni
   * ilgʻab oladi — tuman "aylanayotgan lenta"ga aylanadi. Kasr nisbatda
   * esa traektoriya ochiq egri chiziq boʻlib qoladi.
   *
   * Hosil boʻladigan davomiyliklar 12–18s oraligʻida qoladi:
   *   x 13s · y 17.2s · scale 12.35s
   */
  ratioY: 1.32,
  ratioScale: 0.95,
  /** Qatlamlar orasidagi kechikish (s) — ular birga "nafas olmasin". */
  stagger: 2.4,
} as const;

/*
 * ── GYROSKOP PARALLAKSI ─────────────────────────────────────────────
 *
 * Telefon egilganda rasm ramka ichida biroz siljiydi — goʻyo ramka
 * deraza, rasm esa undan bir oz orqada turibdi.
 */
export const GYRO = {
  /**
   * Siljishning CHEGARASI (px). Talab: 6–10.
   *
   * 8px — rasm hech qachon bundan ortiq qimirlamaydi, qanchalik
   * qattiq egilmasin. Chegara qatʼiy boʻlishi SHART: aks holda
   * qurilmani agʻdarganda rasm ramkadan chiqib ketardi.
   */
  range: 8,
  /**
   * Shu burchakda (daraja) chekka qiymatga yetiladi.
   *
   * 18° — qoʻlda telefonni "oʻynatish" darajasidagi burilish.
   * Kichikroq qiymatda rasm har kichik titrashda chetga urilib
   * turardi, kattaroqda esa effekt umuman sezilmasdi.
   */
  maxDeg: 18,
  /**
   * Rasm shu qadar kattalashtiriladi.
   *
   * Parallaks rasmni ramka ichida SURADI, yaʼni chetida boʻshliq
   * ochilishi mumkin. 1.05 — 8px siljish uchun yetarli zaxira
   * (200px kenglikda 5% = 10px har tomondan).
   */
  overscan: 1.05,
} as const;

/*
 * ── KIRISH EKRANI ───────────────────────────────────────────────────
 *
 * Belgi kub-boʻlakchalardan yigʻiladi. Yigʻilish `springs.snappy` bilan
 * boradi (aynan `CatalogCubes` dagi kublar qaytadigan prujina), shuning
 * uchun bu yerdagi qiymatlar faqat NAVBATNI boshqaradi.
 */
export const SPLASH = {
  /**
   * Boʻlakchalar orasidagi qadam (s) — ular birin-ketin joyiga tushadi.
   *
   * 0.07 TANLANGAN SABAB: prujina `duration` qabul qilmaydi, yaʼni
   * yigʻilish vaqtini faqat NAVBAT orqali boshqarish mumkin. Bitta
   * boʻlakcha `springs.snappy` bilan 286ms da joyiga tushadi
   * (brauzerda oʻlchandi). 0.04 qadamda umumiy vaqt 386ms edi —
   * talab qilingan 400–600ms dan PAST. 0.07 da oxirgi boʻlakcha
   * 210ms kech boshlaydi va umumiy vaqt ~500ms boʻladi.
   */
  step: 0.07,
  /** Yozuv shundan keyin chiqadi (s). */
  wordDelay: 0.3,
  /**
   * Belgi yigʻilgach ekran shuncha turadi (s).
   *
   * Ataylab qisqa: bu ekran hech narsani KUTMAYDI — ilova uning
   * ostida allaqachon yuklanmoqda.
   */
  hold: 0.1,
  /** Soʻnish (s). */
  fade: 0.22,
} as const;

// Page transitions — faqat fade.
export const pageVariants = {
  // Chiqish (exit) yoʻq: yangi sahifa darhol mount boʻladi va faqat
  // shu yumshoq kirish oʻynaydi. Layout qayta hisoblanmaydi.
  //
  // DIQQAT: bu yerga `y` (yoki boshqa transform) QOʻSHMANG.
  //
  // Bu variantlar <App> dagi sahifani oʻrab turgan `motion.div` ga
  // beriladi. Motion transformni animatsiya tugagach ham styleʼda
  // qoldiradi, `transform` esa — hatto `translateY(0)` boʻlsa ham —
  // oʻsha divʼni ichidagi BARCHA `position: fixed` elementlar uchun
  // "containing block" ga aylantiradi. Natijada fixed elementlar
  // viewportʼga emas, shu divʼga nisbatan joylashadi.
  //
  // Amalda nima buzilgandi (oʻlchandi, 375x812):
  //   - ProductPageʼdagi yopishqoq "Savatga qoʻshish" paneli
  //     viewport tubidan 64px emas, 122px balandda turardi — panel
  //     bilan pastki navigatsiya orasida 69px sahifa mazmuni
  //     koʻrinib qolardi.
  //   - CatalogPageʼdagi filtr bottom-sheetʼining `fixed inset-0`
  //     backdropʼi butun ekranni qoplamasdi.
  //
  // 6px siljish sezilmas darajada edi; fixed panellarning toʻgʻri
  // turishi esa mobil UX uchun hal qiluvchi. Shuning uchun faqat
  // opacity qoldirildi.
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export const pageTransition = { duration: DURATION.page, ease: EASE.standard };

// Overlay (backdrop) fade for modals/drawers.
export const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// Modal pop (scale + fade), spec section 16.
export const modalVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

// Right-side drawer (desktop cart / mobile menu variants live alongside).
export const drawerRightVariants = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
};

export const drawerLeftVariants = {
  initial: { x: '-100%' },
  animate: { x: 0 },
  exit: { x: '-100%' },
};

// Bottom sheet (mobile filters, mobile cart).
export const sheetVariants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

// Stagger container for grids/lists (spec sections 8, 14, 21).
export const staggerContainer = (staggerChildren = DURATION.stagger, delayChildren = 0) => ({
  animate: { transition: { staggerChildren, delayChildren } },
});

export const fadeUpItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.ui, ease: EASE.standard } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.micro } },
};

// Dropdown / suggestion panels (search, sort) — spec sections 9, 18.
export const popVariants = {
  initial: { opacity: 0, y: -4, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.99 },
};

// Toast slide + fade (spec section 25).
export const toastVariants = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.96, transition: { duration: DURATION.micro } },
};

export const tapScale = { scale: 0.97 };

/*
 * ── JISMONIY BOSISH ─────────────────────────────────────────────────
 *
 * `tapScale` tugmani KICHRAYTIRADI — u uzoqlashayotgandek tuyuladi.
 * Haqiqiy tugma esa uzoqlashmaydi, u YUZAGA BOTADI: pastga tushadi va
 * ostidagi soya qisqaradi, chunki u yerga yaqinlashdi.
 *
 * Farq kichik, lekin sahifadagi asosiy amalda (savatga qoʻshish) aynan
 * shu narsa tugmani "haqiqiy" qiladi.
 *
 * Qaytish `springs.snappy` bilan — barmoq koʻtarilgach tugma oʻzi
 * koʻtariladi, kichik overshoot bilan. Aynan shu prujina `CatalogCubes`
 * dagi kublarni ham joyiga qaytaradi, yaʼni ilovadagi "jismoniylik"
 * hamma joyda bir xil his qilinadi.
 */
export const PRESS = {
  /** Necha piksel pastga tushadi. */
  depth: 2,
  /** Bir vaqtda arzimas darajada siqiladi — barmoq ostidagi materialdek. */
  scale: 0.985,
  /** Soya shunchaga toraydi (yer yaqinlashdi). */
  shadowScale: 0.8,
  /** Bosilgan holatdagi soya koʻrinishi. */
  shadowOpacity: 0.45,
} as const;
