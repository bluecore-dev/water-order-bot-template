import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { autoRetry } from '@grammyjs/auto-retry';
import { Api, Bot, GrammyError, HttpError, RawApi, session, webhookCallback } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { RequestHandler } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { safeErrorMessage } from '../common/utils/redact';
import { getMessages } from '../i18n';
import { AdminsService } from '../modules/admins/admins.service';
import { UsersService } from '../modules/users/users.service';
import { BotContext, createInitialSession } from './context';
import { AddressesHandler } from './handlers/addresses.handler';
import { AdminAdminsHandler } from './handlers/admin/admin-admins.handler';
import { AdminAmocrmHandler } from './handlers/admin/admin-amocrm.handler';
import { AdminBroadcastHandler } from './handlers/admin/admin-broadcast.handler';
import { AdminOrdersHandler } from './handlers/admin/admin-orders.handler';
import { AdminProductsHandler } from './handlers/admin/admin-products.handler';
import { AdminSettingsHandler } from './handlers/admin/admin-settings.handler';
import { AdminHandler } from './handlers/admin/admin.handler';
import { BotHandler } from './handlers/bot-handler';
import { FallbackHandler } from './handlers/fallback.handler';
import { HistoryHandler } from './handlers/history.handler';
import { OrderHandler } from './handlers/order.handler';
import { ProductHandler } from './handlers/product.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { StartHandler } from './handlers/start.handler';
import { privateChatOnly, rateLimit, timing, userContext } from './middlewares';
import { PrismaSessionStorage } from './session/prisma-session.storage';
import { StateRouter } from './state-router';
import { BotApiHolder } from './services/bot-api.holder';

export type BotStatus = 'disabled' | 'starting' | 'running' | 'error' | 'stopped';

const ALLOWED_UPDATES = ['message', 'callback_query'] as const;
const INIT_RETRY_MS = 30_000;

/**
 * Owns the grammY bot: builds it from the handlers and runs it in polling or webhook mode.
 * Nothing here depends on a specific bot — swapping BOT_TOKEN in env switches bots.
 */
@Injectable()
export class BotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot<BotContext>;
  private state: BotStatus = 'disabled';
  private webhookHandler?: RequestHandler;
  private retryTimer?: NodeJS.Timeout;
  private readonly handlers: BotHandler[];

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly admins: AdminsService,
    private readonly holder: BotApiHolder,
    start: StartHandler,
    admin: AdminHandler,
    product: ProductHandler,
    order: OrderHandler,
    history: HistoryHandler,
    profile: ProfileHandler,
    addresses: AddressesHandler,
    adminProducts: AdminProductsHandler,
    adminOrders: AdminOrdersHandler,
    adminSettings: AdminSettingsHandler,
    adminAmocrm: AdminAmocrmHandler,
    adminAdmins: AdminAdminsHandler,
    adminBroadcast: AdminBroadcastHandler,
    fallback: FallbackHandler,
  ) {
    // Order matters: the admin gate precedes admin buttons; fallback (free input router) is last.
    this.handlers = [
      start,
      admin,
      product,
      order,
      history,
      profile,
      addresses,
      adminProducts,
      adminOrders,
      adminSettings,
      adminAmocrm,
      adminAdmins,
      adminBroadcast,
      fallback,
    ];
  }

  status(): BotStatus {
    return this.state;
  }

  get api(): Api<RawApi> | undefined {
    return this.bot?.api;
  }

  get instance(): Bot<BotContext> | undefined {
    return this.bot;
  }

  /** Builds a fully wired bot. `botInfo` lets tests run without calling Telegram. */
  build(botInfo?: UserFromGetMe): Bot<BotContext> {
    const token = this.config.bot.token;
    if (!token) throw new Error('BOT_TOKEN is not set');
    const bot = new Bot<BotContext>(token, { botInfo });

    bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

    bot.use(timing(this.logger));
    bot.use(privateChatOnly);
    bot.use(rateLimit({ windowMs: 10_000, max: 25 }));
    bot.use(
      session({
        initial: createInitialSession,
        storage: new PrismaSessionStorage(this.prisma),
        getSessionKey: (ctx) => ctx.from?.id.toString(),
      }),
    );
    bot.use(userContext(this.users, this.admins));

    const router = new StateRouter();
    for (const handler of this.handlers) handler.register(bot, router);

    bot.catch(async (err) => {
      const e = err.error;
      const kind = e instanceof GrammyError ? 'telegram' : e instanceof HttpError ? 'network' : 'app';
      this.logger.error({ msg: 'Bot update failed', kind, updateId: err.ctx.update.update_id, err: safeErrorMessage(e) });
      const t = err.ctx.t ?? getMessages();
      if (err.ctx.callbackQuery) await err.ctx.answerCallbackQuery({ text: t.common.error, show_alert: true }).catch(() => undefined);
      else if (err.ctx.chat) await err.ctx.reply(t.common.error).catch(() => undefined);
    });

    this.bot = bot;
    this.holder.bot = bot;
    return bot;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.bot.enabled) {
      this.logger.log({ msg: 'Bot disabled (BOT_ENABLED=false)' });
      return;
    }
    this.build();
    await this.launch();
  }

  private async launch(): Promise<void> {
    const bot = this.bot!;
    this.state = 'starting';
    try {
      await bot.init();
    } catch (err) {
      this.state = 'error';
      this.logger.error({ msg: 'Bot init failed, will retry', err: safeErrorMessage(err), retryInMs: INIT_RETRY_MS });
      this.retryTimer = setTimeout(() => void this.launch(), INIT_RETRY_MS);
      return;
    }
    this.logger.log({ msg: 'Bot connected', username: bot.botInfo.username, id: bot.botInfo.id, mode: this.config.bot.mode });
    await this.setCommands(bot);

    if (this.config.bot.mode === 'webhook') {
      const url = `${this.config.values.apiUrl}${this.config.bot.webhookPath}`;
      this.webhookHandler = webhookCallback(bot, 'express', {
        secretToken: this.config.bot.webhookSecret,
        onTimeout: 'return',
        timeoutMilliseconds: 9_000,
      }) as unknown as RequestHandler;
      await bot.api.setWebhook(url, { secret_token: this.config.bot.webhookSecret, allowed_updates: [...ALLOWED_UPDATES] });
      this.state = 'running';
      this.logger.log({ msg: 'Webhook set', path: this.config.bot.webhookPath });
      return;
    }

    // Long polling. grammY deletes any webhook first. Only ONE process may poll a token:
    // a second one gets 409 Conflict and both stop receiving updates.
    bot
      .start({
        allowed_updates: [...ALLOWED_UPDATES],
        onStart: () => {
          this.state = 'running';
          this.logger.log({ msg: 'Bot polling started' });
        },
      })
      .catch((err) => {
        this.state = 'error';
        const conflict = err instanceof GrammyError && err.error_code === 409;
        this.logger.error({
          msg: conflict ? 'Polling conflict: another process uses this BOT_TOKEN' : 'Bot polling stopped with error',
          err: safeErrorMessage(err),
        });
      });
  }

  private async setCommands(bot: Bot<BotContext>): Promise<void> {
    const t = getMessages();
    const base = [
      { command: 'start', description: t.commands.start },
      { command: 'cancel', description: t.commands.cancel },
    ];
    await bot.api.setMyCommands(base).catch((err) => this.logger.warn({ msg: 'setMyCommands failed', err: safeErrorMessage(err) }));
    for (const id of await this.admins.notifiableIds()) {
      await bot.api
        .setMyCommands([...base, { command: 'admin', description: t.commands.admin }], { scope: { type: 'chat', chat_id: Number(id) } })
        .catch(() => undefined); // admin has not opened the bot yet
    }
  }

  getWebhookHandler(): RequestHandler | undefined {
    return this.webhookHandler;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.bot && this.config.bot.mode === 'polling' && this.bot.isRunning()) {
      await this.bot.stop();
      this.logger.log({ msg: 'Bot polling stopped' });
    }
    if (this.state !== 'disabled') this.state = 'stopped';
  }
}
