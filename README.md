# OpenShop

O‘zbekiston bozori uchun onlayn do‘kon: katalog, savat, buyurtma
rasmiylashtirish, shaxsiy kabinet, admin paneli va Telegram bot orqali
to‘liq savdo kanali.

**Stek:** React 18 · TypeScript · Vite · Tailwind CSS · Motion · Supabase
(Postgres + Auth + Storage + Edge Functions)

---

## Tez boshlash

```bash
npm ci                 # aynan lockfile bo'yicha o'rnatish
cp .env.example .env    # qiymatlarni to'ldiring (pastda)
npm run dev             # http://localhost:5173
```

Node 20+ talab qilinadi.

---

## Muhit o‘zgaruvchilari

`.env` faylini `.env.example` dan nusxalab to‘ldiring. **`.env`
repozitoriyaga tushmaydi** (`.gitignore` da).

| O‘zgaruvchi | Majburiy | Tavsif |
|---|---|---|
| `VITE_SUPABASE_URL` | ha | Supabase loyiha URL'i |
| `VITE_SUPABASE_ANON_KEY` | ha | Public anon kalit (RLS himoya qiladi) |
| `VITE_TELEGRAM_BOT_USERNAME` | yo‘q | Ro‘yxatdan o‘tish boti (`@` siz) |
| `VITE_SITE_URL` | produksiyada ha | Domen, oxirida `/` siz |

`VITE_SITE_URL` berilmasa: canonical manzillar joriy domendan olinadi
va **`sitemap.xml` umuman yaratilmaydi** (build ogohlantirish chiqaradi,
lekin to‘xtamaydi). Bu ataylab — noto‘g‘ri domenli sitemap umuman
yo‘q sitemapdan yomonroq.

> `VITE_` prefiksli har qanday o‘zgaruvchi brauzer bundle'iga tushadi.
> Server sirlari (service_role, bot tokeni, webhook sirlari) u yerga
> **hech qachon** yozilmaydi — ular Supabase Edge Function secret'lari.
> Batafsil: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Supabase

### Migratsiyalar

```bash
supabase link --project-ref <PROJECT_REF>
supabase db dump -f backup-$(date +%F).sql   # produksiyada: avval zaxira
supabase db push
```

Migratsiyalar `supabase/migrations/` da, vaqt belgisi bo‘yicha tartibda.
Har birining boshida nima uchun kerakligi izohlangan.

### Edge Function'lar

```bash
supabase functions deploy telegram-bot
supabase functions deploy telegram-order-notify
supabase functions deploy stock-alert-notify
```

Deploy qilishdan **oldin** sirlarni o‘rnating — funksiyalar fail-closed,
ya‘ni sirsiz butun trafikni rad etadi. To‘liq ro‘yxat va webhook
sozlamalari: [`docs/SECURITY.md`](docs/SECURITY.md).

### Admin tayinlash

Admin huquqi `profiles.is_admin` ustunida. Uni brauzerdan o‘zgartirib
bo‘lmaydi — `protect_profile_privileged_fields` triggeri buni bloklaydi.
Faqat SQL editordan:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'admin@example.uz');
```

---

## Buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | Dev-server |
| `npm run build` | Produksiya build + `robots.txt`/`sitemap.xml` |
| `npm run preview` | Build natijasini lokal ko‘rish |
| `npm run typecheck` | TypeScript tekshiruvi |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (bir marta) |
| `npm run test:watch` | Vitest (kuzatuv rejimi) |
| `npm run verify` | typecheck + lint + test + build |

CI (`.github/workflows/ci.yml`) har push/PR da `npm run verify` ni
bajaradi va build chiqishini tekshiradi (`robots.txt`, `_redirects`,
bundle'da server siri yo‘qligi).

---

## Testlar

```
src/lib/__tests__/
  routes.test.ts               marshrutlar, buzuq URL'lar, sitemap yo'llari
  pricing.test.ts              narx, chegirma, savat, yetkazib berish
  cartResilience.test.ts       buzuq localStorage, idempotentlik kaliti
  search.test.ts               LIKE qochirish, ajratib ko'rsatish
  adminPagination.test.ts      sahifalash, PostgREST filtr in'yeksiyasi
  edgeFunctionSecurity.test.ts Edge Function manbalarini tekshiradi
  legacyHashUrl.test.ts        eski `#/` havolalar ko'chirilishi
```

`edgeFunctionSecurity.test.ts` **haqiqiy** `supabase/functions/*/index.ts`
fayllarini o‘qiydi — mantiqning nusxasini emas. Shuning uchun fail-open
sir tekshiruvi qaytib kelsa, test darhol qizil bo‘ladi.

---

## Deploy

Ilova **History API** marshrutlarida ishlaydi (`/product/iphone-15`),
shuning uchun serverda SPA-fallback SHART: noma’lum yo‘lda `index.html`
qaytarilishi kerak.

| Platforma | Konfiguratsiya |
|---|---|
| Vercel | `vercel.json` (repozitoriyada) |
| Netlify / Cloudflare Pages | `public/_redirects` (repozitoriyada) |
| Nginx | `location / { try_files $uri /index.html; }` |

Eski `#/...` havolalar avtomatik toza manzilga ko‘chiriladi
(`migrateLegacyHashUrl`), shuning uchun bot xabarlaridagi va
xatcho‘plardagi havolalar buzilmaydi.

---

## Produksiya nazorat ro‘yxati

- [ ] `VITE_SITE_URL` produksiya domeniga qo‘yilgan
- [ ] `supabase db push` bajarilgan (avval zaxira olingan)
- [ ] Edge Function sirlari o‘rnatilgan va funksiyalar deploy qilingan
- [ ] Telegram webhook `secret_token` bilan ro‘yxatdan o‘tkazilgan
- [ ] Database Webhook'larga sir sarlavhalari qo‘shilgan
- [ ] `dist/sitemap.xml` va `dist/robots.txt` mavjud
- [ ] CSP staging'da tekshirilgan va majburiy rejimga o‘tkazilgan
      (qarang: `docs/SECURITY.md`)
- [ ] Kamida bitta admin tayinlangan

---

## Arxitektura haqida qisqacha

- **Marshrutlar** — `src/lib/routes.ts` da bitta sof funksiya
  (`matchRoute`). Yangi sahifa qo‘shish shu yerdan boshlanadi;
  sitemap va SEO ham shu ro‘yxatga tayanadi.
- **Narx va ombor** — hech qachon mijozdan olinmaydi. `create_order`
  RPC hamma narsani bazadagi qiymatlardan qayta hisoblaydi.
- **Checkout idempotent** — har bir urinish uchun `checkout_request_id`,
  bazada UNIQUE. Takroriy so‘rov mavjud buyurtmani qaytaradi.
- **Dizayn tizimi** — `src/lib/design.ts` dagi sinf retseptlari. Tugma
  yoki input noto‘g‘ri ko‘rinsa, u bir joyda tuzatiladi.
- **Bot va sayt bitta mantiqni ishlatadi** — `create_order_as` ikkalasi
  uchun ham yagona manba, shuning uchun ular narxni har xil hisoblab
  ajralib ketmaydi.
