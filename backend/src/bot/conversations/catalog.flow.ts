import { Injectable } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { Product } from '@prisma/client';
import { ProductsService } from '../../modules/products/products.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { SettingsService } from '../../modules/settings/settings.service';
import { CB } from '../callbacks';
import { BotContext } from '../context';
import { Messages } from '../../i18n';
import { BotUi } from '../services/bot-ui.service';
import { ProductMediaService } from '../services/product-media.service';

@Injectable()
export class CatalogFlow {
  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly media: ProductMediaService,
    private readonly ui: BotUi,
  ) {}

  /**
   * One active product → its card directly (fewest taps); several → a pick list.
   * `fresh` never edits the pressed message (used under reminders and announcements).
   */
  async showCatalog(ctx: BotContext, opts: { fresh?: boolean } = {}): Promise<void> {
    const products = await this.products.listActive();
    if (!products.length) {
      await this.ui.reply(ctx, ctx.t.catalog.empty);
      return;
    }
    if (products.length === 1) {
      await this.sendProductCard(ctx, products[0], false);
      return;
    }

    const kb = new InlineKeyboard();
    for (const p of products) kb.text(ctx.t.catalog.productButton(p.name, p.price), CB.product(p.id)).row();
    const cartCount = ctx.session.cart.reduce((s, i) => s + i.quantity, 0);
    if (cartCount > 0) kb.text(ctx.t.cart.button(cartCount), CB.cart);
    if (opts.fresh) await this.ui.reply(ctx, ctx.t.catalog.choose, kb);
    else await this.ui.editOrReply(ctx, ctx.t.catalog.choose, kb);
  }

  async showProduct(ctx: BotContext, productId: number): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product?.isActive) {
      await this.ui.answer(ctx, ctx.t.catalog.unavailable, true);
      await this.showCatalog(ctx);
      return;
    }
    const activeCount = (await this.products.listActive()).length;
    await this.sendProductCard(ctx, product, activeCount > 1);
  }

  /**
   * Lowest quantity a card allows. With a single product the order minimum applies to that
   * product directly, so the card starts there and ➖ cannot go below it; with several
   * products the minimum is checked on the cart total instead.
   */
  private async quantityBounds(multi: boolean): Promise<{ min: number; max: number; minOrder: number }> {
    const max = await this.settings.getInt('max_item_quantity');
    const minOrder = await this.settings.getInt('min_order_quantity');
    return { min: multi ? 1 : Math.min(minOrder, max), max, minOrder };
  }

  private async sendProductCard(ctx: BotContext, product: Product, multi: boolean): Promise<void> {
    const inCart = ctx.session.cart.find((i) => i.productId === product.id)?.quantity;
    const { min, max, minOrder } = await this.quantityBounds(multi);
    const qty = Math.min(Math.max(inCart ?? min, min), max);
    await this.media.sendCard(
      ctx,
      product,
      ctx.t.catalog.card(product.name, product.description, product.price, minOrder),
      productKeyboard(ctx.t, product, qty, multi),
    );
  }

  /** Re-renders only the buttons of a product card (quantity changed). */
  async updateQuantity(ctx: BotContext, productId: number, qty: number): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product?.isActive) {
      await this.ui.answer(ctx, ctx.t.catalog.unavailable, true);
      return;
    }
    const multi = (await this.products.listActive()).length > 1;
    const { min, max } = await this.quantityBounds(multi);
    if (qty < min) {
      await this.ui.answer(ctx, ctx.t.catalog.minQty(min));
      return;
    }
    if (qty > max) {
      await this.ui.answer(ctx, ctx.t.catalog.maxQty(max));
      return;
    }
    await ctx.editMessageReplyMarkup({ reply_markup: productKeyboard(ctx.t, product, qty, multi) }).catch(() => undefined);
    await this.ui.answer(ctx);
  }

  /** Returns false when the product cannot be added (inactive / bad quantity). */
  async addToCart(ctx: BotContext, productId: number, qty: number): Promise<boolean> {
    const product = await this.products.findById(productId);
    const maxQty = await this.settings.getInt('max_item_quantity');
    if (!product?.isActive) {
      await this.ui.answer(ctx, ctx.t.catalog.unavailable, true);
      return false;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) {
      await this.ui.answer(ctx, ctx.t.catalog.maxQty(maxQty), true);
      return false;
    }
    const cart = ctx.session.cart.filter((i) => i.productId !== productId);
    cart.push({ productId, quantity: qty });
    ctx.session.cart = cart;
    await this.ui.answer(ctx, ctx.t.catalog.added);
    await this.ui.clearButtons(ctx);
    return true;
  }

  async isSingleProductCatalog(): Promise<boolean> {
    return (await this.products.listActive()).length === 1;
  }

  /** Cart view; re-prices from the DB and repairs the stored cart. */
  async showCart(ctx: BotContext): Promise<void> {
    const preview = await this.orders.previewCart(ctx.session.cart);
    ctx.session.cart = preview.items;

    const notices: string[] = [];
    if (preview.removedProductIds.length) notices.push(ctx.t.cart.itemsRemoved);
    if (preview.clampedProductIds.length) notices.push(ctx.t.cart.qtyClamped(await this.settings.getInt('max_item_quantity')));

    if (!preview.items.length) {
      const kb = new InlineKeyboard().text(ctx.t.cart.addMore, CB.catalog);
      await this.ui.editOrReply(ctx, [...notices, ctx.t.cart.empty].join('\n\n'), kb);
      return;
    }

    if (preview.belowMinimum) notices.push(ctx.t.cart.belowMinimum(preview.minOrderQuantity, preview.totalQuantity));

    const lines = preview.lines.map((l) => ctx.t.cart.line(l.name, l.quantity, l.subtotal));
    const text = [...notices, ctx.t.cart.title, lines.join('\n'), ctx.t.cart.total(preview.total)].join('\n\n');
    const kb = new InlineKeyboard();
    // Below the minimum there is nothing to check out yet — only "add more" or "clear".
    if (!preview.belowMinimum) kb.text(ctx.t.cart.checkout, CB.checkout).row();
    kb.text(ctx.t.cart.addMore, CB.catalog).text(ctx.t.cart.clear, CB.cartClear);
    await this.ui.editOrReply(ctx, text, kb);
  }
}

export function productKeyboard(t: Messages, product: Product, qty: number, multi: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('➖', CB.qty(product.id, qty - 1))
    .text(String(qty), CB.noop)
    .text('➕', CB.qty(product.id, qty + 1))
    .row()
    .text(t.catalog.addToCart(product.price * qty), CB.add(product.id, qty));
  if (multi) kb.row().text(t.catalog.backToProducts, CB.catalog);
  return kb;
}
