/* OpenShop prototip yordamchilari — faqat transform/opacity. Qiymatlar src/lib/motion.ts dan. */
(function () {
  if (window.OS && window.OS.EASE) return;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';          // EASE.standard
  const SPRING = 'cubic-bezier(0.34, 1.45, 0.64, 1)';      // springs.snappy ga yaqin CSS muqobili
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';

  function zoomOf(el) { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; }

  function applyTilt(e) {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = 'transform 160ms ' + EASE;
    el.style.transform = `perspective(900px) rotateX(${(-dy * 10).toFixed(2)}deg) rotateY(${(dx * 10).toFixed(2)}deg)`;
  }
  const tiltMove = (e) => { if (!reduce() && e.pointerType !== 'touch') applyTilt(e); };
  const tiltDown = (e) => { if (!reduce() && e.pointerType === 'touch') applyTilt(e); };
  const tiltRest = (e) => {
    const el = e.currentTarget;
    el.style.transition = 'transform 420ms ' + SPRING;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  };

  function pop(el) {
    if (!el) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.24)', offset: 0.38 }, { transform: 'scale(1)' }],
      { duration: reduce() ? 1 : 340, easing: EASE });
  }
  function ring(el) {
    if (!el || reduce()) return;
    el.animate([{ opacity: 0.55, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(1.9)' }], { duration: 420, easing: EASE });
  }
  function roll(el) {
    if (!el || reduce()) return;
    el.animate([{ transform: 'translateY(70%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 240, easing: EASE });
  }

  /* Rasm savatga yoy bo'ylab uchadi: 620ms, kvadratik egri chiziq, oxirida nishon "pop". */
  function fly(fromEl, toEl, layer, dark) {
    if (!fromEl || !toEl || !layer) return;
    if (reduce()) { pop(toEl); return; }
    const z = zoomOf(layer), L = layer.getBoundingClientRect(), a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const size = 64;
    const ax = (a.left + a.width / 2 - L.left) / z, ay = (a.top + a.height / 2 - L.top) / z;
    const bx = (b.left + b.width / 2 - L.left) / z, by = (b.top + b.height / 2 - L.top) / z;
    const g = document.createElement('div');
    g.style.cssText = `position:absolute;left:${ax - size / 2}px;top:${ay - size / 2}px;width:${size}px;height:${size}px;border-radius:12px;` +
      `background:repeating-linear-gradient(135deg,${dark ? '#403e39 0 6px,#292825 6px 12px' : '#e6e5e2 0 6px,#f1f1ef 6px 12px'});` +
      `border:2px solid ${dark ? '#57544e' : '#fff'};box-shadow:0 8px 40px -12px rgb(24 23 22/.28);pointer-events:none;z-index:90;will-change:transform,opacity`;
    layer.appendChild(g);
    const cx = (ax + bx) / 2, cy = Math.min(ay, by) - 140, frames = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx, y = u * u * ay + 2 * u * t * cy + t * t * by;
      frames.push({ transform: `translate(${x - ax}px,${y - ay}px) scale(${1 - 0.78 * t}) rotate(${-14 * t}deg)`, opacity: t > 0.85 ? 1 - ((t - 0.85) / 0.15) * 0.8 : 1 });
    }
    g.animate(frames, { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }).onfinish = () => { g.remove(); pop(toEl); };
  }

  /* Katalog ikonkasi: 4 kub ajraladi (200ms) va prujina bilan qaytadi. Qiymatlar CatalogCubes.tsx dan. */
  const CUBES = [[-8, -7.6, 25, -35, 0], [7.6, -8.6, -30, 25, 28], [-8.6, 7.6, 20, 40, 56], [8, 7.2, -25, -30, 84]];
  function burst(container) {
    if (!container || reduce()) return;
    container.querySelectorAll('[data-cube]').forEach((c, i) => {
      const [tx, ty, rx, ry, d] = CUBES[i], rx0 = i % 2 ? 4.5 : -4.5, ry0 = i < 2 ? -4.5 : 4.5;
      c.animate([
        { transform: `translate(${rx0}px,${ry0}px)` },
        { transform: `translate(${tx}px,${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.14)`, offset: 0.4 },
        { transform: `translate(${rx0 * 0.9}px,${ry0 * 0.9}px) scale(0.96)`, offset: 0.78 },
        { transform: `translate(${rx0}px,${ry0}px)` },
      ], { duration: 560, delay: d, easing: EASE });
    });
  }

  /* Giroskop parallaksi: max 8px, 18° da chekka, rasm 1.05 kattalashtirilgan. Desktopda kursor bilan simulyatsiya. */
  function setShift(root, nx, ny) {
    root.querySelectorAll('[data-gyro]').forEach((el) => {
      el.style.transition = 'transform 200ms ' + EASE;
      el.style.transform = `translate(${(nx * 8).toFixed(1)}px,${(ny * 8).toFixed(1)}px) scale(1.05)`;
    });
  }
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  function gyroPointer(e) {
    if (reduce()) return;
    const r = e.currentTarget.getBoundingClientRect();
    setShift(e.currentTarget, clamp(((e.clientX - r.left) / r.width - 0.5) * -2), clamp(((e.clientY - r.top) / r.height - 0.5) * -2));
  }
  function gyroRest(e) { setShift(e.currentTarget, 0, 0); }
  function bindGyro(root) {
    if (!root || reduce() || !window.DeviceOrientationEvent) return () => {};
    const h = (ev) => { if (ev.gamma == null) return; setShift(root, clamp(-ev.gamma / 18), clamp(-(ev.beta - 45) / 18)); };
    window.addEventListener('deviceorientation', h);
    return () => window.removeEventListener('deviceorientation', h);
  }

  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0');
    return { d: p(Math.floor(s / 86400)), h: p(Math.floor(s / 3600) % 24), m: p(Math.floor(s / 60) % 60), s: p(s % 60) };
  }

  /* Namuna ma'lumot — FAQAT bazada mavjud maydonlar. stockState: 0 → yo'q, 1–5 → kam, 6+ → bor. */
  const products = [
    { id: 'p1', name: 'iPhone 15 Pro 256 GB, tabiiy titan', brand: 'Apple', price: 13990000, old_price: 15490000, rating: 4.8, reviews_count: 126, sales_count: 340, stock: 18, is_new: false, img: 'lifestyle · telefon yongʻoq stolda', stateLabel: 'Chegirmali' },
    { id: 'p2', name: 'Samsung Galaxy S24 Ultra 512 GB', brand: 'Samsung', price: 14290000, old_price: null, rating: 4.9, reviews_count: 88, sales_count: 210, stock: 3, is_new: false, img: 'lifestyle · telefon marmar ustida', stateLabel: 'Kam qolgan' },
    { id: 'p3', name: 'AirPods Pro (2-avlod) USB-C', brand: 'Apple', price: 3190000, old_price: 3590000, rating: 4.7, reviews_count: 64, sales_count: 520, stock: 40, is_new: false, img: 'lifestyle · quloqchin yogʻochda', stateLabel: 'Savatda' },
    { id: 'p4', name: 'MacBook Air 13" M3, 16/512 GB', brand: 'Apple', price: 16490000, old_price: null, rating: 0, reviews_count: 0, sales_count: 4, stock: 7, is_new: true, img: 'lifestyle · noutbuk ish stolida', stateLabel: 'Yangi · reytingsiz' },
    { id: 'p5', name: 'Xiaomi Redmi Note 13 Pro 8/256', brand: 'Xiaomi', price: 3690000, old_price: null, rating: 4.6, reviews_count: 212, sales_count: 890, stock: 0, is_new: false, img: 'lifestyle · telefon qoʻlda', stateLabel: 'Sotuvda yoʻq' },
    { id: 'p6', name: 'Sony WH-1000XM5 simsiz quloqchin', brand: 'Sony', price: 4890000, old_price: 5690000, rating: 4.9, reviews_count: 41, sales_count: 76, stock: 12, is_new: false, img: 'lifestyle · quloqchin kreslo ustida', stateLabel: 'Sevimlida' },
    { id: 'p7', name: 'Anker 737 quvvat banki 24 000 mAh', brand: 'Anker', price: 1190000, old_price: null, rating: 4.5, reviews_count: 17, sales_count: 58, stock: 25, is_new: true, img: 'lifestyle · powerbank sumkada', stateLabel: 'Yangi · reytingli' },
    { id: 'p8', name: 'Dyson V15 Detect simsiz changyutgich', brand: 'Dyson', price: 9990000, old_price: null, rating: 0, reviews_count: 0, sales_count: 8, stock: 9, is_new: false, img: 'lifestyle · changyutgich parket ustida', stateLabel: 'Oddiy' },
  ];
  const categories = [
    { name: 'Telefonlar', img: 'telefon' }, { name: 'Noutbuklar', img: 'noutbuk' }, { name: 'Quloqchinlar', img: 'audio' },
    { name: 'Aksessuarlar', img: 'aksessuar' }, { name: 'Maishiy texnika', img: 'maishiy' }, { name: 'Planshetlar', img: 'planshet' },
  ];
  const reviews = [
    { name: 'Dilshod R.', date: '14-sentabr, 2026', stars: 5, text: 'Ertasi kuni yetkazib berishdi, qutisi muhrlangan edi. Kamera va batareya zoʻr.' },
    { name: 'Malika T.', date: '9-sentabr, 2026', stars: 4, text: 'Telefon aʼlo. Kuryer oldindan qoʻngʻiroq qildi, lekin sal kechikdi.' },
    { name: 'Jasur A.', date: '2-sentabr, 2026', stars: 5, text: 'Rasmiy kafolat talonini ham berishdi. Narxi bozordagidan arzonroq chiqdi.' },
  ];

  window.OS = Object.assign(window.OS || {}, { EASE, SPRING, reduce, fmt, tiltMove, tiltDown, tiltRest, pop, ring, roll, fly, burst, gyroPointer, gyroRest, bindGyro, parts, products, categories, reviews });
})();
