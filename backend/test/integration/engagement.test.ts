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

  const startedAt = async (telegramId: number) =>
    (await app.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(telegramId) } })).startedAt!;
  const after = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
  const sentTo = (chatId: number, method = 'sendMessage') =>
    tg.calls.filter((c) => c.method === method && Number(c.payload.chat_id) === chatId);

  describe('start reminders: 10 min, 60 min, then silence', () => {
    it('silent after /start → reminder at 10 min and at 60 min, nothing more; every /start repeats it', async () => {
      await tg.text(ali, '/start');
      const t0 = await startedAt(ali.id);
      tg.clear();

      expect(await reminders.runOnce(after(t0, 9))).toBe(0);
      expect(await reminders.runOnce(after(t0, 10))).toBe(1);
      const [first] = sentTo(ali.id);
      expect(first.payload.text).toContain('Toza ichimlik suvi kerakmi');
      expect(first.payload.text).toContain('Demo Suv');
      expect(first.payload.reply_markup.inline_keyboard[0][0]).toMatchObject({ text: t.engage.orderButton, callback_data: 'go' });

      expect(await reminders.runOnce(after(t0, 30))).toBe(0);
      expect(await reminders.runOnce(after(t0, 60))).toBe(1);
      expect(sentTo(ali.id)[1].payload.text).toContain('Buyurtma berishni unutmang');

      expect(await reminders.runOnce(after(t0, 61))).toBe(0);
      expect(await reminders.runOnce(after(t0, 120))).toBe(0);
      expect(await reminders.runOnce(after(t0, 24 * 60))).toBe(0);

      await tg.text(ali, '/start'); // a new cycle
      const t1 = await startedAt(ali.id);
      expect(await reminders.runOnce(after(t1, 10))).toBe(1);
    });

    it('any message or button press after /start cancels the remaining reminders', async () => {
      await products().create({ name: 'Suv', price: 15000 });
      await tg.text(ali, '/start');
      await tg.text(ali, t.menu.buy); // pressed a menu button right away
      await tg.text(vali, '/start');
      const tv = await startedAt(vali.id);
      const ta = await startedAt(ali.id);

      tg.clear();
      expect(await reminders.runOnce(after(tv, 10))).toBe(1);
      expect(sentTo(ali.id)).toHaveLength(0);
      expect(sentTo(vali.id)).toHaveLength(1);

      await tg.callback(vali, 'go'); // pressed the reminder's own button
      expect(await reminders.runOnce(after(tv, 60))).toBe(0);
      expect(await reminders.runOnce(after(ta, 60))).toBe(0);
    });

    it('a reminder missed while the bot was offline is not sent late', async () => {
      await tg.text(ali, '/start');
      const t0 = await startedAt(ali.id);
      tg.clear();
      // At 75 min the 10-min reminder is long overdue: only the 60-min one goes out.
      expect(await reminders.runOnce(after(t0, 75))).toBe(1);
      expect(sentTo(ali.id)[0].payload.text).toContain('Buyurtma berishni unutmang');

      await tg.text(vali, '/start');
      const tv = await startedAt(vali.id);
      expect(await reminders.runOnce(after(tv, 100))).toBe(0); // both missed by >30 min
    });

    it('delays are settings; either reminder can be switched off; the second must be later', async () => {
      const settings = app.get(SettingsService);
      await expect(settings.set('reminder_second_minutes', '5')).rejects.toMatchObject({ code: 'VALIDATION' });

      await settings.set('reminder_first_minutes', '0');
      await tg.text(ali, '/start');
      const ta = await startedAt(ali.id);
      expect(await reminders.runOnce(after(ta, 10))).toBe(0);
      expect(await reminders.runOnce(after(ta, 60))).toBe(1);

      await settings.set('reminder_second_minutes', '0');
      await settings.set('reminder_first_minutes', '15');
      await tg.text(gani, '/start');
      const tgani = await startedAt(gani.id);
      expect(await reminders.runOnce(after(tgani, 15))).toBe(1);
      expect(await reminders.runOnce(after(tgani, 60))).toBe(0);
    });

    it('custom texts; a user who blocked the bot is marked, skipped and un-blocked on return', async () => {
      const settings = app.get(SettingsService);
      await settings.set('reminder_text', 'Bugun 10% chegirma! <3');
      await settings.set('reminder_text_2', 'Oxirgi imkoniyat!');
      await tg.text(ali, '/start');
      await tg.text(vali, '/start');
      const t0 = await startedAt(vali.id);
      tg.failFor.set(vali.id, BLOCKED);
      tg.clear();

      expect(await reminders.runOnce(after(t0, 10))).toBe(1);
      expect(sentTo(ali.id)[0].payload.text).toBe('Bugun 10% chegirma! &lt;3');
      const blocked = await app.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(vali.id) } });
      expect(blocked.botBlockedAt).not.toBeNull();

      expect(await reminders.runOnce(after(t0, 60))).toBe(1);
      expect(sentTo(ali.id)[1].payload.text).toBe('Oxirgi imkoniyat!');
      expect(sentTo(vali.id)).toHaveLength(1); // the failed attempt only, nothing after

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

});
