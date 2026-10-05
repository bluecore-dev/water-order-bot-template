import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { formatPhone } from '../../common/utils/phone';
import { UsersService } from '../../modules/users/users.service';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { labelsFor, phoneKeyboard } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { readPhoneInput } from '../utils/input';
import { BotHandler } from './bot-handler';

@Injectable()
export class ProfileHandler implements BotHandler {
  constructor(
    private readonly users: UsersService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.hears(labelsFor((t) => t.menu.profile), async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.show(ctx);
    });

    bot.callbackQuery(CB.profilePhone, async (ctx) => {
      await this.ui.answer(ctx);
      ctx.session.state = 'profile:phone';
      await this.ui.reply(ctx, ctx.t.checkout.askPhone, phoneKeyboard(ctx.t));
    });

    router.on('profile:phone', async (ctx) => {
      const input = readPhoneInput(ctx);
      if ('error' in input) {
        await this.ui.reply(ctx, input.error === 'foreign_contact' ? ctx.t.checkout.foreignContact : ctx.t.checkout.invalidPhone);
        return;
      }
      ctx.user = await this.users.setPhone(ctx.user.id, input.phone);
      this.ui.resetFlow(ctx);
      await this.ui.showMainMenu(ctx, ctx.t.profile.phoneSaved(formatPhone(input.phone)));
    });
  }

  private async show(ctx: BotContext): Promise<void> {
    const orders = await this.users.countOrders(ctx.user.id);
    const name = UsersService.displayName(ctx.user) ?? ctx.t.admin.unnamed;
    const phone = ctx.user.phone ? formatPhone(ctx.user.phone) : ctx.t.common.notSet;
    const kb = new InlineKeyboard().text(ctx.t.profile.changePhone, CB.profilePhone);
    await this.ui.reply(ctx, ctx.t.profile.view(name, phone, orders), kb);
  }
}
