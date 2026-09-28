# Handoff: OpenShop — “Iliq vitrina” dizayn tizimi (14 ta sahifa)

## Umumiy
Men OpenShop (React + Tailwind + Motion + Supabase, Telegram bot) mijoz qismining to‘liq qayta dizayni. Maqsad: birinchi 5 soniyada “jiddiy, zamonaviy, ishonchli do‘kon” hissi va yuqori konversiya — faqat haqiqiy ma’lumot bilan. Asosiy qurilma: 390px, o‘rta Android. O‘lchamlar: 390 / 820 / 1280.

## Dizayn fayllari haqida
Bu papkadagi fayllar — **HTML’da yasalgan dizayn namunalari** (ko‘rinish va xulq-atvor prototiplari), production kod emas. Vazifa — ularni **mavjud kod bazasida** (`src/lib/*`, Tailwind tokenlari, `motion.ts`, `design.ts`) uning o‘z patternlari bilan qayta yaratish. HTML’ni to‘g‘ridan-to‘g‘ri ko‘chirmang.

Prototiplarni ochish: `00 Indeks.dc.html` ni brauzerda oching (fayllar yonma-yon turishi kerak). Har sahifa yuqorisida 390/820/1280 tanlagichi bor; savat/sevimlilar `localStorage('openshop-proto-v1')` orqali sahifalar orasida umumiy.

## Aniqlik darajasi
**Yuqori (hi-fi).** Ranglar, tipografiya, oraliqlar, radiuslar, soyalar va animatsiya vaqtlari yakuniy. Faqat mahsulot suratlari — chiziqli placeholder (haqiqiy lifestyle suratlar bilan almashtiring).

## Asosiy qarorlar
- Yo‘nalish: **A “Iliq vitrina”** + B dan: hero sarlavhasi uslubi (“Yangi texnika. Halol narx. Toshkentda — ertagayoq.”) va “Hozir trendda” to‘q studiya tasmasi. Rasmlar 1:1, “Savatga” — yozuvli tugma.
- **Kontrast qoidasi (hamma joyda):** oq matnli to‘ldirilgan element foni `orange-700 #c2410c` (5.2:1), “press” soyasi `orange-800 #9a3412`. `orange-600 #EA6100` faqat matnsiz yuzalarda: logo, to‘ldirilgan yurak, nav nuri, tanlangan chegara, aurora. Kichik urg‘u matni oq fonda orange-700, to‘q fonda orange-300/400. Kulrang yorliqlar ≥ ink-600 `#57544e` (ink-400 AA’dan o‘tmaydi).
- Barcha bosiladigan joylar ≥ 44×44px. Asosiy CTA 48–52px.

## Design tokenlar
Mavjud (`tailwind.config.js`):
- brand: 50 `#fff7ed`, 100 `#ffedd5`, 200 `#fed7aa`, 300 `#fdba74`, 400 `#fb923c`, 500 `#f97316`, 600 `#ea6100`, 700 `#c2410c`, 800 `#9a3412`
- ink: 50 `#f8f8f7`, 100 `#f1f1ef`, 200 `#e6e5e2`, 300 `#d3d1cd`, 400 `#a3a09a`, 500 `#78756e`, 600 `#57544e`, 700 `#403e39`, 800 `#292825`, 900 `#181716`
- holat: emerald-600 `#059669` / 700 `#047857` / 50 `#ecfdf5`; amber-700 `#b45309` (kam qoldi), amber-400 `#fbbf24` (yulduz), red-700 `#b91c1c` (xato)
- radius: rounded-control 8, rounded-card 12, rounded-surface 16, rounded-md 6 (nishon), full
- soya: shadow-card `0 1px 2px 0 rgb(24 23 22/.04), 0 4px 16px -6px rgb(24 23 22/.10)`; shadow-overlay `0 8px 40px -12px rgb(24 23 22/.28)`; shadow-glass `inset 0 1px 0 0 rgb(255 255 255/.7), inset 0 -1px 0 0 rgb(24 23 22/.05)`; shadow-brand `0 4px 14px -4px rgb(234 97 0/.9)`
- tip: Inter 400/500/600/700 + Onest 600/700 (sarlavhalar); letter-spacing −0.02…−0.035em; eyebrow 12px/600, 0.14em, uppercase, ink-600

**`info` haqida (aniq):** yangi `info` tokeni **qo‘shilmaydi**. Prototipdagi yagona ma’lumot banneri (checkout tasdig‘idagi “Onlayn to‘lov hozircha tasdiqlanmoqda…”) mavjud `badgeTone.info` = `bg-blue-50 text-blue-700` (#eff6ff / #1d4ed8) ni ishlatadi — ya’ni bu **bir xil narsa**. Kirish sahifasidagi bot belgisi — koddagi `bg-sky-50 text-sky-600` (o‘zgarmagan). Ko‘k faqat ma’lumot uchun; ma’lumotli toast (`toast.tsx` info = orange-600 ikonka) o‘zgarmaydi.

**Yangi (qo‘shish kerak, 3 ta):**
| Token | Qiymat | Nima uchun |
|---|---|---|
| `shadow-press` | `0 4px 0 0 #9a3412` (kichik tugmada `0 3px`) | To‘ldirilgan CTA qalinligi; `:active` da `translateY(2px)` + `0 2px 0 0` |
| `ink-950` | `#0e0e0d` | Faqat “Hozir trendda” studiya tasmasi foni |
| `rounded-tile` | 18px | Bo‘sh/xato holat belgisi plitkasi (72px) |

Oraliq: telefonda gorizontal padding 16, planshetda 24, kompyuterda 32; kontent max-width 1280 (checkout/kabinet 1120, ma’lumot 1040). Seksiyalar orasi 32 (m) / 48 (t, d). To‘r oralig‘i: 18×12 (m), 20×16 (t), 24×20 (d).

## Harakat (motion.ts ga qo‘shing)
Qoidalar: faqat `transform` / `opacity`; MICRO ~140ms, COMPONENT 220–300ms, STORY ~600ms (faqat hero va buyurtma tasdig‘i); hech bir animatsiya kutishga majburlamaydi; doimiy halqa faqat ≥12s fon; `prefers-reduced-motion` → hammasi statik yakuniy holatda. EASE.standard = `cubic-bezier(0.22,1,0.36,1)`, prujina = `cubic-bezier(0.34,1.3,0.64,1)` (yoki Motion spring).

| Harakat | Daraja | Spets | Trigger |
|---|---|---|---|
| Tugma botishi | MICRO | 140ms, Y+2px, soya qisqaradi, scale .985 | pointerdown |
| Karta 3D burilishi | MICRO | ≤5°, 160ms; qaytish 420ms prujina | kursor/barmoq |
| Yorug‘lik chizig‘i | COMP | 1.1s linear, bir marta, 0.18s kechikish | karta ilk ko‘ringanda |
| Savatga uchish | COMP | 620ms `(0.45,0,0.25,1)`, kvadratik yoy (yuqoriga 140px), scale 1→.22, oxirida nishon pop 340ms | “Savatga” |
| Yurak halqasi | COMP | 420ms, scale .6→1.9, opacity .55→0 | sevimliga qo‘shish |
| 4 kub (Katalog) | COMP | 560ms, 28ms qadam (CatalogCubes.tsx qiymatlari) | Katalog ikonkasi |
| Nav nuri / segment | COMP | 300 / 280ms prujina, translateX | tab almashishi |
| Sonlar surilishi | COMP | 240ms, translateY 70%→0 + opacity | narx, savat soni, taymer, jami, natija soni |
| Sheet / drawer | COMP | 300ms standard; parda 220ms opacity | filtr, savat paneli, katalog paneli |
| Checkbox / switch | COMP | 220 / 260ms prujina | bosish |
| Checkout “tanga” | COMP | rotateY 0→180°, 460ms overshoot; orqada check; chiziq scaleX 400ms | bosqich bajarilganda |
| Galereya parallaksi | COMP | ≤8px, rasm scale 1.05, 200ms; `deviceorientation` (gamma/beta ±18°) | telefon egilishi / kursor |
| Xato maydon | MICRO | 280ms translateX ±4px | yuborishda xato |
| Splash | STORY | 4 kub 360ms (70ms qadam) + so‘z 260ms; 820ms dan keyin 220ms so‘nadi | sessiyada 1-marta |
| Hero sarlavhasi | STORY | 3 qator, 600ms, 60ms qadam, Y12px | bosh sahifa |
| Buyurtma tasdig‘i | STORY | check rotateY −110°→0 600ms + 12–16 kub 2.2–3.6s tushadi | buyurtma qabul qilinganda |
| Aurora | FON | 3 dog‘ 13 / 17.2 / 12.35s alternate, blur statik | hero, aksiya, trend |

## Belgilangan joylar — `[…]`
Prototipda o‘ylab topilgan qiymat yo‘q. Mavjud koddan olinadigan har bir qiymat sariq punktirli belgi bilan ko‘rsatilgan (`data-ph` atributi — HTML’da `grep data-ph` bilan hammasini topasiz).

| Belgi | Manba | Qayerda |
|---|---|---|
| `[SETTINGS: phone]` | store_settings.phone (useSettings) | header tasmasi, mobil panel, footer, 14 |
| `[SETTINGS: address]`, `[SETTINGS: email]` | store_settings | footer, 14 |
| `[SETTINGS: telegram_url]` | store_settings | footer (title), 14 |
| `[SETTINGS: store_name]` | store_settings.store_name ?? 'OpenShop' | 11 chap panel |
| `[SETTINGS: delivery_fee_tashkent]` / `[SETTINGS: delivery_fee_republic]` | store_settings → quoteDelivery | 02 ishonch bloki, 08 bosqich 2, 14 |
| `[SETTINGS: free_delivery_threshold]` | store_settings | 08, 14 |
| `[quoteDelivery(…).fee]`, `[delivery.remainingForFree]` | delivery.ts quoteDelivery(settings, subtotal, city) | 07 savat + drawer, 08 xulosa |
| `[PROMO: title]`, `[PROMO: subtitle]`, `[PROMO: ends_at]` | promotions jadvali | 03 aksiya bloki, mega-menyu plitkasi; taymer faqat ends_at dan |
| `[ORDER: order_number]` / `[orders.order_number]` | orders.order_number (OS-YYMMDD-NNNN) | 02 bir bosishda, 08 tasdiq, 10 |
| `[orders.total_amount]`, `[formatOrderDate(created_at)]` | orders | 08 tasdiq, 10 |
| `[PROFILE: full_name]`, `[PROFILE: phone]` | profiles | 10 |
| `[addresses[n].city, street]` | foydalanuvchi manzillari | 10 |
| `[PRODUCT: warranty]` | mahsulot xususiyatlari | 02 “Xususiyatlar” |
| `[ENV: VITE_TELEGRAM_BOT_USERNAME]` | AuthPage BOT_USERNAME | 10 Xavfsizlik, 11 |
| `[STATIC: /delivery …]`, `[STATIC: /returns …]`, `[STATIC: /about …]` | staticPages.ts (title, intro, sections[heading]) | 14 |

Namuna ma’lumot (belgisiz, ataylab): kategoriyalar daraxti (mega-menyu, mobil panel — `categories` jadvalidan / CatalogNavSheet), mahsulotlar va sharhlar (OS.products / OS.reviews) — faqat karta holatlarini ko‘rsatish uchun; bazadagi mahsulotlar bilan almashtiriladi.

**Koddan olingan va prototipga moslangan:** to‘lov usullari (CheckoutPage.PAYMENT_OPTIONS: Naqd pul / Click / Payme), muddatlar matni, buyurtma holatlari (types.ts ORDER_STATUS_LABELS/COLORS, 6 ta), kabinet bo‘limlari (AccountPage: Profil, Buyurtmalar, Sevimlilar, Manzillar, Xavfsizlik), “Bekor qilish” faqat “Yangi” da, qidiruv tarixi (searchHistory.ts, 8 ta, ≥2 belgi), kirish oqimi (AuthPage: login+parol, Google, bot orqali ro‘yxatdan o‘tish va parolni tiklash). Olib tashlangan (kodda manbasi yo‘q): yetkazish vaqti oraliqlari, “Ko‘p qidiriladi”.

## Ishontirish — faqat haqiqiy maydonlar
`name, brand, price, old_price, rating, reviews_count, sales_count, stock, is_new, images, variants`.
- `−N%` = `round((1 − price/old_price)·100)`, faqat `old_price > price`.
- “Yangi” faqat `is_new` va chegirma yo‘q bo‘lsa (chegirma ustun).
- Reyting qatori faqat `rating > 0`; `(reviews_count)`.
- “Kam qoldi — N dona” faqat `1 ≤ stock ≤ 5`; `stock = 0` → “Sotuvda yo‘q”, tugma o‘chadi, surat 50% opacity, pastda qora tasma.
- “N marta sotib olingan” faqat `sales_count ≥ 10`.
- Taymer faqat aksiyaning haqiqiy `ends_at` sanasidan (prototipdagi sana — namuna, `[PROMO: ends_at]`).
- Savat stepperi `stock` dan oshmaydi. Yetkazib berish narxi — faqat quoteDelivery.
- Soxta taymer / “hozir N kishi ko‘ryapti” / soxta sharh — yo‘q.

## Sahifalar
Har bir HTML sahifa ostidagi kartochkalarda shu sahifaning tokenlari va harakatlari yozilgan. Qisqacha:

1. **01 Kartochka** (`ProductCard.tsx`) — holatlar: oddiy, chegirmali, yangi, kam qolgan, sotuvda yo‘q, savatda (yashil “✓ Savatda” 1.4s → “Savatda · N  +”), reytingli/reytingsiz, sevimli, skeleton. Rasm 1:1; brend 11px uppercase ink-500; nom 13px/500, 2 qator; narx 15px/700; chegirmada narx shisha panelda (brand-50/55%, brand-200 chegara). Tugma 44px, rounded-control, oq + ink-200 chegara + `0 2px 0 0 #e6e5e2`. Kompyuterda rasm ustida “Tezkor ko‘rish” (36px). To‘r 2/3/5.
2. **02 Mahsulot** — m: butun kenglikdagi snap-galereya + nuqtalar, 560px scrolldan keyin pastda yopishqoq narx + “Savatga”. t: 2 ustun. d: 7/5, vertikal eskizlar, o‘ng panel sticky (top 124). Narx 30px/700 roll; tejash nishoni brand-700; variantlar (xotira 44px segment, rang 44px doira); “Savatga qo‘shish” (brand-700 + press) va “Bir bosishda buyurtma” (ink-900, telefon raqami bilan sheet/modal → STORY tasdiq); ishonch bloki (3 qator); tablar Tavsif / Xususiyatlar / Sharhlar (nur 260ms), sharh: ism, sana, yulduz, “Xarid tasdiqlangan” (emerald chip); “Bu bilan birga olishadi”.
3. **03 Bosh sahifa** (`HomePage.tsx`, `AuroraBackground.tsx`) — hero (ink-900, aurora, 38/44/60px sarlavha, 2 CTA, surat), 3 ishonch plitkasi, kategoriyalar (m: gorizontal doiralar; t/d: 3/6 plitka), “Hozir trendda” to‘q tasma (ink-950): katta spotlight karta + 3–4 ixcham qator, “Xit mahsulotlar”, aksiya bloki (taymer, sekund plitkasi brand-700), “Yangi qo‘shilganlar”, footer.
4. **04 Katalog** (1280 da 4 ustun — tasdiqlangan, hozirgi kod bilan bir xil) — kategoriya chiplari, yopishqoq “Filtr (N) + Saralash” qatori; filtrlar: narx dan/gacha, brend checkbox (son bilan), switchlar (sotuvda bor / chegirmali / reyting 4+); faol filtr chiplari; m/t: pastdan sheet, tugmada jonli natija soni; d: 264px sticky panel + 4 ustun. Natija yo‘q holati. Sotuvda yo‘qlar har doim oxirida.
5. **05 Qidiruv** — o‘z minimal sarlavhasi, avtofokus; bo‘sh: tarix (8 ta, o‘chiriladi, tozalash) + kategoriyalar; yozish: 5 ta taklif, moslik qalin + brand-100 fon; Enter: natijalar; natija yo‘q holati (kategoriya chiplari).
6. **06 Tezkor ko‘rish** — faqat desktop, 900px modal, 2 ustun, 260ms pop-in, Esc yopadi.
7. **07 Savat** — qatorlar (stepper 40px, roll), o‘chirishda 5s “Qaytarish” toasti; xulosa (chegirma, yetkazish “keyingi qadamda”, jami roll) + ishonch; m: pastda yopishqoq jami; drawer 420px (desktop headerdagi savat ham ochadi); bo‘sh holat.
8. **08 Checkout** — 3 bosqich: Manzil (ism, telefon, Toshkent/Viloyatlar, manzil, mo‘ljal; validatsiya), Yetkazish (hudud bo‘yicha muddat + `[SETTINGS: delivery_fee_*]`, bepul chegara), To‘lov (Naqd pul / Click / Payme) + tekshirish; bosqich doiralari “tanga”; xulosa sticky; m: pastda “Davom etish · jami”. Tasdiq: STORY + `[ORDER: order_number]`, onlayn to‘lovda badgeTone.info eslatmasi.
9. **09 Sevimlilar** — to‘r 2/3/5, “Hammasini savatga (N)”, bo‘sh holat.
10. **10 Kabinet** — AccountPage bo‘limlari (m/t: chiplar, d: chap menyu); buyurtmalar: 6 holat chipi, ochiladigan 5 bosqichli kuzatuv, “Bekor qilish” (faqat Yangi), “Qayta buyurtma”; profil, sevimlilar, manzillar, xavfsizlik (parol bot orqali).
11. **11 Kirish** (AuthPage.tsx) — “Hisobingizga kiring”: login + parol (ko‘rsatish/yashirish, validatsiya, xato banneri, “Kirilmoqda…”), “Bot orqali tiklang”, “Google bilan davom etish”, “Hisobingiz yo‘qmi?” kartasi — bot orqali ro‘yxatdan o‘tish. Bot tugmasi kodda sky-500 + oq matn (2.8:1) — prototipda ink-900 (AA).
12. **12 Navigatsiya** — header (d: ishonch tasmasi 36px + 72px qator; m: 56px), mega-menyu (3 ustun), mobil katalog paneli (chapdan, akkordeon), pastki nav (5 tab, nur), footer.
13. **13 Holatlar** — splash, 404 (kub motivli), bo‘sh savat/sevimlilar/qidiruv/sharhlar, tarmoq xatosi, skeleton.
14. **14 Ma’lumot** — 3 tab: Yetkazib berish / Qaytarish / Biz haqimizda; barcha matn `[STATIC: …]` (staticPages.ts), narx va kontaktlar `[SETTINGS: …]`.

## Holat boshqaruvi
- `cart: {productId: qty}`, `favs: {productId: true}`, `recentSearches: string[]` — Supabase + localStorage (mehmon), kirgach birlashtiriladi.
- UI holatlari: `addedFlash[id]` (1.4s), `quickViewId`, `filterSheetOpen`, `filters {brands, inStock, discount, rating4, min, max}`, `sort`, `checkoutStep 1..3`, `checkoutDone`, `authState start|wait|ok|err`.
- Sonlar o‘zgarganda roll animatsiyasi — oldingi qiymat bilan solishtirib (`useRef`).

## Aktivlar
Ikonkalar — lucide-react (kod bazasida bor): Home, LayoutGrid→4 kub, Heart, ShoppingCart, User, Search, MapPin, Truck, RotateCcw, ShieldCheck, Flame, TrendingUp, Sparkles, Star, Check, X, Minus, Plus, Trash2, SlidersHorizontal, ArrowUpDown, Clock, Send, Phone, LogOut, AlertCircle, RefreshCw, ChevronDown/Right, Eye, Zap, Bell, Package. Suratlar — placeholder; har bir joyda monospace izoh bilan qaysi lifestyle surat kerakligi yozilgan. Telefon raqami, bot nomi, manzil — namuna.


## Yangilanish: kartochka, aksiya, bosh sahifa ritmi, savat

**Kartochka (OSKarta, hamma sahifalarda).** Tartib: rasm 1:1 → brend (11px/500 uppercase ink-500) → nom (13px/500, 2 qator, min-height yo‘q) → reyting (11px) → narx (15px/700) [+ eski narx 12px chizilgan + “N so‘m tejaysiz” 11px/600 emerald-700] → ombor (Sotuvda bor / Kam qoldi — N dona / Vaqtincha mavjud emas) → tugma 44px. Ichki padding 10px, bloklar oralig‘i 4–8px. Chegirmali narx paneli (glass) olib tashlandi.
- **Savatda holati:** karta endi savatdagi **haqiqiy sonni** ko‘rsatadi (mavjud `useCart` dan), 1.4 soniyalik vaqtinchalik “Savatda” flesh **emas**. Ko‘rinishi: `[ − ]  ✓ N  [ + ]` — emerald-50 fon, emerald-200 chegara, har tugma 44×42px. “−” 1 da bosilsa → pozitsiya o‘chadi → oddiy “Savatga” tugmasiga qaytadi. “+” stock’dan oshmaydi (o‘chiq rang ink-400). Son 240ms roll bilan almashadi. “Savatga” bosilganda uchish animatsiyasi saqlanadi.

**Aksiya bloki (03) — tanlangan variant 2b “Sahna”.** Chetdan-chetga ink-950 tasma. Tarkib: ustki yozuv “Aksiya” + nom + `[PROMO: title]`/`[PROMO: subtitle]` + “Barchasini ko‘rish →”; katta bir qatorli taymer (30/38px, tabular, soniyalar brand-300) — faqat `[PROMO: ends_at]`; eng katta chegirma = aksiyadagi, sotuvda bor mahsulotlar ichida max((old_price − price)/old_price) — katta sahna kartasi (m 4:3, t 1:1 + yon ustun, d 16:9), 64/80px “−N%”, narx 24px, “N so‘m tejaysiz” chipi, 48px “Savatga”/stepper; qolgan chegirmalilar — m: suriladigan qator (164px), t: 3 ustun, d: 5 ustun. d: sarlavha+taymer chapda (0.9fr), karta o‘ngda (1.1fr).
- **Fon (yangi, 3D):** 2 aurora dog‘i + 4 ta shaffof 3D kub (brend kubi motivi; 34–88px; 6 yuzli `preserve-3d`, yuz: brand-600 34%→4% gradient + brand-400/50 chegara). Aylanish `rotateX(-22°) rotateY(0→360°)` 18–28s linear, suzish translate3d ±10px + rotate ±6° 12.5–16s alternate — ikkalasi ham ≥12s (qoida). Faqat transform; blur faqat aurora dog‘larida (statik). `prefers-reduced-motion`: kublar harakatsiz turadi. Kub soni 4 dan oshmasin (o‘rta Android).
- **Yakunlandi holati:** taymer 0 ga yetganda (foydalanuvchi sahifadaligida) — soat ikonkasi + “Aksiya yakunlandi / Narxlar odatiy holatga qaytdi.” + “Katalogga o‘tish →”; karta va qator yashiriladi. Keyingi yuklanishda blok umuman chiqmaydi.
- Soxta “N% sotildi” chizig‘i / hisoblagich yo‘q.

**Bosh sahifa ritmi.** Ma’lumoti yo‘q bo‘lim **umuman chizilmaydi**: faol aksiya yoki unda sotuvda bor chegirmali mahsulot bo‘lmasa — aksiya bloki yo‘q; “Xit”/“Yangi”/“Trendda” ro‘yxati bo‘sh bo‘lsa — bo‘lim yo‘q (bo‘sh joy, sarlavha yoki skeleton qolmaydi). Kategoriyalar — barcha o‘lchamlarda gorizontal suriladigan yumaloq plitkalar (m 64px, t/d 92px; oq, shadow-card), rasm `[CATEGORY: image_url]`, bo‘lmasa 2×2 kub motivi (brand-600/300). Hamma bo‘lim sarlavhasi bir xil: ustki yozuv (11px, 0.14em, uppercase, brand-700) + sarlavha (24/28px) + “Barchasi →”. Bo‘limlar orasi 24px (m) / 36px (t, d).

**Savat (07).** “Bepul yetkazishgacha yana `[delivery.remainingForFree]` so‘m” + to‘lib boradigan chiziq (6px, emerald-600 on emerald-600/18%, scaleX 400ms). Chegaraga yetganda: “✓ Yetkazib berish bepul!” (260ms pop-in). Qiymatlar faqat `quoteDelivery(settings, subtotal)`: fill = subtotal / freeThreshold; freeThreshold = 0 bo‘lsa blok yo‘q. Prototipdagi chegara — faqat chiziqni ko‘rsatish uchun namuna.

## Chek printeri (OSChek) — 08 tasdig‘i
Mavjud `OrderReceiptPrinter.tsx` (variant `printer`) ning 3D ko‘rinishi. Mantiq koddagidek, faqat mashina endi haqiqiy 3D quti:
- **Korpus:** CSS 3D (`preserve-3d`), 6 yuz — old panel 320×104 (grafit gradient, “OpenShop”, orange-500 LED chizig‘i — bosishda yonadi, yashil quvvat chirog‘i, FEED tugmasi, rezina oyoqlar), ustki qopqoq 320×210 (qopqoq choki, tutqich, qog‘oz tirqishi — bosishda ichida to‘q sariq nur yuguradi, tishli metall yirtish plankasi), yon va orqa yuzlar, polga tushgan soya. Kamera `rotateX(-20°) rotateY(-14°)`; kursor/telefon egilishi bilan ±9° (420ms). Faqat transform/opacity.
- **Bosish:** koddagi qiymatlar — boshlash 170ms, har qator 82ms (qog‘oz tirqishdan tepaga chiqadi, qator butunligicha paydo bo‘ladi), motor tovushi, har qadamda tik, oxirida “klik”. Qog‘oz tomoshabinga 10° egilgan.
- **Tortish:** qog‘ozni ushlab **pastga va o‘zingizga** tortasiz (tishli plankaga bosib) — `resist(raw) = 132·(1 − e^(−raw/132))`, uzilish 86px; taranglik bilan qog‘oz egilishi 10→32°, pastki qismi old panel ortiga kiradi, qiyshayish 0.8°, chok chizig‘i va chap chekkadagi boshlang‘ich yirtiq paydo bo‘ladi; tola uzilish tovushlari 6 ostonada; yetmasa — prujina bilan qaytadi (560ms, overshoot). Matn: “Chekni torting” → “Qo‘yib yuboring — uziladi”.
- **Yirtilish:** 340ms, ease-out cubic — bo‘lak o‘ng-past burchak atrofida aylanadi, ya’ni chok **chapdan o‘ngga** ketadi (koddagi `TEAR_PROFILE` qiya profili + yirtish plankasi tishlari); mashinada tishli qirrali parcha qoladi va prujina bilan joyiga tushadi; tovush — bandpass 900→4600 Hz sweep + tola chirsillashlari. Yirtilish paytida chek matni o‘zgarmaydi (to‘liq qatorlar). So‘ng bo‘lak tomoshabinga uchadi (460ms), mashina so‘nib pastga tushadi (360ms) va qo‘lda turgan chek markazda paydo bo‘ladi: yuqorisi qiya yirtiq, pasti tishli, yon tomonga surib 360° aylantiriladi, orqa tomoni koddagi `ReceiptBack` matni.
- **3D qoidasi:** qog‘oz, parcha va bo‘lak 3D konteynerning to‘g‘ridan-to‘g‘ri bolalari (`preserve-3d` zanjiri uzilmasin — shartli render uchun wrapper qo‘shilsa, unga ham `transform-style: preserve-3d`). Orqa/old yuz `backface-visibility` + burchakka qarab opacity (ba’zi brauzerlarda backface ishlamaydi).
- **A11y:** “Chekni yirtib olish” tugmasi (44px) tortmasdan yirtadi; ovoz tugmasi; `role=status` matni; `prefers-reduced-motion` → chek darhol chop etilgan, yirtish darhol.
- Chek qatorlari koddagi `buildLines` bilan bir xil; qiymatlar `[order_number]`, `[formatOrderDate(created_at)]`, `[orders.total_amount]` belgilari.
- Amallar (“Buyurtmalarim”, “Telegram botda kuzatish”) printerni kutmaydi.


## Tipografiya va rang ulushi (yakuniy)
- **Shriftlar (2 ta):** Inter — matn, tugma, narx, yorliq; **Onest 600/700** — faqat h1–h3, hero va aksiya sarlavhalari. Google Fonts: `family=Inter:wght@400;500;600;700&family=Onest:wght@600;700`. Tanlov `Shrift taqqoslash.dc.html` da: brauzerda glif qamrovi tekshirildi — Onest 5/5 (ʻ U+02BB, ʼ U+02BC, oʻzbek kirill Ўў Ққ Ғғ Ҳҳ, rus kirill, raqamlar); Manrope ʻ va ʼ ni chizmaydi — chetlashtirildi.
- **Belgilar:** barcha matnda oʻ/gʻ uchun **ʻ (U+02BB)**, tutuq belgisi uchun **ʼ (U+02BC)** ishlatiladi (‘ va ’ emas). Kodda ham shunday yozing (staticPages.ts, i18n).
- **Oʻlchamlar (6 ta):** 12 · 14 · 16 · 20 · 28 · 40 px. Ierarxiya qalinlik bilan: 400 matn, 500 yorliq, 600 tugma/ta’kid, 700 sarlavha/narx. Responsiv sarlavhalar faqat shu qadamlar orasida almashadi (masalan h1: 28 → 40).
- **Raqamlar:** `body { font-variant-numeric: tabular-nums }` — narx, taymer, savat soni, jami teng kenglikda.
- **Brend ulushi (~10%):** #EA6100 / orange-700 faqat asosiy CTA, chegirma nishonlari, faol holat va kichik urgʻularda. Ochiq fondagi ustki yozuvlar (eyebrow) va “Barchasi →” havolalari ink-600 / ink-900 ga oʻtkazildi. Asosiy kompozitsiya — ink-50 fon, oq kartalar, ink-900 matn va toʻq bloklar.
- Oq matn ostida doim orange-700 (#c2410c).

## Tekshiruv
Barcha 14 sahifa 390 va 1280 da ko‘rib chiqildi (01–04, 07, 08 — uchala o‘lchamda); konsolda xato yo‘q. Ekran rasmlari to‘plamga kiritilmagan (so‘rov bo‘yicha).

## Fayllar
- `00 Indeks.dc.html` — kirish, tokenlar, harakat jadvali
- `01 … 14 *.dc.html` — sahifalar
- `OSChek.dc.html` — 3D chek printeri (08 da ishlatiladi)
- `Aksiya bloki variantlar.dc.html` — aksiya 2a/2b taqqoslash (2b tanlangan)
- `OSKarta.dc.html` (karta), `OSHeader.dc.html`, `OSNav.dc.html`, `OSFooter.dc.html`, `OSQuick.dc.html` — umumiy komponentlar
- `os-proto.js` (animatsiya yordamchilari: tilt, fly, ring, roll, burst, gyro), `os-app.js` (holat, freym, karta view-modeli — ko‘rsatish qoidalari shu yerda)
- `support.js` — prototip runtime (implementatsiyaga kerak emas)
- Kod bazasi xaritasi: karta → `src/lib/ProductCard.tsx`; pastki nav → `BottomNav.tsx`; kublar → `CatalogCubes.tsx`; aurora → `AuroraBackground.tsx`; bosh sahifa → `HomePage.tsx`; header → `ui.tsx`; vaqt/egri chiziqlar → `motion.ts`; klass retseptlari → `design.ts`; tokenlar → `tailwind.config.js`.
