import { translator, type Dict } from './core.ts';

/*
 * Savdo bo'limining matnlari (katalog, savat, checkout, bildirishnomalar).
 * Autentifikatsiya matnlari `index.ts` dagi eski lug'atda qoladi — ular
 * ishlab turibdi va tegilmaydi.
 */
const D: Dict = {
  // ── Katalog ──
  btn_catalog: { uz: '🛍 Katalog', ru: '🛍 Каталог', en: '🛍 Catalog' },
  btn_cart: { uz: '🛒 Savatim', ru: '🛒 Моя корзина', en: '🛒 My cart' },
  categories_title: { uz: '🛍 <b>Katalog</b>\n\nBo‘limni tanlang:', ru: '🛍 <b>Каталог</b>\n\nВыберите раздел:', en: '🛍 <b>Catalog</b>\n\nChoose a section:' },
  no_categories: { uz: 'Hozircha bo‘limlar yo‘q.', ru: 'Разделов пока нет.', en: 'No sections yet.' },
  no_products: { uz: 'Bu bo‘limda hozircha mahsulot yo‘q.', ru: 'В этом разделе пока нет товаров.', en: 'No products in this section yet.' },
  category_title: { uz: '📂 <b>{name}</b>\n\n{count} ta mahsulot · {page}/{pages}-sahifa', ru: '📂 <b>{name}</b>\n\n{count} товаров · стр. {page}/{pages}', en: '📂 <b>{name}</b>\n\n{count} products · page {page}/{pages}' },
  btn_prev: { uz: '◀️ Oldingi', ru: '◀️ Назад', en: '◀️ Prev' },
  btn_next: { uz: 'Keyingi ▶️', ru: 'Вперёд ▶️', en: 'Next ▶️' },
  btn_details: { uz: 'ℹ️ Batafsil', ru: 'ℹ️ Подробнее', en: 'ℹ️ Details' },
  btn_add_to_cart: { uz: '🛒 Savatga', ru: '🛒 В корзину', en: '🛒 Add to cart' },
  btn_back_to_categories: { uz: '🔙 Bo‘limlar', ru: '🔙 Разделы', en: '🔙 Sections' },
  btn_back_to_category: { uz: '🔙 Ro‘yxatga', ru: '🔙 К списку', en: '🔙 Back to list' },

  // ── Mahsulot kartasi ──
  product_card: {
    uz: '<b>{name}</b>\n{brand}\n\n{price}\n{stock}\n\n{description}',
    ru: '<b>{name}</b>\n{brand}\n\n{price}\n{stock}\n\n{description}',
    en: '<b>{name}</b>\n{brand}\n\n{price}\n{stock}\n\n{description}',
  },
  in_stock: { uz: '✅ Sotuvda bor', ru: '✅ В наличии', en: '✅ In stock' },
  low_stock: { uz: '⚠️ Kam qoldi — {n} dona', ru: '⚠️ Осталось мало — {n} шт', en: '⚠️ Only {n} left' },
  out_of_stock: { uz: '❌ Sotuvda yo‘q', ru: '❌ Нет в наличии', en: '❌ Out of stock' },
  no_description: { uz: 'Tavsif qo‘shilmagan.', ru: 'Описание не добавлено.', en: 'No description yet.' },
  price_with_old: { uz: '💰 <b>{price}</b>  <s>{old}</s>  −{discount}%', ru: '💰 <b>{price}</b>  <s>{old}</s>  −{discount}%', en: '💰 <b>{price}</b>  <s>{old}</s>  −{discount}%' },
  price_plain: { uz: '💰 <b>{price}</b>', ru: '💰 <b>{price}</b>', en: '💰 <b>{price}</b>' },
  qty_label: { uz: 'Miqdor: {n}', ru: 'Количество: {n}', en: 'Quantity: {n}' },
  added_to_cart: { uz: '✅ «{name}» savatga qo‘shildi', ru: '✅ «{name}» добавлен в корзину', en: '✅ “{name}” added to cart' },
  choose_variant: { uz: 'Avval variantni tanlang', ru: 'Сначала выберите вариант', en: 'Choose a variant first' },
  max_stock_reached: { uz: 'Omborda {n} donadan ko‘p yo‘q', ru: 'На складе не больше {n} шт', en: 'Only {n} available' },

  // ── Ombor bildirishnomasi ──
  btn_notify_me: { uz: '🔔 Mavjud bo‘lganda xabar bering', ru: '🔔 Сообщить о поступлении', en: '🔔 Notify when available' },
  alert_added: { uz: '🔔 Yaxshi! Mahsulot sotuvga chiqishi bilan xabar beramiz.', ru: '🔔 Готово! Сообщим, когда товар появится.', en: '🔔 Done! We’ll let you know when it’s back.' },
  alert_exists: { uz: 'Siz allaqachon obuna bo‘lgansiz.', ru: 'Вы уже подписаны.', en: 'You are already subscribed.' },
  back_in_stock: {
    uz: '🔔 <b>{name}</b> yana sotuvda!\n\n{price}\n\nTez bo‘ling — miqdor cheklangan.',
    ru: '🔔 <b>{name}</b> снова в наличии!\n\n{price}\n\nУспейте — количество ограничено.',
    en: '🔔 <b>{name}</b> is back in stock!\n\n{price}\n\nHurry — limited quantity.',
  },

  // ── Savat ──
  cart_empty: { uz: '🛒 Savatingiz bo‘sh.\n\nKatalogdan mahsulot tanlang.', ru: '🛒 Ваша корзина пуста.\n\nВыберите товар в каталоге.', en: '🛒 Your cart is empty.\n\nPick something from the catalog.' },
  cart_title: { uz: '🛒 <b>Savatingiz</b>\n\n{lines}\n\n➖➖➖\nMahsulotlar: <b>{subtotal}</b>', ru: '🛒 <b>Ваша корзина</b>\n\n{lines}\n\n➖➖➖\nТовары: <b>{subtotal}</b>', en: '🛒 <b>Your cart</b>\n\n{lines}\n\n➖➖➖\nItems: <b>{subtotal}</b>' },
  cart_line: { uz: '{i}. {name}\n     {qty} × {price} = <b>{sum}</b>', ru: '{i}. {name}\n     {qty} × {price} = <b>{sum}</b>', en: '{i}. {name}\n     {qty} × {price} = <b>{sum}</b>' },
  btn_checkout: { uz: '✅ Buyurtma berish', ru: '✅ Оформить заказ', en: '✅ Checkout' },
  btn_clear_cart: { uz: '🗑 Savatni tozalash', ru: '🗑 Очистить корзину', en: '🗑 Clear cart' },
  cart_cleared: { uz: 'Savat tozalandi.', ru: 'Корзина очищена.', en: 'Cart cleared.' },
  item_removed: { uz: 'Mahsulot savatdan olib tashlandi.', ru: 'Товар удалён из корзины.', en: 'Item removed from cart.' },
  cart_item_gone: { uz: '⚠️ Ba’zi mahsulotlar sotuvdan olindi va savatdan chiqarildi.', ru: '⚠️ Некоторые товары сняты с продажи и удалены из корзины.', en: '⚠️ Some items are no longer for sale and were removed.' },

  // ── Checkout ──
  checkout_login_required: {
    uz: '🔐 Buyurtma berish uchun avval hisobingizga kiring yoki ro‘yxatdan o‘ting.',
    ru: '🔐 Чтобы оформить заказ, войдите в аккаунт или зарегистрируйтесь.',
    en: '🔐 Please sign in or register to place an order.',
  },
  choose_address: { uz: '📍 Yetkazib berish manzilini tanlang:', ru: '📍 Выберите адрес доставки:', en: '📍 Choose a delivery address:' },
  btn_send_location: { uz: '📍 Joylashuvni yuborish', ru: '📍 Отправить локацию', en: '📍 Send location' },
  btn_type_address: { uz: '✍️ Manzilni yozish', ru: '✍️ Ввести адрес', en: '✍️ Type address' },
  ask_address_text: { uz: 'Manzilni yozing (shahar, ko‘cha, uy):', ru: 'Введите адрес (город, улица, дом):', en: 'Type your address (city, street, house):' },
  address_too_short: { uz: '❌ Manzil juda qisqa. To‘liqroq yozing:', ru: '❌ Адрес слишком короткий. Уточните:', en: '❌ Address too short. Add more detail:' },
  ask_recipient_name: { uz: 'Qabul qiluvchi ismi:', ru: 'Имя получателя:', en: 'Recipient name:' },
  name_too_short: { uz: '❌ Ism juda qisqa. Qaytadan kiriting:', ru: '❌ Имя слишком короткое. Введите снова:', en: '❌ Name too short. Try again:' },
  ask_order_note: { uz: 'Kuryer uchun izoh (ixtiyoriy):', ru: 'Комментарий курьеру (необязательно):', en: 'Note for the courier (optional):' },
  btn_skip: { uz: '⏭ O‘tkazib yuborish', ru: '⏭ Пропустить', en: '⏭ Skip' },
  payment_title: { uz: '💳 To‘lov usuli:', ru: '💳 Способ оплаты:', en: '💳 Payment method:' },
  btn_cash: { uz: '💵 Naqd pul (yetkazib berishda)', ru: '💵 Наличные (при доставке)', en: '💵 Cash on delivery' },
  confirm_title: {
    uz: '🧾 <b>Buyurtmani tasdiqlang</b>\n\n{lines}\n\n➖➖➖\nMahsulotlar: {subtotal}\nYetkazib berish: {delivery}\n<b>Jami: {total}</b>\n\n👤 {name}\n📞 {phone}\n📍 {address}\n💳 {payment}',
    ru: '🧾 <b>Подтвердите заказ</b>\n\n{lines}\n\n➖➖➖\nТовары: {subtotal}\nДоставка: {delivery}\n<b>Итого: {total}</b>\n\n👤 {name}\n📞 {phone}\n📍 {address}\n💳 {payment}',
    en: '🧾 <b>Confirm your order</b>\n\n{lines}\n\n➖➖➖\nItems: {subtotal}\nDelivery: {delivery}\n<b>Total: {total}</b>\n\n👤 {name}\n📞 {phone}\n📍 {address}\n💳 {payment}',
  },
  delivery_free: { uz: 'Bepul', ru: 'Бесплатно', en: 'Free' },
  btn_confirm_order: { uz: '✅ Tasdiqlash', ru: '✅ Подтвердить', en: '✅ Confirm' },
  order_created: {
    uz: '🎉 <b>Buyurtmangiz qabul qilindi!</b>\n\n№ <code>{number}</code>\nSumma: <b>{total}</b>\n\nOperatorimiz tez orada bog‘lanadi.',
    ru: '🎉 <b>Заказ принят!</b>\n\n№ <code>{number}</code>\nСумма: <b>{total}</b>\n\nОператор скоро свяжется с вами.',
    en: '🎉 <b>Order accepted!</b>\n\nNo. <code>{number}</code>\nTotal: <b>{total}</b>\n\nOur operator will contact you shortly.',
  },
  order_failed: { uz: '❌ Buyurtmani yaratib bo‘lmadi: {reason}', ru: '❌ Не удалось создать заказ: {reason}', en: '❌ Could not create the order: {reason}' },
  err_out_of_stock: { uz: 'ba’zi mahsulotlar tugab qoldi', ru: 'некоторых товаров не осталось', en: 'some items are out of stock' },
  err_too_many: { uz: 'juda ko‘p buyurtma yubordingiz, birozdan so‘ng urinib ko‘ring', ru: 'слишком много заказов, попробуйте позже', en: 'too many orders, try again later' },
  err_blocked: { uz: 'hisobingiz bloklangan', ru: 'ваш аккаунт заблокирован', en: 'your account is blocked' },
  err_details: { uz: 'ism, telefon yoki manzil to‘liq emas', ru: 'имя, телефон или адрес неполные', en: 'name, phone or address is incomplete' },
  err_unknown: { uz: 'kutilmagan xatolik', ru: 'непредвиденная ошибка', en: 'unexpected error' },

  // ── Admin ──
  btn_stats: { uz: '📊 Statistika', ru: '📊 Статистика', en: '📊 Statistics' },
  btn_admin_orders: { uz: '📦 Buyurtmalar', ru: '📦 Заказы', en: '📦 Orders' },
  stats_text: {
    uz: '📊 <b>Statistika</b>\n\n📅 Bugun: <b>{todayCount}</b> ta · {todaySum}\n⏳ Ochiq buyurtmalar: <b>{openCount}</b>\n📈 7 kunlik savdo: <b>{weekSum}</b>\n\n🔝 <b>Top-5 (7 kun)</b>\n{top}',
    ru: '📊 <b>Статистика</b>\n\n📅 Сегодня: <b>{todayCount}</b> · {todaySum}\n⏳ Открытые заказы: <b>{openCount}</b>\n📈 Продажи за 7 дней: <b>{weekSum}</b>\n\n🔝 <b>Топ-5 (7 дней)</b>\n{top}',
    en: '📊 <b>Statistics</b>\n\n📅 Today: <b>{todayCount}</b> · {todaySum}\n⏳ Open orders: <b>{openCount}</b>\n📈 7-day sales: <b>{weekSum}</b>\n\n🔝 <b>Top 5 (7 days)</b>\n{top}',
  },
  stats_no_sales: { uz: 'Ma’lumot yetarli emas.', ru: 'Недостаточно данных.', en: 'Not enough data.' },
  admin_orders_title: { uz: '📦 <b>So‘nggi buyurtmalar</b>', ru: '📦 <b>Последние заказы</b>', en: '📦 <b>Recent orders</b>' },
  admin_order_card: {
    uz: '№ <code>{number}</code>\n👤 {name} · {phone}\n📍 {address}\n💰 <b>{total}</b>\n📌 {status}\n\n{items}',
    ru: '№ <code>{number}</code>\n👤 {name} · {phone}\n📍 {address}\n💰 <b>{total}</b>\n📌 {status}\n\n{items}',
    en: 'No. <code>{number}</code>\n👤 {name} · {phone}\n📍 {address}\n💰 <b>{total}</b>\n📌 {status}\n\n{items}',
  },
  admin_no_orders: { uz: 'Buyurtmalar yo‘q.', ru: 'Заказов нет.', en: 'No orders.' },
  btn_change_status: { uz: '🔄 Holatni o‘zgartirish', ru: '🔄 Изменить статус', en: '🔄 Change status' },
  status_updated: { uz: '✅ Holat «{status}» ga o‘zgartirildi.', ru: '✅ Статус изменён на «{status}».', en: '✅ Status changed to “{status}”.' },
  status_failed: { uz: '❌ Holatni o‘zgartirib bo‘lmadi.', ru: '❌ Не удалось изменить статус.', en: '❌ Could not change the status.' },

  // ── Maqsadli xabar ──
  btn_target_all: { uz: '👥 Hammaga', ru: '👥 Всем', en: '👥 Everyone' },
  btn_target_viewers: { uz: '🎯 Mahsulotni ko‘rganlarga', ru: '🎯 Смотревшим товар', en: '🎯 Product viewers' },
  ask_target: { uz: 'Kimga yuboramiz?', ru: 'Кому отправляем?', en: 'Who should receive it?' },
  ask_target_product: { uz: 'Mahsulot nomini yozing (qidiramiz):', ru: 'Введите название товара (найдём):', en: 'Type the product name (we’ll find it):' },
  target_no_match: { uz: 'Bunday mahsulot topilmadi. Boshqacha yozing:', ru: 'Товар не найден. Попробуйте иначе:', en: 'No such product. Try again:' },
  target_selected: { uz: '🎯 Nishon: «{name}» — {count} ta ko‘rgan foydalanuvchi.', ru: '🎯 Цель: «{name}» — {count} просмотревших.', en: '🎯 Target: “{name}” — {count} viewers.' },
  target_empty: { uz: 'Bu mahsulotni hali hech kim botda ko‘rmagan.', ru: 'Этот товар ещё никто не смотрел в боте.', en: 'Nobody has viewed this product in the bot yet.' },
};

export const t = translator(D);
