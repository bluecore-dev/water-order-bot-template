import { Injectable } from '@nestjs/common';
import { Composer } from 'grammy';
import { formatPhone } from '../../common/utils/phone';
import { SettingsService } from '../../modules/settings/settings.service';
import { UsersService } from '../../modules/users/users.service';
import { BotContext } from '../context';
import { labelsFor } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { BotProfileService } from '../services/bot-profile.service';
import { StateRouter } from '../state-router';
import { BotHandler } from './bot-handler';

/** /start, cancellation and the "Contact" section. */
@Injectable()
export class StartHandler implements BotHandler {
  constructor(
    private readonly ui: BotUi,
    private readonly settings: SettingsService,
    private readonly profile: BotProfileService,
    private readonly users: UsersService,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    bot.command('start', async (ctx) => {
      this.ui.resetFlow(ctx);
      ctx.user = await this.users.startCycle(ctx.user);
      if (this.ui.isAdmin(ctx)) await this.profile.ensureAdminCommands(ctx.from!.id);
      await this.ui.showMainMenu(ctx, ctx.t.menu.welcome(await this.ui.companyName(ctx)));
    });

    const cancel = async (ctx: BotContext) => {
      this.ui.resetFlow(ctx);
      await this.ui.showMainMenu(ctx, ctx.t.common.cancelled);
    };
    bot.command('cancel', cancel);
    bot.hears(labelsFor((t) => t.common.cancel), cancel);

    bot.hears(labelsFor((t) => t.menu.contact), async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.showContact(ctx);
    });
  }

  private async showContact(ctx: BotContext): Promise<void> {
    const s = await this.settings.getAll();
    const lines = [
      s.company_name && ctx.t.contact.company(s.company_name),
      s.support_phone && ctx.t.contact.phone(formatPhone(s.support_phone)),
      s.support_telegram && ctx.t.contact.telegram(s.support_telegram),
      s.working_hours && ctx.t.contact.hours(s.working_hours),
    ].filter(Boolean);
    const body = lines.length ? lines.join('\n') : ctx.t.contact.none;
    await this.ui.reply(ctx, `${ctx.t.contact.title}\n\n${body}`);
  }
}
