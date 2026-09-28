import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { GYRO, springOptions } from './motion';

/*
 * UI hookʼlari.
 *
 * Bular ilgari `AnimatedPrimitives.tsx` va `CartDrawer.tsx` ichida —
 * yaʼni komponentlar bilan bir faylda — turardi. Vite'ning Fast Refresh
 * mexanizmi bitta fayldan ham komponent, ham komponent boʻlmagan qiymat
 * eksport qilinsa modul holatini saqlab qola olmaydi (va ESLint buni
 * `react-refresh/only-export-components` bilan ogohlantiradi). Hookʼlar
 * mustaqil, komponentga bogʻliq boʻlmagan mantiq — shuning uchun ular
 * oʻz modulida turishi toʻgʻriroq.
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
 * Kuzatilayotgan element ekranda koʻrinib turibdimi?
 *
 * Yopishqoq (sticky) CTA panellari uchun: asosiy tugma koʻrinib turganda
 * pastdagi takror panelni koʻrsatishning maʼnosi yoʻq — ekranda bir vaqtda
 * ikkita bir xil tugma turadi. `IntersectionObserver` scroll hodisalaridan
 * farqli oʻlaroq asosiy oqimda hisob-kitob qilmaydi, shuning uchun u
 * oʻrta darajali telefonda ham arzon.
 *
 * Boshlangʻich qiymat `true` — element hali oʻlchanmagan boʻlsa panel
 * KOʻRSATILMAYDI, yaʼni sahifa ochilishida panel "chaqnab" oʻtmaydi.
 */
export function useIsVisible<T extends Element>(options?: IntersectionObserverInit) {
  /*
   * Element ODDIY `useRef` orqali emas, CALLBACK REF orqali olinadi.
   *
   * Sabab: kuzatilayotgan element koʻpincha birinchi renderda mavjud
   * emas — masalan `ProductPage` yuklanayotganda skeleton qaytaradi va
   * tugma keyinroq paydo boʻladi. `useRef` bilan `useEffect` faqat bir
   * marta (mountʼda) ishlaydi, oʻshanda `ref.current` hali `null`
   * boʻladi va kuzatuvchi HECH QACHON ulanmaydi — natijada holat
   * boshlangʻich qiymatida qotib qoladi.
   *
   * Callback ref esa element DOMʼga qoʻshilgan aniq paytda chaqiriladi,
   * `node` holati oʻzgaradi va effekt qayta ishga tushadi.
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
 * Bu "DOMʼda bormi" degani EMAS. Chiqish animatsiyasi davomida element
 * hamon DOMʼda turadi, lekin u endi ochiq dialog emas: fokus darhol
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
 * Fokus tuzoqʼisiz klaviatura foydalanuvchisi modal ochiq turgani holda
 * uning ORQASIDAGI sahifa elementlariga oʻtib ketadi va u yerda nima
 * boʻlayotganini koʻra olmaydi (WCAG 2.4.3 / 2.1.2).
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  // Chiqish animatsiyasi paytida tuzoq DARHOL boʻshatiladi — aks holda
  // Tab bosgan foydalanuvchi koʻzdan yoʻqolayotgan panel ichida qamalib
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
        // Fokuslanadigan element boʻlmasa, fokus panelning oʻzida qolsin.
        e.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      // `focused` — ATAYLAB `active` emas: tashqaridagi `active` parametri
      // (dialog ochiqmi) bilan nom toʻqnashuvi boʻlardi.
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
 * oz orqada turgan narsaga oʻxshaydi.
 *
 * ── NEGA "NOL NUQTA" BIRINCHI OʻQISHDAN OLINADI ───────────────────
 *
 * `beta` (oldinga-orqaga egilish) mutlaq qiymat: telefon stolda yotsa
 * 0°, qoʻlda oʻqish holatida esa ~45°. Agar 0° ni markaz deb olsak,
 * oddiy oʻqish holatida rasm DOIM chekkaga urilib turardi va
 * parallaks umuman ishlamayotgandek tuyulardi.
 *
 * Shuning uchun BIRINCHI oʻqish "nol" deb belgilanadi va keyingi
 * hammasi undan FARQ sifatida hisoblanadi. Foydalanuvchi telefonni
 * qanday ushlab turgan boʻlsa — oʻsha holat markaz.
 *
 * ── RUXSAT ────────────────────────────────────────────────────────
 *
 * iOS 13+ da `DeviceOrientationEvent.requestPermission()` MAJBURIY va
 * u faqat foydalanuvchi harakatidan chaqirilishi mumkin. Shu sababli
 * hook `enable` qaytaradi: uni AYNAN parallaks qoʻllanadigan
 * elementning `onTouchEnd` iga bogʻlash kerak — shunda tizim oynasi
 * kutilmaganda emas, foydalanuvchi oʻsha rasmga tekkanda chiqadi.
 *
 * Ruxsat berilmasa, API boʻlmasa yoki xato chiqsa — hook JIM qoladi:
 * qiymatlar 0 da turadi, konsolga hech narsa yozilmaydi, hech qanday
 * xato tashlanmaydi. Rasm shunchaki qimirlamaydi.
 */

/** iOS 13+ da qoʻshilgan, standart tiplarda yoʻq. */
type PermissionCapable = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

export function useGyroParallax() {
  const reduce = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  /*
   * Prujina — gyroskop signali "shovqinli": qoʻl titraydi va xom
   * qiymatlar har kadrda sakraydi. `soft` uni yumshatadi, natijada
   * rasm suzadi, titramaydi.
   */
  const x = useSpring(rawX, springOptions.soft);
  const y = useSpring(rawY, springOptions.soft);

  /* Birinchi oʻqish — markaz. `null` = hali oʻlchanmagan. */
  const origin = useRef<{ beta: number; gamma: number } | null>(null);
  const listening = useRef(false);
  /*
   * Tinglovchini oʻchirish funksiyasi.
   *
   * Refʼda saqlanadi, chunki tinglash IKKI xil yoʻldan boshlanishi
   * mumkin (darhol yoki `enable` orqali, ancha keyin), tozalash esa
   * bitta joyda — unmountʼda — boʻlishi kerak.
   */
  const cleanup = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    if (listening.current || reduce) return;
    listening.current = true;

    const onOrient = (e: DeviceOrientationEvent) => {
      // Qurilmada gyroskop boʻlmasa qiymatlar `null` keladi.
      if (e.beta == null || e.gamma == null) return;
      if (!origin.current) {
        origin.current = { beta: e.beta, gamma: e.gamma };
        return;
      }
      const clamp = (v: number) => Math.max(-1, Math.min(1, v / GYRO.maxDeg));
      // `gamma` — chapga/oʻngga egilish → gorizontal siljish.
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
   * Ruxsat TALAB QILINMAYDIGAN qurilmalarda (Android, baʼzi
   * brauzerlar) darhol boshlanadi — foydalanuvchi hech narsa
   * qilishi shart emas. iOS esa `enable` ni kutadi.
   */
  useEffect(() => {
    if (reduce || typeof window === 'undefined') return;
    const DOE = (window as { DeviceOrientationEvent?: PermissionCapable }).DeviceOrientationEvent;
    if (!DOE) return; // API umuman yoʻq — jim qolamiz
    if (typeof DOE.requestPermission !== 'function') start();
    return () => cleanup.current?.();
  }, [reduce, start]);

  /**
   * iOS uchun ruxsat soʻrash. Foydalanuvchi harakatidan chaqirilishi
   * SHART, aks holda brauzer soʻrovni rad etadi.
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
