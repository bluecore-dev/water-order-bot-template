import { OrderStatus, SyncStatus, AmocrmEntityType } from '@prisma/client';
import { escapeHtml as e, formatAmount } from '../common/utils/format';
import type { SettingKey } from '../modules/settings/settings.registry';

/**
 * Uzbek (default) bot texts. Every function escapes the raw strings it receives, so callers
 * pass plain values and never build HTML from user input themselves.
 * Another language = another file with the same shape (`const ru: Messages = {…}`).
 */
const sum = (n: number) => `${formatAmount(n)} so‘m`;

export const uz = {
  common: {
    cancel: '❌ Bekor qilish',
    back: '⬅️ Orqaga',
    skip: '⏭ O‘tkazib yuborish',
    yes: '✅ Ha',
    no: 'Yo‘q',
    prev: '⬅️',
    next: '➡️',
    cancelled: 'Bekor qilindi.',
    unknownInput: 'Tushunmadim 🙂 Iltimos, quyidagi tugmalardan birini tanlang.',
    staleButton: 'Bu tugma eskirgan. Iltimos, qaytadan boshlang.',
    error: '⚠️ Kutilmagan xatolik yuz berdi. Iltimos, birozdan so‘ng qayta urinib ko‘ring.',
    tooManyRequests: 'Juda tez yuboryapsiz, biroz kuting 🙂',
    notSet: 'kiritilmagan',
    piece: (n: number) => `${n} ta`,
    money: sum,
  },

  commands: {
    start: 'Asosiy menyu',
    cancel: 'Amalni bekor qilish',
    admin: 'Boshqaruv paneli',
  },

  menu: {
    buy: '🛒 Suv buyurtma qilish',
    orders: '📦 Buyurtmalarim',
    profile: '👤 Profilim',
    addresses: '📍 Manzillarim',
    contact: '☎️ Aloqa',
    admin: '⚙️ Boshqaruv',
    welcome: (company: string) =>
      `💧 <b>${e(company)}</b> botiga xush kelibsiz!\n\n` +
      'Toza ichimlik suvini bir necha bosishda buyurtma qiling. Quyidagi menyudan tanlang 👇',
    hint: 'Asosiy menyu 👇',
  },

  /** Bot profile texts (Telegram limits: description 512, short description 120 chars). */
  botProfile: {
    shortDescription: (company: string) => `💧 ${company} — toza ichimlik suvi yetkazib berish. Buyurtma bir necha bosishda!`,
    shortDescriptionGeneric: '💧 Toza ichimlik suvi yetkazib berish. Buyurtma bir necha bosishda!',
    description: (p: { company: string; phone: string; hours: string; note: string }) =>
      [
        p.company ? `💧 ${p.company} — toza ichimlik suvini uyingizga yetkazib beramiz.` : '💧 Toza ichimlik suvini uyingizga yetkazib beramiz.',
        '',
        '✅ Buyurtma bir necha bosishda',
        '♻️ Bo‘sh idishlarni kuryer olib ketadi',
        '📍 Manzil — lokatsiya yoki matn bilan',
        '📦 Buyurtmalar tarixi va bir bosishda qayta buyurtma',
        ...(p.note ? [`🚚 ${p.note}`] : []),
        ...(p.phone || p.hours ? ['', [p.phone && `📞 ${p.phone}`, p.hours && `🕘 ${p.hours}`].filter(Boolean).join(' · ')] : []),
        '',
        'Boshlash uchun «Start» tugmasini bosing 👇',
      ].join('\n'),
  },

  engage: {
    orderButton: '🛒 Buyurtma berish',
    reminder: (company: string) =>
      `💧 <b>${e(company)}</b>\n\nToza ichimlik suvi kerakmi? Bir necha bosishda buyurtma bering — kuryer eshigingizgacha olib keladi 🚚\n\nBoshlash uchun pastdagi tugmani bosing 👇`,
    reminder2: (company: string) =>
      `⏰ Buyurtma berishni unutmang 🙂\n\n💧 <b>${e(company)}</b> — toza ichimlik suvi eshigingizgacha. Buyurtma atigi bir daqiqa oladi.\n\nPastdagi tugmani bosing 👇`,
    customReminder: (text: string) => e(text),
  },

  catalog: {
    empty: '😔 Hozircha sotuvda mahsulot yo‘q. Keyinroq urinib ko‘ring yoki biz bilan bog‘laning: ☎️ Aloqa',
    choose: '💧 <b>Mahsulotni tanlang:</b>',
    productButton: (name: string, price: number) => `${name} · ${sum(price)}`,
    card: (name: string, description: string | null, price: number, minOrder = 1) =>
      `<b>${e(name)}</b>\n` +
      (description ? `\n${e(description)}\n` : '') +
      `\n💰 Narxi: <b>${sum(price)}</b>` +
      (minOrder > 1 ? `\n📦 Minimal buyurtma: <b>${minOrder} ta</b>` : ''),
    addToCart: (total: number) => `🛒 Savatga qo‘shish · ${sum(total)}`,
    backToProducts: '⬅️ Mahsulotlar',
    minQty: (n: number) => `Eng kam miqdor — ${n} ta`,
    maxQty: (n: number) => `Bir buyurtmada eng ko‘pi bilan ${n} ta`,
    unavailable: 'Bu mahsulot hozir sotuvda yo‘q.',
    added: 'Savatga qo‘shildi ✅',
  },

  cart: {
    title: '🛒 <b>Savatingiz</b>',
    button: (count: number) => `🛒 Savat (${count})`,
    line: (name: string, qty: number, subtotal: number) => `• ${e(name)} × ${qty} = <b>${sum(subtotal)}</b>`,
    total: (total: number) => `Jami: <b>${sum(total)}</b>`,
    empty: '🛒 Savatingiz bo‘sh.',
    addMore: '➕ Yana mahsulot qo‘shish',
    checkout: '➡️ Rasmiylashtirish',
    clear: '🗑 Savatni tozalash',
    cleared: 'Savat tozalandi.',
    itemsRemoved: '⚠️ Ba’zi mahsulotlar sotuvdan olingan, ular savatdan chiqarildi.',
    qtyClamped: (n: number) => `⚠️ Ba’zi miqdorlar ${n} taga tushirildi (bir buyurtmadagi eng ko‘p miqdor).`,
    belowMinimum: (min: number, current: number) =>
      `⚠️ Minimal buyurtma — <b>${min} ta</b>, savatda ${current} ta. Iltimos, yana qo‘shing.`,
  },

  checkout: {
    askBottles: '♻️ <b>Nechta bo‘sh idish qaytarasiz?</b>\n\nKuryer bo‘sh idishlarni olib ketadi.',
    bottleFineNotice: (fine: number) =>
      `⚠️ Idish shikastlangan bo‘lsa, <b>${sum(fine)}</b> jarima olinadi — kuryer idishlarni qabul qilishda tekshiradi.`,
    bottlesMore: '5+',
    askBottlesNumber: (max: number) => `Bo‘sh idishlar sonini raqam bilan yozing (0–${max}):`,
    invalidBottles: (max: number) => `⚠️ Iltimos, 0 dan ${max} gacha butun son yozing.`,
    askPhone:
      '📞 <b>Telefon raqamingizni yuboring</b>\n\n' +
      'Pastdagi «📱 Raqamni yuborish» tugmasini bosing yoki raqamni yozing: <code>+998 90 123 45 67</code>',
    sendPhone: '📱 Raqamni yuborish',
    invalidPhone: '⚠️ Raqam noto‘g‘ri. Namuna: <code>+998 90 123 45 67</code>',
    foreignContact:
      '⚠️ Iltimos, o‘zingizning raqamingizni «📱 Raqamni yuborish» tugmasi orqali yuboring yoki raqamni yozing.',
    askAddress:
      '📍 <b>Yetkazib berish manzilini yuboring</b>\n\n' +
      '«📍 Lokatsiyani yuborish» tugmasini bosing yoki manzilni yozing (tuman, ko‘cha, uy, xonadon).',
    askAddressSaved: '\n\nYoki pastdan saqlangan manzilni tanlang 👇',
    sendLocation: '📍 Lokatsiyani yuborish',
    askAddressDetails:
      '🏢 Uy, podyezd, qavat, xonadon raqami yoki mo‘ljalni yozing.\n\nKerak bo‘lmasa «⏭ O‘tkazib yuborish» ni bosing.',
    locationResolved: (label: string) => `📍 Manzil aniqlandi: <b>${e(label)}</b>`,
    invalidAddress: '⚠️ Manzil juda qisqa yoki juda uzun. Iltimos, aniqroq yozing (3–300 belgi).',
    locationOnly: (lat: number, lng: number) => `Lokatsiya: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    locationWithDetails: (place: string, details: string) => `${place} — ${details}`,
    savedAddressButton: (title: string) => `🏠 ${title}`,
    review: '📋 Buyurtmangizni tekshirib, tasdiqlang 👇',
    bottlesChosen: (n: number) => `♻️ Bo‘sh idishlar: <b>${n} ta</b>`,
    summaryTitle: '🧾 <b>BUYURTMA</b>',
    summaryLine: (name: string, qty: number, subtotal: number) => `💧 ${e(name)} × ${qty} — ${sum(subtotal)}`,
    summaryBottles: (n: number) => `♻️ Bo‘sh idishlar: ${n} ta`,
    summaryBottleFine: (fine: number) => `⚠️ Shikastlangan idish uchun jarima: ${sum(fine)} (kuryer tekshiradi)`,
    summaryPhone: (phone: string) => `📞 ${e(phone)}`,
    summaryAddress: (address: string) => `📍 ${e(address)}`,
    summaryTotal: (total: number) => `💰 <b>JAMI: ${sum(total)}</b>`,
    defaultPaymentNote: '💵 To‘lov buyurtma yetkazib berilganda amalga oshiriladi.',
    paymentNote: (note: string) => `💵 ${e(note)}`,
    confirm: '✅ Tasdiqlash',
    edit: '✏️ O‘zgartirish',
    cancelOrder: '❌ Bekor qilish',
    editWhat: '✏️ <b>Nimani o‘zgartiramiz?</b>',
    editItems: '🛒 Mahsulotlar',
    editBottles: '♻️ Bo‘sh idishlar',
    editPhone: '📞 Telefon',
    editAddress: '📍 Manzil',
    backToSummary: '⬅️ Buyurtmaga qaytish',
    priceChanged: '⚠️ Narxlar yangilandi. Iltimos, buyurtmani qaytadan tekshirib, tasdiqlang.',
    expired: 'Buyurtma ma’lumotlari eskirgan. Iltimos, qaytadan boshlang.',
    accepted: (orderNumber: number, total: number) =>
      '✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n' +
      `Buyurtma: <b>#${orderNumber}</b>\n` +
      `Summa: <b>${sum(total)}</b>\n\n` +
      'Operator tez orada buyurtmangizni tasdiqlaydi.',
    processing: '⏳ Buyurtma rasmiylashtirilmoqda...',
  },

  history: {
    empty: '📦 Sizda hali buyurtmalar yo‘q.\n\nBirinchi buyurtmani «🛒 Suv buyurtma qilish» orqali bering.',
    title: (total: number) => `📦 <b>Buyurtmalaringiz</b> (${total} ta)\n\nBatafsil ko‘rish uchun buyurtmani tanlang:`,
    button: (orderNumber: number, date: string, total: number, statusIcon: string) =>
      `${statusIcon} #${orderNumber} · ${date} · ${sum(total)}`,
    details: (p: {
      orderNumber: number;
      date: string;
      status: string;
      lines: string[];
      bottles: number;
      address: string;
      phone: string;
      total: number;
    }) =>
      `🧾 <b>Buyurtma #${p.orderNumber}</b>\n` +
      `🕒 ${p.date}\n` +
      `Holati: ${p.status}\n\n` +
      `${p.lines.join('\n')}\n` +
      `♻️ Bo‘sh idishlar: ${p.bottles} ta\n\n` +
      `📞 ${e(p.phone)}\n` +
      `📍 ${e(p.address)}\n\n` +
      `💰 <b>Jami: ${sum(p.total)}</b>`,
    line: (name: string, qty: number, unitPrice: number, subtotal: number) =>
      `💧 ${e(name)}: ${qty} × ${sum(unitPrice)} = ${sum(subtotal)}`,
    repeat: '🔁 Qayta buyurtma qilish',
    repeatUnavailable: '😔 Bu buyurtmadagi mahsulotlar hozir sotuvda yo‘q.',
    backToList: '⬅️ Buyurtmalar',
    status: {
      NEW: '🆕 Yangi',
      CONFIRMED: '✅ Tasdiqlangan',
      PROCESSING: '⚙️ Tayyorlanmoqda',
      ASSIGNED: '👤 Kuryerga biriktirilgan',
      DELIVERING: '🚚 Yo‘lda',
      DELIVERED: '📦 Yetkazilgan',
      CANCELLED: '❌ Bekor qilingan',
    } satisfies Record<OrderStatus, string>,
  },

  profile: {
    view: (name: string, phone: string, orders: number) =>
      '👤 <b>Profilingiz</b>\n\n' + `Ism: ${e(name)}\n` + `Telefon: ${e(phone)}\n` + `Buyurtmalar: ${orders} ta`,
    changePhone: '📱 Telefonni o‘zgartirish',
    phoneSaved: (phone: string) => `✅ Telefon raqami saqlandi: ${e(phone)}`,
  },

  addresses: {
    empty:
      '📍 Saqlangan manzillar yo‘q.\n\nManzil birinchi buyurtmada avtomatik saqlanadi yoki hozir qo‘shishingiz mumkin.',
    title: '📍 <b>Saqlangan manzillar</b>',
    line: (index: number, address: string, isDefault: boolean) => `${index}. ${isDefault ? '⭐ ' : ''}${e(address)}`,
    legend: '⭐ — asosiy manzil. Raqamli tugmalar orqali boshqaring:',
    add: '➕ Yangi manzil',
    makeDefault: (index: number) => `⭐ ${index}`,
    remove: (index: number) => `🗑 ${index}`,
    saved: '✅ Manzil saqlandi.',
    removed: 'Manzil o‘chirildi.',
    defaultSet: '⭐ Asosiy manzil o‘zgartirildi.',
  },

  contact: {
    title: '☎️ <b>Aloqa</b>',
    company: (name: string) => `🏢 ${e(name)}`,
    phone: (phone: string) => `📞 Telefon: ${e(phone)}`,
    telegram: (username: string) => `💬 Telegram: ${e(username)}`,
    hours: (hours: string) => `🕘 Ish vaqti: ${e(hours)}`,
    none: 'Aloqa ma’lumotlari hali kiritilmagan.',
  },

  admin: {
    notAdmin: 'Bu bo‘lim faqat administratorlar uchun.',
    superOnly: 'Bu amal faqat bosh administrator uchun.',
    menuTitle: '⚙️ <b>Boshqaruv paneli</b>\n\nKerakli bo‘limni tanlang:',
    products: '📦 Mahsulotlar',
    stats: '📊 Statistika',
    orders: '📋 Buyurtmalar',
    settings: '⚙️ Sozlamalar',
    amocrm: '🔗 amoCRM',
    admins: '👥 Adminlar',
    broadcast: '📣 Xabar yuborish',
    backToMenu: '⬅️ Boshqaruv',
    saved: '✅ Saqlandi.',
    inputCancelHint: 'Bekor qilish uchun «❌ Bekor qilish» ni bosing.',

    productList: '📦 <b>Mahsulotlar</b>\n\n✅ — sotuvda, ⛔ — sotuvda emas',
    productListEmpty: '📦 <b>Mahsulotlar</b>\n\nHali mahsulot yo‘q. Birinchisini qo‘shing 👇',
    productButton: (active: boolean, name: string, price: number) => `${active ? '✅' : '⛔'} ${name} · ${sum(price)}`,
    newProduct: '➕ Yangi mahsulot',
    productCard: (p: {
      name: string;
      price: number;
      description: string | null;
      hasImage: boolean;
      sortOrder: number;
      isActive: boolean;
      usedCount: number;
    }) =>
      `📦 <b>${e(p.name)}</b>\n\n` +
      `💰 Narxi: <b>${sum(p.price)}</b>\n` +
      `📝 Tavsif: ${p.description ? e(p.description) : '—'}\n` +
      `🖼 Rasm: ${p.hasImage ? 'bor' : 'yo‘q'}\n` +
      `🔢 Tartib raqami: ${p.sortOrder}\n` +
      `Holati: ${p.isActive ? '✅ Sotuvda' : '⛔ Sotuvda emas'}\n` +
      `Buyurtmalarda: ${p.usedCount} marta`,
    editName: '✏️ Nomi',
    editPrice: '💰 Narxi',
    editDescription: '📝 Tavsif',
    editPhoto: '🖼 Rasm',
    editSortOrder: '🔢 Tartib',
    deactivate: '⛔ Sotuvdan olish',
    activate: '✅ Sotuvga qaytarish',
    delete: '🗑 O‘chirish',
    backToProducts: '⬅️ Mahsulotlar',
    askName: 'Mahsulot nomini yozing (masalan: <i>18.9 L ichimlik suvi</i>):',
    askPrice: 'Narxni so‘mda yozing (masalan: <code>15000</code>):',
    askDescription: 'Qisqa tavsif yozing (800 belgigacha). Tavsifni o‘chirish uchun «-» yuboring.',
    askDescriptionNew: 'Qisqa tavsif yozing (800 belgigacha) yoki «⏭ O‘tkazib yuborish» ni bosing.',
    askPhoto: 'Mahsulot rasmini yuboring. Rasmni olib tashlash uchun «-» yuboring.',
    askPhotoNew: 'Mahsulot rasmini yuboring yoki «⏭ O‘tkazib yuborish» ni bosing.',
    askSortOrder: 'Tartib raqamini yozing (0–9999). Kichik raqamli mahsulot ro‘yxatda yuqorida turadi.',
    invalidName: '⚠️ Nom 1–100 belgi bo‘lishi kerak.',
    invalidPrice: '⚠️ Narx 1 dan 100 000 000 gacha butun son bo‘lishi kerak. Masalan: <code>15000</code>',
    invalidDescription: '⚠️ Tavsif juda uzun (800 belgigacha).',
    invalidSortOrder: '⚠️ 0 dan 9999 gacha butun son yozing.',
    invalidPhoto: '⚠️ Iltimos, rasm yuboring (JPG, PNG yoki WEBP, 10 MB gacha).',
    priceUpdated: (oldPrice: number, newPrice: number) =>
      `✅ Narx o‘zgartirildi: ${sum(oldPrice)} → <b>${sum(newPrice)}</b>.\n` +
      'Bot darhol yangi narxni ko‘rsatadi, avvalgi buyurtmalar esa eski narxda qoladi.',
    productCreated: '✅ Mahsulot qo‘shildi va sotuvga chiqarildi.',
    confirmDelete: (name: string) => `🗑 «${e(name)}» o‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.`,
    confirmDeleteYes: '🗑 Ha, o‘chirish',
    deleteInUse: (n: number) =>
      `Bu mahsulot ${n} ta buyurtmada ishlatilgan, shuning uchun uni o‘chirib bo‘lmaydi. ` +
      'Uning o‘rniga «⛔ Sotuvdan olish» tugmasidan foydalaning.',
    deleted: 'Mahsulot o‘chirildi.',
    activated: 'Mahsulot sotuvga qaytarildi ✅',
    deactivated: 'Mahsulot sotuvdan olindi ⛔',
    productNotFound: 'Mahsulot topilmadi.',

    statsView: (s: {
      today: { orders: number; amount: number };
      week: { orders: number; amount: number };
      month: { orders: number; amount: number };
      totalOrders: number;
      newOrders: number;
      activeProducts: number;
      customers: number;
      amoPending: number;
      amoFailed: number;
      botUsers: number;
      blockedUsers: number;
    }) =>
      '📊 <b>Statistika</b>\n\n' +
      `Bugun: <b>${s.today.orders}</b> ta · ${sum(s.today.amount)}\n` +
      `So‘nggi 7 kun: <b>${s.week.orders}</b> ta · ${sum(s.week.amount)}\n` +
      `So‘nggi 30 kun: <b>${s.month.orders}</b> ta · ${sum(s.month.amount)}\n\n` +
      `Jami buyurtmalar: ${s.totalOrders}\n` +
      `Yangi (ko‘rib chiqilmagan): ${s.newOrders}\n` +
      `Buyurtma bergan mijozlar: ${s.customers}\n` +
      `Bot foydalanuvchilari: ${s.botUsers} (botni bloklagan: ${s.blockedUsers})\n` +
      `Sotuvdagi mahsulotlar: ${s.activeProducts}\n\n` +
      `amoCRM navbatida: ${s.amoPending} · xato bilan: ${s.amoFailed}`,
    refresh: '🔄 Yangilash',

    ordersTitle: (total: number) => `📋 <b>So‘nggi buyurtmalar</b> (jami ${total} ta)\n\n✅ amoCRM’da · ⏳ navbatda · ⚠️ xato`,
    ordersEmpty: '📋 Hali buyurtmalar yo‘q.',
    orderButton: (orderNumber: number, date: string, total: number, syncIcon: string) =>
      `${syncIcon} #${orderNumber} · ${date} · ${sum(total)}`,
    orderDetails: (p: {
      orderNumber: number;
      date: string;
      status: string;
      customer: string;
      phone: string;
      address: string;
      mapLink: string | null;
      lines: string[];
      bottles: number;
      total: number;
      sync: string[];
    }) =>
      `🧾 <b>Buyurtma #${p.orderNumber}</b>\n` +
      `🕒 ${p.date} · ${p.status}\n\n` +
      `👤 ${e(p.customer)}\n` +
      `📞 ${e(p.phone)}\n` +
      `📍 ${e(p.address)}\n` +
      (p.mapLink ? `🗺 <a href="${e(p.mapLink)}">Xaritada ochish</a>\n` : '') +
      `\n${p.lines.join('\n')}\n` +
      `♻️ Bo‘sh idishlar: ${p.bottles} ta\n` +
      `💰 <b>Jami: ${sum(p.total)}</b>\n\n` +
      `🔗 <b>amoCRM</b>\n${p.sync.join('\n')}`,
    syncLine: (entity: AmocrmEntityType, status: SyncStatus, entityId: number | null, attempts: number, error: string | null) => {
      const names: Record<AmocrmEntityType, string> = { CONTACT: 'Kontakt', LEAD: 'Lid', NOTE: 'Izoh' };
      const icons: Record<SyncStatus, string> = { PENDING: '⏳', PROCESSING: '🔄', SUCCESS: '✅', FAILED: '⚠️' };
      return (
        `${icons[status]} ${names[entity]}${entityId ? ` #${entityId}` : ''}` +
        (attempts ? ` · ${attempts} urinish` : '') +
        (error && status !== 'SUCCESS' ? `\n   <i>${e(error.slice(0, 200))}</i>` : '')
      );
    },
    resync: '🔁 amoCRM’ga qayta yuborish',
    resyncQueued: '🔁 Qayta yuborish navbatga qo‘yildi.',
    backToOrders: '⬅️ Buyurtmalar',

    settingsTitle: '⚙️ <b>Sozlamalar</b>\n\nO‘zgartirish uchun sozlamani tanlang:',
    botPhoto: '🖼 Bot rasmi (avatar)',
    askBotPhoto: '🖼 Botning yangi rasmini (avatarini) yuboring. Kvadrat rasm yaxshi ko‘rinadi, masalan logotip.',
    botPhotoSaved: '✅ Bot rasmi yangilandi. Telegram’da bir necha daqiqada ko‘rinadi.',
    botPhotoFailed: (error: string) => `❌ Telegram rasmni qabul qilmadi: <code>${e(error)}</code>`,
    settingButton: (label: string, value: string) => `${label}: ${value || '—'}`,
    settingLabels: {
      company_name: 'Kompaniya nomi',
      support_phone: 'Aloqa telefoni',
      support_telegram: 'Aloqa Telegrami',
      working_hours: 'Ish vaqti',
      payment_note: 'To‘lov izohi',
      max_item_quantity: 'Bitta mahsulotdan eng ko‘p',
      min_order_quantity: 'Minimal buyurtma',
      max_empty_bottles: 'Eng ko‘p bo‘sh idish',
      damaged_bottle_fine: 'Shikastlangan idish jarimasi',
      reminder_first_minutes: '1-eslatma (daqiqa)',
      reminder_second_minutes: '2-eslatma (daqiqa)',
      reminder_text: '1-eslatma matni',
      reminder_text_2: '2-eslatma matni',
      bot_about: 'Bot haqida (About)',
      bot_description: 'Bot tavsifi (Start oldidan)',
    } satisfies Record<SettingKey, string>,
    settingHints: {
      company_name: 'Masalan: <i>Toza Suv</i>. Salomlashuv va aloqa bo‘limida ko‘rinadi.',
      support_phone: 'Masalan: <code>+998 90 123 45 67</code>',
      support_telegram: 'Masalan: <code>@company_support</code>',
      working_hours: 'Masalan: <i>Har kuni 08:00–20:00</i>',
      payment_note: 'Buyurtma xulosasida chiqadi. Masalan: <i>To‘lov naqd yoki karta orqali, yetkazib berilganda.</i>',
      max_item_quantity: '1 dan 1000 gacha butun son. Minimal buyurtmadan kam bo‘lmasligi kerak.',
      min_order_quantity:
        'Bir buyurtmadagi mahsulotlarning umumiy soni (masalan: <code>2</code>). «Bitta mahsulotdan eng ko‘p» dan oshmasligi kerak.',
      max_empty_bottles: '1 dan 10000 gacha butun son.',
      damaged_bottle_fine:
        'So‘mda, masalan: <code>40000</code>. Buyurtma summasiga qo‘shilmaydi — mijozga bo‘sh idish qadamida va xulosada ogohlantirish sifatida ko‘rsatiladi. <code>0</code> — ko‘rsatilmaydi.',
      reminder_first_minutes:
        'Mijoz /start bosib, hech narsa yozmasa yoki tugma bosmasa, necha daqiqadan keyin 1-eslatma yuborilsin (masalan: <code>10</code>). <code>0</code> — 1-eslatma yo‘q.',
      reminder_second_minutes:
        '/start bosilgandan necha daqiqa keyin 2-eslatma (oxirgisi) yuborilsin (masalan: <code>60</code>). 1-eslatmadan katta bo‘lishi kerak. <code>0</code> — 2-eslatma yo‘q.',
      reminder_text: '1-eslatmaning o‘z matningiz. Bo‘sh bo‘lsa, standart matn. Ostiga «🛒 Buyurtma berish» tugmasi qo‘shiladi.',
      reminder_text_2: '2-eslatmaning o‘z matningiz. Bo‘sh bo‘lsa, standart matn. Ostiga «🛒 Buyurtma berish» tugmasi qo‘shiladi.',
      bot_about:
        'Bot profilidagi qisqa matn (120 belgigacha). Bo‘sh bo‘lsa, kompaniya nomidan avtomatik tuziladi.',
      bot_description:
        'Botni birinchi ochganda «Start» tugmasidan oldin chiqadigan matn (512 belgigacha, qatorlarga bo‘lish mumkin). Bo‘sh bo‘lsa, sozlamalardan avtomatik tuziladi.',
    } satisfies Record<SettingKey, string>,
    askSetting: (label: string, current: string, hint: string, optional: boolean) =>
      `✏️ <b>${e(label)}</b>\n\nHozirgi qiymat: ${current ? e(current) : '—'}\n${hint}\n\n` +
      'Yangi qiymatni yozing.' +
      (optional ? ' Tozalash uchun «-» yuboring.' : ''),
    invalidSetting: '⚠️ Qiymat noto‘g‘ri. Iltimos, namunaga qarab qayta yozing.',

    amocrmView: (p: {
      mode: string;
      connection: string;
      syncEnabled: boolean;
      pending: number;
      failed: number;
      pipeline: string;
    }) =>
      '🔗 <b>amoCRM</b>\n\n' +
      `Ulanish: ${p.connection}\n` +
      `Usul: ${p.mode}\n` +
      `Voronka / bosqich: ${p.pipeline}\n` +
      `Sinxronlash: ${p.syncEnabled ? 'yoqilgan' : 'o‘chirilgan (AMOCRM_SYNC_ENABLED=false)'}\n\n` +
      `Navbatda: ${p.pending} ta buyurtma\n` +
      `Xato bilan: ${p.failed} ta buyurtma`,
    amoModeLongLived: 'uzoq muddatli token',
    amoModeOauth: 'OAuth2',
    amoModeNone: '—',
    amoNotConfigured: '⚠️ sozlanmagan (.env da AMOCRM_* yo‘q)',
    amoOauthMissing: '❌ hali ulanmagan — «🔗 amoCRM’ni ulash» ni bosing',
    amoConfigured: (domain: string) => `✅ ${e(domain)}`,
    amoCheck: '🔍 Ulanishni tekshirish',
    amoCheckOk: (name: string, domain: string) => `✅ Ulanish ishlayapti: <b>${e(name)}</b> (${e(domain)})`,
    amoCheckFail: (error: string) => `❌ Ulanishda xato:\n<code>${e(error)}</code>`,
    amoRetryAll: '🔁 Xatolarni qayta yuborish',
    amoRetryQueued: (n: number) => `🔁 ${n} ta buyurtma qayta yuborish navbatiga qo‘yildi.`,
    amoConnect: '🔗 amoCRM’ni ulash',
    amoConnectHint:
      'Tugmani bosing va amoCRM’da ruxsat bering. Havola 15 daqiqa amal qiladi.',
    amoConnectNeedsHttps: 'OAuth ulash uchun serverda https API_URL kerak.',

    broadcastAsk: (recipients: number, last: string | null) =>
      '📣 <b>Barcha mijozlarga xabar</b>\n\n' +
      'Yuboriladigan xabarni shu yerga jo‘nating: matn, rasm yoki video (izoh bilan). ' +
      'Masalan: chegirma, aksiya yoki yangilik.\n\n' +
      `Qabul qiluvchilar: <b>${recipients}</b> ta mijoz.` +
      (last ? `\nOxirgi xabar: ${last}` : '') +
      '\n\nXabar ostiga «🛒 Buyurtma berish» tugmasi avtomatik qo‘shiladi.',
    broadcastLast: (date: string, sent: number, total: number) => `${date} — ${sent}/${total} ta yuborilgan`,
    broadcastUnsupported: '⚠️ Bu turdagi xabarni yuborib bo‘lmaydi. Matn, rasm, video yoki fayl yuboring.',
    broadcastPreviewTitle: '👆 Mijozlar xabarni shunday ko‘radi.',
    broadcastConfirm: (recipients: number) => `📣 Xabar <b>${recipients}</b> ta mijozga yuborilsinmi?`,
    broadcastSend: '✅ Yuborish',
    broadcastStarted: (recipients: number) =>
      `🚀 Yuborish boshlandi: ${recipients} ta mijoz. Tugagach natijani shu yerga yozaman.`,
    broadcastBusy: '⏳ Oldingi xabar hali yuborilmoqda. U tugagach qayta urinib ko‘ring.',
    broadcastNobody: 'Hozircha xabar yuboriladigan mijoz yo‘q.',
    broadcastDone: (sent: number, blocked: number, failed: number, total: number) =>
      `✅ <b>Xabar yuborildi</b>\n\nYetkazildi: <b>${sent}</b> / ${total}\n` +
      `Botni bloklagan: ${blocked}\n` +
      (failed ? `Xato: ${failed}\n` : ''),
    broadcastFailed: '❌ Xabarni yuborib bo‘lmadi: asl xabar o‘chirilgan bo‘lishi mumkin. Qaytadan yuboring.',

    adminsTitle: '👥 <b>Adminlar</b>\n\n👑 — bosh admin (.env dagi ADMIN_TELEGRAM_IDS)',
    adminLine: (index: number, name: string, telegramId: string, isSuper: boolean) =>
      `${index}. ${isSuper ? '👑 ' : ''}${e(name)} · <code>${e(telegramId)}</code>`,
    addAdmin: '➕ Admin qo‘shish',
    removeAdmin: (index: number) => `🗑 ${index}`,
    askAdmin:
      'Yangi adminni pastdagi «👤 Foydalanuvchini tanlash» tugmasi orqali tanlang yoki uning Telegram ID raqamini yozing.',
    pickUser: '👤 Foydalanuvchini tanlash',
    adminAdded: (name: string) =>
      `✅ ${e(name)} admin qilib qo‘shildi.\nU botga /start yuborgach, unda «⚙️ Boshqaruv» tugmasi paydo bo‘ladi.`,
    adminRemoved: 'Admin o‘chirildi.',
    cannotRemoveSuper: 'Bosh adminni bot orqali o‘chirib bo‘lmaydi (.env dagi ADMIN_TELEGRAM_IDS).',
    invalidAdminId: '⚠️ Telegram ID faqat raqamlardan iborat bo‘ladi.',
    unnamed: 'Ismsiz',
  },

  notify: {
    syncFailed: (orderNumber: number, attempts: number, error: string, final: boolean) =>
      `⚠️ <b>amoCRM:</b> #${orderNumber} buyurtma yuborilmadi (${attempts}-urinish).\n` +
      `Xato: <code>${e(error.slice(0, 300))}</code>\n\n` +
      (final
        ? 'Avtomatik urinishlar to‘xtatildi. «⚙️ Boshqaruv → 📋 Buyurtmalar» orqali qayta yuboring.'
        : 'Bot avtomatik ravishda qayta urinadi. Buyurtma bazada saqlangan.'),
    authFailed: (error: string) =>
      `⚠️ <b>amoCRM avtorizatsiyasi ishlamayapti.</b>\nBuyurtmalar bazada saqlanmoqda va ulanish tiklangach yuboriladi.\n\n<code>${e(error.slice(0, 300))}</code>`,
    amoConnected: (domain: string) => `✅ amoCRM ulandi: <b>${e(domain)}</b>`,
    newOrder: (p: {
      orderNumber: number;
      customer: string;
      phone: string;
      address: string;
      mapLink: string | null;
      lines: string[];
      bottles: number;
      total: number;
    }) =>
      `🆕 <b>Yangi buyurtma #${p.orderNumber}</b>\n\n` +
      `👤 ${e(p.customer)}\n📞 ${e(p.phone)}\n📍 ${e(p.address)}\n` +
      (p.mapLink ? `🗺 <a href="${e(p.mapLink)}">Xaritada ochish</a>\n` : '') +
      `\n${p.lines.join('\n')}\n♻️ Bo‘sh idishlar: ${p.bottles} ta\n💰 <b>Jami: ${sum(p.total)}</b>`,
  },

  amoPage: {
    connected: 'amoCRM muvaffaqiyatli ulandi. Telegram’ga qaytishingiz mumkin.',
    failed: 'amoCRM ulanmadi. Havola eskirgan yoki noto‘g‘ri. Botdan qaytadan urinib ko‘ring.',
  },

  /** Text pieces sent to amoCRM (lead name, note). Operators read them in Uzbek. */
  crm: {
    leadName: (orderNumber: number) => `Buyurtma #${orderNumber}`,
    defaultContactName: 'Telegram mijoz',
    noteTitle: (orderNumber: number) => `🧾 Telegram buyurtma #${orderNumber}`,
    noteLine: (name: string, qty: number, unitPrice: number, subtotal: number) =>
      `• ${name} × ${qty} (${sum(unitPrice)}) = ${sum(subtotal)}`,
    noteBottles: (n: number) => `Bo‘sh idishlar: ${n} ta`,
    noteTotal: (total: number) => `Jami: ${sum(total)}`,
    notePhone: (phone: string) => `Telefon: ${phone}`,
    noteAddress: (address: string) => `Manzil: ${address}`,
    noteMap: (link: string) => `Xarita: ${link}`,
    noteCoordinates: (lat: number, lng: number) => `Koordinatalar: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    noteTelegram: (id: string, username: string | null) => `Telegram: ${id}${username ? ` (@${username})` : ''}`,
    noteCustomer: (name: string) => `Mijoz: ${name}`,
  },
};

export type Messages = typeof uz;
