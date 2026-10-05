import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { SyncStatus } from '@prisma/client';
import { isDomainError } from '../../../common/errors';
import { yandexMapLink } from '../../../common/utils/format';
import { formatPhone } from '../../../common/utils/phone';
import { formatDateTime } from '../../../common/utils/time';
import { AppConfigService } from '../../../config/app-config.service';
import { AmocrmSyncService } from '../../../integrations/amocrm/amocrm-sync.service';
import { OrdersService } from '../../../modules/orders/orders.service';
import { UsersService } from '../../../modules/users/users.service';
import { CB } from '../../callbacks';
import { BotContext } from '../../context';
import { BotUi } from '../../services/bot-ui.service';
import { StateRouter } from '../../state-router';
import { BotHandler, intParam } from '../bot-handler';

const PAGE_SIZE = 8;

/** Read-only order view for admins (amoCRM stays the operational CRM) + manual amoCRM resend. */
@Injectable()
export class AdminOrdersHandler implements BotHandler {
  constructor(
    private readonly orders: OrdersService,
    private readonly sync: AmocrmSyncService,
    private readonly config: AppConfigService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, _router: StateRouter): void {
    bot.callbackQuery(/^adm:ord:p:(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showList(ctx, intParam(ctx.match, 1));
    });

    bot.callbackQuery(/^adm:ord:v:(\d+):(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showDetails(ctx, intParam(ctx.match, 1), intParam(ctx.match, 2));
    });

    bot.callbackQuery(/^adm:ord:rs:(\d+):(\d+)$/, async (ctx) => {
      await this.sync.requeueOrder(intParam(ctx.match, 1));
      await this.ui.answer(ctx, ctx.t.admin.resyncQueued);
      await this.showDetails(ctx, intParam(ctx.match, 1), intParam(ctx.match, 2));
    });
  }

  private async showList(ctx: BotContext, page: number): Promise<void> {
    const { items, total } = await this.orders.listRecent(page, PAGE_SIZE);
    const kb = new InlineKeyboard();
    if (!total) {
      kb.text(ctx.t.admin.backToMenu, CB.admin.menu);
      return this.ui.editOrReply(ctx, ctx.t.admin.ordersEmpty, kb);
    }
    const tz = this.config.timezone;
    for (const o of items) {
      const statuses = o.amocrmSyncs.map((s) => s.status);
      const icon = statuses.every((s) => s === SyncStatus.SUCCESS) ? '✅' : statuses.includes(SyncStatus.FAILED) ? '⚠️' : '⏳';
      kb.text(ctx.t.admin.orderButton(o.orderNumber, formatDateTime(o.createdAt, tz), o.totalAmount, icon), CB.admin.order(o.id, page)).row();
    }
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages > 1) {
      if (page > 0) kb.text(ctx.t.common.prev, CB.admin.orders(page - 1));
      kb.text(`${page + 1}/${pages}`, CB.noop);
      if (page + 1 < pages) kb.text(ctx.t.common.next, CB.admin.orders(page + 1));
      kb.row();
    }
    kb.text(ctx.t.admin.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, ctx.t.admin.ordersTitle(total), kb);
  }

  private async showDetails(ctx: BotContext, orderId: number, page: number): Promise<void> {
    let order;
    try {
      order = await this.orders.getFull(orderId);
    } catch (err) {
      if (isDomainError(err, 'NOT_FOUND')) return this.showList(ctx, 0);
      throw err;
    }
    const username = order.user.telegramUsername ? ` (@${order.user.telegramUsername})` : '';
    const customer = `${order.customerName ?? UsersService.displayName(order.user) ?? ctx.t.admin.unnamed}${username} · ID ${order.user.telegramId}`;
    const text = ctx.t.admin.orderDetails({
      orderNumber: order.orderNumber,
      date: formatDateTime(order.createdAt, this.config.timezone),
      status: ctx.t.history.status[order.status],
      customer,
      phone: formatPhone(order.phone),
      address: order.deliveryAddress,
      mapLink: order.latitude != null && order.longitude != null ? yandexMapLink(order.latitude, order.longitude) : null,
      lines: order.items.map((i) => ctx.t.history.line(i.productNameSnapshot, i.quantity, i.unitPrice, i.subtotal)),
      bottles: order.emptyBottleCount,
      total: order.totalAmount,
      sync: order.amocrmSyncs.map((s) => ctx.t.admin.syncLine(s.entityType, s.status, s.entityId, s.attempts, s.errorMessage)),
    });

    const kb = new InlineKeyboard();
    if (order.amocrmSyncs.some((s) => s.status !== SyncStatus.SUCCESS)) kb.text(ctx.t.admin.resync, CB.admin.orderResync(order.id, page)).row();
    kb.text(ctx.t.admin.backToOrders, CB.admin.orders(page));
    await this.ui.editOrReply(ctx, text, kb);
  }
}
