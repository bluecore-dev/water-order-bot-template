import { Logger } from '@nestjs/common';
import { MiddlewareFn } from 'grammy';
import { AdminsService } from '../../modules/admins/admins.service';
import { UsersService } from '../../modules/users/users.service';
import { BotContext } from '../context';
import { getMessages } from '../../i18n';

/**
 * The ordering bot works in private chats only. Group updates (e.g. the optional order
 * notification group) are ignored so nobody can drive the bot from a group.
 */
export const privateChatOnly: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return;
  await next();
};

/**
 * Per-user flood protection (in-memory sliding window). Enough for a single-instance MVP;
 * Telegram itself also rate-limits clients.
 */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareFn<BotContext> {
  const hits = new Map<number, number[]>();
  let lastSweep = Date.now();

  return async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id) return next();
    const now = Date.now();

    if (now - lastSweep > 60_000) {
      for (const [key, times] of hits) if (!times.some((t) => now - t < opts.windowMs)) hits.delete(key);
      lastSweep = now;
    }

    const recent = (hits.get(id) ?? []).filter((t) => now - t < opts.windowMs);
    recent.push(now);
    hits.set(id, recent);

    if (recent.length > opts.max) {
      if (recent.length === opts.max + 1) {
        const t = getMessages(ctx.from?.language_code);
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t.common.tooManyRequests }).catch(() => undefined);
        else await ctx.reply(t.common.tooManyRequests).catch(() => undefined);
      }
      return;
    }
    await next();
  };
}

/** Loads/creates the DB user, picks the language and resolves admin role for every update. */
export function userContext(users: UsersService, admins: AdminsService): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const from = ctx.from!;
    ctx.user = await users.upsertFromTelegram(from);
    ctx.t = getMessages(ctx.user.language);
    ctx.adminRole = await admins.getRole(from.id);
    await next();
  };
}

/** Logs slow updates; helps spot DB or Telegram latency without per-update noise. */
export function timing(logger: Logger, slowMs = 3000): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const started = Date.now();
    await next();
    const took = Date.now() - started;
    if (took > slowMs) logger.warn({ msg: 'Slow bot update', updateId: ctx.update.update_id, ms: took });
  };
}
