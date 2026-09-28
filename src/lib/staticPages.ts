/*
 * Statik sahifalar mazmuni.
 *
 * Ilgari /about, /contact, /delivery, /returns va /faq bitta qatorlik
 * matndan iborat edi ("Tez-tez beriladigan savollar." — savollarning o'zi
 * yo'q). Bunday sahifalar mijozda "sayt tugallanmagan" taassurotini
 * qoldiradi va aynan ular xarid oldidan eng ko'p o'qiladigan sahifalardir.
 *
 * Matn markaziy joyda saqlanadi, chunki u bir necha sahifada takrorlanadi
 * (yetkazib berish shartlari footer va mahsulot sahifasida ham keladi).
 */

export type StaticSection = {
  heading: string;
  body?: string;
  items?: string[];
};

export type StaticPageContent = {
  title: string;
  description: string;
  intro: string;
  sections: StaticSection[];
};

const PAGES = {
  '/about': {
    title: 'Biz haqimizda',
    description: "OpenShop — O'zbekistondagi ishonchli online-do'kon: rasmiy mahsulotlar, tez yetkazib berish va halol narx.",
    intro:
      'OpenShop — texnika va kundalik hayot uchun kerakli mahsulotlarni bir joydan, ortiqcha ovoragarchiliksiz sotib olish imkonini beruvchi online-do‘kon.',
    sections: [
      {
        heading: 'Nima bilan shug‘ullanamiz',
        body: 'Telefonlar, noutbuklar, audio texnika, aksessuarlar va maishiy texnikani rasmiy yetkazib beruvchilardan olib, mijozga to‘g‘ridan-to‘g‘ri sotamiz. Oraliq bo‘g‘inlar kamaygani uchun narx ham pastroq bo‘ladi.',
      },
      {
        heading: 'Nega bizga ishonishadi',
        items: [
          'Har bir mahsulot rasmiy kafolat taloni bilan beriladi.',
          'Mahsulotni kuryer oldida ko‘rib, keyin to‘lash mumkin.',
          '14 kun ichida sabab ko‘rsatmasdan qaytarish huquqi.',
          'Buyurtma holati «Buyurtmalarim» bo‘limida real vaqtda ko‘rinadi.',
        ],
      },
      {
        heading: 'Ish vaqti',
        body: 'Buyurtmalar sayt orqali kunning istalgan vaqtida qabul qilinadi. Operatorlar har kuni 09:00 dan 21:00 gacha ishlaydi.',
      },
    ],
  },

  '/contact': {
    title: 'Aloqa',
    description: "OpenShop bilan bog'lanish: telefon, Telegram va ish vaqti.",
    intro: 'Savol, taklif yoki shikoyatingiz bo‘lsa — bog‘laning. Odatda bir necha daqiqada javob beramiz.',
    sections: [
      {
        heading: 'Bog‘lanish uchun',
        items: [
          'Telefon va Telegram raqamlari saytning quyi qismida (footer) ko‘rsatilgan.',
          'Buyurtma bo‘yicha savolda buyurtma raqamini (masalan OS-260830-0001) tayyorlab qo‘ying — shunda tezroq yordam beramiz.',
        ],
      },
      {
        heading: 'Ish vaqti',
        body: 'Dushanba–yakshanba, 09:00–21:00. Bu vaqtdan tashqari yuborilgan murojaatlarga ertasi kuni ertalab javob beriladi.',
      },
      {
        heading: 'Hamkorlik',
        body: 'Yetkazib beruvchi yoki hamkor sifatida ishlashni istasangiz, footerdagi email orqali taklifingizni yuboring.',
      },
    ],
  },

  '/delivery': {
    title: 'Yetkazib berish',
    description: "OpenShop yetkazib berish shartlari, muddatlari va narxlari.",
    intro: 'Buyurtmangizni butun O‘zbekiston bo‘ylab yetkazib beramiz. Yetkazib berish narxi savat va checkout sahifalarida oldindan aniq ko‘rsatiladi.',
    sections: [
      {
        heading: 'Muddatlar',
        items: [
          'Toshkent shahri: odatda 1 ish kuni ichida.',
          'Viloyatlar: 2–3 ish kuni ichida.',
          'Buyurtma tasdiqlangach, kuryer yetkazishdan oldin qo‘ng‘iroq qiladi.',
        ],
      },
      {
        heading: 'Narx',
        body: 'Yetkazib berish narxi shahar va buyurtma summasiga qarab hisoblanadi. Belgilangan summadan yuqori buyurtmalarda yetkazib berish bepul — aniq chegara savat sahifasida ko‘rsatiladi.',
      },
      {
        heading: 'To‘lov',
        items: [
          'Naqd pul — mahsulotni ko‘rib, kuryerga to‘laysiz.',
          'Click yoki Payme — onlayn to‘lov (tasdiqlanishi bir necha daqiqa olishi mumkin).',
        ],
      },
      {
        heading: 'Muhim',
        body: 'Kuryer kelganda mahsulotni ochib ko‘rish va tekshirish huquqingiz bor. Mahsulot buyurtmaga mos kelmasa, uni qabul qilmasangiz ham bo‘ladi.',
      },
    ],
  },

  '/returns': {
    title: 'Qaytarish va almashtirish',
    description: "OpenShop qaytarish siyosati: 14 kun ichida qaytarish shartlari.",
    intro: 'Mahsulot sizga to‘g‘ri kelmasa, uni 14 kun ichida qaytarishingiz mumkin.',
    sections: [
      {
        heading: 'Qaytarish shartlari',
        items: [
          'Mahsulot ishlatilmagan va tovar ko‘rinishini saqlagan bo‘lishi kerak.',
          'Original qadoq, aksessuarlar va kafolat taloni saqlangan bo‘lsin.',
          'Qaytarish uchun buyurtma raqami talab qilinadi.',
        ],
      },
      {
        heading: 'Nuqsonli mahsulot',
        body: 'Mahsulotda ishlab chiqarish nuqsoni aniqlansa, u kafolat shartlari asosida bepul almashtiriladi yoki puli to‘liq qaytariladi. Bunday holatda yetkazib berish xarajati ham bizning zimmamizda.',
      },
      {
        heading: 'Pulni qaytarish muddati',
        body: 'Mahsulot qabul qilinib tekshirilgandan so‘ng, to‘lov usuliga qarab 1–5 ish kuni ichida pul qaytariladi.',
      },
      {
        heading: 'Qaytarib bo‘lmaydigan holatlar',
        items: [
          'Mexanik shikast yetkazilgan mahsulotlar.',
          'Gigiyenik sabablarga ko‘ra qaytarilmaydigan toifadagi tovarlar (masalan quloqchin qulog‘iga tegadigan qismlari ochilgan bo‘lsa).',
        ],
      },
    ],
  },

  '/faq': {
    title: 'Ko‘p so‘raladigan savollar',
    description: "Buyurtma, to'lov, yetkazib berish va kafolat bo'yicha eng ko'p so'raladigan savollarga javoblar.",
    intro: 'Eng ko‘p beriladigan savollarni bir joyga to‘pladik. Javobini topa olmasangiz — bizga yozing.',
    sections: [
      {
        heading: 'Buyurtmani qanday beraman?',
        body: 'Mahsulotni savatga qo‘shing, «Buyurtmani rasmiylashtirish» tugmasini bosing va manzil hamda to‘lov usulini tanlang. Buyurtma raqami darhol beriladi.',
      },
      {
        heading: 'Ro‘yxatdan o‘tish shartmi?',
        body: 'Katalogni ko‘rish va savat to‘ldirish uchun shart emas. Buyurtma berish uchun esa hisob kerak — bu buyurtmangiz holatini kuzatib borish imkonini beradi.',
      },
      {
        heading: 'Buyurtmani bekor qila olamanmi?',
        body: 'Ha. Buyurtma «Yangi» holatida turganda «Buyurtmalarim» bo‘limidan o‘zingiz bekor qilishingiz mumkin. Keyingi bosqichlarda operator bilan bog‘laning.',
      },
      {
        heading: 'Narx nega savatda o‘zgardi?',
        body: 'Savat mahsulot ma’lumotlarini saqlaydi va sayt ochilganda ularni bazadagi joriy narx bilan solishtiradi. Aksiya tugagan yoki narx yangilangan bo‘lsa, savat avtomatik yangilanadi va bu haqda xabar beriladi.',
      },
      {
        heading: 'Kafolat qancha?',
        body: 'Kafolat muddati ishlab chiqaruvchiga bog‘liq va kafolat talonida ko‘rsatiladi. Kafolat holatlari bo‘yicha biz mijozga to‘liq ko‘maklashamiz.',
      },
      {
        heading: 'To‘lovni qanday amalga oshiraman?',
        body: 'Naqd pul (kuryerga), Click yoki Payme orqali. Onlayn to‘lovda buyurtma to‘lov tasdiqlangandan keyin ishga olinadi.',
      },
    ],
  },
} satisfies Record<string, StaticPageContent>;

/**
 * `/about` | `/contact` | `/delivery` | `/returns` | `/faq`
 *
 * Ilgari `STATIC_PAGES` `Record<string, …>` edi: TypeScript uchun ISTALGAN
 * satr yaroqli kalit bo'lib ko'rinar, `STATIC_PAGES['/xyz']` tekshiruvdan
 * o'tib ketar, lekin ish vaqtida `undefined` qaytarib sahifani oq ekranga
 * aylantirardi. `satisfies` kalitlarni literal birlashma sifatida saqlaydi
 * — endi marshrut jadvali ham, sitemap ham shu ro'yxatga tayanadi.
 */
export type StaticPagePath = keyof typeof PAGES;

export const STATIC_PAGES: Record<StaticPagePath, StaticPageContent> = PAGES;
