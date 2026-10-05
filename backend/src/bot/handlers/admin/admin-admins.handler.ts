import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import { isDomainError } from '../../../common/errors';
import { AdminsService } from '../../../modules/admins/admins.service';
import { UsersService } from '../../../modules/users/users.service';
import { ADMIN_PICK_REQUEST_ID, CB } from '../../callbacks';
import { BotContext } from '../../context';
import { BotUi } from '../../services/bot-ui.service';
import { StateRouter } from '../../state-router';
import { BotHandler } from '../bot-handler';
import { adminOnly, isSuperAdmin } from './admin-guard';

/** Super admins can grant/revoke the ADMIN role from the bot. */
@Injectable()
export class AdminAdminsHandler implements BotHandler {
  constructor(
    private readonly admins: AdminsService,
    private readonly users: UsersService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.callbackQuery(/^adm:adm:/, async (ctx, next) => {
      if (!isSuperAdmin(ctx)) return this.ui.answer(ctx, ctx.t.admin.superOnly, true);
      await next();
    });

    bot.callbackQuery(CB.admin.admins, async (ctx) => {
      await this.ui.answer(ctx);
      this.ui.resetFlow(ctx);
      await this.showList(ctx);
    });

    bot.callbackQuery(CB.admin.adminAdd, async (ctx) => {
      await this.ui.answer(ctx);
      ctx.session.state = 'admin:admins:add';
      const kb = new Keyboard()
        .requestUsers(ctx.t.admin.pickUser, ADMIN_PICK_REQUEST_ID, { user_is_bot: false, max_quantity: 1, request_name: true })
        .row()
        .text(ctx.t.common.cancel)
        .resized();
      await this.ui.reply(ctx, ctx.t.admin.askAdmin, kb);
    });

    bot.callbackQuery(/^adm:adm:del:(\d+)$/, async (ctx) => {
      try {
        await this.admins.remove(ctx.match[1], String(ctx.from.id));
      } catch (err) {
        if (isDomainError(err, 'FORBIDDEN')) return this.ui.answer(ctx, ctx.t.admin.cannotRemoveSuper, true);
        throw err;
      }
      await this.ui.answer(ctx, ctx.t.admin.adminRemoved);
      await this.showList(ctx);
    });

    router.on(
      'admin:admins:add',
      adminOnly(async (ctx) => {
        const shared = ctx.message?.users_shared;
        let telegramId: string | undefined;
        let name: string | null = null;

        if (shared && shared.request_id === ADMIN_PICK_REQUEST_ID && shared.users[0]) {
          const u = shared.users[0];
          telegramId = String(u.user_id);
          name = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : null);
        } else {
          const text = ctx.message?.text?.trim() ?? '';
          if (!/^\d{3,20}$/.test(text)) return this.ui.reply(ctx, ctx.t.admin.invalidAdminId);
          telegramId = text;
          const known = await this.users.findByTelegramId(BigInt(text));
          name = known ? UsersService.displayName(known) : null;
        }

        await this.admins.add(telegramId, name, String(ctx.from!.id));
        this.ui.resetFlow(ctx);
        await this.ui.showMainMenu(ctx, ctx.t.admin.adminAdded(name ?? telegramId));
        await this.showList(ctx);
      }, 'super'),
    );
  }

  private async showList(ctx: BotContext): Promise<void> {
    const list = await this.admins.list();
    const lines = list.map((a, i) => ctx.t.admin.adminLine(i + 1, a.name ?? ctx.t.admin.unnamed, a.telegramId, a.fromEnv));
    const kb = new InlineKeyboard();
    list.forEach((a, i) => {
      if (!a.fromEnv) kb.text(ctx.t.admin.removeAdmin(i + 1), CB.admin.adminRemove(a.telegramId));
    });
    kb.row().text(ctx.t.admin.addAdmin, CB.admin.adminAdd).row().text(ctx.t.admin.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, [ctx.t.admin.adminsTitle, lines.join('\n')].join('\n\n'), kb);
  }
}
