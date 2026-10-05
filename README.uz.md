# 💧 Suv buyurtma boti (Telegram)

Ichimlik suvi yetkazib beradigan bizneslar uchun tayyor **Telegram buyurtma boti** shabloni
(masalan, 18.9 litrlik idishdagi suv).

- **Mijoz** buyurtmani oddiy Telegram botda bir necha bosishda beradi. Mini App ham, sayt ham kerak emas.
- **Admin** mahsulot, narx, rasm va sozlamalarni **shu botning ichida** boshqaradi. Alohida admin panel yo‘q.
- **Buyurtmalar amoCRM’ga** avtomatik tushadi, operatorlar ular bilan o‘sha yerda ishlaydi.

Kod hech bir kompaniyaga bog‘lanmagan. Kompaniya nomi, narxlar va qoidalar bazadagi sozlamalarda,
bot tokeni va amoCRM ma’lumotlari `.env` faylida turadi. Shuning uchun **bitta shablondan istalgan
suv kompaniyasi uchun bot** qilsa bo‘ladi va kodni o‘zgartirish kerak bo‘lmaydi.

> 🇬🇧 English version: [README.md](README.md)

---

## Bot nima qiladi

### 👤 Mijoz uchun

| Bo‘lim | Imkoniyatlar |
|---|---|
| 🛒 **Suv buyurtma qilish** | Mahsulotni tanlash va miqdorni ➖ / ➕ bilan belgilash. Nechta bo‘sh idish qaytarishini tanlash (0–4 tugma yoki «5+» deb son yozish). Telefonni bitta tugma bilan yuborish. Manzilni lokatsiya yoki matn sifatida yuborish. **Lokatsiya ko‘cha va tuman nomiga aylantiriladi**, keyin uy, qavat va xonadonni qo‘shish mumkin. Xulosani ko‘rib ✅ tasdiqlash yoki ✏️ o‘zgartirish. |
| 📦 **Buyurtmalarim** | Barcha buyurtmalar va ularning holati. Ichiga kirib batafsil ko‘rish. «🔁 Qayta buyurtma qilish» bitta tugma bilan. |
| 👤 **Profilim** | Ism, telefon, buyurtmalar soni, telefonni o‘zgartirish. |
| 📍 **Manzillarim** | Saqlangan manzillar (10 tagacha): asosiy qilish, o‘chirish, yangisini qo‘shish. |
| ☎️ **Aloqa** | Kompaniya telefoni, Telegrami va ish vaqti. |

Qulayliklar:
- **Qaytgan mijozdan telefon qayta so‘ralmaydi.** Saqlangan manzil bitta bosishda tanlanadi.
- Har qadamda «❌ Bekor qilish» bor. Tushunarsiz xabarga bot muloyim yo‘l-yo‘riq beradi.
- Bitta mahsulot bo‘lsa, ro‘yxat ko‘rsatilmaydi va mijoz to‘g‘ridan-to‘g‘ri mahsulot kartasiga o‘tadi.
- **Eslatma.** Botga kirib, buyurtma bermay ketgan mijozga belgilangan vaqtdan keyin (standart 3 soat)
  bir marta «🛒 Buyurtma berish» tugmasi bilan eslatma boradi. Eslatmalar faqat kunduzi (09:00–21:00) yuboriladi.

### ⚙️ Admin uchun («⚙️ Boshqaruv» tugmasi yoki `/admin`)

| Bo‘lim | Nima qiladi |
|---|---|
| 📦 **Mahsulotlar** | Yangi mahsulot qo‘shish, nom, narx, tavsif va rasmni o‘zgartirish, sotuvdan olish yoki qaytarish. Mahsulot hech qachon buyurtma qilinmagan bo‘lsa, o‘chirish ham mumkin. **Yangi narx darhol ko‘rinadi.** |
| 📊 **Statistika** | Bugun, 7 kun va 30 kundagi buyurtmalar soni va summasi, yangi buyurtmalar, mijozlar soni, amoCRM navbati. |
| 📣 **Xabar yuborish** | Barcha mijozlarga yangilik, chegirma yoki reklama yuborish: matn, rasm yoki video. Avval namuna ko‘rsatiladi, tasdiqlangach xabar fonda tarqatiladi va ostiga «🛒 Buyurtma berish» tugmasi qo‘shiladi. Oxirida nechtasiga yetkazilgani va nechtasi botni bloklagani haqida hisobot keladi. |
| 📋 **Buyurtmalar** | So‘nggi buyurtmalar: mijoz, telefon, manzil (xaritada ochish havolasi bilan), mahsulotlar. Har birining amoCRM’ga yuborilgan-yuborilmagani ko‘rinadi, kerak bo‘lsa qayta yuboriladi. |
| ⚙️ **Sozlamalar** | Kompaniya nomi, aloqa telefoni va Telegrami, ish vaqti, to‘lov izohi, **minimal buyurtma**, **shikastlangan idish jarimasi**, **eslatma vaqti va matni**, cheklovlar. |
| 🔗 **amoCRM** | Ulanish holati, «🔍 Tekshirish», xato bilan qolgan buyurtmalarni qayta yuborish. |
| 👥 **Adminlar** | Bosh admin yangi admin qo‘sha va o‘chira oladi. Yangi adminni Telegram kontaktlaridan tanlash kifoya. |

Mijozlar «⚙️ Boshqaruv» tugmasini ko‘rmaydi. Admin huquqi har bir xabarda qayta tekshiriladi.

### 🔗 amoCRM bilan ishlash

Har bir buyurtma uchun:
1. **Kontakt.** Telefon raqami bo‘yicha qidiriladi, topilmasa yaratiladi. Qaytgan mijoz uchun dublikat ochilmaydi.
2. **Lid.** «Buyurtma #1042», summa bilan, kerakli voronka va bosqichga tushadi.
3. **Izoh.** Buyurtmaning to‘liq tarkibi: mahsulotlar, bo‘sh idishlar, manzil (joy nomi bilan), **Yandex xarita
   havolasi va aniq koordinatalar**, Telegram. amoCRM’da «Xarita» maydoni sozlansa, havola lidning o‘ziga ham yoziladi.

**amoCRM ishlamay qolsa ham buyurtma yo‘qolmaydi.** U bazada saqlanadi va bot avtomatik qayta
yuboradi. Muammo uzoq davom etsa, adminlarga Telegram orqali xabar keladi. Mijoz esa amoCRM’ni
kutib o‘tirmaydi.

### 🛡 Ishonchlilik

- **Summani faqat server hisoblaydi.** Narxlar har doim bazadan olinadi.
- **Eski buyurtmalarning narxi o‘zgarmaydi.** Har bir buyurtma o‘sha paytdagi narxni saqlab qoladi.
- Mijoz xulosani ko‘rganidan keyin admin narxni o‘zgartirsa, mijozga yangi xulosa ko‘rsatiladi va
  qayta tasdiqlash so‘raladi.
- «Tasdiqlash» tugmasi ikki marta bosilsa ham **bitta buyurtma** yaratiladi. Eski tugmalar 12 soatdan keyin ishlamaydi.
- Minimal buyurtma (masalan, 2 ta) server tomonida majburiy tekshiriladi.
- Shikastlangan idish jarimasi mijozga oldindan ko‘rsatiladi, lekin summaga qo‘shilmaydi, chunki uni kuryer joyida oladi.
- **104 ta avtomatik test.** Ular to‘liq bot suhbatlari, buyurtma yaratish va amoCRM’dagi xato va qayta urinish holatlarini tekshiradi.

---

## Qanday ishlaydi

```
Mijoz ──► Telegram ──► Backend (bot + amoCRM yuboruvchi) ──► PostgreSQL (asosiy baza)
                              │
                              └──► amoCRM (navbat va qayta urinish bilan)
```

Hammasi bitta Node.js jarayonida ishlaydi. Bot amoCRM bilan to‘g‘ridan-to‘g‘ri ishlamaydi: buyurtma
avval bazaga yoziladi, keyin alohida qism uni amoCRM’ga yetkazadi.

**Texnologiyalar:** NestJS 11, TypeScript, grammY (Telegram), Prisma 6, PostgreSQL, Jest.

---

## Nima kerak

- **Node.js 20+** va **PostgreSQL 14+**
- **Telegram bot tokeni**: [@BotFather](https://t.me/BotFather) da `/newbot` orqali olinadi
- **Server (VPS)**, masalan Ubuntu. **Domen shart emas**, chunki bot domensiz ham ishlaydi (polling rejimi).
- **amoCRM** ixtiyoriy. Ulanmagan bo‘lsa, buyurtmalar navbatda kutib turadi.
- Lokatsiya nomlari uchun kalit kerak emas: standart bo‘yicha bepul OpenStreetMap ishlatiladi. Yandex kaliti
  bo‘lsa (`GEOCODER_PROVIDER=yandex`, `YANDEX_GEOCODER_API_KEY`), toza o‘zbekcha nomlar chiqadi.

---

## Kompyuterda sinab ko‘rish

```bash
cd backend
cp .env.example .env      # DATABASE_URL, APP_SECRET, BOT_TOKEN, ADMIN_TELEGRAM_IDS ni to‘ldiring
npm install
npx prisma migrate dev    # bazada jadvallarni yaratadi
npm run seed:demo         # ixtiyoriy: bitta namunaviy mahsulot
npm run dev
```

Telegram’da botingizga `/start` yuboring. Telegram ID’ingiz `ADMIN_TELEGRAM_IDS` da bo‘lsa,
«⚙️ Boshqaruv» tugmasi chiqadi. O‘z ID’ingizni [@userinfobot](https://t.me/userinfobot) dan bilib olasiz.

> ⚠️ **Bitta bot tokeni faqat bitta joyda ishlay oladi.** Bot serverda ishlayotgan bo‘lsa, kompyuterda
> ishga tushirishdan oldin serverdagisini to‘xtating. Aks holda ikkalasi ham xabar ololmay qoladi.

---

## Yangi mijoz uchun bot o‘rnatish (qadamma-qadam)

### 1. Mijozdan olinadigan ma’lumotlar
- Bot tokeni (mijoz @BotFather’da bot yaratib beradi)
- Admin bo‘ladigan odamlarning Telegram ID’lari
- Kompaniya nomi, aloqa telefoni, Telegram, ish vaqti
- Mahsulotlar, narxlar va rasmlar
- Qoidalar: minimal buyurtma, idish jarimasi, yetkazish shartlari
- amoCRM ishlatilsa: hisob manzili (`kompaniya.amocrm.ru`), uzoq muddatli token, lidlar tushadigan voronka va bosqich

### 2. Yangi repo
GitHub’da **«Use this template»** tugmasi orqali mijoz uchun alohida (yopiq) repo yarating.

### 3. Serverga o‘rnatish
Serverda boshqa loyihalar bo‘lsa, ularga tegmang: har bir mijozga **o‘z papkasi, o‘z porti, o‘z
bazasi va o‘z PM2 nomi** beriladi.

```bash
# Baza (o‘z roli va bazasi)
sudo -u postgres psql -c "CREATE ROLE suv_bot LOGIN PASSWORD '<kuchli-parol>';"
sudo -u postgres psql -c "CREATE DATABASE suv_bot OWNER suv_bot;"

# Kod
git clone <repo> /var/www/suv-bot && cd /var/www/suv-bot/backend
cp .env.example .env && chmod 600 .env     # pastdagi jadval bo‘yicha to‘ldiring

# Build, migratsiya va ishga tushirish (bitta buyruq)
bash ../deploy/deploy.sh
pm2 save                                     # server qayta yuklanganda bot o‘zi ko‘tariladi
```

**`.env` dagi asosiy qiymatlar:**

| O‘zgaruvchi | Nima yoziladi |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Serverdagi bo‘sh port (`ss -ltnp` bilan tekshiring) |
| `DATABASE_URL` | `postgresql://suv_bot:<parol>@127.0.0.1:5432/suv_bot?schema=public` |
| `APP_SECRET` | `openssl rand -hex 32` natijasi |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` natijasi |
| `BOT_TOKEN` | Mijozning bot tokeni |
| `ADMIN_TELEGRAM_IDS` | Bosh adminlar ID’lari, vergul bilan |
| `PM2_APP_NAME` | Masalan `suv-bot` (har mijozga alohida nom) |
| `SWAGGER_ENABLED` | `false` |
| `AMOCRM_*` | amoCRM bo‘lsa, [docs/amocrm.md](docs/amocrm.md) bo‘yicha |

Hamma o‘zgaruvchilar izohlari bilan [backend/.env.example](backend/.env.example) da. Biror qiymat
noto‘g‘ri bo‘lsa, ilova ishga tushmaydi va qaysi o‘zgaruvchida xato borligini aytadi.

### 4. Botni sozlash (Telegram’da, admin sifatida)
«⚙️ Boshqaruv» bo‘limida:
1. **⚙️ Sozlamalar**: kompaniya nomi, telefon, Telegram, ish vaqti, to‘lov izohi (masalan, «Yetkazib
   berish — bepul…»), minimal buyurtma, idish jarimasi.
2. **📦 Mahsulotlar**: mahsulotlarni qo‘shing, narx va rasm qo‘ying.
3. **👥 Adminlar**: kerak bo‘lsa, operatorlarni qo‘shing.

### 5. amoCRM’ni ulash (ixtiyoriy)
1. amoCRM’da *Sozlamalar → Integratsiyalar → shaxsiy integratsiya* yarating va **uzoq muddatli token** oling.
2. `.env` ga `AMOCRM_DOMAIN` va `AMOCRM_LONG_LIVED_TOKEN` ni yozing.
3. `npm run amocrm:inspect` buyrug‘i voronka, bosqich va maydonlarning ID’larini chiqaradi. Ularni `.env` ga yozing.
4. `bash deploy/deploy.sh`, keyin botda «🔗 amoCRM → 🔍 Ulanishni tekshirish».

### 6. Ishga tushirish
1. Bitta sinov buyurtma bering va u amoCRM’da paydo bo‘lganini tekshiring.
2. Sinov paytidagi buyurtmalarni tozalang: `npm run data:clear-test -- --yes`. Mahsulot va sozlamalar
   saqlanib qoladi, buyurtma raqami yana #1001 dan boshlanadi.
3. Bot mijozlar uchun tayyor ✅

### Yangilash
Kod o‘zgargandan keyin kompyuterdan bitta buyruq yetarli:

```bash
DEPLOY_HOST=root@<server> DEPLOY_DIR=/var/www/suv-bot bash deploy/push.sh
```

U `.env`, rasmlar va bazaga tegmaydi, faqat kodni yangilaydi va botni qayta ishga tushiradi.

---

## Foydali buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | Kompyuterda ishga tushirish (o‘zgarishlarni kuzatib turadi) |
| `npm test` | Barcha testlar (faqat nomi `_test` bilan tugaydigan bazada ishlaydi) |
| `npx prisma migrate deploy` | Serverda baza tuzilmasini yangilash |
| `npx prisma studio` | Bazani brauzerda ko‘rish |
| `npm run amocrm:inspect` | amoCRM voronka, bosqich va maydon ID’larini ko‘rsatish |
| `npm run data:clear-test -- --yes` | Sinov buyurtmalari va mijozlarini o‘chirish |
| `pm2 logs <nom>` | Serverdagi loglar (maxfiy ma’lumotlar yashirilgan) |

---

## Matnlarni o‘zgartirish va boshqa tillar

Botdagi barcha matnlar bitta faylda: [backend/src/i18n/uz.ts](backend/src/i18n/uz.ts).
Rus yoki ingliz tilini qo‘shish uchun shu tuzilmada `ru.ts` yaratiladi. Biror matn qolib ketsa,
TypeScript buni o‘zi ko‘rsatadi.

---

## Xavfsizlik

- `.env` hech qachon GitHub’ga yuklanmaydi, sirlar faqat serverda turadi.
- amoCRM tokenlari bazada shifrlangan holda (AES-256-GCM) saqlanadi.
- Loglarda bot tokeni va boshqa sirlar avtomatik yashiriladi.
- Bot faqat shaxsiy chatlarda ishlaydi va tez-tez yuboriladigan xabarlardan himoyalangan.
  Mijoz faqat o‘z buyurtmasi va manzillarini ko‘ra oladi.

---

## Batafsil hujjatlar

- [Admin qo‘llanmasi (o‘zbekcha)](docs/admin-guide.uz.md): mijozning adminlari uchun
- [Bot qanday ishlaydi](docs/bot-flow.md)
- [Arxitektura va qarorlar](docs/architecture.md)
- [amoCRM integratsiyasi](docs/amocrm.md)
- [Serverga o‘rnatish](docs/deployment.md)
- [HTTP API](docs/api.md)
