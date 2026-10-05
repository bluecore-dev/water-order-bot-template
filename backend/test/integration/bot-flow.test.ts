import { AdminRole } from '@prisma/client';
import { BotService } from '../../src/bot/bot.service';
import { getMessages } from '../../src/i18n';
import { ProductsService } from '../../src/modules/products/products.service';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { createTestApp, FakeTelegram, resetDb, TestApp } from '../helpers';

const t = getMessages('uz');
const SUPER_ADMIN_ID = 900000001; // ADMIN_TELEGRAM_IDS in test/test.env

describe('Telegram bot conversation (real handlers, fake Telegram)', () => {
  let app: TestApp;
  let tg: FakeTelegram;
  let products: ProductsService;
  const customer = FakeTelegram.user(555001, 'Ali', 'ali');
  const admin = FakeTelegram.user(SUPER_ADMIN_ID, 'Boss', 'boss');

  beforeAll(async () => {
    app = await createTestApp();
    products = app.get(ProductsService);
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb(app.prisma);
    await app.get(SettingsService).set('company_name', 'Demo Suv');
    tg = new FakeTelegram(app.get(BotService));
  });

  async function orderOnce(user = customer, opts: { qtyClicks?: number; bottles?: number } = {}) {
    await tg.text(user, t.menu.buy);
    for (let i = 0; i < (opts.qtyClicks ?? 0); i++) await tg.callback(user, tg.button('➕'));
    await tg.callback(user, tg.button('Savatga'));
    await tg.callback(user, `bt:${opts.bottles ?? 0}`);
  }

  it('first-time customer: /start → product → qty → bottles → phone → location → confirm', async () => {
    const water = await products.create({ name: '18.9 L suv', price: 15000 });

    await tg.text(customer, '/start');
    expect(tg.lastText()).toContain('Demo Suv');
    expect(tg.lastReplyKeyboard()).toEqual([t.menu.buy, t.menu.orders, t.menu.profile, t.menu.addresses, t.menu.contact]);

    await tg.text(customer, t.menu.buy);
    expect(tg.lastText()).toContain('18.9 L suv');
    expect(tg.lastText()).toContain('15 000 so‘m');
    expect(tg.button('➕')).toBe(`qty:${water.id}:2`);

    await tg.callback(customer, `qty:${water.id}:2`);
    await tg.callback(customer, `qty:${water.id}:3`);
    expect(tg.button('Savatga')).toBe(`add:${water.id}:3`);
    expect(tg.lastInlineButtons().find((b) => b.text.startsWith('🛒'))!.text).toContain('45 000');

    // Single product → straight to checkout.
    await tg.callback(customer, `add:${water.id}:3`);
    expect(tg.lastText()).toBe(t.checkout.askBottles);

    await tg.callback(customer, 'bt:2');
    expect(tg.lastText()).toBe(t.checkout.askPhone);

    tg.clear();
    await tg.contact(customer, '998 90 123 45 67', 999); // somebody else's contact card
    expect(tg.lastText()).toBe(t.checkout.foreignContact);
    await tg.contact(customer, '998901234567');
    expect(tg.lastText()).toContain('Yetkazib berish manzilini');

    await tg.location(customer, 41.2856, 69.2034);
    expect(tg.lastText()).toBe(t.checkout.askAddressDetails);
    await tg.text(customer, 'Chilonzor 9, 12-uy, 21-xonadon');

    const summary = tg.lastText();
    expect(summary).toContain('18.9 L suv × 3 — 45 000 so‘m');
    expect(summary).toContain('Bo‘sh idishlar: 2 ta');
    expect(summary).toContain('+998 90 123 45 67');
    expect(summary).toContain('Chilonzor 9, 12-uy, 21-xonadon');
    expect(summary).toContain('JAMI: 45 000 so‘m');

    await tg.callback(customer, 'co:ok');
    expect(tg.lastText()).toContain('Buyurtmangiz qabul qilindi');
    expect(tg.lastText()).toContain('#1001');

    const order = await app.prisma.order.findFirstOrThrow({ include: { items: true } });
    expect(order).toMatchObject({
      orderNumber: 1001,
      totalAmount: 45000,
      emptyBottleCount: 2,
      phone: '+998901234567',
      deliveryAddress: 'Chilonzor 9, 12-uy, 21-xonadon',
      latitude: 41.2856,
      longitude: 69.2034,
      customerName: 'Ali',
    });
    expect(order.items[0]).toMatchObject({ productNameSnapshot: '18.9 L suv', unitPrice: 15000, quantity: 3 });

    // Pressing confirm again must not create a second order.
    await tg.callback(customer, 'co:ok');
    expect(tg.alerts().at(-1)).toBe(t.common.staleButton);
    expect(await app.prisma.order.count()).toBe(1);
  });

  it('returning customer: saved phone is reused and a saved address is one tap', async () => {
    await products.create({ name: 'Suv', price: 15000 });
    await orderOnce();
    await tg.contact(customer, '998901234567');
    await tg.text(customer, 'Yunusobod 4, 10-uy');
    await tg.callback(customer, 'co:ok');

    tg.clear();
    await orderOnce();
    // No phone question this time: straight to the address step with the saved address.
    expect(tg.texts().some((x) => x === t.checkout.askPhone)).toBe(false);
    const saved = tg.lastReplyKeyboard().find((b) => b.startsWith('🏠'));
    expect(saved).toBe('🏠 Yunusobod 4, 10-uy');
    await tg.text(customer, saved!);
    expect(tg.lastText()).toContain('Yunusobod 4, 10-uy');
    await tg.callback(customer, 'co:ok');
    expect(await app.prisma.order.count()).toBe(2);
    expect(await app.prisma.address.count()).toBe(1);
  });

  it('price changed between summary and confirm → fresh summary, then the new price', async () => {
    const water = await products.create({ name: 'Suv', price: 15000 });
    await orderOnce(customer, { qtyClicks: 2 });
    await tg.contact(customer, '998901234567');
    await tg.text(customer, 'Chilonzor 1');
    expect(tg.lastText()).toContain('45 000');

    await products.update(water.id, { price: 17000 });
    await tg.callback(customer, 'co:ok');
    expect(await app.prisma.order.count()).toBe(0);
    expect(tg.lastText()).toContain(t.checkout.priceChanged);
    expect(tg.lastText()).toContain('51 000');

    await tg.callback(customer, 'co:ok');
    expect((await app.prisma.order.findFirstOrThrow()).totalAmount).toBe(51000);
  });

  it('5+ bottles, invalid input, editing from the summary and cancelling', async () => {
    await products.create({ name: 'Suv', price: 15000 });
    await tg.text(customer, t.menu.buy);
    await tg.callback(customer, tg.button('Savatga'));
    await tg.callback(customer, 'bt:more');
    await tg.text(customer, 'ko‘p');
    expect(tg.lastText()).toContain('0 dan 100 gacha');
    await tg.text(customer, '7');
    await tg.contact(customer, '998901234567');
    await tg.text(customer, 'x'); // too short
    expect(tg.lastText()).toBe(t.checkout.invalidAddress);
    await tg.text(customer, 'Sergeli 5');
    expect(tg.lastText()).toContain('Bo‘sh idishlar: 7 ta');

    await tg.callback(customer, 'co:edit');
    await tg.callback(customer, 'co:ed:address');
    expect(tg.lastText()).toContain('Yetkazib berish manzilini');
    await tg.text(customer, 'Olmazor 2');
    expect(tg.lastText()).toContain('Olmazor 2');

    await tg.callback(customer, 'co:edit');
    await tg.callback(customer, 'co:ed:phone');
    expect(tg.lastText()).toBe(t.checkout.askPhone);
    await tg.text(customer, t.common.cancel);
    expect(tg.lastText()).toBe(t.common.cancelled);
    const session = await app.prisma.botSession.findUniqueOrThrow({ where: { key: String(customer.id) } });
    expect(session.value).toMatchObject({ state: 'idle', checkout: {} });
    expect(await app.prisma.order.count()).toBe(0);
  });

  it('an abandoned checkout expires: an old Confirm button no longer creates an order', async () => {
    await products.create({ name: 'Suv', price: 15000 });
    await orderOnce();
    await tg.contact(customer, '998901234567');
    await tg.text(customer, 'Chilonzor 1');
    const session = await app.prisma.botSession.findUniqueOrThrow({ where: { key: String(customer.id) } });
    const value = session.value as { checkout: { startedAt: number } };
    value.checkout.startedAt = Date.now() - 13 * 60 * 60 * 1000;
    await app.prisma.botSession.update({ where: { key: session.key }, data: { value } });

    await tg.callback(customer, 'co:ok');
    expect(tg.alerts().at(-1)).toBe(t.checkout.expired);
    expect(await app.prisma.order.count()).toBe(0);
  });

  it('several products: pick list, cart, checkout', async () => {
    const water = await products.create({ name: 'Suv 18.9 L', price: 15000 });
    const small = await products.create({ name: 'Suv 10 L', price: 9000 });
    await tg.text(customer, t.menu.buy);
    expect(tg.lastText()).toBe(t.catalog.choose);
    await tg.callback(customer, `prd:${water.id}`);
    await tg.callback(customer, `add:${water.id}:2`);
    expect(tg.lastText()).toContain('Jami: <b>30 000 so‘m</b>');
    await tg.callback(customer, 'cat');
    await tg.callback(customer, `prd:${small.id}`);
    await tg.callback(customer, `add:${small.id}:1`);
    expect(tg.lastText()).toContain('Jami: <b>39 000 so‘m</b>');
    await tg.callback(customer, 'co:go');
    expect(tg.lastText()).toBe(t.checkout.askBottles);
  });

  it('history shows the purchase-time price; repeat order uses today’s price', async () => {
    const water = await products.create({ name: 'Suv', price: 15000 });
    await orderOnce(customer, { qtyClicks: 2 });
    await tg.contact(customer, '998901234567');
    await tg.text(customer, 'Chilonzor 1');
    await tg.callback(customer, 'co:ok');
    const order = await app.prisma.order.findFirstOrThrow();

    await products.update(water.id, { price: 20000 });
    await tg.text(customer, t.menu.orders);
    await tg.callback(customer, tg.button('#1001'));
    expect(tg.lastText()).toContain('3 × 15 000 so‘m = 45 000 so‘m');

    await tg.callback(customer, `ord:r:${order.id}`);
    expect(tg.lastText()).toBe(t.checkout.askBottles);
    await tg.callback(customer, 'bt:0');
    await tg.text(customer, tg.lastReplyKeyboard().find((b) => b.startsWith('🏠'))!);
    expect(tg.lastText()).toContain('JAMI: 60 000 so‘m');
  });

  describe('client rules: minimum 2 bottles, 40 000 so‘m fine for damaged bottles', () => {
    beforeEach(async () => {
      const settings = app.get(SettingsService);
      await settings.set('min_order_quantity', '2');
      await settings.set('damaged_bottle_fine', '40 000');
    });

    it('single product: card starts at the minimum and ➖ cannot go below it', async () => {
      const water = await products.create({ name: '18.9 L suv', price: 15000 });
      await tg.text(customer, t.menu.buy);
      expect(tg.lastText()).toContain('Minimal buyurtma: <b>2 ta</b>');
      expect(tg.button('Savatga')).toBe(`add:${water.id}:2`);
      expect(tg.button('➖')).toBe(`qty:${water.id}:1`);

      await tg.callback(customer, `qty:${water.id}:1`);
      expect(tg.alerts().at(-1)).toBe(t.catalog.minQty(2));

      await tg.callback(customer, `add:${water.id}:2`);
      expect(tg.lastText()).toContain(t.checkout.askBottles);
      expect(tg.lastText()).toContain('40 000 so‘m</b> jarima');

      await tg.callback(customer, 'bt:2');
      await tg.contact(customer, '998901234567');
      await tg.text(customer, 'Chilonzor 1');
      expect(tg.lastText()).toContain('Shikastlangan idish uchun jarima: 40 000 so‘m');
      expect(tg.lastText()).toContain('JAMI: 30 000 so‘m'); // the fine is never added to the total
      await tg.callback(customer, 'co:ok');
      expect((await app.prisma.order.findFirstOrThrow()).totalAmount).toBe(30000);
    });

    it('no fine line in the summary when no bottles are returned', async () => {
      await products.create({ name: 'Suv', price: 15000 });
      await orderOnce(customer, { bottles: 0 });
      await tg.contact(customer, '998901234567');
      await tg.text(customer, 'Chilonzor 1');
      expect(tg.lastText()).not.toContain('jarima');
    });

    it('several products: below the minimum the cart hides checkout and explains why', async () => {
      const a = await products.create({ name: 'Suv 18.9 L', price: 15000 });
      await products.create({ name: 'Suv 10 L', price: 9000 });
      await tg.text(customer, t.menu.buy);
      await tg.callback(customer, `prd:${a.id}`);
      await tg.callback(customer, `add:${a.id}:1`);
      expect(tg.lastText()).toContain('Minimal buyurtma — <b>2 ta</b>, savatda 1 ta');
      expect(tg.lastInlineButtons().map((b) => b.text)).not.toContain(t.cart.checkout);

      await tg.callback(customer, 'co:go'); // an old/crafted button still cannot skip the rule
      expect(tg.lastText()).toContain('Minimal buyurtma');
      expect(tg.texts()).not.toContain(t.checkout.askBottles);

      await tg.callback(customer, `add:${a.id}:2`);
      expect(tg.button(t.cart.checkout)).toBe('co:go');
    });

    it('admin sees and edits the new settings', async () => {
      await tg.callback(admin, 'adm:set:list');
      const labels = tg.lastInlineButtons().map((b) => b.text);
      expect(labels).toContain('Minimal buyurtma: 2');
      expect(labels).toContain('Shikastlangan idish jarimasi: 40 000 so‘m');
      await tg.callback(admin, 'adm:set:e:min_order_quantity');
      await tg.text(admin, '500');
      expect(tg.lastText()).toBe(t.admin.invalidSetting);
      await tg.text(admin, '3');
      expect(await app.get(SettingsService).getInt('min_order_quantity')).toBe(3);
    });
  });

  it('ignores group chats and nudges on unexpected input', async () => {
    await tg.bot.handleUpdate({
      update_id: 99999,
      message: { message_id: 1, date: 0, chat: { id: -100, type: 'group', title: 'g' }, from: customer, text: '/start' },
    } as any);
    expect(tg.calls).toHaveLength(0);

    await tg.message(customer, { sticker: { file_id: 's', file_unique_id: 's', type: 'regular', width: 1, height: 1, is_animated: false, is_video: false } });
    expect(tg.lastText()).toBe(t.common.unknownInput);
  });

  describe('admin mode', () => {
    it('is invisible and locked for customers', async () => {
      await tg.text(customer, '/start');
      expect(tg.lastReplyKeyboard()).not.toContain(t.menu.admin);
      await tg.callback(customer, 'adm:menu');
      expect(tg.alerts().at(-1)).toBe(t.admin.notAdmin);
      await tg.text(customer, '/admin');
      expect(tg.lastText()).toBe(t.admin.notAdmin);
    });

    it('admin changes a price and the bot shows it to customers immediately', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      await tg.text(admin, '/start');
      expect(tg.lastReplyKeyboard()).toContain(t.menu.admin);
      await tg.text(admin, t.menu.admin);
      expect(tg.lastText()).toBe(t.admin.menuTitle);

      await tg.callback(admin, 'adm:prd:list');
      await tg.callback(admin, `adm:prd:v:${water.id}`);
      await tg.callback(admin, `adm:prd:e:${water.id}:price`);
      await tg.text(admin, 'abc');
      expect(tg.lastText()).toBe(t.admin.invalidPrice);
      await tg.text(admin, '17 000');
      expect(tg.texts().some((x) => x.includes('15 000 so‘m → <b>17 000 so‘m</b>'))).toBe(true);

      await tg.text(customer, t.menu.buy);
      expect(tg.lastText()).toContain('17 000 so‘m');
    });

    it('admin creates, deactivates and safely deletes products', async () => {
      await tg.callback(admin, 'adm:prd:new');
      await tg.text(admin, 'Pompa');
      await tg.text(admin, '45000');
      await tg.text(admin, t.common.skip);
      await tg.text(admin, t.common.skip);
      expect(tg.texts()).toContain(t.admin.productCreated);
      const pump = await app.prisma.product.findFirstOrThrow({ where: { name: 'Pompa' } });
      expect(pump).toMatchObject({ price: 45000, isActive: true, description: null });

      await tg.callback(admin, `adm:prd:tg:${pump.id}`);
      expect((await products.findById(pump.id))!.isActive).toBe(false);
      await tg.text(customer, t.menu.buy);
      expect(tg.lastText()).toBe(t.catalog.empty);

      await tg.callback(admin, `adm:prd:tg:${pump.id}`);
      await orderOnce();
      await tg.contact(customer, '998901234567');
      await tg.text(customer, 'Chilonzor 1');
      await tg.callback(customer, 'co:ok');
      await tg.callback(admin, `adm:prd:del:${pump.id}`);
      expect(tg.alerts().at(-1)).toContain('1 ta buyurtmada');
      expect(await products.findById(pump.id)).not.toBeNull();
    });

    it('admin uploads a product photo; it is stored and re-used by file_id', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(Buffer.from('fake-jpeg-bytes')));
      try {
        await tg.callback(admin, `adm:prd:e:${water.id}:photo`);
        await tg.message(admin, { photo: [{ file_id: 'admin-photo-id', file_unique_id: 'p', width: 800, height: 800, file_size: 1000 }] });
      } finally {
        fetchSpy.mockRestore();
      }
      const saved = (await products.findById(water.id))!;
      expect(saved.imageUrl).toMatch(/^local:products\/.+\.jpg$/);
      expect(saved).toMatchObject({ imageFileId: 'admin-photo-id', imageFileBotId: '4242' });

      tg.clear();
      await tg.text(customer, t.menu.buy);
      const photo = tg.calls.find((c) => c.method === 'sendPhoto');
      expect(photo?.payload.photo).toBe('admin-photo-id');
    });

    it('settings edited from the bot appear in the Contact section', async () => {
      await tg.callback(admin, 'adm:set:e:support_phone');
      await tg.text(admin, '123');
      expect(tg.lastText()).toBe(t.admin.invalidSetting);
      await tg.text(admin, '90 111 22 33');
      await tg.text(customer, t.menu.contact);
      expect(tg.lastText()).toContain('+998 90 111 22 33');
    });

    it('only super admins manage admins; added admins get access', async () => {
      const helper = FakeTelegram.user(700000001, 'Operator', 'op');
      await tg.callback(admin, 'adm:adm:add');
      await tg.message(admin, { users_shared: { request_id: 1, users: [{ user_id: helper.id, first_name: 'Operator' }] } });
      const row = await app.prisma.adminUser.findUniqueOrThrow({ where: { telegramId: BigInt(helper.id) } });
      expect(row).toMatchObject({ role: AdminRole.ADMIN, isActive: true, name: 'Operator' });

      await tg.text(helper, '/start');
      expect(tg.lastReplyKeyboard()).toContain(t.menu.admin);
      await tg.callback(helper, 'adm:stats');
      expect(tg.lastText()).toContain('Statistika');
      await tg.callback(helper, 'adm:adm:list');
      expect(tg.alerts().at(-1)).toBe(t.admin.superOnly);

      await tg.callback(admin, `adm:adm:del:${helper.id}`);
      await tg.callback(helper, 'adm:stats');
      expect(tg.alerts().at(-1)).toBe(t.admin.notAdmin);

      await tg.callback(admin, `adm:adm:del:${SUPER_ADMIN_ID}`);
      expect(tg.alerts().at(-1)).toBe(t.admin.cannotRemoveSuper);
    });
  });
});
