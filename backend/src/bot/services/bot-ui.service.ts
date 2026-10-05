import { Injectable, Logger } from '@nestjs/common';
import { GrammyError, InlineKeyboard } from 'grammy';
import type { ForceReply, ReplyKeyboardMarkup, ReplyKeyboardRemove } from 'grammy/types';
import { SettingsService } from '../../modules/settings/settings.service';
import { BotContext } from '../context';
import { mainMenuKeyboard } from '../keyboards';

type Markup = InlineKeyboard | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply | { keyboard: unknown };

/** Small UI helpers shared by all handlers. */
@Injectable()
export class BotUi {
  private readonly logger = new Logger(BotUi.name);

  constructor(private readonly settings: SettingsService) {}

  isAdmin(ctx: BotContext): boolean {
    return ctx.adminRole !== null;
  }

  async showMainMenu(ctx: BotContext, text?: string): Promise<void> {
    await ctx.reply(text ?? ctx.t.menu.hint, {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(ctx.t, this.isAdmin(ctx)),
    });
  }

  /** Leaves any step. The cart is kept unless asked otherwise (it is cheap to keep, annoying to lose). */
  resetFlow(ctx: BotContext, opts: { keepCart?: boolean } = {}): void {
    ctx.session.state = 'idle';
    ctx.session.checkout = {};
    ctx.session.pendingLocation = undefined;
    ctx.session.addressChoices = undefined;
    ctx.session.admin = undefined;
    if (opts.keepCart === false) ctx.session.cart = [];
  }

  async companyName(ctx: BotContext): Promise<string> {
    return (await this.settings.get('company_name')) || ctx.me.first_name;
  }

  /**
   * Edits the message the pressed button belongs to; sends a new message when editing is
   * impossible (photo message, too old, deleted).
   */
  async editOrReply(ctx: BotContext, text: string, keyboard?: InlineKeyboard): Promise<void> {
    const message = ctx.callbackQuery?.message;
    if (message && 'text' in message && message.text !== undefined) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } });
        return;
      } catch (err) {
        if (isNotModified(err)) return;
        this.logger.debug({ msg: 'editMessageText failed, sending new message', err });
      }
    }
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } });
  }

  async reply(ctx: BotContext, text: string, markup?: Markup): Promise<void> {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: markup as InlineKeyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  /** Removes inline buttons from the pressed message (e.g. a confirmed summary). Errors are irrelevant. */
  async clearButtons(ctx: BotContext): Promise<void> {
    if (!ctx.callbackQuery?.message) return;
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  }

  async answer(ctx: BotContext, text?: string, alert = false): Promise<void> {
    if (!ctx.callbackQuery) return;
    await ctx.answerCallbackQuery({ text, show_alert: alert }).catch(() => undefined);
  }
}

export function isNotModified(err: unknown): boolean {
  return err instanceof GrammyError && err.description.includes('message is not modified');
}
