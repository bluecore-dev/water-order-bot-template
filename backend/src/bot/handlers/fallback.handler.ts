import { Injectable } from '@nestjs/common';
import { Composer } from 'grammy';
import { BotContext } from '../context';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { BotHandler } from './bot-handler';

/**
 * Registered last. Routes free input to the current step; anything else (stickers, random
 * text, buttons from old messages) gets a polite nudge instead of silence.
 */
@Injectable()
export class FallbackHandler implements BotHandler {
  constructor(private readonly ui: BotUi) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.on('message', async (ctx) => {
      if (await router.dispatch(ctx)) return;
      this.ui.resetFlow(ctx);
      await this.ui.showMainMenu(ctx, ctx.t.common.unknownInput);
    });

    bot.on('callback_query', (ctx) => this.ui.answer(ctx, ctx.t.common.staleButton, true));
  }
}
