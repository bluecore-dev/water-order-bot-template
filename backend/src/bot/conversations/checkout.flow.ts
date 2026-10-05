import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InlineKeyboard } from 'grammy';
import { isDomainError } from '../../common/errors';
import { formatPhone } from '../../common/utils/phone';
import { truncate } from '../../common/utils/format';
import { AddressesService } from '../../modules/addresses/addresses.service';
import { GeocodingService } from '../../modules/geocoding/geocoding.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { SettingsService } from '../../modules/settings/settings.service';
import { UsersService } from '../../modules/users/users.service';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { cancelKeyboard, locationKeyboard, mainMenuKeyboard, phoneKeyboard, skipKeyboard } from '../keyboards';
import { BotUi } from '../services/bot-ui.service';
import { isSkip, readPhoneInput } from '../utils/input';
import { CatalogFlow } from './catalog.flow';

const MAX_SAVED_ADDRESS_BUTTONS = 5;
const CHECKOUT_TTL_MS = 12 * 60 * 60 * 1000;
export type EditableField = 'items' | 'bottles' | 'phone' | 'address';

/**
 * Checkout as a linear state machine: cart → empty bottles → phone → address → summary.
 * `advance()` always jumps to the first missing piece, so editing one field from the summary
 * is just "clear it and advance". A saved phone is reused silently; the address is always
 * confirmed (wrong address = failed delivery) but saved ones are one tap away.
 */
@Injectable()
export class CheckoutFlow {
  private readonly logger = new Logger(CheckoutFlow.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly addresses: AddressesService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogFlow,
    private readonly geocoding: GeocodingService,
    private readonly ui: BotUi,
  ) {}

  /** Location → pending place (with its street/district name when the geocoder knows it). */
  async receiveLocation(ctx: BotContext, latitude: number, longitude: number): Promise<void> {
    const label = (await this.geocoding.reverse(latitude, longitude)) ?? undefined;
    ctx.session.pendingLocation = { latitude, longitude, label };
    const prompt = label
      ? `${ctx.t.checkout.locationResolved(label)}\n\n${ctx.t.checkout.askAddressDetails}`
      : ctx.t.checkout.askAddressDetails;
    await this.ui.reply(ctx, prompt, skipKeyboard(ctx.t));
  }

  /** Final address text for a shared location: place name (or coordinates) + optional details. */
  static locationAddress(
    t: BotContext['t'],
    pending: { latitude: number; longitude: number; label?: string },
    details: string | null,
  ): string {
    if (!details) return pending.label ?? t.checkout.locationOnly(pending.latitude, pending.longitude);
    return pending.label ? t.checkout.locationWithDetails(pending.label, details) : details;
  }

  isActive(ctx: BotContext): boolean {
    const { idempotencyKey, startedAt } = ctx.session.checkout;
    return !!idempotencyKey && (!startedAt || Date.now() - startedAt < CHECKOUT_TTL_MS);
  }

  async start(ctx: BotContext): Promise<void> {
    ctx.session.state = 'idle';
    ctx.session.checkout = { idempotencyKey: randomUUID(), startedAt: Date.now(), phone: ctx.user.phone ?? undefined };
    await this.advance(ctx);
  }

  /** "Continue" from the cart: resume an open checkout or start a new one. */
  async continue(ctx: BotContext): Promise<void> {
    if (!this.isActive(ctx)) return this.start(ctx);
    await this.advance(ctx);
  }

  async advance(ctx: BotContext): Promise<void> {
    const c = ctx.session.checkout;
    if (!ctx.session.cart.length) {
      this.ui.resetFlow(ctx);
      await this.catalog.showCatalog(ctx);
      return;
    }
    // The cart view explains the minimum and offers "add more" (it hides "checkout" meanwhile).
    if ((await this.orders.previewCart(ctx.session.cart)).belowMinimum) {
      ctx.session.state = 'idle';
      return this.catalog.showCart(ctx);
    }
    if (c.emptyBottles === undefined) return this.askBottles(ctx);
    if (!c.phone) return this.askPhone(ctx);
    if (!c.address) return this.askAddress(ctx);
    return this.showSummary(ctx, { restoreMenu: true });
  }

  // ---- empty bottles -------------------------------------------------------------------

  private async askBottles(ctx: BotContext): Promise<void> {
    ctx.session.state = 'idle';
    const kb = new InlineKeyboard();
    for (const n of [0, 1, 2, 3, 4]) kb.text(String(n), CB.bottles(n));
    kb.text(ctx.t.checkout.bottlesMore, CB.bottlesMore).row().text(ctx.t.checkout.cancelOrder, CB.cancelCheckout);
    const fine = await this.settings.getInt('damaged_bottle_fine');
    const text = fine > 0 ? `${ctx.t.checkout.askBottles}\n\n${ctx.t.checkout.bottleFineNotice(fine)}` : ctx.t.checkout.askBottles;
    await this.ui.reply(ctx, text, kb);
  }

  async onBottlesButton(ctx: BotContext, n: number): Promise<void> {
    if (!this.isActive(ctx)) return this.stale(ctx);
    await this.ui.answer(ctx);
    await this.setBottles(ctx, n, true);
  }

  async onBottlesMore(ctx: BotContext): Promise<void> {
    if (!this.isActive(ctx)) return this.stale(ctx);
    await this.ui.answer(ctx);
    await this.ui.clearButtons(ctx);
    ctx.session.state = 'checkout:bottles_custom';
    const max = await this.settings.getInt('max_empty_bottles');
    await this.ui.reply(ctx, ctx.t.checkout.askBottlesNumber(max), cancelKeyboard(ctx.t));
  }

  async onBottlesText(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text?.trim() ?? '';
    const max = await this.settings.getInt('max_empty_bottles');
    if (!/^\d{1,6}$/.test(text) || Number(text) > max) {
      await this.ui.reply(ctx, ctx.t.checkout.invalidBottles(max));
      return;
    }
    await this.setBottles(ctx, Number(text), false);
  }

  private async setBottles(ctx: BotContext, n: number, fromButton: boolean): Promise<void> {
    const max = await this.settings.getInt('max_empty_bottles');
    if (!Number.isInteger(n) || n < 0 || n > max) {
      await this.ui.reply(ctx, ctx.t.checkout.invalidBottles(max));
      return;
    }
    ctx.session.checkout.emptyBottles = n;
    ctx.session.state = 'idle';
    if (fromButton) await this.ui.editOrReply(ctx, ctx.t.checkout.bottlesChosen(n));
    await this.advance(ctx);
  }

  // ---- phone ---------------------------------------------------------------------------

  private async askPhone(ctx: BotContext): Promise<void> {
    ctx.session.state = 'checkout:phone';
    await this.ui.reply(ctx, ctx.t.checkout.askPhone, phoneKeyboard(ctx.t));
  }

  async onPhoneInput(ctx: BotContext): Promise<void> {
    const input = readPhoneInput(ctx);
    if ('error' in input) {
      await this.ui.reply(ctx, input.error === 'foreign_contact' ? ctx.t.checkout.foreignContact : ctx.t.checkout.invalidPhone);
      return;
    }
    ctx.session.checkout.phone = input.phone;
    ctx.session.state = 'idle';
    await this.advance(ctx);
  }

  // ---- address -------------------------------------------------------------------------

  private async askAddress(ctx: BotContext): Promise<void> {
    ctx.session.state = 'checkout:address';
    const saved = (await this.addresses.listForUser(ctx.user.id)).slice(0, MAX_SAVED_ADDRESS_BUTTONS);
    const choices: Record<string, number> = {};
    for (const a of saved) {
      let label = ctx.t.checkout.savedAddressButton(truncate(a.title, 40));
      while (choices[label] !== undefined) label += ' ';
      choices[label] = a.id;
    }
    ctx.session.addressChoices = choices;
    const text = ctx.t.checkout.askAddress + (saved.length ? ctx.t.checkout.askAddressSaved : '');
    await this.ui.reply(ctx, text, locationKeyboard(ctx.t, Object.keys(choices)));
  }

  async onAddressInput(ctx: BotContext): Promise<void> {
    const location = ctx.message?.location;
    if (location) {
      ctx.session.state = 'checkout:address_details';
      await this.receiveLocation(ctx, location.latitude, location.longitude);
      return;
    }

    const text = ctx.message?.text;
    if (!text) {
      await this.ui.reply(ctx, ctx.t.checkout.askAddress);
      return;
    }

    const savedId = ctx.session.addressChoices?.[text];
    if (savedId !== undefined) {
      const saved = await this.addresses.getForUser(ctx.user.id, savedId).catch(() => null);
      if (saved) {
        return this.finishAddress(ctx, {
          text: saved.address,
          latitude: saved.latitude ?? undefined,
          longitude: saved.longitude ?? undefined,
        });
      }
    }

    try {
      await this.finishAddress(ctx, { text: AddressesService.validateText(text) });
    } catch (err) {
      if (!isDomainError(err, 'VALIDATION')) throw err;
      await this.ui.reply(ctx, ctx.t.checkout.invalidAddress);
    }
  }

  async onAddressDetails(ctx: BotContext): Promise<void> {
    const location = ctx.message?.location;
    if (location) {
      await this.receiveLocation(ctx, location.latitude, location.longitude);
      return;
    }
    const pending = ctx.session.pendingLocation;
    if (!pending) return this.askAddress(ctx);

    const text = ctx.message?.text;
    if (!text) {
      await this.ui.reply(ctx, ctx.t.checkout.askAddressDetails, skipKeyboard(ctx.t));
      return;
    }
    const coords = { latitude: pending.latitude, longitude: pending.longitude };
    if (isSkip(text)) {
      return this.finishAddress(ctx, { text: CheckoutFlow.locationAddress(ctx.t, pending, null), ...coords });
    }
    try {
      const full = CheckoutFlow.locationAddress(ctx.t, pending, AddressesService.validateText(text));
      await this.finishAddress(ctx, { text: AddressesService.validateText(full), ...coords });
    } catch (err) {
      if (!isDomainError(err, 'VALIDATION')) throw err;
      await this.ui.reply(ctx, ctx.t.checkout.invalidAddress);
    }
  }

  private async finishAddress(ctx: BotContext, address: { text: string; latitude?: number; longitude?: number }) {
    ctx.session.checkout.address = address;
    ctx.session.pendingLocation = undefined;
    ctx.session.addressChoices = undefined;
    ctx.session.state = 'idle';
    await this.advance(ctx);
  }

  // ---- summary & confirmation ----------------------------------------------------------

  async showSummary(ctx: BotContext, opts: { notice?: string; restoreMenu?: boolean } = {}): Promise<void> {
    const c = ctx.session.checkout;
    const preview = await this.orders.previewCart(ctx.session.cart);
    ctx.session.cart = preview.items;
    ctx.session.state = 'idle';

    const notices = [opts.notice];
    if (preview.removedProductIds.length) notices.push(ctx.t.cart.itemsRemoved);
    if (preview.clampedProductIds.length) notices.push(ctx.t.cart.qtyClamped(await this.settings.getInt('max_item_quantity')));

    if (!preview.items.length) {
      await this.ui.reply(ctx, [...notices.filter(Boolean), ctx.t.cart.empty].join('\n\n'));
      this.ui.resetFlow(ctx);
      await this.catalog.showCatalog(ctx);
      return;
    }
    if (preview.belowMinimum || c.emptyBottles === undefined || !c.phone || !c.address) return this.advance(ctx);

    c.shownTotal = preview.total;
    const paymentNote = await this.settings.get('payment_note');
    const fine = await this.settings.getInt('damaged_bottle_fine');
    const text = [
      ...notices.filter(Boolean),
      ctx.t.checkout.summaryTitle,
      preview.lines.map((l) => ctx.t.checkout.summaryLine(l.name, l.quantity, l.subtotal)).join('\n'),
      [
        ctx.t.checkout.summaryBottles(c.emptyBottles),
        ...(fine > 0 && c.emptyBottles > 0 ? [ctx.t.checkout.summaryBottleFine(fine)] : []),
        ctx.t.checkout.summaryPhone(formatPhone(c.phone)),
        ctx.t.checkout.summaryAddress(c.address.text),
      ].join('\n'),
      ctx.t.checkout.summaryTotal(preview.total),
      paymentNote ? ctx.t.checkout.paymentNote(paymentNote) : ctx.t.checkout.defaultPaymentNote,
    ].join('\n\n');

    // The previous step may have left a contact/location keyboard; bring the main menu back.
    if (opts.restoreMenu) await this.ui.reply(ctx, ctx.t.checkout.review, mainMenuKeyboard(ctx.t, this.ui.isAdmin(ctx)));

    const kb = new InlineKeyboard()
      .text(ctx.t.checkout.confirm, CB.confirm)
      .row()
      .text(ctx.t.checkout.edit, CB.edit)
      .text(ctx.t.checkout.cancelOrder, CB.cancelCheckout);
    await this.ui.reply(ctx, text, kb);
  }

  async confirm(ctx: BotContext): Promise<void> {
    const c = ctx.session.checkout;
    if (!this.isActive(ctx)) return this.stale(ctx);
    if (c.emptyBottles === undefined || !c.phone || !c.address || c.shownTotal === undefined) {
      await this.ui.answer(ctx);
      return this.advance(ctx);
    }
    await this.ui.answer(ctx, ctx.t.checkout.processing);

    try {
      const { order, created } = await this.orders.createOrder({
        userId: ctx.user.id,
        items: ctx.session.cart,
        emptyBottleCount: c.emptyBottles,
        phone: c.phone,
        customerName: UsersService.displayName(ctx.user),
        address: { text: c.address.text, latitude: c.address.latitude, longitude: c.address.longitude },
        idempotencyKey: c.idempotencyKey!,
        expectedTotal: c.shownTotal,
      });
      if (!created) this.logger.warn({ msg: 'Duplicate confirm ignored', orderId: order.id });

      this.ui.resetFlow(ctx, { keepCart: false });
      ctx.user.phone = order.phone;
      await this.ui.clearButtons(ctx);
      await this.ui.showMainMenu(ctx, ctx.t.checkout.accepted(order.orderNumber, order.totalAmount));
    } catch (err) {
      if (isDomainError(err, 'PRICE_CHANGED')) {
        await this.ui.clearButtons(ctx);
        return this.showSummary(ctx, { notice: ctx.t.checkout.priceChanged });
      }
      if (
        isDomainError(err, 'PRODUCT_UNAVAILABLE') ||
        isDomainError(err, 'QUANTITY_LIMIT') ||
        isDomainError(err, 'MIN_ORDER') ||
        isDomainError(err, 'CART_EMPTY')
      ) {
        await this.ui.clearButtons(ctx);
        return this.showSummary(ctx);
      }
      if (isDomainError(err, 'VALIDATION')) {
        // Typically a limit lowered by an admin mid-checkout: re-ask that step.
        this.logger.warn({ msg: 'Checkout validation failed', err: err.message });
        c.emptyBottles = undefined;
        await this.ui.clearButtons(ctx);
        return this.advance(ctx);
      }
      throw err;
    }
  }

  async showEditMenu(ctx: BotContext): Promise<void> {
    if (!this.isActive(ctx)) return this.stale(ctx);
    await this.ui.answer(ctx);
    const kb = new InlineKeyboard()
      .text(ctx.t.checkout.editItems, CB.editField('items'))
      .text(ctx.t.checkout.editBottles, CB.editField('bottles'))
      .row()
      .text(ctx.t.checkout.editPhone, CB.editField('phone'))
      .text(ctx.t.checkout.editAddress, CB.editField('address'))
      .row()
      .text(ctx.t.checkout.backToSummary, CB.summary);
    await this.ui.editOrReply(ctx, ctx.t.checkout.editWhat, kb);
  }

  async editField(ctx: BotContext, field: EditableField): Promise<void> {
    if (!this.isActive(ctx)) return this.stale(ctx);
    await this.ui.answer(ctx);
    await this.ui.clearButtons(ctx);
    const c = ctx.session.checkout;
    switch (field) {
      case 'items':
        return this.catalog.showCart(ctx);
      case 'bottles':
        c.emptyBottles = undefined;
        break;
      case 'phone':
        c.phone = undefined;
        break;
      case 'address':
        c.address = undefined;
        break;
    }
    await this.advance(ctx);
  }

  async backToSummary(ctx: BotContext): Promise<void> {
    if (!this.isActive(ctx)) return this.stale(ctx);
    await this.ui.answer(ctx);
    await this.ui.clearButtons(ctx);
    await this.showSummary(ctx);
  }

  async cancel(ctx: BotContext): Promise<void> {
    await this.ui.answer(ctx);
    this.ui.resetFlow(ctx, { keepCart: false });
    await this.ui.editOrReply(ctx, ctx.t.common.cancelled);
    await this.ui.showMainMenu(ctx);
  }

  private async stale(ctx: BotContext): Promise<void> {
    if (ctx.session.checkout.idempotencyKey) {
      // Expired rather than finished: drop the draft so the next tap starts cleanly.
      ctx.session.checkout = {};
      await this.ui.answer(ctx, ctx.t.checkout.expired, true);
      return;
    }
    await this.ui.answer(ctx, ctx.t.common.staleButton, true);
  }
}
