import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { safeErrorMessage } from '../../../common/utils/redact';
import { AppConfigService } from '../../../config/app-config.service';
import { AmocrmAuthService } from '../../../integrations/amocrm/amocrm-auth.service';
import { AmocrmSyncService } from '../../../integrations/amocrm/amocrm-sync.service';
import { AmocrmService } from '../../../integrations/amocrm/amocrm.service';
import { CB } from '../../callbacks';
import { BotContext } from '../../context';
import { BotUi } from '../../services/bot-ui.service';
import { StateRouter } from '../../state-router';
import { BotHandler } from '../bot-handler';

/** amoCRM status, connection check, OAuth connect link and bulk resend of failed orders. */
@Injectable()
export class AdminAmocrmHandler implements BotHandler {
  constructor(
    private readonly auth: AmocrmAuthService,
    private readonly amocrm: AmocrmService,
    private readonly sync: AmocrmSyncService,
    private readonly config: AppConfigService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    bot.callbackQuery(CB.admin.amocrm, async (ctx) => {
      await this.ui.answer(ctx);
      await this.show(ctx);
    });

    bot.callbackQuery(CB.admin.amocrmCheck, async (ctx) => {
      await this.ui.answer(ctx);
      try {
        const account = await this.amocrm.getAccount();
        await this.ui.reply(ctx, ctx.t.admin.amoCheckOk(account.name, this.auth.domain));
      } catch (err) {
        await this.ui.reply(ctx, ctx.t.admin.amoCheckFail(safeErrorMessage(err, 300)));
      }
    });

    bot.callbackQuery(CB.admin.amocrmRetry, async (ctx) => {
      const n = await this.sync.requeueAllFailed();
      await this.ui.answer(ctx, ctx.t.admin.amoRetryQueued(n));
      await this.show(ctx);
    });
  }

  private async show(ctx: BotContext): Promise<void> {
    const t = ctx.t.admin;
    const cfg = this.config.amocrm;
    const connection = await this.auth.connection();
    const counts = await this.sync.counts();

    const connectionText =
      connection === 'not_configured' ? t.amoNotConfigured : connection === 'oauth_missing' ? t.amoOauthMissing : t.amoConfigured(cfg.domain!);
    const mode = cfg.authMode === 'long_lived' ? t.amoModeLongLived : cfg.authMode === 'oauth' ? t.amoModeOauth : t.amoModeNone;
    const pipeline = cfg.pipelineId ? `${cfg.pipelineId} / ${cfg.statusId ?? '—'}` : '—';

    const text = t.amocrmView({
      mode,
      connection: connectionText,
      syncEnabled: cfg.syncEnabled,
      pending: counts.pendingOrders,
      failed: counts.failedOrders,
      pipeline,
    });

    const kb = new InlineKeyboard();
    if (connection === 'ready') kb.text(t.amoCheck, CB.admin.amocrmCheck).row();
    if (counts.failedOrders > 0) kb.text(t.amoRetryAll, CB.admin.amocrmRetry).row();
    let hint = '';
    if (cfg.authMode === 'oauth') {
      // Telegram accepts only public https links in URL buttons, and amoCRM must reach the callback.
      if (cfg.redirectUri?.startsWith('https://')) {
        kb.url(t.amoConnect, this.auth.buildAuthorizeUrl(ctx.from!.id)).row();
        hint = `\n\n${t.amoConnectHint}`;
      } else {
        hint = `\n\n${t.amoConnectNeedsHttps}`;
      }
    }
    kb.text(t.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, text + hint, kb);
  }
}
