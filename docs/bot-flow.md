# Bot flow

All texts are in `backend/src/i18n/uz.ts`. Business data (company name, contacts, products,
prices) comes from the database.

## Main menu (reply keyboard)

```
🛒 Suv buyurtma qilish
📦 Buyurtmalarim   👤 Profilim
📍 Manzillarim     ☎️ Aloqa
⚙️ Boshqaruv                 ← admins only
```

`/start` shows the welcome message (`💧 <company> botiga xush kelibsiz!`). `/cancel` or
`❌ Bekor qilish` leaves any step at any time. Unexpected input (stickers, random text) gets a
short hint plus the menu.

## Ordering

```
🛒 Suv buyurtma qilish
   ├─ 1 active product → product card directly
   └─ several          → pick list → product card
Product card:  [➖] [3] [➕]   [🛒 Savatga qo‘shish · 45 000 so‘m]
               (single product: starts at the minimum order, e.g. 2, and ➖ stops there)
   ├─ 1 product  → straight to checkout
   └─ several    → cart: [➡️ Rasmiylashtirish] [➕ Yana] [🗑 Tozalash]
Checkout (advance() always jumps to the first missing piece):
   (cart total below the minimum order → cart with a notice, no checkout button)
   ♻️ empty bottles   [0][1][2][3][4][5+]  (5+ → type a number);
                      shows the damaged-bottle fine notice when it is set
   📞 phone           skipped if saved; contact button or typed number;
                      someone else's contact card is rejected
   📍 address         location button → reverse-geocoded to "street, district, city"
                      → optional "house/apartment" note; or typed text; or one tap on a
                      saved address. Unknown place → coordinates are kept as text.
   🧾 summary         items, bottles, phone, address, TOTAL, payment note
                      [✅ Tasdiqlash] [✏️ O‘zgartirish] [❌ Bekor qilish]
✅ → order saved → "✅ Buyurtmangiz qabul qilindi! Buyurtma: #1042 …"
```

Guarantees:

- Quantities are carried in the button data, so product cards keep working after a restart.
- Prices are re-read from the DB for the cart, the summary and at confirmation. If a price
  changed after the summary was shown, the customer gets a fresh summary instead of an order
  with a surprise total.
- A product deactivated mid-checkout is dropped from the cart with a notice.
- The minimum order (`min_order_quantity`, total items) is enforced by the backend. The bot
  only makes it easy to meet.
- The damaged-bottle fine (`damaged_bottle_fine`) is information only: it is never added to the
  total, and the courier collects it on the spot.
- Double taps and old "Confirm" buttons cannot create a second order (idempotency key + 12 h expiry).
- The customer never waits for amoCRM. Sync happens in the background.

## My orders / profile / addresses

- **📦 Buyurtmalarim**: 5 per page. Details show purchase-time prices (snapshot).
  `🔁 Qayta buyurtma qilish` refills the cart at today's prices and starts checkout.
- **👤 Profilim**: name, phone, order count, `📱 Telefonni o‘zgartirish`.
- **📍 Manzillarim**: up to 10 addresses. `⭐ n` sets the default, `🗑 n` deletes,
  `➕ Yangi manzil` adds one. Addresses used in orders are saved automatically.
- **☎️ Aloqa**: company, phone, Telegram and working hours, all from settings.

## Admin mode (`⚙️ Boshqaruv` or `/admin`)

```
📦 Mahsulotlar   → list → card: ✏️ Nomi 💰 Narxi 📝 Tavsif 🖼 Rasm 🔢 Tartib
                                ⛔/✅ sotuvdan olish/qaytarish  🗑 O‘chirish (only if never ordered)
                 → ➕ Yangi mahsulot: name → price → description (skip) → photo (skip)
📊 Statistika    today / 7 / 30 days, totals, new orders, amoCRM queue
📋 Buyurtmalar   recent orders with amoCRM status (✅ ⏳ ⚠️), details, 🔁 resend to amoCRM
⚙️ Sozlamalar    company name, contact phone/Telegram, working hours, payment note,
                 minimum order, damaged-bottle fine, limits
🔗 amoCRM        connection status, 🔍 check, 🔁 resend failed, 🔗 connect (OAuth)
👥 Adminlar      super admins only: add (pick a user or type an id) / remove
```

Price changes apply to the very next customer message. Past orders keep their prices.

## Reminder and announcements

- **Start reminders.** Every `/start` opens a cycle. If the user then neither writes nor taps
  anything, they get reminder 1 after `reminder_first_minutes` (default 10) and reminder 2
  after `reminder_second_minutes` (default 60, counted from `/start`), each with a
  `🛒 Buyurtma berish` button, and nothing after that. Any message or button press cancels the
  rest, and the next `/start` starts a new cycle. A reminder more than 30 minutes late (bot
  offline) is dropped. Texts: defaults or `reminder_text` / `reminder_text_2`.
- **Announcement (`📣 Xabar yuborish`).** The admin's message is copied to every user who hasn't
  blocked the bot (~25 per second, in the background, resumable after a restart), with the same
  order button. The author receives a report: delivered / blocked / failed. A 403 from Telegram
  marks the user as blocked until they write to the bot again.
- The order button always opens the catalog in a **new** message, so the announcement stays.

## Conversation states

`BotSession.value.state`: `idle`, `checkout:bottles_custom`, `checkout:phone`,
`checkout:address`, `checkout:address_details`, `profile:phone`, `addresses:new`,
`addresses:new_details`, `admin:product:create:{name,price,description,photo}`,
`admin:product:edit`, `admin:setting:edit`, `admin:admins:add`, `admin:broadcast:compose`.
Free input (text, contact, location, photo, shared user) is routed by `StateRouter` to the
handler of the current state. Buttons are handled independently of state.
