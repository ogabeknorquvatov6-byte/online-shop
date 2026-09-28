/*
 * Shared class recipes for the design system.
 *
 * The app previously hand-wrote button/input/card classes at every call site,
 * which is why heights, radii and focus states drifted between screens. These
 * recipes are the single source of truth — if a control looks wrong, it gets
 * fixed here once.
 *
 * Kept deliberately as plain strings (no `cva`, no `clsx` dependency): the
 * project has no class-variance library and doesn't need one.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Focus ───────────────────────────────────────────────────────────────
 * Every interactive element gets the same visible keyboard ring. We use
 * `focus-visible` so mouse users don't see it, but keyboard users always do.
 */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export const focusRingInset =
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500';

/* ── Buttons ─────────────────────────────────────────────────────────────
 * Three sizes, four intents. Height is fixed per size so a row of buttons
 * always lines up, and every size clears the 44px touch target on mobile
 * except `sm`, which is only used inside dense desktop tables.
 */
const buttonBase =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold ' +
  'transition-colors duration-150 disabled:cursor-not-allowed ' +
  focusRing;

export const buttonSize = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[0.9375rem]',
  /*
   * Mahsulot kartasidagi asosiy amal ("Savatga").
   *
   * Mobilda va planshetda 44px — barmoq uchun minimal qulay balandlik;
   * desktopda 36px, shunda karta ixcham qoladi.
   *
   * Chegara ATAYLAB `xl` (1280px).
   *
   * Avval `sm` (640px) edi — oʻshanda barcha planshetlar 36px tugma
   * olardi. Keyin `lg` (1024px) — lekin 1024px hamon sensorli qurilma
   * (iPad Pro landscape). Endi `xl`: barmoq oʻlchamiga bogʻliq boʻlgan
   * hamma narsa planshetlarning butun diapazonini qamrab oladi.
   *
   * DIQQAT: bu NAVIGATSIYA chegarasidan farq qiladi. Navigatsiya `tab`
   * (820px) da desktop koʻrinishiga oʻtadi, teginish nishonlari esa
   * `xl` gacha 44px boʻlib qoladi. Ikkalasi turli savolga javob beradi:
   * "ekran keng-mi?" va "barmoq bilan bosiladimi?".
   *
   * Nega alohida oʻlcham, `button('sm', 'h-11 sm:h-9')` emas?
   * Chunki u holda class roʻyxatida `h-9` ham, `h-11` ham boʻlardi.
   * Ikkalasi ham bitta utility, spetsifikatsiyasi teng — gʻolibi
   * CSSʼdagi tartibga bogʻliq boʻlib qolardi (tekshirildi: `h-9`
   * yutdi va tugma 36px boʻlib qolgandi). Bitta qatorda yozilsa
   * bunday toʻqnashuv umuman boʻlmaydi.
   */
  card: 'h-11 px-3 text-sm xl:h-9',
} as const;

export const buttonVariant = {
  /*
   * ── OQ MATN OSTIDA DOIM `orange-700` ──────────────────────────
   *
   * Ilgari bu yerda `bg-orange-600` (#EA6100) turardi. Oq matn bilan
   * uning kontrasti — 3.4:1 (hisoblandi, WCAG formulasi boʻyicha).
   * Kichik matn uchun AA 4.5:1 talab qiladi, yaʼni ilovaning ENG
   * MUHIM tugmasidagi yozuv standartdan oʻtmasdi. Quyoshli kunda
   * telefon ekranida bu nazariy muammo emas.
   *
   * `orange-700` (#c2410c) bilan kontrast 5.2:1 — AA dan oʻtadi va
   * AAA (7:1) ga ham yaqinlashadi.
   *
   * `orange-600` YOʻQ BOʻLIB KETMAYDI: u matnsiz yuzalarda qoladi —
   * logo, toʻldirilgan yurakcha, navigatsiya nuri, tanlangan chegara,
   * aurora nuri. Yaʼni brend rangi ekranda oʻsha-oʻsha, faqat ustida
   * OʻQILADIGAN NARSA boʻlganda bir pogʻona toʻqlashadi.
   *
   * Bu tuzatish ATAYLAB IKKI JOYDA: shu yerda va `discountBadge()` da.
   * Uchinchi joy yoʻq — qolgan hamma narsa shu ikkisini chaqiradi.
   */
  primary:
    'bg-orange-700 text-white hover:bg-orange-800 active:bg-orange-900 disabled:bg-ink-200 disabled:text-ink-400',
  secondary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-black disabled:bg-ink-200 disabled:text-ink-400',
  outline:
    'border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-ink-200',
  /*
   * TASDIQ HOLATI — "Savatda", "Qoʻshildi".
   *
   * Nega alohida variant, `button('primary', …, 'bg-emerald-600')` emas?
   *
   * Chunki oʻsha yozuv ISHLAMAYDI va bu OʻLCHANDI. `primary` allaqachon
   * oʻz fonini beradi; qoʻshimcha `bg-emerald-*` bilan class roʻyxatida
   * IKKALA utility ham turadi. Ularning spetsifikatsiyasi teng, demak
   * gʻolib class tartibi bilan emas, CSS FAYLIDAGI tartib bilan
   * aniqlanadi. Tailwind chiqargan faylda yashil to'q sariqdan OLDIN
   * turadi — yaʼni har doim toʻq sariq yutadi.
   *
   * Natijada ilovadagi toʻrtta "savatga qoʻshildi" tasdigʻi ham
   * yashil emas, toʻq sariq boʻlib chiqardi: foydalanuvchi uchun
   * tugma bosilganidan keyin RANG UMUMAN oʻzgarmasdi, faqat matn
   * almashardi (brauzerda oʻlchandi: `rgb(234, 97, 0)`).
   *
   * Bitta variantda esa toʻqnashuv umuman boʻlmaydi.
   *
   * `hover` ATAYLAB oʻzgarmaydi: bu holat bir necha soniyada oʻzidan
   * oʻtadi va uni qayta bosishga chorlash notoʻgʻri signal.
   *
   * (Ayni tabiatdagi toʻqnashuv `buttonSize.card` izohida ham
   * tasvirlangan — u yerda `h-9` va `h-11` shu tarzda urishgandi.)
   *
   * FON `emerald-700`, `emerald-600` EMAS — AYNI sabab `primary` da.
   * Oʻlchandi: oq matn `emerald-600` (#059669) ustida 3.8:1, yaʼni u
   * ham AA dan oʻtmasdi; `emerald-700` (#047857) bilan 5.5:1. Brif
   * kontrast qoidasini toʻq sariq uchun yozgan, lekin nuqson bir xil:
   * tasdiq tugmasi — foydalanuvchi bosgandan keyin OʻQIYDIGAN yagona
   * narsa.
   */
  success: 'bg-emerald-700 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-ink-200',
} as const;

export function button(
  variant: keyof typeof buttonVariant = 'primary',
  size: keyof typeof buttonSize = 'md',
  extra?: string
): string {
  return cx(buttonBase, buttonSize[size], buttonVariant[variant], extra);
}

/** Square icon-only button. Sized to stay a comfortable touch target. */
export function iconButton(size: 'sm' | 'md' = 'md', extra?: string): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-control text-ink-500 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900',
    size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
    focusRing,
    extra
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────────
 * One height (44px) so labels, inputs and buttons align in any grid.
 */
export const inputBase =
  'h-11 w-full rounded-control border bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 ' +
  'transition-colors duration-150 outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-ink-50 disabled:text-ink-400';

export const inputIdle = 'border-ink-200 focus:border-orange-500 focus:ring-orange-500/20';
export const inputInvalid = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

export function input(invalid?: boolean, extra?: string): string {
  return cx(inputBase, invalid ? inputInvalid : inputIdle, extra);
}

export function textarea(invalid?: boolean, extra?: string): string {
  return cx(
    'w-full resize-none rounded-control border bg-white px-3.5 py-3 text-sm text-ink-900 placeholder:text-ink-400',
    'transition-colors duration-150 outline-none focus:ring-2 disabled:bg-ink-50',
    invalid ? inputInvalid : inputIdle,
    extra
  );
}

export const selectBase = cx(
  'h-11 cursor-pointer appearance-none rounded-control border border-ink-200 bg-white pl-3.5 pr-9 text-sm text-ink-800',
  'transition-colors duration-150 hover:border-ink-300 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20',
  // Chevron drawn with a background image so the control matches our inputs
  // instead of falling back to the OS select widget.
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2378756e' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:16px_16px] bg-[right_0.75rem_center] bg-no-repeat"
);

export const checkboxBase =
  'h-4.5 w-4.5 shrink-0 cursor-pointer rounded border-ink-300 text-orange-600 focus:ring-orange-500 focus:ring-offset-0';

/* ── Surfaces ────────────────────────────────────────────────────────────
 * Cards rest flat with a hairline border. Only interactive cards lift.
 */
export const card = 'rounded-card border border-ink-200 bg-white';
export const cardInteractive = cx(
  card,
  'transition-[border-color,box-shadow,transform] duration-200 ease-standard hover:border-ink-300 hover:shadow-card'
);
export const panel = 'rounded-surface border border-ink-200 bg-white';

/** Dropdown / popover / suggestion paneli — yagona elevatsiya. */
export const popSurface = 'rounded-card border border-ink-200 bg-white shadow-overlay';

/* ── Shisha yuza ─────────────────────────────────────────────────────────
 * Sahifadagi ENG MUHIM raqam uchun (mahsulot narxi). Oddiy `card` dan
 * farqi — u toʻldirilgan quti emas, yupqa shisha boʻlak: foni yarim
 * shaffof, qirrasi esa `shadow-glass` bilan koʻrsatiladi (tepada oq
 * yorugʻlik, pastda ingichka qorongʻulik).
 *
 * `backdrop-blur` ATAYLAB YOʻQ.
 *
 * "Shisha" deganda birinchi boʻlib oʻsha esga keladi, lekin bu yerda u
 * hech narsa qilmaydi: panel oq sahifa ustida turadi va orqasida
 * blurlanadigan hech narsa yoʻq. Foydasi nolga teng, narxi esa —
 * qoʻshimcha kompozitsiya qatlami va har scrollʼda qayta hisoblash.
 * Shaffoflik `/60` alfadan, chuqurlik esa ichki soyadan keladi.
 */
export const glassTone = {
  neutral: 'border-ink-200/80 bg-ink-50/60',
  /** Chegirma bor — panel brend rangiga boʻyaladi. */
  brand: 'border-orange-200/90 bg-orange-50/55',
} as const;

export function glassPanel(tone: keyof typeof glassTone = 'neutral', extra?: string): string {
  return cx('rounded-card border shadow-glass', glassTone[tone], extra);
}

/* ── Badges & chips ──────────────────────────────────────────────────────*/
export const badge =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5';

export const badgeTone = {
  brand: 'bg-orange-50 text-orange-700',
  neutral: 'bg-ink-100 text-ink-600',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-700',
} as const;

/* ── Sanoq nishonchasi ───────────────────────────────────────────────────
 * "Savatda 3 ta", "Sevimlilar 5", "Filtr (2)" — bitta maʼno, ilovada
 * BESH joyda: header savat, header sevimlilar, pastki navigatsiya, mobil
 * menyu qatori va katalogdagi filtr tugmasi.
 *
 * Beshtasi ham qoʻlda yozilgan edi va uchta narsada ajralib ketgandi:
 * oʻlcham (16 yoki 20px), matn (10 yoki 11px) va eng muhimi — foni
 * `orange-600` boʻlib, ustidagi oq raqam 3.4:1 kontrast berardi. Yaʼni
 * savatdagi mahsulot soni — foydalanuvchi eng koʻp qaraydigan raqam —
 * AA dan oʻtmasdi.
 *
 * Endi bitta joyda: fon `orange-700` (5.2:1) va matn 12px — tipografiya
 * shkalasining eng kichik qadami. 10px shkalada umuman yoʻq edi.
 *
 * `tabular-nums` SHART: 1 → 2 → 3 almashganda nishoncha kengligi
 * sakramasligi kerak, aks holda yonidagi ikonka har qoʻshishda joyidan
 * qimirlab turardi.
 *
 * Oʻlcham 18px — 12px matn uchun minimal qulay balandlik. Nishoncha
 * bosilmaydi (u har doim bosiladigan ikonka yoki qator ICHIDA turadi),
 * shuning uchun 44px qoidasi bu yerga tegishli emas.
 */
const countBadgeBase =
  'flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-700 ' +
  'px-1 text-xs font-bold leading-none text-white tabular-nums';

export const countBadge = {
  /**
   * Ikonka ustida "osilgan" nishoncha (header savat/sevimlilar, pastki nav).
   * Oq halqa — nishoncha ikonka chizigʻiga qoʻshilib ketmasligi uchun.
   * Joylashuvi (`right`/`top`) chaqiruv joyida qoladi: uchala ikonkada
   * u har xil, chunki ikonka oʻlchamlari ham har xil.
   */
  overlay: cx(countBadgeBase, 'absolute z-10 ring-2 ring-white'),
  /** Matn yonida, qator ichida (mobil menyu, filtr tugmasi). */
  inline: cx(countBadgeBase, 'shrink-0 px-1.5'),
} as const;

/* ── Chegirma nishoni ────────────────────────────────────────────────────
 * `−N%` uchta joyda chiziladi: kartochka gridʼida, Spotlightʼda va
 * mahsulot sahifasidagi galereyada. Uchalasi ham bir xil MAʼLUMOT, lekin
 * uch xil vaznda yozilgan edi: ikkitasi tekis va soyasiz, uchinchisi esa
 * qoʻlda yozilgan brend nuri bilan "muhrdek" chiqib turardi. Natijada
 * bitta chegirma qayerda koʻrinishiga qarab turlicha jiddiy tuyulardi.
 *
 * Endi koʻrinish bitta joyda. FARQ FAQAT OʻLCHAMDA qoladi va u haqiqiy:
 * grid kartochkasi 200px, Spotlight va mahsulot sahifasi esa ikki-uch
 * barobar kattaroq — ularda 11px nishon yoʻqolib ketardi.
 *
 * `sm` geometriyasi yonidagi "Yangi" nishonchasi bilan AYNAN bir xil
 * (`px-1.5 py-0.5 text-[11px] leading-5`): ular kartochkada bitta
 * ustunda, birin-ketin turadi va oʻlchami farq qilsa qatorlar
 * tekislanmay qolardi.
 */
export const discountBadgeSize = {
  /*
   * 12px — tipografiya shkalasining eng kichik qadami. Ilgari 11px edi,
   * yaʼni shkalada umuman yoʻq qiymat: nishon yonidagi "Yangi" belgisi
   * ham, kartochkadagi qolgan mayda matn ham 12px ga oʻtgach, u yolgʻiz
   * bir piksel kichik boʻlib qolardi.
   */
  sm: 'px-1.5 py-0.5 text-xs leading-5',
  md: 'px-2 py-1 text-xs',
} as const;

export function discountBadge(
  size: keyof typeof discountBadgeSize = 'md',
  extra?: string
): string {
  return cx(
    // Fon `orange-700`, `orange-600` EMAS — sabab `buttonVariant.primary`
    // izohida: ustida oq matn bor, demak 4.5:1 talabi amal qiladi.
    // `shadow-brand` esa `orange-600` nuri boʻlib qoladi: u matn ostida
    // emas, nishon ATROFIDA va kontrastga taʼsir qilmaydi — yaʼni
    // nishonning "muhrlangan" koʻrinishi saqlanadi.
    'inline-flex items-center rounded-md bg-orange-700 font-bold text-white shadow-brand',
    discountBadgeSize[size],
    extra
  );
}

export function chip(active?: boolean, extra?: string): string {
  return cx(
    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors duration-150',
    active
      ? 'border-orange-300 bg-orange-50 text-orange-700'
      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
    focusRing,
    extra
  );
}

/* ── Layout ──────────────────────────────────────────────────────────────
 * One shell width and one horizontal rhythm for every page, so screens stop
 * disagreeing about their gutters.
 */
export const shell = 'mx-auto w-full max-w-shell px-4 sm:px-5 lg:px-8';

/** Vertical space between major page sections. */
export const sectionGap = 'mt-10 md:mt-14';

/* ── Skeleton ────────────────────────────────────────────────────────────
 * A moving sheen reads as "loading" far better than a pulsing block, and it
 * is a single composited transform so it costs nothing.
 */
export const skeleton =
  'relative overflow-hidden bg-ink-100 ' +
  'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer ' +
  'before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent ' +
  'motion-reduce:before:hidden';
