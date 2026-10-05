import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { StatsService } from '../../../modules/stats/stats.service';
import { CB } from '../../callbacks';
import { BotContext } from '../../context';
import { labelsFor } from '../../keyboards';
import { BotUi } from '../../services/bot-ui.service';
import { StateRouter } from '../../state-router';
import { BotHandler } from '../bot-handler';
import { adminOnly, isAdmin, isSuperAdmin } from './admin-guard';

/** Entry point of the in-bot admin mode: access gate, main admin menu and statistics. */
@Injectable()
export class AdminHandler implements BotHandler {
  constructor(
    private readonly stats: StatsService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    // Gate for every admin button. Registered before all other adm:* handlers.
    bot.callbackQuery(/^adm:/, async (ctx, next) => {
      if (!isAdmin(ctx)) {
        await this.ui.answer(ctx, ctx.t.admin.notAdmin, true);
        return;
      }
      await next();
    });

    const open = adminOnly(async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.showMenu(ctx);
    });
    bot.hears(labelsFor((t) => t.menu.admin), open);
    bot.command('admin', open);

    bot.callbackQuery(CB.admin.menu, async (ctx) => {
      await this.ui.answer(ctx);
      this.ui.resetFlow(ctx);
      await this.showMenu(ctx);
    });

    bot.callbackQuery(CB.admin.stats, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showStats(ctx);
    });
  }

  async showMenu(ctx: BotContext): Promise<void> {
    const t = ctx.t.admin;
    const kb = new InlineKeyboard()
      .text(t.products, CB.admin.products)
      .text(t.stats, CB.admin.stats)
      .row()
      .text(t.orders, CB.admin.orders(0))
      .text(t.settings, CB.admin.settings)
      .row()
      .text(t.broadcast, CB.admin.broadcast)
      .text(t.amocrm, CB.admin.amocrm);
    if (isSuperAdmin(ctx)) kb.row().text(t.admins, CB.admin.admins);
    await this.ui.editOrReply(ctx, t.menuTitle, kb);
  }

  private async showStats(ctx: BotContext): Promise<void> {
    const s = await this.stats.summary();
    const text = ctx.t.admin.statsView({
      today: s.today,
      week: s.last7Days,
      month: s.last30Days,
      totalOrders: s.totalOrders,
      newOrders: s.newOrders,
      activeProducts: s.activeProducts,
      customers: s.customers,
      amoPending: s.amocrm.pendingOrders,
      amoFailed: s.amocrm.failedOrders,
      botUsers: s.botUsers,
      blockedUsers: s.blockedUsers,
    });
    const kb = new InlineKeyboard().text(ctx.t.admin.refresh, CB.admin.stats).row().text(ctx.t.admin.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, text, kb);
  }
}
