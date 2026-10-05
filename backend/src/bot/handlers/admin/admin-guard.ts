import { AdminRole } from '@prisma/client';
import { BotContext } from '../../context';
import { StepHandler } from '../../state-router';

/** Admin role is re-checked on every update, so a removed admin loses access immediately. */
export function isAdmin(ctx: BotContext): boolean {
  return ctx.adminRole !== null;
}

export function isSuperAdmin(ctx: BotContext): boolean {
  return ctx.adminRole === AdminRole.SUPER_ADMIN;
}

async function deny(ctx: BotContext, text: string): Promise<void> {
  ctx.session.state = 'idle';
  ctx.session.admin = undefined;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => undefined);
  else await ctx.reply(text);
}

/** Wraps an admin step/callback handler with a role check. */
export function adminOnly(handler: StepHandler, level: 'admin' | 'super' = 'admin'): StepHandler {
  return async (ctx) => {
    if (!isAdmin(ctx)) return deny(ctx, ctx.t.admin.notAdmin);
    if (level === 'super' && !isSuperAdmin(ctx)) return deny(ctx, ctx.t.admin.superOnly);
    return handler(ctx);
  };
}
