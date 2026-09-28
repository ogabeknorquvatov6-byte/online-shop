# Xavfsizlik: joriy holat va deploy talablari

Bu hujjat kodda hal qilingan narsalarni EMAS, deploy paytida qo'lda
bajarilishi shart bo'lgan ishlarni sanaydi. Kodda hal qilinganlari
tegishli fayllardagi izohlarda tushuntirilgan.

---

## 1. Edge Function sirlari — MAJBURIY

Uchala funksiya ham endi **fail-closed**: sir o'rnatilmagan bo'lsa
funksiya butun trafikni rad etadi (HTTP 500) va hech narsani qayta
ishlamaydi.

Ilgari ular fail-open edi (`if (SECRET) { tekshir }`) — ya'ni sir
yo'q bo'lsa tekshiruv umuman bajarilmasdi va funksiya URL'ini bilgan
har kim botni `service_role` huquqlari bilan boshqara olardi.

**Deploy qilishdan oldin shu sirlar o'rnatilgan bo'lishi SHART**,
aks holda bot va bildirishnomalar ishlamaydi:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase secrets set TELEGRAM_WEBHOOK_SECRET=...     # telegram-bot + stock-alert-notify
supabase secrets set ORDER_WEBHOOK_SECRET=...        # telegram-order-notify
supabase secrets set ADMIN_CHAT_ID=...
```

Sirni tasodifiy va uzun qiling:

```bash
openssl rand -hex 32
```

Telegram webhook'ini shu sir bilan ro'yxatdan o'tkazing:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT>.functions.supabase.co/telegram-bot" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Database Webhook'lar uchun Supabase Dashboard → Database → Webhooks →
**HTTP Headers** bo'limiga qo'ying:

| Funksiya | Sarlavha | Qiymat |
|---|---|---|
| `stock-alert-notify` | `X-Webhook-Secret` | `TELEGRAM_WEBHOOK_SECRET` |
| `telegram-order-notify` | `x-webhook-secret` | `ORDER_WEBHOOK_SECRET` |

Regressiya testi: `src/lib/__tests__/edgeFunctionSecurity.test.ts`
haqiqiy manba fayllarni o'qib, fail-open naqsh qaytib kelmaganini
tekshiradi.

---

## 2. Content-Security-Policy — HOZIRCHA REPORT-ONLY

`vercel.json` da CSP **`Content-Security-Policy-Report-Only`** sifatida
qo'yilgan, ya'ni u hozircha hech narsani BLOKLAMAYDI.

Bu ataylab. Noto'g'ri sozlangan CSP ishlab turgan do'konni oq ekranga
aylantiradi, joriy siyosat esa haqiqiy brauzerda hali tekshirilmagan.
Ayniqsa **onlayn to'lov (Click/Payme) qayta yo'naltirishlari** tekshirilishi
kerak — ular `form-action` va `frame-src` ga ta'sir qilishi mumkin.

### Qanday yoqiladi

1. Staging'ga deploy qiling.
2. Quyidagi oqimlarni to'liq bosib chiqing, DevTools → Console'da
   `Content-Security-Policy` buzilishlarini kuzating:
   - bosh sahifa, katalog, mahsulot sahifasi (rasmlar);
   - savat → checkout → **naqd pul bilan buyurtma**;
   - **Click va Payme bilan to'lov** (eng muhimi);
   - Google bilan kirish;
   - admin panel (rasm yuklash).
3. Buzilish bo'lsa — tegishli manbani siyosatga qo'shing.
4. Buzilish qolmagach, `vercel.json` da kalit nomini
   `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
   ga o'zgartiring.

Tekshirilmagan CSP'ni majburiy rejimda yoqish — do'konni yo'qotish
xavfi; report-only rejim esa buzilishlarni ko'rsatadi, lekin hech
kimga zarar yetkazmaydi.

---

## 3. Muhit o'zgaruvchilari

`VITE_` prefiksi bilan boshlangan HAR QANDAY o'zgaruvchi brauzer
bundle'iga tushadi va ochiq ko'rinadi. U yerga faqat public qiymatlar:

| O'zgaruvchi | Joyi | Maxfiymi |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | yo'q (public) |
| `VITE_SUPABASE_ANON_KEY` | frontend | yo'q (public, RLS himoya qiladi) |
| `VITE_TELEGRAM_BOT_USERNAME` | frontend | yo'q |
| `VITE_SITE_URL` | frontend | yo'q |
| `SUPABASE_SERVICE_ROLE_KEY` | faqat Edge Function | **HA** |
| `TELEGRAM_BOT_TOKEN` | faqat Edge Function | **HA** |
| `TELEGRAM_WEBHOOK_SECRET` | faqat Edge Function | **HA** |
| `ORDER_WEBHOOK_SECRET` | faqat Edge Function | **HA** |

CI (`.github/workflows/ci.yml`) har bir build'dan keyin `dist/` ichida
server sirlariga o'xshash matn borligini avtomatik tekshiradi.

---

## 4. Ma'lumotlar bazasi

`supabase/migrations/20260909000000_order_integrity_hardening.sql`
buyurtma yaxlitligini mustahkamlaydi (idempotentlik, holatlar mashinasi,
naqd pul holati, ombor yig'indisi).

**Bu migratsiya hali PRODUKSIYAGA QO'LLANMAGAN.** U ishlab turgan
bazadagi ma'lumotni o'zgartiradi (`orders.payment_status` ni yangilaydi)
va eski funksiya imzolarini o'chiradi, shuning uchun qo'llash — ongli
qaror. Qo'llashdan oldin zaxira nusxa oling:

```bash
supabase db dump -f backup-$(date +%F).sql
supabase db push
```

Qo'llagandan keyin frontend ham yangilanishi SHART: `create_order`
endi `p_checkout_request_id` parametrini qabul qiladi va eski imzo
o'chiriladi.
