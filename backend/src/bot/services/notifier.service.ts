import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { yandexMapLink } from '../../common/utils/format';
import { formatPhone } from '../../common/utils/phone';
import { safeErrorMessage } from '../../common/utils/redact';
import {
  AmocrmAuthFailedEvent,
  AmocrmConnectedEvent,
  AmocrmSyncFailedEvent,
  Events,
  OrderCreatedEvent,
} from '../../common/events';
import { AppConfigService } from '../../config/app-config.service';
import { getMessages } from '../../i18n';
import { AdminsService } from '../../modules/admins/admins.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { UsersService } from '../../modules/users/users.service';
import { BotService } from '../bot.service';

/** Outbound operational messages: admin alerts and the optional order-copy group. */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly bot: BotService,
    private readonly admins: AdminsService,
    private readonly orders: OrdersService,
    private readonly config: AppConfigService,
  ) {}

  @OnEvent(Events.OrderCreated, { async: true, promisify: true })
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const chatId = this.config.bot.orderNotifyChatId;
    if (!chatId) return;
    await this.guard('order copy', async () => {
      const order = await this.orders.getFull(event.orderId);
      const t = getMessages();
      const text = t.notify.newOrder({
        orderNumber: order.orderNumber,
        customer: order.customerName ?? UsersService.displayName(order.user) ?? t.admin.unnamed,
        phone: formatPhone(order.phone),
        address: order.deliveryAddress,
        mapLink: order.latitude != null && order.longitude != null ? yandexMapLink(order.latitude, order.longitude) : null,
        lines: order.items.map((i) => t.history.line(i.productNameSnapshot, i.quantity, i.unitPrice, i.subtotal)),
        bottles: order.emptyBottleCount,
        total: order.totalAmount,
      });
      await this.send(chatId, text);
    });
  }

  @OnEvent(Events.AmocrmSyncFailed, { async: true, promisify: true })
  async onSyncFailed(e: AmocrmSyncFailedEvent): Promise<void> {
    await this.toAdmins(getMessages().notify.syncFailed(e.orderNumber, e.attempts, e.error, e.final));
  }

  @OnEvent(Events.AmocrmAuthFailed, { async: true, promisify: true })
  async onAuthFailed(e: AmocrmAuthFailedEvent): Promise<void> {
    await this.toAdmins(getMessages().notify.authFailed(e.error));
  }

  @OnEvent(Events.AmocrmConnected, { async: true, promisify: true })
  async onConnected(e: AmocrmConnectedEvent): Promise<void> {
    const text = getMessages().notify.amoConnected(e.accountDomain);
    if (e.telegramId) await this.guard('amo connected', () => this.send(e.telegramId!, text));
    else await this.toAdmins(text);
  }

  private async toAdmins(text: string): Promise<void> {
    const ids = await this.admins.notifiableIds();
    for (const id of ids) await this.guard(`admin ${id}`, () => this.send(id, text));
  }

  private async send(chatId: string, text: string): Promise<void> {
    const api = this.bot.api;
    if (!api) return;
    await api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }

  /** A notification must never break the flow that triggered it. */
  private async guard(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn({ msg: 'Notification not delivered', target: what, err: safeErrorMessage(err) });
    }
  }
}
