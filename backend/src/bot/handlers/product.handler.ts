import { Injectable } from '@nestjs/common';
import { Composer } from 'grammy';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { CatalogFlow } from '../conversations/catalog.flow';
import { CheckoutFlow } from '../conversations/checkout.flow';
import { labelsFor } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { BotHandler, intParam } from './bot-handler';

/** Product browsing, quantity selection and the cart. */
@Injectable()
export class ProductHandler implements BotHandler {
  constructor(
    private readonly catalog: CatalogFlow,
    private readonly checkout: CheckoutFlow,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    bot.hears(labelsFor((t) => t.menu.buy), async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.catalog.showCatalog(ctx);
    });

    bot.callbackQuery(CB.catalog, async (ctx) => {
      await this.ui.answer(ctx);
      await this.catalog.showCatalog(ctx);
    });

    // "🛒 Buyurtma berish" under reminders and announcements: keep that message intact.
    bot.callbackQuery(CB.startOrder, async (ctx) => {
      await this.ui.answer(ctx);
      this.ui.resetFlow(ctx);
      await this.catalog.showCatalog(ctx, { fresh: true });
    });

    bot.callbackQuery(/^prd:(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.catalog.showProduct(ctx, intParam(ctx.match, 1));
    });

    bot.callbackQuery(/^qty:(\d+):(-?\d+)$/, async (ctx) => {
      await this.catalog.updateQuantity(ctx, intParam(ctx.match, 1), intParam(ctx.match, 2));
    });

    bot.callbackQuery(/^add:(\d+):(\d+)$/, async (ctx) => {
      const added = await this.catalog.addToCart(ctx, intParam(ctx.match, 1), intParam(ctx.match, 2));
      if (!added) return;
      // With a single product there is nothing else to pick: go straight to checkout.
      if (await this.catalog.isSingleProductCatalog()) await this.checkout.continue(ctx);
      else await this.catalog.showCart(ctx);
    });

    bot.callbackQuery(CB.cart, async (ctx) => {
      await this.ui.answer(ctx);
      await this.catalog.showCart(ctx);
    });

    bot.callbackQuery(CB.cartClear, async (ctx) => {
      ctx.session.cart = [];
      ctx.session.checkout = {};
      await this.ui.answer(ctx, ctx.t.cart.cleared);
      await this.catalog.showCart(ctx);
    });

    bot.callbackQuery(CB.noop, (ctx) => this.ui.answer(ctx));
  }
}
