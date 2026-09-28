import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE, springs } from './motion';

/*
 * KATALOG IKONKASI — "katalog ikonkaning ichidan chiqadi".
 *
 * G'oya: ikonkadagi 4 ta kvadrat — bezak emas, katalogning o'zi.
 * Bosilganda ular ikonkadan ajralib, 3D da biroz burilib chiqadi va
 * keyin joyiga qaytib "yig'iladi". Foydalanuvchi "ikonka aylandi" emas,
 * "katalog shu yerdan ochildi" degan tuyg'uni oladi.
 *
 * Nega lucide `LayoutGrid` emas?
 * O'sha ikonka ham 4 ta kvadratdan iborat, lekin u bitta SVG — ichidagi
 * to'rtburchaklarni alohida animatsiya qilish uchun uni qo'lda qayta
 * chizish kerak bo'lardi. Shuning uchun bu yerda 4 ta mustaqil element
 * bor va har biri o'z vaqti, burilishi va masofasiga ega.
 *
 * NAVIGATSIYA HECH QACHON KUTMAYDI. Bu komponent faqat vizual javob:
 * <Link> o'z ishini odatdagidek, darhol bajaradi.
 *
 * Ishlash: faqat `transform` va `opacity`. Hech qanday layout xossasi
 * (width/height/top/left) animatsiya qilinmaydi.
 */

/*
 * Har bir kubning o'z "shaxsiyati" — bir xil harakat sun'iy ko'rinadi.
 *
 * QIYMATLAR HAQIQIY BRAUZERDA KO'RIB SOZLANDI (10x kattalashtirilgan
 * holda), taxmin bilan emas. Ikkita aniq kamchilik topildi:
 *
 * 1. Dam olish holati (`x`/`y`) ±3.2 edi. Kub eni 7px, ya'ni markazlar
 *    orasi atigi 6.4px — kublar BIR-BIRINING USTIGA chiqib, yaxlit
 *    "yumaloq dog'" bo'lib ko'rinardi. Katalog ikonkasi umuman
 *    o'qilmasdi. Endi ±4.5: markazlar orasi 9px, ya'ni 2px ko'rinadigan
 *    tirqish — to'rtta alohida plitka.
 *
 * 2. Chiqish masofasi (`tx`/`ty`) ±5.5 edi — bu yangi dam olish
 *    holatidan atigi ~1px uzoq, ya'ni ajralish umuman sezilmasdi.
 *    Endi ±8: harakat aniq ko'rinadi, lekin umumiy o'lcham ~23px
 *    bo'lib, faol holatdagi 32px "bead" ichida qoladi va hech qayerda
 *    kesilmaydi.
 *
 * Burilish burchaklari o'zgartirilmadi — ular 7px o'lchamda allaqachon
 * nozik, kattalashtirilgan ko'rinish esa ularni bo'rttirib ko'rsatadi.
 */
const CUBES = [
  { x: -4.5, y: -4.5, tx: -8.0, ty: -7.6, rx: 25, ry: -35, delay: 0 },
  { x: 4.5, y: -4.5, tx: 7.6, ty: -8.6, rx: -30, ry: 25, delay: 0.028 },
  { x: -4.5, y: 4.5, tx: -8.6, ty: 7.6, rx: 20, ry: 40, delay: 0.056 },
  { x: 4.5, y: 4.5, tx: 8.0, ty: 7.2, rx: -25, ry: -30, delay: 0.084 },
] as const;

/** Ajralish fazasi tugagach kublar joyiga qaytadi. */
const BURST_MS = 340;

/*
 * ── KUBNING SHAKLI — YAGONA TA'RIF ──────────────────────────────────
 *
 * Kub navigatsiya ikonkasida 7px, burchak radiusi 1.5px edi. Bu nisbat
 * (≈1/4.7) shaklning O'ZI: undan kattaroq radius plitkani "tugmacha",
 * kichikroq radius esa quruq kvadrat qilib qo'yadi.
 *
 * Endi bu nisbat bitta joyda yashaydi, chunki kub ikkinchi joyda ham
 * ishlatiladi — buyurtma tasdiqlanganda tushadigan zarrachalar aynan
 * shu plitkaning kattaroq nusxasi. Agar shakl ikki joyda alohida
 * yozilganda, biri o'zgarganda ikkinchisi jimgina eskirib qolardi.
 */
const CUBE_RADIUS_RATIO = 1.5 / 7;
const CUBE_PX = 7;

function cubeShape(size: number): CSSProperties {
  /*
   * `display: block` — SHAKLNING BIR QISMI, bezak emas.
   *
   * `<span>` sukut bo'yicha `inline`, inline element esa `width` va
   * `height` ni UMUMAN e'tiborsiz qoldiradi. Ya'ni sinfida `block`
   * bo'lmagan har qanday chaqiruv joyida kub ko'rinmas bo'lib qolardi —
   * xatolik jim, chunki element DOM'da bor, transformlari to'g'ri
   * animatsiya qilinadi, faqat o'lchami nol (kirish ekranida aynan
   * shunday bo'lgan: yozuv chiqdi, kublar yo'q edi).
   *
   * Shuning uchun u chaqiruvchining sinfiga tashlab qo'yilmaydi.
   */
  return { display: 'block', width: size, height: size, borderRadius: size * CUBE_RADIUS_RATIO };
}

/**
 * Bitta kub plitkasi — ikonkadagi shaklning istalgan o'lchamdagi nusxasi.
 *
 * Rang `className` orqali beriladi (`bg-orange-500` va h.k.), chunki u
 * kontekstga bog'liq: navigatsiyada oq/kulrang, tasdiq ekranida brend
 * rangida. Shakl esa har doim bir xil.
 */
export function Cube({
  size,
  className,
  style,
}: {
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden="true" className={className} style={{ ...cubeShape(size), ...style }} />
  );
}

export function CatalogCubes({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const [bursting, setBursting] = useState(false);
  const timer = useRef<number | null>(null);

  /*
   * TEZ-TEZ BOSISH XAVFSIZLIGI.
   *
   * Holat bitta boolean — nechta marta bosilmasin, "duplikat kub" yoki
   * bir-birining ustiga chiqqan animatsiya paydo bo'lishi MUMKIN EMAS.
   * Har bosishda avvalgi taymer bekor qilinadi va qaytish qayta
   * rejalashtiriladi, ya'ni ikonka hech qachon transformlangan holatda
   * qotib qolmaydi.
   */
  const play = useCallback(() => {
    if (reduce) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setBursting(true);
    timer.current = window.setTimeout(() => {
      setBursting(false);
      timer.current = null;
    }, BURST_MS);
  }, [reduce]);

  /*
   * QOTIB QOLGAN TRANSFORMGA QARSHI HIMOYA.
   *
   * Ikki holatda kublar ajralgan holatida "muzlab" qolishi mumkin:
   *
   *  1. Komponent animatsiya o'rtasida unmount bo'lsa — taymer osilib
   *     qoladi (pastdagi cleanup buni hal qiladi).
   *  2. Sahifa fon rejimiga o'tsa. Brauzer `requestAnimationFrame` ni
   *     to'liq to'xtatadi (o'lchandi: 600ms ichida 0 ta kadr), ya'ni
   *     Motion qaytish animatsiyasini BAJARA OLMAYDI va kublar
   *     chiqarilgan holatida qoladi. Foydalanuvchi qaytib kelganda
   *     buzilgan ikonkani ko'radi.
   *
   * Shuning uchun sahifa yashirilishi bilanoq holat majburan "rest" ga
   * qaytariladi: qaytib kelganda React allaqachon to'g'ri nishonni
   * ko'rsatib turgan bo'ladi.
   */
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      setBursting(false);
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <span
      onPointerDown={play}
      /*
       * `perspective` — 3D burilish tekis (flat) ko'rinmasligi uchun.
       * Qiymat ataylab katta: kichik perspektiva bu o'lchamda kublarni
       * cho'zib yuborardi.
       */
      style={{ perspective: 220 }}
      className="relative flex h-5 w-5 items-center justify-center"
    >
      {/*
        Mikro-nur — FAQAT ajralish paytida. Doimiy nur bosim hosil qiladi
        va ikonkani "shovqinli" qiladi, shuning uchun u sozlanadigan
        holatga bog'langan va o'zidan keyin izsiz yo'qoladi.
      */}
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: bursting ? 0.55 : 0, scale: bursting ? 1.5 : 0.7 }}
        transition={{ duration: bursting ? 0.16 : 0.28, ease: EASE.standard }}
        className={cxGlow(active)}
      />

      {CUBES.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          // O'lcham va radius `cubeShape` dan — tasdiq ekranidagi
          // zarrachalar bilan bitta ta'rif. Hisoblangan qiymatlar
          // avvalgi `h-[7px] w-[7px] rounded-[1.5px]` bilan bir xil.
          style={cubeShape(CUBE_PX)}
          initial={false}
          animate={
            bursting
              ? {
                  x: c.tx,
                  y: c.ty,
                  rotateX: c.rx,
                  rotateY: c.ry,
                  scale: 1.14,
                  z: 18,
                }
              : { x: c.x, y: c.y, rotateX: 0, rotateY: 0, scale: 1, z: 0 }
          }
          transition={
            bursting
              ? // Chiqish — tez va aniq.
                { duration: 0.2, ease: EASE.standard, delay: c.delay }
              : // Qaytish — prujina, kichik "overshoot" bilan. Aynan shu
                // narsa kublarni jismoniy his qildiradi.
                { ...springs.snappy, delay: c.delay * 0.5 }
          }
          className={cxCube(active)}
        />
      ))}
    </span>
  );
}

/* Sinf satrlari pastda — JSX ichida uzun `cx(...)` o'qishni qiyinlashtiradi. */

function cxCube(active: boolean): string {
  return [
    // O'lcham va burchak radiusi bu yerda YO'Q — ular `cubeShape` da.
    'absolute block',
    // Faol holatda kublar to'ldiriladi (bead ustida oq), aks holda
    // konturli — bu qolgan navigatsiya elementlari bilan bir xil mantiq.
    active ? 'bg-white' : 'bg-ink-400',
    'transition-colors duration-200',
  ].join(' ');
}

function cxGlow(active: boolean): string {
  return [
    'pointer-events-none absolute h-6 w-6 rounded-full',
    active ? 'bg-white/45' : 'bg-orange-500/45',
    'blur-[6px]',
  ].join(' ');
}
