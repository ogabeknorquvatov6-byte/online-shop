import { useEffect, useRef, useState } from 'react';

/*
 * ── AKSIYA BLOKIDAGI SHAFFOF 3D KUBLAR ──────────────────────────────
 *
 * Toʻrtta kub sekin aylanadi va suzadi. Ular brend belgisining oʻsha
 * kub motivi (`CatalogCubes`, splash, 404) — yaʼni yangi shakl emas,
 * ilovaning oʻz tilidagi fon.
 *
 * ── NEGA MOTION EMAS, CSS ──────────────────────────────────────────
 *
 * Bular cheksiz 18–28 soniyalik sikllar. Motion har kadrda qiymat
 * hisoblaydi; CSS animatsiyasi esa kompozitor oqimida ishlaydi va JS
 * umuman qatnashmaydi. Ayni mulohaza `spin-slow` va `float` uchun ham
 * qoʻllangan (`tailwind.config.js` izohi).
 *
 * ── NEGA 4 TA VA NEGA SHU QIYMATLAR ────────────────────────────────
 *
 * Asosiy qurilma — oʻrta darajali Android. Har bir kub 6 ta yuzdan
 * iborat, yaʼni 4 ta kub = 24 ta kompozitsiya qatlami. Beshinchisi
 * qoʻshilsa foyda koʻrinmaydi, narx esa chiziqli oʻsadi.
 *
 * Aylanish 18–28s, suzish 12.5–16s: ikkalasi ham 12 soniyadan sekin
 * (harakat qoidasi: doimiy halqa faqat ≥12s fon). Davomiyliklar
 * ATAYLAB bir-biriga karrali emas va kechikishlar manfiy — shunda
 * toʻrttasi hech qachon bir vaqtda bir xil holatga qaytmaydi va koʻz
 * takrorlanishni ilgʻamaydi.
 */

type Cube = {
  /** Oʻlcham (px) — yuz `translateZ` i shuning yarmi. */
  size: number;
  /** Joylashuv — `left`/`top` CSS qiymatlari. */
  left: string;
  top: string;
  opacity: number;
  radius: string;
  /** Aylanish sikli (s). */
  spin: number;
  /** Suzish sikli (s). */
  bob: number;
  /** Ikkala animatsiya uchun boshlangʻich siljish (s, manfiy). */
  delay: number;
};

const CUBES: Cube[] = [
  { size: 88, left: 'calc(100% - 118px)', top: '64px', opacity: 0.9, radius: '12px', spin: 24, bob: 14, delay: 0 },
  { size: 46, left: 'calc(100% - 190px)', top: '210px', opacity: 0.7, radius: '6px', spin: 18, bob: 12.5, delay: -6 },
  { size: 34, left: '14px', top: '46%', opacity: 0.55, radius: '5px', spin: 21, bob: 16, delay: -3 },
  { size: 60, left: '38%', top: 'calc(100% - 120px)', opacity: 0.45, radius: '8px', spin: 28, bob: 15, delay: -9 },
];

/** Bitta kubning oltita yuzi. */
const FACE_TRANSFORMS = [
  'rotateY(0deg)',
  'rotateY(90deg)',
  'rotateY(180deg)',
  'rotateY(-90deg)',
  'rotateX(90deg)',
  'rotateX(-90deg)',
];

export function PromoCubes() {
  const hostRef = useRef<HTMLDivElement>(null);
  /*
   * ── EKRANDAN CHIQQANDA TOʻXTAYDI ────────────────────────────────
   *
   * CSS animatsiyasi element koʻrinmasa ham ishlashda davom etadi:
   * brauzer uni kompozitor oqimida hisoblayveradi. Aksiya bloki
   * sahifaning oʻrtasida, yaʼni foydalanuvchi pastdagi mahsulotlarni
   * koʻrayotganda 24 ta yuz behuda aylanib turardi — oʻrta darajali
   * telefonda bu batareya va kadr tezligi masalasi.
   *
   * `IntersectionObserver` arzon: u scroll hodisasiga obuna boʻlmaydi
   * va asosiy oqimni bloklamaydi.
   */
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    // Brauzerda yoʻq boʻlsa (juda eski) — animatsiya doim ishlayversin.
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      // Blok chetiga yetmasdan oldin yoqiladi — foydalanuvchi scroll
      // qilib kelganda kublar allaqachon harakatda boʻlsin.
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /*
   * ── SAHIFA FONGA OʻTSA HAM TOʻXTAYDI ────────────────────────────
   *
   * `IntersectionObserver` faqat SCROLL holatini biladi: foydalanuvchi
   * boshqa ilovaga oʻtsa yoki boshqa yorliqni ochsa, blok hamon
   * "koʻrinadigan" hisoblanadi va 24 ta yuz aylanishda davom etadi.
   *
   * Brauzerlar fon yorligʻidagi animatsiyani sekinlashtiradi, lekin
   * TOʻXTATMAYDI — va bu kafolatlangan xulq ham emas. Telefonda bu
   * toʻgʻridan-toʻgʻri batareya masalasi, shuning uchun toʻxtatish
   * ochiq yoziladi.
   *
   * Ikkinchi foydasi: bu shart brauzerda oʻlchash mumkin, IO ning
   * scroll yoʻli esa preview panelida umuman ishga tushmaydi.
   */
  const [pageVisible, setPageVisible] = useState(
    typeof document === 'undefined' || document.visibilityState === 'visible'
  );

  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const running = onScreen && pageVisible;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ perspective: '900px' }}
    >
      {CUBES.map((c, i) => (
        <span
          key={i}
          className="absolute animate-cube-bob motion-reduce:animate-none"
          style={{
            left: c.left,
            top: c.top,
            width: c.size,
            height: c.size,
            opacity: c.opacity,
            animationDuration: `${c.bob}s`,
            animationDelay: `${c.delay}s`,
            // `paused` — element DOMʼda qoladi, faqat vaqt toʻxtaydi.
            // Qayta koʻringanda u toʻxtagan joyidan davom etadi.
            animationPlayState: running ? 'running' : 'paused',
          }}
        >
          <span
            className="absolute inset-0 animate-cube-spin motion-reduce:animate-none"
            style={{
              transformStyle: 'preserve-3d',
              animationDuration: `${c.spin}s`,
              animationDelay: `${c.delay}s`,
              animationPlayState: running ? 'running' : 'paused',
            }}
          >
            {FACE_TRANSFORMS.map((t, f) => (
              <span
                key={f}
                className="absolute inset-0 border border-orange-400/50"
                style={{
                  borderRadius: c.radius,
                  backgroundImage:
                    'linear-gradient(135deg, rgb(234 97 0 / 0.34), rgb(234 97 0 / 0.04))',
                  transform: `${t} translateZ(${c.size / 2}px)`,
                  // Baʼzi brauzerlarda orqa yuz umuman chizilmaydi va
                  // kub "yarim" koʻrinadi — shuning uchun ikkala yuz ham
                  // koʻrinadigan qoldiriladi.
                  backfaceVisibility: 'visible',
                }}
              />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
