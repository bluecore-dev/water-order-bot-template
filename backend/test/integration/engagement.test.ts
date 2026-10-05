import { BroadcastStatus } from '@prisma/client';
import { BotService } from '../../src/bot/bot.service';
import { BroadcastService } from '../../src/bot/services/broadcast.service';
import { BotProfileService } from '../../src/bot/services/bot-profile.service';
import { ReminderService } from '../../src/bot/services/reminder.service';
import { getMessages } from '../../src/i18n';
import { GeocodingService } from '../../src/modules/geocoding/geocoding.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { createTestApp, FakeTelegram, resetDb, TestApp } from '../helpers';

const t = getMessages('uz');
const SUPER_ADMIN_ID = 900000001;
const BLOCKED = { error_code: 403, description: 'Forbidden: bot was blocked by the user' };
// 12:00 in Tashkent (UTC+5) — inside the reminder window.
const NOON_TASHKENT = new Date('2026-10-05T07:00:00Z');

describe('Reminders, announcements and named locations', () => {
  let app: TestApp;
  let tg: FakeTelegram;
  let reminders: ReminderService;
  let broadcasts: BroadcastService;
  const ali = FakeTelegram.user(555001, 'Ali', 'ali');
  const vali = FakeTelegram.user(555002, 'Vali', 'vali');
  const gani = FakeTelegram.user(555003, 'Gani', 'gani');
  const admin = FakeTelegram.user(SUPER_ADMIN_ID, 'Boss', 'boss');

  beforeAll(async () => {
    app = await createTestApp();
    reminders = app.get(ReminderService);
    broadcasts = app.get(BroadcastService);
    broadcasts.sendGapMs = 0;
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb(app.prisma);
    await app.get(SettingsService).set('company_name', 'Demo Suv');
    tg = new FakeTelegram(app.get(BotService));
  });

  const inactiveFor = (telegramId: number, hours: number, now = NOON_TASHKENT) =>
    app.prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { lastActivityAt: new Date(now.getTime() - hours * 3_600_000) },
    });
  const sentTo = (chatId: number, method = 'sendMessage') =>
    tg.calls.filter((c) => c.method === method && Number(c.payload.chat_id) === chatId);

  describe('“you haven’t ordered yet” reminder', () => {
    it('one reminder after the configured idle time, with an order button', async () => {
      await tg.text(ali, '/start');
      await inactiveFor(ali.id, 4);
      tg.clear();

      expect(await reminders.runOnce(NOON_TASHKENT)).toBe(1);
      const [msg] = sentTo(ali.id);
      expect(msg.payload.text).toContain('Demo Suv');
      expect(msg.payload.text).toContain('buyurtma bering');
      expect(msg.payload.reply_markup.inline_keyboard[0][0]).toMatchObject({ text: t.engage.orderButton, callback_data: 'go' });

      // Never twice.
      expect(await reminders.runOnce(new Date(NOON_TASHKENT.getTime() + 3_600_000))).toBe(0);
    });

    it('skips: recently active, customers who ordered, admins, night time, feature off', async () => {
      await products().create({ name: 'Suv', price: 15000 });
      await tg.text(ali, '/start'); // active 1h ago → too early
      await inactiveFor(ali.id, 1);
      await tg.text(admin, '/start'); // admin
      await inactiveFor(admin.id, 10);
      await placeOrder(vali); // already a customer
      await inactiveFor(vali.id, 10);

      expect(await reminders.runOnce(NOON_TASHKENT)).toBe(0);

      await tg.text(gani, '/start');
      await inactiveFor(gani.id, 5, new Date('2026-10-05T18:00:00Z'));
      expect(await reminders.runOnce(new Date('2026-10-05T18:00:00Z'))).toBe(0); // 23:00 in Tashkent

      await app.get(SettingsService).set('reminder_after_hours', '0');
      await inactiveFor(gani.id, 5);
      expect(await reminders.runOnce(NOON_TASHKENT)).toBe(0);
    });

    it('custom text from settings; a user who blocked the bot is marked', async () => {
      await app.get(SettingsService).set('reminder_text', 'Bugun 10% chegirma! <3');
      await tg.text(ali, '/start');
      await tg.text(vali, '/start');
      await inactiveFor(ali.id, 4);
      await inactiveFor(vali.id, 4);
      tg.failFor.set(vali.id, BLOCKED);
      tg.clear();

      expect(await reminders.runOnce(NOON_TASHKENT)).toBe(1);
      expect(sentTo(ali.id)[0].payload.text).toBe('Bugun 10% chegirma! &lt;3');
      const blocked = await app.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(vali.id) } });
      expect(blocked.botBlockedAt).not.toBeNull();

      // Writing to the bot again un-blocks them.
      tg.failFor.delete(vali.id);
      await tg.text(vali, '/start');
      expect((await app.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(vali.id) } })).botBlockedAt).toBeNull();
    });

    it('the order button opens the catalog in a new message, keeping the reminder', async () => {
      await products().create({ name: 'Suv', price: 15000 });
      await tg.text(ali, '/start');
      tg.clear();
      await tg.callback(ali, 'go');
      expect(tg.calls.some((c) => c.method === 'editMessageText')).toBe(false);
      expect(tg.lastText()).toContain('Suv');
    });
  });

  describe('admin announcements (📣 Xabar yuborish)', () => {
    it('compose → preview → confirm → copied to every customer with an order button', async () => {
      for (const u of [ali, vali, gani]) await tg.text(u, '/start');
      tg.failFor.set(gani.id, BLOCKED);

      await tg.text(admin, '/start');
      await tg.callback(admin, 'adm:bc:new');
      expect(tg.lastText()).toContain('Qabul qiluvchilar: <b>3</b>');

      await tg.message(admin, { sticker: { file_id: 's', file_unique_id: 's', type: 'regular', width: 1, height: 1, is_animated: false, is_video: false } });
      expect(tg.lastText()).toBe(t.admin.broadcastUnsupported);

      tg.clear();
      await tg.text(admin, '🎉 Bu hafta 2 ta suvga 10% chegirma!');
      const preview = sentTo(admin.id, 'copyMessage');
      expect(preview).toHaveLength(1);
      expect(preview[0].payload.reply_markup.inline_keyboard[0][0].callback_data).toBe('go');
      expect(tg.lastText()).toContain('<b>3</b> ta mijozga yuborilsinmi');

      await tg.callback(admin, 'adm:bc:send');
      const row = await app.prisma.broadcast.findFirstOrThrow();
      const done = await broadcasts.run(row.id);

      expect(done).toMatchObject({ status: BroadcastStatus.DONE, total: 3, sent: 2, blocked: 1, failed: 0 });
      for (const u of [ali, vali]) {
        const [copy] = sentTo(u.id, 'copyMessage');
        expect(copy.payload).toMatchObject({ from_chat_id: admin.id });
        expect(copy.payload.reply_markup.inline_keyboard[0][0].callback_data).toBe('go');
      }
      expect(sentTo(admin.id, 'copyMessage')).toHaveLength(1); // the author is not a recipient
      expect(tg.texts().some((x) => x.includes('Yetkazildi: <b>2</b> / 3'))).toBe(true);
      expect((await app.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(gani.id) } })).botBlockedAt).not.toBeNull();

      // Next time the blocked user is not even counted.
      await tg.callback(admin, 'adm:bc:new');
      expect(tg.lastText()).toContain('Qabul qiluvchilar: <b>2</b>');
    });

    it('customers cannot open it', async () => {
      await tg.callback(ali, 'adm:bc:new');
      expect(tg.alerts().at(-1)).toBe(t.admin.notAdmin);
    });
  });

  describe('bot profile (description, about, commands, avatar)', () => {
    const calls = (method: string) => tg.calls.filter((c) => c.method === method);

    it('built from settings, sent only when changed, refreshed after admin edits', async () => {
      const settings = app.get(SettingsService);
      await settings.set('support_phone', '90 111 22 33');
      await settings.set('working_hours', 'Har kuni 08:00–20:00');
      await settings.set('payment_note', 'Yetkazib berish — bepul.');
      const profile = app.get(BotProfileService);

      await profile.sync();
      expect(tg.profile.description).toContain('💧 Demo Suv — toza ichimlik suvini uyingizga yetkazib beramiz.');
      expect(tg.profile.description).toContain('🚚 Yetkazib berish — bepul.');
      expect(tg.profile.description).toContain('📞 +998 90 111 22 33 · 🕘 Har kuni 08:00–20:00');
      expect(tg.profile.description.length).toBeLessThanOrEqual(512);
      expect(tg.profile.short_description).toBe('💧 Demo Suv — toza ichimlik suvi yetkazib berish. Buyurtma bir necha bosishda!');
      expect(tg.profile.commands).toEqual([
        { command: 'start', description: t.commands.start },
        { command: 'cancel', description: t.commands.cancel },
      ]);

      tg.clear();
      await profile.sync(); // nothing changed → nothing re-sent
      expect(calls('setMyDescription')).toHaveLength(0);
      expect(calls('setMyShortDescription')).toHaveLength(0);

      await tg.callback(admin, 'adm:set:e:company_name');
      await tg.text(admin, 'Yangi Suv');
      await new Promise((r) => setTimeout(r, 50)); // profile refresh runs in the background
      expect(tg.profile.short_description).toContain('Yangi Suv');

      // Admin-written texts replace the generated ones (multi-line descriptions are kept).
      await settings.set('bot_about', '💧 Demo — Pure by Nature');
      await settings.set('bot_description', 'Birinchi qator\n\nIkkinchi qator');
      await profile.sync();
      expect(tg.profile.short_description).toBe('💧 Demo — Pure by Nature');
      expect(tg.profile.description).toBe('Birinchi qator\n\nIkkinchi qator');
    });

    it('admins get /admin in their command menu when they open the bot', async () => {
      await tg.text(admin, '/start');
      const scoped = calls('setMyCommands').find((c) => c.payload.scope?.chat_id === admin.id);
      expect(scoped?.payload.commands.map((c: { command: string }) => c.command)).toEqual(['start', 'cancel', 'admin']);
      tg.clear();
      await tg.text(ali, '/start');
      expect(calls('setMyCommands')).toHaveLength(0);
    });

    it('admin sets the bot avatar from a photo', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(Buffer.from('jpeg-bytes')));
      try {
        await tg.callback(admin, 'adm:set:photo');
        expect(tg.lastText()).toBe(t.admin.askBotPhoto);
        await tg.message(admin, { photo: [{ file_id: 'logo', file_unique_id: 'l', width: 640, height: 640, file_size: 2000 }] });
      } finally {
        fetchSpy.mockRestore();
      }
      const [call] = calls('setMyProfilePhoto');
      expect(call.payload.photo.type).toBe('static');
      expect(tg.texts()).toContain(t.admin.botPhotoSaved);
    });
  });

  describe('shared locations become place names', () => {
    it('checkout shows and stores the street/district instead of coordinates', async () => {
      const spy = jest.spyOn(app.get(GeocodingService), 'reverse').mockResolvedValue('Chilonzor 9 kvartal 13/1, Toshkent');
      try {
        await products().create({ name: 'Suv', price: 15000 });
        await tg.text(ali, t.menu.buy);
        await tg.callback(ali, tg.button('Savatga'));
        await tg.callback(ali, 'bt:1');
        await tg.contact(ali, '998901234567');
        await tg.location(ali, 41.2856, 69.2034);
        expect(tg.lastText()).toContain('Manzil aniqlandi: <b>Chilonzor 9 kvartal 13/1, Toshkent</b>');

        await tg.text(ali, '3-podyezd, 21-xonadon');
        expect(tg.lastText()).toContain('Chilonzor 9 kvartal 13/1, Toshkent — 3-podyezd, 21-xonadon');
        await tg.callback(ali, 'co:ok');
        const order = await app.prisma.order.findFirstOrThrow();
        expect(order).toMatchObject({
          deliveryAddress: 'Chilonzor 9 kvartal 13/1, Toshkent — 3-podyezd, 21-xonadon',
          latitude: 41.2856,
          longitude: 69.2034,
        });
      } finally {
        spy.mockRestore();
      }
    });

    it('skipping details keeps just the place name; unknown place falls back to coordinates', async () => {
      const spy = jest.spyOn(app.get(GeocodingService), 'reverse').mockResolvedValueOnce('Yunusobod 4, Toshkent').mockResolvedValueOnce(null);
      try {
        await tg.callback(ali, 'addr:new');
        await tg.location(ali, 41.36, 69.28);
        await tg.text(ali, t.common.skip);
        await tg.callback(ali, 'addr:new');
        await tg.location(ali, 41.1, 69.1);
        await tg.text(ali, t.common.skip);
        const saved = await app.prisma.address.findMany({ orderBy: { id: 'asc' } });
        expect(saved.map((a) => a.address)).toEqual(['Yunusobod 4, Toshkent', 'Lokatsiya: 41.100000, 69.100000']);
      } finally {
        spy.mockRestore();
      }
    });
  });

  function products() {
    return app.get(ProductsService);
  }

  async function placeOrder(user: ReturnType<typeof FakeTelegram.user>) {
    await tg.text(user, t.menu.buy);
    await tg.callback(user, tg.button('Savatga'));
    await tg.callback(user, 'bt:0');
    await tg.contact(user, '998901234567');
    await tg.text(user, 'Chilonzor 1');
    await tg.callback(user, 'co:ok');
  }
});
