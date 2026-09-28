# OpenShop — Premium 3D dizayn yangilanishi (implementatsiya prompti)

**Maqsad:** Saytga bitta izchil, tanib olinadigan "premium" vizual til qo'shish — tasodifiy effektlar to'plami emas, balki mavjud kod bazasidagi ikkita motivni (kub tili va jismoniy bosilish falsafasi) butun saytga izchil tarqatish orqali. Fokus — **mobil qurilma**, chunki asosiy auditoriya O'zbekistonda telefon orqali kiradi.

Bu hujjatni to'g'ridan-to'g'ri Claude Code/boshqa AI-koding vositasiga yoki dasturchiga topshiriq sifatida berish mumkin — har bir band aniq fayl va texnik yondashuvni ko'rsatadi.

---

## 0. Umumiy qoidalar (BARCHA bandlar uchun majburiy)

1. **Mavjud token tizimidan foydalanish.** Yangi qattiq kodlangan (`hardcoded`) davomiylik/easing/prujina qiymati yozilmaydi — barchasi `src/lib/motion.ts` dagi `EASE`, `DURATION`, `springs`, `MOTION` obyektlariga qo'shiladi (kerak bo'lsa yangi token shu faylga qo'shiladi, boshqa joyda emas). Bu qoida fayldagi izohda aniq aytilgan — buzilmasin.
2. **Faqat GPU-arzon xossalar animatsiya qilinadi**: `transform` (translate/scale/rotate) va `opacity`. `width/height/top/left/box-shadow`ning o'zi animatsiya qilinmaydi — layout qayta hisoblanmasligi kerak (mavjud kod shu tamoyilga qat'iy amal qiladi, masalan `flight.tsx` izohida aniq yozilgan).
3. **`prefers-reduced-motion` har doim hurmat qilinadi.** Har bir yangi komponent `useReducedMotion()` ni tekshiradi va kamida holat o'zgarishini (masalan rang/checkmark) animatsiyasiz ham ko'rsatadi — hech qanday funksiya faqat animatsiyaga bog'liq bo'lib qolmasligi kerak.
4. **Gyroskop (`DeviceOrientationEvent`) ishlatiladigan joylarda:**
   - iOS 13+ da `DeviceOrientationEvent.requestPermission()` orqali foydalanuvchidan ruxsat so'raladi (avtomatik emas — tugma bosilganda so'raladi, masalan "Mahsulotni aylantirib ko'rish" birinchi tegishda).
   - Ruxsat berilmasa / qurilma qo'llamasa (desktop, eski Android) — komponent jim ravishda oddiy statik holatga qaytadi, xato chiqmaydi.
   - Sezgirlik past qo'yiladi (±5-8 gradusgacha siljish yetarli) — haddan tashqari harakat mikroblanish (motion sickness) keltirib chiqarishi mumkin.
5. **Past darajali qurilmada tekshirish.** Har bir yangi effekt arzon Android telefonda (masalan 2-3 yillik, quyi-o'rta segment) sinaladi — 60fps saqlanishi shart, aks holda soddalashtiriladi yoki olib tashlanadi.
6. **Bitta effekt = bitta ma'no.** Har bir band pastda "nega aynan shu yerda" degan asoslash bilan berilgan — asoslashsiz joyga effekt qo'shilmaydi (zerikarli bo'lib qolmaslik uchun ataylab tanlangan sanoq).

---

## 1. Ilova kirish animatsiyasi (yangi komponent)

**Joylashuv:** yangi `src/lib/SplashScreen.tsx`, `src/main.tsx` ichida `ErrorBoundary`dan oldin, birinchi render paytida ko'rsatiladi (400-600ms, keyin `AnimatePresence` bilan yo'qoladi).

**Nima qilish kerak:** OpenShop logotipi/belgisi kub-bo'lakchalardan yig'ilib chiqadi — `CatalogCubes.tsx` dagi 4-kub burilish mantig'ining kattaroq, bosh sahifaga xos versiyasi (`CUBES` massividagi `x/y/tx/ty/rx/ry/delay` naqshini qayta ishlatish, faqat miqyosi kattaroq).

**Nega:** Birinchi taassurot — xaridorga (yoki saytni sotib olayotgan tomonga) demo ko'rsatilganda eng birinchi ko'rinadigan narsa. Hozir bo'sh oq ekran + skelet ko'rinadi.

---

## 2. Bosh sahifa herosi (`src/lib/HeroShowcase.tsx`)

**Hozirgi holat:** Markazdagi karta atrofida yon kartalar `rotateY` (±7°) bilan biroz burilib turadi, sahna `perspective: 1400` bilan qurilgan — 3D poydevor allaqachon bor.

**Qo'shish kerak:**
- **Gyroskop-parallaks:** faol (markaziy) kartaning ichida ikki qatlam (fon rasm + old plan) bo'lsa, telefon egilganda ular bir-biriga nisbatan sal siljiydi (`translateX/Y`, ±6-10px chegarada). `SlideCard` komponenti ichiga `useMotionValue` + `deviceorientation` listener qo'shiladi, mavjud `pos`/`d` hisoblash mantig'iga aralashmaydi.
- **Aurora fon:** hozir sahna orqasida hech qanday fon yo'q (bannerlar to'g'ridan-to'g'ri sahifa fonida). Bannerlar orasidagi bo'sh fazoda (agar bo'lsa) yoki `FallbackHero`dagi ikkita statik xira dog' o'rniga sekin (12-18s davrli) harakatlanuvchi gradient-tuman — faqat `transform: translate + scale`, `opacity` bilan, ranglar mavjud `orange-600/25` va `orange-500/15` dan olinadi (yangi rang kiritilmaydi).

**Nega aynan shu yerda:** Hero — sahifaning eng ko'zga tashlanadigan qismi, 3D poydevor allaqachon qurilgan, faqat chuqurlik qatlami yetishmayapti.

---

## 3. Aksiya bloki (`src/lib/HomePage.tsx` — `PromoSection`)

**Hozirgi holat:** `ink-900` fon + ikkita statik `blur-3xl` dog'.

**Qo'shish kerak:** Statik dog'lar o'rniga xuddi shu aurora-gradient harakati (band 2 dagi bilan bir xil texnika, kod qayta ishlatiladi — alohida komponentga chiqarilsa yaxshi: `src/lib/AuroraBackground.tsx`, `tone: 'dark' | 'light'` propi bilan, keyin `FallbackHero`da ham ishlatiladi).

**Nega:** Uchta to'q fon bloki (hero fallback, promo, checkout success) bitta umumiy fon-komponentga ega bo'lsa, ham kod takrorlanmaydi, ham vizual izchillik ta'minlanadi.

---

## 4. Mahsulot kartalari (`src/lib/ProductCard.tsx`)

**Qo'shish kerak:**
- **Tilt-on-touch:** karta ustida barmoq harakatlanganda (`onTouchMove`/`onPointerMove`) karta nozik `rotateX/rotateY` (±4-5°, `perspective` bilan) egiladi, soyasi barmoq tomoniga qarab siljiydi. `CatalogCubes`dagi kabi `perspective` + prujina bilan qaytish (`springs.snappy`).
- **Bir martalik "shine" chizig'i:** karta birinchi marta ekranga kirganda (`whileInView`, `viewport: { once: true }` — `AnimatedSection` dagi naqsh) rasm ustidan diagonal yaltiroq chiziq bir marta sirg'alib o'tadi. Faqat bir marta — takrorlansa zerikarli bo'ladi.

**Nega:** Bu — foydalanuvchi eng ko'p vaqt o'tkazadigan, eng ko'p qайta ishlatiladigan komponent (katalog, bosh sahifa, qidiruv natijalari — hammasi shu komponentdan foydalanadi), shuning uchun bittagina o'zgarish butun saytga tarqaladi.

---

## 5. Mahsulot sahifasi (`src/lib/ProductPage.tsx`, `src/lib/ImageGallery.tsx`, `src/lib/design.ts`)

**Qo'shish kerak:**
- **Asosiy rasmda gyroskop-parallaks** (band 2 dagi bilan bir xil texnika/komponent qayta ishlatiladi, faqat bitta rasm qatlamiga qo'llanadi).
- **Narx bloki — "shisha" ko'rinish:** hozirgi tekis to'rtburchak konteynerga (`ProductPage.tsx`dagi narx bloki) nozik ichki soya (`inset shadow`) + engil shaffoflik qo'shiladi — `design.ts` ga yangi token: `export const glassPanel = cx(card, 'shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,0,0,0.04)]')` kabi.
- **Miqdor stepper va "Savatga qo'shish" tugmasi — jismoniy bosilish:** bosilganda `translateY(1-2px)` + soya kichrayishi, qo'yib yuborilganda `springs.snappy` bilan qaytadi. `design.ts`dagi `button()` funksiyasiga yangi variant sifatida emas, `AnimatedButton` (`AnimatedPrimitives.tsx`da allaqachon bor!) komponentiga `whileTap`ni kengaytirish orqali qo'shiladi — **yangi komponent kerak emas, mavjudini kengaytirish kifoya**.

**Nega:** Xarid qarori shu sahifada qabul qilinadi — eng yuqori "premium" taassurot aynan shu yerda kerak.

---

## 6. Checkout bosqichlari va muvaffaqiyat ekrani (`src/lib/CheckoutPage.tsx`)

**Qo'shish kerak:**
- **Bosqich raqami doiralari (1/2/3):** bosqich tugallanganda doira 3D "tanga aylanishi" (`rotateY: 180`, `AnimatePresence` bilan old tomonda raqam, orqa tomonida check-belgi) bilan almashadi.
- **Muvaffaqiyat ekrani:** katta check-belgi `rotateY` flip bilan paydo bo'ladi (bandalar `springs.soft`). Atrofida **kub-shaklidagi zarrachalar** (oddiy konfeti emas — `CatalogCubes` bilan bir xil kub elementi, kattaroq va turli burchakda) sekin pastga tushib, so'nadi. Fon — band 3 dagi aurora komponenti, `tone="dark"`.

**Nega:** Bu — xaridorning saytdagi eng oxirgi va eng emotsional lahzasi, shuning uchun eng kuchli, eng "brendga xos" effekt aynan shu yerga tegishli (kub-konfeti — hech qanday shablon konfeti kutubxonasidan emas, sizning o'z brend elementingizdan yasalgan, shuning uchun noyob).

---

## 7. Pastki navigatsiya (`src/lib/BottomNav.tsx`)

**Qo'shish kerak:** Faol tab ikonkasi ostida yumshoq nur/soya "platforma" (`blur` + `opacity` bilan chizilgan ellips), ikonka esa platforma ustida bir oz "suzib" turgandek `translateY(-2px)` bilan ko'tarilgan holatda turadi. Tab almashganda platforma yangi tabga silliq siljiydi (`layoutId` — Motion'ning umumiy element animatsiyasi mexanizmi).

**Nega:** Bu — mobil foydalanuvchi eng ko'p ko'radigan, doimiy ekrandagi element, kichik detal butun sessiya davomida "premium" hissini ushlab turadi.

---

## 8. Bo'sh va xato holatlar (`src/lib/ProductCard.tsx` — `EmptyState`/`ErrorState`, va boshqa joylardagi mahalliy nusxalar)

**Hozirgi holat:** 404 sahifasida (`App.tsx` — `NotFound`) juda chiroyli, brendga xos illyustratsiya bor: to'q fon, ikkita nur dog'i, aylanuvchi halqa ichida suzuvchi quti.

**Qo'shish kerak:** Aynan shu vizual naqsh (halqa + suzuvchi ob'ekt, sekin nafas oluvchi harakat) kichikroq o'lchamda umumiy `EmptyState` komponentiga ko'chiriladi — hozir savat bo'sh, sevimlilar bo'sh, qidiruv natija bermadi kabi holatlar har xil oddiy ikonka bilan ko'rsatiladi. Bitta izchil illyustratsiya uslubi butun saytni yaxlitroq qiladi.

**Nega:** Bu — eng arzon, eng katta ta'sir beradigan o'zgarish: yangi effekt o'ylab topish shart emas, mavjud eng yaxshi naqsh (404) butun saytga tarqatiladi.

---

## Ustuvorlik tartibi (agar bosqichma-bosqich qilinsa)

1. Mahsulot kartalari (tilt + shine) va bo'sh holatlar unifikatsiyasi — eng arzon, eng katta qamrov.
2. Checkout muvaffaqiyat ekrani (kub-konfeti) — eng "wow" lahza, sotuv/demo uchun eng muhim.
3. Hero + promo aurora fon — vizual izchillik.
4. Gyroskop-parallaks (hero + mahsulot rasmi) — texnik jihatdan eng murakkab, iOS ruxsat oqimi talab qiladi.
5. Kirish animatsiyasi, pastki nav, checkout bosqich flipi — "cila" darajasidagi tafsilotlar, oxirida qo'shiladi.
