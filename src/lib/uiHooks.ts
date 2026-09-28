import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { GYRO, springOptions } from './motion';

/*
 * UI hook'lari.
 *
 * Bular ilgari `AnimatedPrimitives.tsx` va `CartDrawer.tsx` ichida —
 * ya'ni komponentlar bilan bir faylda — turardi. Vite'ning Fast Refresh
 * mexanizmi bitta fayldan ham komponent, ham komponent bo'lmagan qiymat
 * eksport qilinsa modul holatini saqlab qola olmaydi (va ESLint buni
 * `react-refresh/only-export-components` bilan ogohlantiradi). Hook'lar
 * mustaqil, komponentga bog'liq bo'lmagan mantiq — shuning uchun ular
 * o'z modulida turishi to'g'riroq.
 */

/** True below `breakpoint` px, kept in sync with viewport resizes. */
export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

/**
 * Kuzatilayotgan element ekranda ko'rinib turibdimi?
 *
 * Yopishqoq (sticky) CTA panellari uchun: asosiy tugma ko'rinib turganda
 * pastdagi takror panelni ko'rsatishning ma'nosi yo'q — ekranda bir vaqtda
 * ikkita bir xil tugma turadi. `IntersectionObserver` scroll hodisalaridan
 * farqli o'laroq asosiy oqimda hisob-kitob qilmaydi, shuning uchun u
 * o'rta darajali telefonda ham arzon.
 *
 * Boshlang'ich qiymat `true` — element hali o'lchanmagan bo'lsa panel
 * KO'RSATILMAYDI, ya'ni sahifa ochilishida panel "chaqnab" o'tmaydi.
 */
export function useIsVisible<T extends Element>(options?: IntersectionObserverInit) {
  /*
   * Element ODDIY `useRef` orqali emas, CALLBACK REF orqali olinadi.
   *
   * Sabab: kuzatilayotgan element ko'pincha birinchi renderda mavjud
   * emas — masalan `ProductPage` yuklanayotganda skeleton qaytaradi va
   * tugma keyinroq paydo bo'ladi. `useRef` bilan `useEffect` faqat bir
   * marta (mount'da) ishlaydi, o'shanda `ref.current` hali `null`
   * bo'ladi va kuzatuvchi HECH QACHON ulanmaydi — natijada holat
   * boshlang'ich qiymatida qotib qoladi.
   *
   * Callback ref esa element DOM'ga qo'shilgan aniq paytda chaqiriladi,
   * `node` holati o'zgaradi va effekt qayta ishga tushadi.
   */
  const [node, setNode] = useState<T | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      options
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `options` obyekti har renderda yangi bo'lishi mumkin — kuzatuvchini
    // qayta yaratmaslik uchun uni bog'liqlikka qo'shmaymiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
  return [setNode, visible] as const;
}

/** Closes on Escape key while `active` is true. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

/** Locks body scroll while `active` is true (modals/drawers). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/**
 * Moves keyboard focus into a dialog/drawer panel when it opens, and returns
 * it to the element that had focus beforehand when it closes. Screen reader
 * and keyboard users otherwise stay "outside" the dialog with no indication
 * it opened.
 */
/*
 * `active` — dialog HALI MANTIQAN ochiqmi.
 *
 * Bu "DOM'da bormi" degani EMAS. Chiqish animatsiyasi davomida element
 * hamon DOM'da turadi, lekin u endi ochiq dialog emas: fokus darhol
 * chaqirgan tugmaga qaytishi kerak, animatsiya tugashini kutmasdan.
 */
export function useFocusOnOpen<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active]);
  return ref;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Tab bilan yurishni dialog ichida ushlab turadi.
 *
 * Fokus tuzoq'isiz klaviatura foydalanuvchisi modal ochiq turgani holda
 * uning ORQASIDAGI sahifa elementlariga o'tib ketadi va u yerda nima
 * bo'layotganini ko'ra olmaydi (WCAG 2.4.3 / 2.1.2).
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  // Chiqish animatsiyasi paytida tuzoq DARHOL bo'shatiladi — aks holda
  // Tab bosgan foydalanuvchi ko'zdan yo'qolayotgan panel ichida qamalib
  // qolardi.
  active = true
) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;

      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        // Fokuslanadigan element bo'lmasa, fokus panelning o'zida qolsin.
        e.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      // `focused` — ATAYLAB `active` emas: tashqaridagi `active` parametri
      // (dialog ochiqmi) bilan nom to'qnashuvi bo'lardi.
      const focused = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (focused === first || focused === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && focused === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);
}

/*
 * ── GYROSKOP PARALLAKSI ─────────────────────────────────────────────
 *
 * Telefon egilganda rasm ramka ichida ±`GYRO.range` px siljiydi.
 * Ramka qimirlamaydi — shuning uchun u derazaga, rasm esa undan bir
 * oz orqada turgan narsaga o'xshaydi.
 *
 * ── NEGA "NOL NUQTA" BIRINCHI O'QISHDAN OLINADI ───────────────────
 *
 * `beta` (oldinga-orqaga egilish) mutlaq qiymat: telefon stolda yotsa
 * 0°, qo'lda o'qish holatida esa ~45°. Agar 0° ni markaz deb olsak,
 * oddiy o'qish holatida rasm DOIM chekkaga urilib turardi va
 * parallaks umuman ishlamayotgandek tuyulardi.
 *
 * Shuning uchun BIRINCHI o'qish "nol" deb belgilanadi va keyingi
 * hammasi undan FARQ sifatida hisoblanadi. Foydalanuvchi telefonni
 * qanday ushlab turgan bo'lsa — o'sha holat markaz.
 *
 * ── RUXSAT ────────────────────────────────────────────────────────
 *
 * iOS 13+ da `DeviceOrientationEvent.requestPermission()` MAJBURIY va
 * u faqat foydalanuvchi harakatidan chaqirilishi mumkin. Shu sababli
 * hook `enable` qaytaradi: uni AYNAN parallaks qo'llanadigan
 * elementning `onTouchEnd` iga bog'lash kerak — shunda tizim oynasi
 * kutilmaganda emas, foydalanuvchi o'sha rasmga tekkanda chiqadi.
 *
 * Ruxsat berilmasa, API bo'lmasa yoki xato chiqsa — hook JIM qoladi:
 * qiymatlar 0 da turadi, konsolga hech narsa yozilmaydi, hech qanday
 * xato tashlanmaydi. Rasm shunchaki qimirlamaydi.
 */

/** iOS 13+ da qo'shilgan, standart tiplarda yo'q. */
type PermissionCapable = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

export function useGyroParallax() {
  const reduce = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  /*
   * Prujina — gyroskop signali "shovqinli": qo'l titraydi va xom
   * qiymatlar har kadrda sakraydi. `soft` uni yumshatadi, natijada
   * rasm suzadi, titramaydi.
   */
  const x = useSpring(rawX, springOptions.soft);
  const y = useSpring(rawY, springOptions.soft);

  /* Birinchi o'qish — markaz. `null` = hali o'lchanmagan. */
  const origin = useRef<{ beta: number; gamma: number } | null>(null);
  const listening = useRef(false);
  /*
   * Tinglovchini o'chirish funksiyasi.
   *
   * Ref'da saqlanadi, chunki tinglash IKKI xil yo'ldan boshlanishi
   * mumkin (darhol yoki `enable` orqali, ancha keyin), tozalash esa
   * bitta joyda — unmount'da — bo'lishi kerak.
   */
  const cleanup = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    if (listening.current || reduce) return;
    listening.current = true;

    const onOrient = (e: DeviceOrientationEvent) => {
      // Qurilmada gyroskop bo'lmasa qiymatlar `null` keladi.
      if (e.beta == null || e.gamma == null) return;
      if (!origin.current) {
        origin.current = { beta: e.beta, gamma: e.gamma };
        return;
      }
      const clamp = (v: number) => Math.max(-1, Math.min(1, v / GYRO.maxDeg));
      // `gamma` — chapga/o'ngga egilish → gorizontal siljish.
      // `beta`  — oldinga/orqaga  → vertikal.
      rawX.set(clamp(e.gamma - origin.current.gamma) * GYRO.range);
      rawY.set(clamp(e.beta - origin.current.beta) * GYRO.range);
    };

    window.addEventListener('deviceorientation', onOrient);
    cleanup.current = () => {
      window.removeEventListener('deviceorientation', onOrient);
      listening.current = false;
    };
  }, [reduce, rawX, rawY]);

  /*
   * Ruxsat TALAB QILINMAYDIGAN qurilmalarda (Android, ba'zi
   * brauzerlar) darhol boshlanadi — foydalanuvchi hech narsa
   * qilishi shart emas. iOS esa `enable` ni kutadi.
   */
  useEffect(() => {
    if (reduce || typeof window === 'undefined') return;
    const DOE = (window as { DeviceOrientationEvent?: PermissionCapable }).DeviceOrientationEvent;
    if (!DOE) return; // API umuman yo'q — jim qolamiz
    if (typeof DOE.requestPermission !== 'function') start();
    return () => cleanup.current?.();
  }, [reduce, start]);

  /**
   * iOS uchun ruxsat so'rash. Foydalanuvchi harakatidan chaqirilishi
   * SHART, aks holda brauzer so'rovni rad etadi.
   */
  const enable = useCallback(() => {
    if (reduce || listening.current || typeof window === 'undefined') return;
    const DOE = (window as { DeviceOrientationEvent?: PermissionCapable }).DeviceOrientationEvent;
    if (!DOE || typeof DOE.requestPermission !== 'function') return;
    DOE.requestPermission()
      .then((res) => {
        if (res === 'granted') start();
      })
      /*
       * Rad etilsa yoki xato bo'lsa — HECH NARSA. Bu kutilgan holat,
       * nosozlik emas: foydalanuvchi shunchaki rozi bo'lmadi. Konsolga
       * yozish ham ortiqcha, chunki uni tuzatib bo'lmaydi.
       */
      .catch(() => {});
  }, [reduce, start]);

  return { x, y, enable };
}

/** Savat panelining ochiq/yopiq holati (App darajasida boshqariladi). */
export function useCartDrawer() {
  const [open, setOpen] = useState(false);
  return { open, openCart: () => setOpen(true), closeCart: () => setOpen(false) };
}
