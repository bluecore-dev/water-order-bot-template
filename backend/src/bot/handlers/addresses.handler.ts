import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { isDomainError } from '../../common/errors';
import { AddressesService } from '../../modules/addresses/addresses.service';
import { CB } from '../callbacks';
import { CheckoutFlow } from '../conversations/checkout.flow';
import { BotContext } from '../context';
import { labelsFor, locationKeyboard, skipKeyboard } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { isSkip } from '../utils/input';
import { BotHandler, intParam } from './bot-handler';

/** "My addresses": list, set default, delete, add new (location and/or text). */
@Injectable()
export class AddressesHandler implements BotHandler {
  constructor(
    private readonly addresses: AddressesService,
    private readonly checkout: CheckoutFlow,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.hears(labelsFor((t) => t.menu.addresses), async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.showList(ctx);
    });

    bot.callbackQuery(CB.addresses, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showList(ctx);
    });

    bot.callbackQuery(/^addr:def:(\d+)$/, async (ctx) => {
      await this.mutate(ctx, () => this.addresses.setDefault(ctx.user.id, intParam(ctx.match, 1)), ctx.t.addresses.defaultSet);
    });

    bot.callbackQuery(/^addr:del:(\d+)$/, async (ctx) => {
      await this.mutate(ctx, () => this.addresses.remove(ctx.user.id, intParam(ctx.match, 1)), ctx.t.addresses.removed);
    });

    bot.callbackQuery(CB.addressNew, async (ctx) => {
      await this.ui.answer(ctx);
      ctx.session.state = 'addresses:new';
      await this.ui.reply(ctx, ctx.t.checkout.askAddress, locationKeyboard(ctx.t));
    });

    router.on('addresses:new', async (ctx) => {
      const location = ctx.message?.location;
      if (location) {
        ctx.session.state = 'addresses:new_details';
        await this.checkout.receiveLocation(ctx, location.latitude, location.longitude);
        return;
      }
      const text = ctx.message?.text;
      if (!text) return this.ui.reply(ctx, ctx.t.checkout.askAddress);
      await this.save(ctx, { address: text });
    });

    router.on('addresses:new_details', async (ctx) => {
      const pending = ctx.session.pendingLocation;
      const text = ctx.message?.text;
      if (!pending) {
        ctx.session.state = 'addresses:new';
        return this.ui.reply(ctx, ctx.t.checkout.askAddress, locationKeyboard(ctx.t));
      }
      if (ctx.message?.location) {
        return this.checkout.receiveLocation(ctx, ctx.message.location.latitude, ctx.message.location.longitude);
      }
      if (!text) return this.ui.reply(ctx, ctx.t.checkout.askAddressDetails, skipKeyboard(ctx.t));
      const address = CheckoutFlow.locationAddress(ctx.t, pending, isSkip(text) ? null : text.trim());
      await this.save(ctx, { address, latitude: pending.latitude, longitude: pending.longitude });
    });
  }

  private async save(ctx: BotContext, input: { address: string; latitude?: number; longitude?: number }) {
    try {
      await this.addresses.remember(ctx.user.id, input);
    } catch (err) {
      if (!isDomainError(err, 'VALIDATION')) throw err;
      await this.ui.reply(ctx, ctx.t.checkout.invalidAddress);
      return;
    }
    this.ui.resetFlow(ctx);
    await this.ui.showMainMenu(ctx, ctx.t.addresses.saved);
    await this.showList(ctx);
  }

  private async mutate(ctx: BotContext, action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
    } catch (err) {
      if (!isDomainError(err, 'NOT_FOUND')) throw err;
      await this.ui.answer(ctx, ctx.t.common.staleButton, true);
      return this.showList(ctx);
    }
    await this.ui.answer(ctx, done);
    await this.showList(ctx);
  }

  private async showList(ctx: BotContext): Promise<void> {
    const list = await this.addresses.listForUser(ctx.user.id);
    const kb = new InlineKeyboard();
    if (!list.length) {
      kb.text(ctx.t.addresses.add, CB.addressNew);
      await this.ui.editOrReply(ctx, ctx.t.addresses.empty, kb);
      return;
    }
    const lines = list.map((a, i) => ctx.t.addresses.line(i + 1, a.address, a.isDefault));
    list.forEach((a, i) => {
      if (!a.isDefault) kb.text(ctx.t.addresses.makeDefault(i + 1), CB.addressDefault(a.id));
      kb.text(ctx.t.addresses.remove(i + 1), CB.addressRemove(a.id)).row();
    });
    kb.text(ctx.t.addresses.add, CB.addressNew);
    await this.ui.editOrReply(ctx, [ctx.t.addresses.title, lines.join('\n'), ctx.t.addresses.legend].join('\n\n'), kb);
  }
}
