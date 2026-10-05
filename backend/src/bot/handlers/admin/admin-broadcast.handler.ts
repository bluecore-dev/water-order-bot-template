import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { formatDateTime } from '../../../common/utils/time';
import { AppConfigService } from '../../../config/app-config.service';
import { CB } from '../../callbacks';
import { BotContext } from '../../context';
import { cancelKeyboard } from '../../keyboards';
import { BotUi } from '../../services/bot-ui.service';
import { BroadcastService } from '../../services/broadcast.service';
import { StateRouter } from '../../state-router';
import { BotHandler } from '../bot-handler';
import { adminOnly } from './admin-guard';

/** Message kinds that copyMessage reproduces well for an announcement. */
const SUPPORTED = ['text', 'photo', 'video', 'animation', 'document', 'audio', 'voice'] as const;

/** "📣 Xabar yuborish": compose → preview (exactly what customers get) → confirm → send. */
@Injectable()
export class AdminBroadcastHandler implements BotHandler {
  constructor(
    private readonly broadcasts: BroadcastService,
    private readonly config: AppConfigService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.callbackQuery(CB.admin.broadcast, async (ctx) => {
      if (await this.broadcasts.isBusy()) return this.ui.answer(ctx, ctx.t.admin.broadcastBusy, true);
      await this.ui.answer(ctx);
      const recipients = await this.broadcasts.countRecipients(ctx.from.id);
      const last = await this.broadcasts.last();
      const lastText = last
        ? ctx.t.admin.broadcastLast(formatDateTime(last.createdAt, this.config.timezone), last.sent, last.total)
        : null;
      ctx.session.state = 'admin:broadcast:compose';
      ctx.session.admin = {};
      await this.ui.reply(ctx, ctx.t.admin.broadcastAsk(recipients, lastText), cancelKeyboard(ctx.t));
    });

    router.on(
      'admin:broadcast:compose',
      adminOnly(async (ctx) => {
        const msg = ctx.message!;
        if (!SUPPORTED.some((kind) => kind in msg)) return this.ui.reply(ctx, ctx.t.admin.broadcastUnsupported);

        ctx.session.state = 'idle';
        ctx.session.admin = { broadcast: { chatId: msg.chat.id, messageId: msg.message_id } };
        const orderButton = new InlineKeyboard().text(ctx.t.engage.orderButton, CB.startOrder);
        await ctx.api.copyMessage(msg.chat.id, msg.chat.id, msg.message_id, { reply_markup: orderButton });
        await this.ui.showMainMenu(ctx, ctx.t.admin.broadcastPreviewTitle);

        const recipients = await this.broadcasts.countRecipients(ctx.from!.id);
        const kb = new InlineKeyboard()
          .text(ctx.t.admin.broadcastSend, CB.admin.broadcastSend)
          .text(ctx.t.common.cancel, CB.admin.broadcastCancel);
        await this.ui.reply(ctx, ctx.t.admin.broadcastConfirm(recipients), kb);
      }),
    );

    bot.callbackQuery(CB.admin.broadcastSend, async (ctx) => {
      const draft = ctx.session.admin?.broadcast;
      if (!draft) return this.ui.answer(ctx, ctx.t.common.staleButton, true);
      if (await this.broadcasts.isBusy()) return this.ui.answer(ctx, ctx.t.admin.broadcastBusy, true);
      const recipients = await this.broadcasts.countRecipients(ctx.from.id);
      if (!recipients) return this.ui.answer(ctx, ctx.t.admin.broadcastNobody, true);

      ctx.session.admin = undefined;
      await this.ui.answer(ctx);
      await this.broadcasts.start(ctx.from.id, draft.chatId, draft.messageId);
      await this.ui.editOrReply(ctx, ctx.t.admin.broadcastStarted(recipients));
    });

    bot.callbackQuery(CB.admin.broadcastCancel, async (ctx) => {
      ctx.session.admin = undefined;
      await this.ui.answer(ctx);
      await this.ui.editOrReply(ctx, ctx.t.common.cancelled);
    });
  }
}
