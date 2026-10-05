import { Injectable } from '@nestjs/common';
import { Composer } from 'grammy';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { CheckoutFlow, EditableField } from '../conversations/checkout.flow';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { BotHandler, intParam } from './bot-handler';

/** Checkout buttons and the free-input steps of checkout. */
@Injectable()
export class OrderHandler implements BotHandler {
  constructor(
    private readonly checkout: CheckoutFlow,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.callbackQuery(CB.checkout, async (ctx) => {
      await this.ui.answer(ctx);
      await this.ui.clearButtons(ctx);
      await this.checkout.continue(ctx);
    });

    bot.callbackQuery(/^bt:(\d+)$/, (ctx) => this.checkout.onBottlesButton(ctx, intParam(ctx.match, 1)));
    bot.callbackQuery(CB.bottlesMore, (ctx) => this.checkout.onBottlesMore(ctx));
    bot.callbackQuery(CB.confirm, (ctx) => this.checkout.confirm(ctx));
    bot.callbackQuery(CB.edit, (ctx) => this.checkout.showEditMenu(ctx));
    bot.callbackQuery(/^co:ed:(items|bottles|phone|address)$/, (ctx) =>
      this.checkout.editField(ctx, ctx.match[1] as EditableField),
    );
    bot.callbackQuery(CB.summary, (ctx) => this.checkout.backToSummary(ctx));
    bot.callbackQuery(CB.cancelCheckout, (ctx) => this.checkout.cancel(ctx));

    router
      .on('checkout:bottles_custom', (ctx) => this.checkout.onBottlesText(ctx))
      .on('checkout:phone', (ctx) => this.checkout.onPhoneInput(ctx))
      .on('checkout:address', (ctx) => this.checkout.onAddressInput(ctx))
      .on('checkout:address_details', (ctx) => this.checkout.onAddressDetails(ctx));
  }
}
