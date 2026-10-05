import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { isDomainError } from '../../common/errors';
import { formatPhone } from '../../common/utils/phone';
import { formatDate, formatDateTime } from '../../common/utils/time';
import { AppConfigService } from '../../config/app-config.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { CheckoutFlow } from '../conversations/checkout.flow';
import { labelsFor } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { StateRouter } from '../state-router';
import { BotHandler, intParam } from './bot-handler';

const PAGE_SIZE = 5;

/** "My orders": paginated history, details with price snapshots, and repeat order. */
@Injectable()
export class HistoryHandler implements BotHandler {
  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutFlow,
    private readonly config: AppConfigService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    bot.hears(labelsFor((t) => t.menu.orders), async (ctx) => {
      this.ui.resetFlow(ctx);
      await this.showList(ctx, 0);
    });

    bot.callbackQuery(/^ord:p:(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showList(ctx, intParam(ctx.match, 1));
    });

    bot.callbackQuery(/^ord:v:(\d+):(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showDetails(ctx, intParam(ctx.match, 1), intParam(ctx.match, 2));
    });

    bot.callbackQuery(/^ord:r:(\d+)$/, async (ctx) => {
      await this.repeat(ctx, intParam(ctx.match, 1));
    });
  }

  private async showList(ctx: BotContext, page: number): Promise<void> {
    const { items, total } = await this.orders.listForUser(ctx.user.id, page, PAGE_SIZE);
    if (!total) {
      await this.ui.editOrReply(ctx, ctx.t.history.empty);
      return;
    }
    const tz = this.config.timezone;
    const kb = new InlineKeyboard();
    for (const o of items) {
      const icon = ctx.t.history.status[o.status].split(' ')[0];
      kb.text(ctx.t.history.button(o.orderNumber, formatDate(o.createdAt, tz), o.totalAmount, icon), CB.order(o.id, page)).row();
    }
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages > 1) {
      if (page > 0) kb.text(ctx.t.common.prev, CB.orders(page - 1));
      kb.text(`${page + 1}/${pages}`, CB.noop);
      if (page + 1 < pages) kb.text(ctx.t.common.next, CB.orders(page + 1));
    }
    await this.ui.editOrReply(ctx, ctx.t.history.title(total), kb);
  }

  private async showDetails(ctx: BotContext, orderId: number, page: number): Promise<void> {
    let order;
    try {
      order = await this.orders.getForUser(ctx.user.id, orderId);
    } catch (err) {
      if (isDomainError(err, 'NOT_FOUND')) return this.showList(ctx, 0);
      throw err;
    }
    // Historical lines always come from the snapshot, never from the current product.
    const lines = order.items.map((i) => ctx.t.history.line(i.productNameSnapshot, i.quantity, i.unitPrice, i.subtotal));
    const text = ctx.t.history.details({
      orderNumber: order.orderNumber,
      date: formatDateTime(order.createdAt, this.config.timezone),
      status: ctx.t.history.status[order.status],
      lines,
      bottles: order.emptyBottleCount,
      address: order.deliveryAddress,
      phone: formatPhone(order.phone),
      total: order.totalAmount,
    });
    const kb = new InlineKeyboard()
      .text(ctx.t.history.repeat, CB.repeat(order.id))
      .row()
      .text(ctx.t.history.backToList, CB.orders(page));
    await this.ui.editOrReply(ctx, text, kb);
  }

  /** Same products and quantities, at today's prices; unavailable products are skipped. */
  private async repeat(ctx: BotContext, orderId: number): Promise<void> {
    const order = await this.orders.getForUser(ctx.user.id, orderId).catch(() => null);
    if (!order) return this.ui.answer(ctx, ctx.t.common.staleButton, true);

    const items = order.items
      .filter((i): i is typeof i & { productId: number } => i.productId !== null)
      .map((i) => ({ productId: i.productId, quantity: i.quantity }));
    const preview = await this.orders.previewCart(items);
    if (!preview.items.length) return this.ui.answer(ctx, ctx.t.history.repeatUnavailable, true);

    await this.ui.answer(ctx);
    this.ui.resetFlow(ctx);
    ctx.session.cart = preview.items;
    if (preview.removedProductIds.length) await this.ui.reply(ctx, ctx.t.cart.itemsRemoved);
    await this.checkout.start(ctx);
  }
}
