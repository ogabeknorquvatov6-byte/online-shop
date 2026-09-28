/*
 * CHEK PRINTERI TOVUSHI — WEB AUDIO BILAN SINTEZ QILINADI.
 *
 * NEGA FAYL EMAS. Loyihada bironta audio aktiv yoʻq (`public/` da faqat
 * `_redirects`). Tashqi URL oʻylab topish esa mumkin emas: u tarmoqqa
 * bogʻliqlik qoʻshadi va istalgan kunda oʻlik havolaga aylanadi.
 * Shuning uchun tovush shu yerda — brauzerning oʻzida — yasaladi:
 * hech qanday yuklab olish yoʻq, hech qanday tarmoq soʻrovi yoʻq.
 *
 * AVTOPLEY QOIDALARI. Brauzer foydalanuvchi bilan muloqotgacha ovozni
 * bloklaydi. Bu yerda muammo yoʻq: ikkala tovush ham AYNAN bosishdan
 * keyin chalinadi (buyurtma berish / bekor qilish). Shunga qaramay
 * hech narsa kafolatlanmaydi — `AudioContext` yaratilmasa yoki
 * `resume()` rad etilsa, funksiya JIMGINA qaytadi. Interfeys hech
 * qachon tovushga bogʻliq boʻlmaydi va konsolga xato chiqmaydi.
 *
 * HECH QACHON: uzluksiz sikl, fon musiqasi, baland ovoz, renderʼda
 * yangi `Audio` nusxasi.
 */

/** Umumiy kontekst — har chaqiruvda yangisi yaratilmaydi. */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    /*
     * Kontekst toʻxtatilgan boʻlsa uygʻotamiz. `resume()` vaʼdasi rad
     * etilishi MUMKIN (masalan sahifa hali "muloqot boʻlgan" deb
     * hisoblanmasa) — shuning uchun `catch` boʻsh: bu kutilgan holat,
     * xato emas.
     */
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Qisqa shovqin buferi — qogʻoz va mexanik tovushlar uchun asos. */
function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Ishga tushirilgan tugunlarni toʻxtatadigan bekor qilish funksiyasi. */
export type StopSound = () => void;

const NOOP: StopSound = () => {};

/*
 * MOTOR — uzluksiz gʻingʻillash, qogʻoz yurgan vaqt davomida.
 *
 * Bu tovushning FAQAT fon qatlami. "Chek chiqyapti" degan tuygʻuni
 * qadam tiklari beradi (pastda), motor esa ular ostidagi mexanik
 * shovqin boʻlib turadi.
 *
 * `stop()` chaqirilsa tovush 60ms ichida soʻnadi — keskin uzilish
 * "chirt" etib eshitiladi, shuning uchun qisqa pasayish qoʻyilgan.
 */
export function playMotor(maxMs = 2000): StopSound {
  const ac = getContext();
  if (!ac) return NOOP;

  try {
    const t0 = ac.currentTime;
    const hardStop = t0 + maxMs / 1000;

    const master = ac.createGain();
    master.gain.value = 0.05;
    master.connect(ac.destination);

    const motor = ac.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(56, t0);
    motor.frequency.linearRampToValueAtTime(72, t0 + 0.16);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.08);

    motor.connect(lp).connect(g).connect(master);
    motor.start(t0);
    // Xavfsizlik chegarasi: chaqiruvchi unutsa ham motor abadiy
    // gʻingʻillab qolmaydi.
    motor.stop(hardStop + 0.1);

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      try {
        const now = ac.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        motor.frequency.linearRampToValueAtTime(48, now + 0.06);
        motor.stop(now + 0.08);
      } catch {
        // Allaqachon to'xtagan — xato emas.
      }
    };
  } catch {
    return NOOP;
  }
}

/*
 * BITTA QADAM TIKI — qogʻoz bir qatorga surilganda.
 *
 * ENG MUHIM OʻZGARISH SHU YERDA.
 *
 * Ilgari tiklar qatʼiy 14/sekund ritmda, qogʻozdan MUSTAQIL
 * chalinardi: tovush oʻz soatida, qogʻoz esa rAF soatida yurar va
 * ikkisi bir-biriga tushmasdi. Endi bu funksiya har qadamda —
 * qogʻoz aynan siljigan payt — bir marta chaqiriladi. Yaʼni tovush
 * bilan harakat AJRALMAS: ular bitta hodisadan tugʻiladi.
 *
 * `index` — nechanchi qadam. Undan foydalanib har tik biroz boshqacha
 * tembr oladi; mutlaqo bir xil tiklar quloqqa "sikl" boʻlib
 * eshitiladi va sunʼiylikni darhol fosh qiladi.
 */
export function playFeedTick(index = 0): void {
  const ac = getContext();
  if (!ac) return;

  try {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.014);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    // Deterministik tebranish — `Math.random()` emas, shuning uchun
    // ketma-ketlik takrorlanadigan va sinaladigan boʻlib qoladi.
    bp.frequency.value = 1550 + ((index * 137) % 800);
    bp.Q.value = 7;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);

    const out = ac.createGain();
    out.gain.value = 0.06;
    out.connect(ac.destination);

    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.05);
  } catch {
    // Tovush hech qachon interfeysni to'xtatmaydi.
  }
}

/*
 * TOLA UZILISHI — tortish paytidagi "qirs".
 *
 * Qogʻoz taranglashganda hali yirtilmaydi, lekin ayrim tolalar
 * bittalab uzila boshlaydi va bu eshitiladi. Aynan shu tovush qoʻlga
 * "hozir uziladi" deb aytadi.
 *
 * Juda qisqa (~18ms) va juda past ovozli: u YIRTILISH tovushi emas,
 * uning ogohlantirishi. `strength` 0..1 — taranglik qancha yuqori
 * boʻlsa, qirs shuncha balandroq va yorqinroq.
 */
export function playFiberSnap(strength = 0.5): void {
  const ac = getContext();
  if (!ac) return;

  try {
    const t = ac.currentTime;
    const s = Math.min(1, Math.max(0, strength));

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.02);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    // Taranglik oshgani sari tovush yuqoriroq — tola ingichkalashadi.
    bp.frequency.value = 2200 + s * 2600;
    bp.Q.value = 9;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.35 + s * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

    const out = ac.createGain();
    // Ataylab juda past — bu fon detali, hodisa emas.
    out.gain.value = 0.03 + s * 0.025;
    out.connect(ac.destination);

    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.03);
  } catch {
    // Tovush hech qachon interfeysni to'xtatmaydi.
  }
}

/** Oxirgi mexanik toʻxtash — qogʻoz toʻliq chiqqanda bir marta. */
export function playStopClick(): void {
  const ac = getContext();
  if (!ac) return;

  try {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.05);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 760;
    bp.Q.value = 3;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

    const out = ac.createGain();
    out.gain.value = 0.07;
    out.connect(ac.destination);

    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.12);
  } catch {
    // Jimgina.
  }
}

/*
 * QOGʻOZ YIRTILISHI.
 *
 * Yirtilish — bu tez ketma-ket kelgan MINGLAB mayda tola uzilishi.
 * Shuning uchun asos — oq shovqin, lekin ikkita narsa uni "qogʻoz"
 * qiladi:
 *   1. Bandpass chastotasi PASTDAN YUQORIGA suriladi (yirtiq uzunlashib
 *      borgani sari tovush yorqinlashadi).
 *   2. Amplituda notekis — "gʻadir-budurlik" qoʻshiladi. Silliq
 *      pasayish qogʻoz emas, "shsss" boʻlib eshitiladi.
 *
 * ~420ms, bir marta.
 */
export function playTear(): StopSound {
  const ac = getContext();
  if (!ac) return NOOP;

  try {
    const t0 = ac.currentTime;
    /*
     * IKKI FAZA — QOʻL BILAN YIRTISH SHUNDAY BOʻLADI.
     *
     * Ilgari bu bitta tekis shovqin edi va u "shsss" boʻlib
     * eshitilardi. Haqiqiy yirtilish esa ikki bosqichli:
     *
     *   1. TUTISH (~90ms) — qogʻoz qarshilik qiladi, tolalar bittalab
     *      uziladi: past, siyrak, sekin ovoz.
     *   2. YIRTILISH (~330ms) — chok "ketadi" va tez, yorqin shovqin
     *      bilan oxirigacha boradi.
     *
     * Aynan shu tezlanish quloqqa "qoʻl bilan yirtdi" deb eshitiladi.
     */
    const grab = 0.09;
    const rip = 0.33;
    const dur = grab + rip;

    const master = ac.createGain();
    master.gain.value = 0.085;
    master.connect(ac.destination);

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, dur + 0.06);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.0;
    // Tutish fazasi past va boʻgʻiq; yirtilishda tovush yorqinlashadi.
    bp.frequency.setValueAtTime(620, t0);
    bp.frequency.linearRampToValueAtTime(900, t0 + grab);
    bp.frequency.exponentialRampToValueAtTime(4600, t0 + grab + rip * 0.7);
    bp.frequency.exponentialRampToValueAtTime(2000, t0 + dur);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);

    /* 1-faza: siyrak, past — tolalar qarshiligi. */
    const grabSteps = 4;
    for (let i = 1; i <= grabSteps; i += 1) {
      const t = t0 + (grab * i) / grabSteps;
      // Deterministik notekislik — `Math.random()` emas.
      const j = 0.18 + ((i * 37) % 11) / 55;
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, j), t);
    }

    /* 2-faza: keskin koʻtarilish, soʻng gʻadir-budur pasayish. */
    g.gain.exponentialRampToValueAtTime(1, t0 + grab + 0.02);
    const ripSteps = 10;
    for (let i = 1; i <= ripSteps; i += 1) {
      const t = t0 + grab + 0.02 + (rip - 0.02) * (i / ripSteps);
      const base = 1 - i / ripSteps;
      const j = 0.55 + ((i * 53) % 17) / 26;
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, base * j), t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);

    src.connect(bp).connect(lp).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.06);

    return () => {
      try {
        src.stop();
        master.disconnect();
      } catch {
        // Allaqachon to'xtagan.
      }
    };
  } catch {
    return NOOP;
  }
}
