/* OpenShop prototip: umumiy holat (savat/sevimli), freym o'lchamlari, karta view-modeli. os-proto.js dan keyin yuklanadi. */
(function () {
  const OS = window.OS;
  if (!OS || OS.kit) return;
  const KEY = 'openshop-proto-v1', SKEY = 'openshop-proto-size';
  const subs = new Set();
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  st = st || { cart: { p3: 1, p7: 2 }, favs: { p6: true, p1: true }, recent: ['iphone 15', 'airpods', 'powerbank'] };
  const store = {
    get: () => st,
    set(fn) { st = { ...st, ...fn(st) }; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} subs.forEach((f) => f()); },
    sub(f) { subs.add(f); return () => subs.delete(f); },
  };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { try { st = JSON.parse(e.newValue); subs.forEach((f) => f()); } catch (_) {} } });

  if (!OS.products.some((p) => p.id === 'p9')) OS.products.push(
    { id: 'p9', name: 'Samsung Galaxy Tab S9 FE 128 GB', brand: 'Samsung', price: 5490000, old_price: 6190000, rating: 4.6, reviews_count: 23, sales_count: 44, stock: 11, is_new: false, img: 'lifestyle · planshet divanda', stateLabel: 'Chegirmali' },
    { id: 'p10', name: 'Philips Airfryer XXL HD9650', brand: 'Philips', price: 3290000, old_price: null, rating: 4.7, reviews_count: 35, sales_count: 120, stock: 14, is_new: false, img: 'lifestyle · oshxona marmar stol', stateLabel: 'Oddiy' },
  );
  const byId = (id) => OS.products.find((p) => p.id === id);

  const SIZES = { m: { w: 390, h: 844, label: '390 · Telefon' }, t: { w: 820, h: 1180, label: '820 · Planshet' }, d: { w: 1280, h: 800, label: '1280 · Kompyuter' } };
  const cols = { m: 2, t: 3, d: 5 };

  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function cartTarget(root) { return [...root.querySelectorAll('[data-target="cart"]')].find(visible); }
  function favTarget(root) { return [...root.querySelectorAll('[data-target="fav"]')].find(visible); }

  /* Sahifa uchun umumiy "kit": freym, o'lcham tanlagich, toast, savat/sevimli amallari. */
  function kit(comp) {
    comp.frame = comp.frame || React.createRef();
    const k = {
      mount() {
        let size = 'm'; try { size = localStorage.getItem(SKEY) || 'm'; } catch (e) {}
        comp.setState({ size, vw: document.documentElement.clientWidth, vh: window.innerHeight });
        k.unsub = store.sub(() => comp.forceUpdate());
        k.onR = () => comp.setState({ vw: document.documentElement.clientWidth, vh: window.innerHeight });
        window.addEventListener('resize', k.onR);
      },
      unmount() { k.unsub && k.unsub(); window.removeEventListener('resize', k.onR); clearTimeout(k.tt); },
      toast(msg) { clearTimeout(k.tt); comp.setState({ toast: msg }); k.tt = setTimeout(() => comp.setState({ toast: '' }), 1800); },
      add(p, e, qty) {
        if (p.stock <= 0) return;
        const root = comp.frame.current;
        const card = e && e.currentTarget.closest('[data-card]');
        const media = (card && card.querySelector('[data-media]')) || (e && e.currentTarget);
        if (root && media) OS.fly(media, cartTarget(root), root.querySelector('[data-fly]'), false);
        store.set((s) => ({ cart: { ...s.cart, [p.id]: (s.cart[p.id] || 0) + (qty || 1) } }));
        comp.setState((s) => ({ added: { ...(s.added || {}), [p.id]: true } }));
        setTimeout(() => comp.setState((s) => { const a = { ...(s.added || {}) }; delete a[p.id]; return { added: a }; }), 1400);
        k.toast(p.name.split(',')[0] + ' savatga qoʻshildi');
      },
      fav(p, e) {
        e && e.stopPropagation && e.stopPropagation();
        const btn = e && e.currentTarget, on = !store.get().favs[p.id];
        store.set((s) => { const f = { ...s.favs }; if (on) f[p.id] = true; else delete f[p.id]; return { favs: f }; });
        if (on && btn) {
          requestAnimationFrame(() => OS.ring(btn.querySelector('[data-ring]')));
          const root = comp.frame.current; root && OS.pop(favTarget(root));
        }
        k.toast(on ? 'Sevimlilarga qoʻshildi' : 'Sevimlilardan olib tashlandi');
      },
      rollCard(id) { requestAnimationFrame(() => { const r = comp.frame.current; r && r.querySelectorAll('[data-roll-card="' + id + '"]').forEach((el) => OS.roll(el)); }); },
      setQty(id, q) { store.set((s) => { const c = { ...s.cart }; if (q <= 0) delete c[id]; else c[id] = q; return { cart: c }; }); },
      view(p, i, extra) {
        const S = store.get(), added = !!((comp.state.added || {})[p.id]);
        const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : null;
        const kind = p.stock <= 0 ? 'out' : p.stock <= 5 ? 'low' : 'in';
        const qty = S.cart[p.id] || 0, bp = comp.state.size || 'm';
        return {
          ...p, priceText: OS.fmt(p.price), oldText: p.old_price ? OS.fmt(p.old_price) : '', discount: disc, hasDisc: disc != null, noDisc: disc == null,
          showNew: p.is_new && disc == null, hasRating: p.rating > 0, ratingText: p.rating ? p.rating.toFixed(1) : '', reviewsText: p.reviews_count > 0 ? '(' + p.reviews_count + ')' : '',
          soldText: p.sales_count >= 10 ? p.sales_count + ' marta sotib olingan' : '', hasSold: p.sales_count >= 10,
          isIn: kind === 'in', isLow: kind === 'low', isOut: kind === 'out', lowText: 'Kam qoldi — ' + p.stock + ' dona', inCartText: 'Savatda · ' + qty, reviewsLong: ' · ' + p.reviews_count + ' ta sharh',
          fav: !!S.favs[p.id], notFav: !S.favs[p.id], added, inCartIdle: qty > 0 && !added, inCart: qty > 0 && kind !== 'out', canAdd: kind !== 'out' && qty === 0, qty,
          saveText: p.old_price ? OS.fmt(p.old_price - p.price) + ' tejaysiz' : '', atMax: qty >= p.stock, incC: qty >= p.stock ? '#a3a09a' : '#047857', qtyAria: 'Savatda ' + qty + ' dona',
          onInc: (e) => { e && e.stopPropagation && e.stopPropagation(); if (qty < p.stock) { k.setQty(p.id, qty + 1); k.rollCard(p.id); } }, onDec: (e) => { e && e.stopPropagation && e.stopPropagation(); k.setQty(p.id, qty - 1); if (qty > 1) k.rollCard(p.id); },
          imgOpacity: kind === 'out' ? 0.5 : 1, delay: ((i || 0) * 40) + 'ms', showQuick: bp === 'd' && kind !== 'out',
          href: '02 Mahsulot.dc.html',
          onAdd: (e) => k.add(p, e), onFav: (e) => k.fav(p, e), onOpen: () => { location.href = '02 Mahsulot.dc.html'; },
          onQuick: (e) => { e.stopPropagation(); comp.setState({ quick: p.id }); },
          tiltMove: OS.tiltMove, tiltDown: OS.tiltDown, tiltRest: OS.tiltRest, ...(extra || {}),
        };
      },
      vals() {
        const s = comp.state, size = s.size || 'm', Z = SIZES[size], S = store.get();
        const vw = (s.vw || 1400) - 60, vh = (s.vh || 900) - 96;
        const scale = Math.min(1, vw / Z.w, size === 'm' ? vh / Z.h : 99);
        const cartCount = Object.values(S.cart).reduce((a, b) => a + b, 0);
        return {
          frame: comp.frame, bp: size, isM: size === 'm', isT: size === 't', isD: size === 'd', notM: size !== 'm', notD: size !== 'd', isMT: size !== 'd',
          frameW: Z.w + 'px', frameH: (size === 'm' ? Z.h : Math.min(Z.h, Math.round(vh / scale))) + 'px', frameScale: scale.toFixed(3),
          frameRadius: size === 'm' ? '44px' : '14px', frameRing: size === 'm' ? '0 0 0 10px #181716, 0 30px 60px -20px rgb(24 23 22 / .45)' : '0 0 0 1px #d3d1cd, 0 30px 60px -24px rgb(24 23 22 / .35)',
          stageH: Math.round((size === 'm' ? Z.h : Math.min(Z.h, Math.round(vh / scale))) * scale + 24) + 'px', stageW: Math.round(Z.w * scale + 24) + 'px',
          sizeTabs: Object.keys(SIZES).map((key) => ({ label: SIZES[key].label, go: () => { try { localStorage.setItem(SKEY, key); } catch (e) {} comp.setState({ size: key }); }, bg: key === size ? '#181716' : 'transparent', fg: key === size ? '#fff' : '#403e39' })),
          cols: 'repeat(' + cols[size] + ', minmax(0, 1fr))', colsN: cols[size], pad: size === 'd' ? '32px' : size === 't' ? '24px' : '16px',
          cartCount, favCount: Object.keys(S.favs).length, hasToast: !!s.toast, toast: s.toast || '',
          bottomPad: size === 'd' ? '0px' : '72px',
        };
      },
    };
    return k;
  }

  const orders = [
    { id: '10482', date: '26-sentabr, 2026', status: 'Yoʻlda', step: 2, total: 13990000, items: ['p1'], delivery: 'Ertaga, 10:00–14:00' },
    { id: '10317', date: '11-sentabr, 2026', status: 'Yetkazildi', step: 3, total: 4380000, items: ['p3', 'p7'], delivery: '12-sentabr' },
    { id: '10205', date: '28-avgust, 2026', status: 'Bekor qilindi', step: -1, total: 3690000, items: ['p5'], delivery: '—' },
  ];
  const tree = [
    { name: 'Telefonlar', subs: ['Smartfonlar', 'Tugmali telefonlar', 'Aqlli soatlar', 'Qoplamalar', 'Himoya oynalari', 'Zaryadlagichlar'] },
    { name: 'Noutbuklar', subs: ['Ultrabuklar', 'Oʻyin noutbuklari', 'MacBook', 'Monitorlar', 'Sichqoncha va klaviatura', 'Sumkalar'] },
    { name: 'Quloqchinlar', subs: ['Simsiz (TWS)', 'Toʻliq oʻlchamli', 'Simli', 'Kolonkalar', 'Mikrofonlar'] },
    { name: 'Aksessuarlar', subs: ['Quvvat banklari', 'Kabellar', 'Xotira kartalari', 'Avto aksessuarlar', 'Tarmoq'] },
    { name: 'Maishiy texnika', subs: ['Changyutgichlar', 'Airfryer', 'Choynaklar', 'Dazmollar', 'Soch quritgichlar', 'Iqlim texnikasi'] },
    { name: 'Planshetlar', subs: ['iPad', 'Android planshetlar', 'Elektron kitoblar', 'Stilus va qalamlar'] },
  ];

  Object.assign(OS, { store, byId, kit, SIZES, cartTarget, favTarget, orders, tree });
})();
