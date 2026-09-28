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
    description: "OpenShop — Oʻzbekistondagi ishonchli online-doʻkon: rasmiy mahsulotlar, tez yetkazib berish va halol narx.",
    intro:
      'OpenShop — texnika va kundalik hayot uchun kerakli mahsulotlarni bir joydan, ortiqcha ovoragarchiliksiz sotib olish imkonini beruvchi online-doʻkon.',
    sections: [
      {
        heading: 'Nima bilan shugʻullanamiz',
        body: 'Telefonlar, noutbuklar, audio texnika, aksessuarlar va maishiy texnikani rasmiy yetkazib beruvchilardan olib, mijozga toʻgʻridan-toʻgʻri sotamiz. Oraliq boʻgʻinlar kamaygani uchun narx ham pastroq boʻladi.',
      },
      {
        heading: 'Nega bizga ishonishadi',
        items: [
          'Har bir mahsulot rasmiy kafolat taloni bilan beriladi.',
          'Mahsulotni kuryer oldida koʻrib, keyin toʻlash mumkin.',
          '14 kun ichida sabab koʻrsatmasdan qaytarish huquqi.',
          'Buyurtma holati «Buyurtmalarim» boʻlimida real vaqtda koʻrinadi.',
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
    description: "OpenShop bilan bogʻlanish: telefon, Telegram va ish vaqti.",
    intro: 'Savol, taklif yoki shikoyatingiz boʻlsa — bogʻlaning. Odatda bir necha daqiqada javob beramiz.',
    sections: [
      {
        heading: 'Bogʻlanish uchun',
        items: [
          'Telefon va Telegram raqamlari saytning quyi qismida (footer) koʻrsatilgan.',
          'Buyurtma boʻyicha savolda buyurtma raqamini (masalan OS-260830-0001) tayyorlab qoʻying — shunda tezroq yordam beramiz.',
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
    intro: 'Buyurtmangizni butun Oʻzbekiston boʻylab yetkazib beramiz. Yetkazib berish narxi savat va checkout sahifalarida oldindan aniq koʻrsatiladi.',
    sections: [
      {
        heading: 'Muddatlar',
        items: [
          'Toshkent shahri: odatda 1 ish kuni ichida.',
          'Viloyatlar: 2–3 ish kuni ichida.',
          'Buyurtma tasdiqlangach, kuryer yetkazishdan oldin qoʻngʻiroq qiladi.',
        ],
      },
      {
        heading: 'Narx',
        body: 'Yetkazib berish narxi shahar va buyurtma summasiga qarab hisoblanadi. Belgilangan summadan yuqori buyurtmalarda yetkazib berish bepul — aniq chegara savat sahifasida koʻrsatiladi.',
      },
      {
        heading: 'Toʻlov',
        items: [
          'Naqd pul — mahsulotni koʻrib, kuryerga toʻlaysiz.',
          'Click yoki Payme — onlayn toʻlov (tasdiqlanishi bir necha daqiqa olishi mumkin).',
        ],
      },
      {
        heading: 'Muhim',
        body: 'Kuryer kelganda mahsulotni ochib koʻrish va tekshirish huquqingiz bor. Mahsulot buyurtmaga mos kelmasa, uni qabul qilmasangiz ham boʻladi.',
      },
    ],
  },

  '/returns': {
    title: 'Qaytarish va almashtirish',
    description: "OpenShop qaytarish siyosati: 14 kun ichida qaytarish shartlari.",
    intro: 'Mahsulot sizga toʻgʻri kelmasa, uni 14 kun ichida qaytarishingiz mumkin.',
    sections: [
      {
        heading: 'Qaytarish shartlari',
        items: [
          'Mahsulot ishlatilmagan va tovar koʻrinishini saqlagan boʻlishi kerak.',
          'Original qadoq, aksessuarlar va kafolat taloni saqlangan boʻlsin.',
          'Qaytarish uchun buyurtma raqami talab qilinadi.',
        ],
      },
      {
        heading: 'Nuqsonli mahsulot',
        body: 'Mahsulotda ishlab chiqarish nuqsoni aniqlansa, u kafolat shartlari asosida bepul almashtiriladi yoki puli toʻliq qaytariladi. Bunday holatda yetkazib berish xarajati ham bizning zimmamizda.',
      },
      {
        heading: 'Pulni qaytarish muddati',
        body: 'Mahsulot qabul qilinib tekshirilgandan soʻng, toʻlov usuliga qarab 1–5 ish kuni ichida pul qaytariladi.',
      },
      {
        heading: 'Qaytarib boʻlmaydigan holatlar',
        items: [
          'Mexanik shikast yetkazilgan mahsulotlar.',
          'Gigiyenik sabablarga koʻra qaytarilmaydigan toifadagi tovarlar (masalan quloqchin qulogʻiga tegadigan qismlari ochilgan boʻlsa).',
        ],
      },
    ],
  },

  '/faq': {
    title: 'Koʻp soʻraladigan savollar',
    description: "Buyurtma, toʻlov, yetkazib berish va kafolat boʻyicha eng koʻp soʻraladigan savollarga javoblar.",
    intro: 'Eng koʻp beriladigan savollarni bir joyga toʻpladik. Javobini topa olmasangiz — bizga yozing.',
    sections: [
      {
        heading: 'Buyurtmani qanday beraman?',
        body: 'Mahsulotni savatga qoʻshing, «Buyurtmani rasmiylashtirish» tugmasini bosing va manzil hamda toʻlov usulini tanlang. Buyurtma raqami darhol beriladi.',
      },
      {
        heading: 'Roʻyxatdan oʻtish shartmi?',
        body: 'Katalogni koʻrish va savat toʻldirish uchun shart emas. Buyurtma berish uchun esa hisob kerak — bu buyurtmangiz holatini kuzatib borish imkonini beradi.',
      },
      {
        heading: 'Buyurtmani bekor qila olamanmi?',
        body: 'Ha. Buyurtma «Yangi» holatida turganda «Buyurtmalarim» boʻlimidan oʻzingiz bekor qilishingiz mumkin. Keyingi bosqichlarda operator bilan bogʻlaning.',
      },
      {
        heading: 'Narx nega savatda oʻzgardi?',
        body: 'Savat mahsulot maʼlumotlarini saqlaydi va sayt ochilganda ularni bazadagi joriy narx bilan solishtiradi. Aksiya tugagan yoki narx yangilangan boʻlsa, savat avtomatik yangilanadi va bu haqda xabar beriladi.',
      },
      {
        heading: 'Kafolat qancha?',
        body: 'Kafolat muddati ishlab chiqaruvchiga bogʻliq va kafolat talonida koʻrsatiladi. Kafolat holatlari boʻyicha biz mijozga toʻliq koʻmaklashamiz.',
      },
      {
        heading: 'Toʻlovni qanday amalga oshiraman?',
        body: 'Naqd pul (kuryerga), Click yoki Payme orqali. Onlayn toʻlovda buyurtma toʻlov tasdiqlangandan keyin ishga olinadi.',
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
