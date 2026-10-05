# Admin qo‘llanmasi

Bu qo‘llanma bot administratorlari uchun. Boshqaruv alohida saytda emas, **shu botning o‘zida**
amalga oshiriladi.

## Kirish

Botga `/start` yuboring. Agar siz admin bo‘lsangiz, pastki menyuda **⚙️ Boshqaruv** tugmasi
paydo bo‘ladi (yoki `/admin` buyrug‘ini yuboring). Mijozlar bu tugmani ko‘rmaydi.

## 📦 Mahsulotlar

- **Yangi mahsulot**: «➕ Yangi mahsulot» tugmasini bosing, so‘ng ketma-ket nom, narx (so‘mda,
  masalan `15000`), tavsif va rasmni yuboring. Tavsif va rasm shart emas, ularni «⏭ O‘tkazib
  yuborish» bilan o‘tkazib yuborsa bo‘ladi.
- **Narxni o‘zgartirish**: mahsulotni tanlang → «💰 Narxi» → yangi narxni yozing. Bot yangi narxni
  **darhol** ko‘rsatadi. Avval berilgan buyurtmalar eski narxda qoladi.
- **Rasm**: «🖼 Rasm» → rasmni yuboring. Rasmni olib tashlash uchun «-» yuboring.
- **Sotuvdan olish**: «⛔ Sotuvdan olish» tugmasi mahsulotni mijozlardan yashiradi.
  «✅ Sotuvga qaytarish» uni qaytaradi.
- **O‘chirish**: mahsulot hech qachon buyurtma qilinmagan bo‘lsagina o‘chiriladi. Aks holda uni
  sotuvdan oling.
- **Tartib**: ro‘yxatda kichik raqamli mahsulot yuqorida turadi.

## 📊 Statistika

Bugungi, so‘nggi 7 va 30 kunlik buyurtmalar soni va summasi, yangi buyurtmalar, mijozlar soni,
amoCRM navbati.

## 📋 Buyurtmalar

So‘nggi buyurtmalar ro‘yxati. Belgilarning ma’nosi: ✅ amoCRM’ga yuborilgan, ⏳ navbatda,
⚠️ xato. Buyurtmani ochib mijoz, manzil (xaritada ochish havolasi bilan) va mahsulotlarni
ko‘rasiz. Xato bo‘lsa, «🔁 amoCRM’ga qayta yuborish» tugmasini bosing.

Buyurtmalar bilan asosiy ish (tasdiqlash, kuryer biriktirish) **amoCRM’da** olib boriladi.

## ⚙️ Sozlamalar

| Sozlama | Qayerda ko‘rinadi |
|---|---|
| Kompaniya nomi | Salomlashuvda va «☎️ Aloqa» bo‘limida |
| Aloqa telefoni, Aloqa Telegrami, Ish vaqti | «☎️ Aloqa» bo‘limida |
| To‘lov izohi | Buyurtma xulosasida (masalan: «Yetkazib berish — bepul. To‘lov buyurtma yetkazib berilganda amalga oshiriladi.») |
| Minimal buyurtma | Bir buyurtmadagi eng kam umumiy son (masalan: 2 ta). Mahsulot kartasida ko‘rsatiladi, kamroq bo‘lsa buyurtma berib bo‘lmaydi |
| Shikastlangan idish jarimasi | Mijozga bo‘sh idish qadamida va xulosada ogohlantirish (masalan: 40 000 so‘m). Summaga qo‘shilmaydi, kuryer joyida tekshirib oladi. 0 — ko‘rsatilmaydi |
| Bitta mahsulotdan eng ko‘p / Eng ko‘p bo‘sh idish | Bir buyurtmadagi cheklovlar |

Qiymatni o‘chirish uchun «-» yuboring.

## 🔗 amoCRM

Ulanish holati va navbat ko‘rsatiladi. «🔍 Ulanishni tekshirish» amoCRM bilan aloqa bor-yo‘qligini
tekshiradi. «🔁 Xatolarni qayta yuborish» yuborilmay qolgan barcha buyurtmalarni qaytadan yuboradi.

amoCRM vaqtincha ishlamay qolsa ham buyurtmalar **yo‘qolmaydi**: ular botda saqlanadi va aloqa
tiklangach avtomatik yuboriladi. Muammo uzoq davom etsa, adminlarga Telegram orqali xabar keladi.

## 👥 Adminlar (faqat bosh admin uchun)

«➕ Admin qo‘shish» → «👤 Foydalanuvchini tanlash» orqali kontaktlaringizdan odamni tanlang yoki
uning Telegram ID raqamini yozing. Yangi admin botga /start yuborgach, unda «⚙️ Boshqaruv»
tugmasi paydo bo‘ladi. Adminni o‘chirish uchun ro‘yxatdagi 🗑 tugmasini bosing.

Bosh adminlar server sozlamalarida belgilanadi va ularni bot orqali o‘chirib bo‘lmaydi.
