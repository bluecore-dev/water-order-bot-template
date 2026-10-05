import { Injectable, Logger } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { Product } from '@prisma/client';
import { isDomainError } from '../../../common/errors';
import { parseAmountInput } from '../../../common/utils/format';
import { PRODUCT_LIMITS, ProductsService } from '../../../modules/products/products.service';
import { StorageService } from '../../../modules/storage/storage.service';
import { CB } from '../../callbacks';
import { AdminProductField, BotContext } from '../../context';
import { cancelKeyboard, skipKeyboard } from '../../keyboards';
import { BotUi } from '../../services/bot-ui.service';
import { DownloadedImage, TelegramFilesService } from '../../services/telegram-files.service';
import { StateRouter } from '../../state-router';
import { isClear, isSkip } from '../../utils/input';
import { BotHandler, intParam } from '../bot-handler';
import { adminOnly } from './admin-guard';

const FIELDS: AdminProductField[] = ['name', 'price', 'description', 'photo', 'sortOrder'];

/** Product management from the bot: list, create, edit fields/photo, (de)activate, safe delete. */
@Injectable()
export class AdminProductsHandler implements BotHandler {
  private readonly logger = new Logger(AdminProductsHandler.name);

  constructor(
    private readonly products: ProductsService,
    private readonly storage: StorageService,
    private readonly files: TelegramFilesService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.callbackQuery(CB.admin.products, async (ctx) => {
      await this.ui.answer(ctx);
      this.ui.resetFlow(ctx);
      await this.showList(ctx);
    });

    bot.callbackQuery(/^adm:prd:v:(\d+)$/, async (ctx) => {
      await this.ui.answer(ctx);
      await this.showCard(ctx, intParam(ctx.match, 1), true);
    });

    bot.callbackQuery(/^adm:prd:e:(\d+):(\w+)$/, async (ctx) => {
      const field = ctx.match[2] as AdminProductField;
      if (!FIELDS.includes(field)) return this.ui.answer(ctx);
      await this.ui.answer(ctx);
      await this.askField(ctx, intParam(ctx.match, 1), field);
    });

    bot.callbackQuery(/^adm:prd:tg:(\d+)$/, async (ctx) => {
      const product = await this.products.findById(intParam(ctx.match, 1));
      if (!product) return this.ui.answer(ctx, ctx.t.admin.productNotFound, true);
      const updated = await this.products.setActive(product.id, !product.isActive, actor(ctx));
      await this.ui.answer(ctx, updated.isActive ? ctx.t.admin.activated : ctx.t.admin.deactivated);
      await this.showCard(ctx, product.id, true);
    });

    bot.callbackQuery(/^adm:prd:del:(\d+)$/, async (ctx) => {
      const product = await this.products.findById(intParam(ctx.match, 1));
      if (!product) return this.ui.answer(ctx, ctx.t.admin.productNotFound, true);
      const used = await this.products.countOrderItems(product.id);
      if (used > 0) return this.ui.answer(ctx, ctx.t.admin.deleteInUse(used), true);
      await this.ui.answer(ctx);
      const kb = new InlineKeyboard()
        .text(ctx.t.admin.confirmDeleteYes, CB.admin.productDeleteConfirm(product.id))
        .text(ctx.t.common.no, CB.admin.product(product.id));
      await this.ui.editOrReply(ctx, ctx.t.admin.confirmDelete(product.name), kb);
    });

    bot.callbackQuery(/^adm:prd:delok:(\d+)$/, async (ctx) => {
      try {
        const deleted = await this.products.delete(intParam(ctx.match, 1), actor(ctx));
        await this.storage.delete(deleted.imageUrl);
        await this.ui.answer(ctx, ctx.t.admin.deleted);
      } catch (err) {
        if (isDomainError(err, 'PRODUCT_IN_USE')) {
          return this.ui.answer(ctx, ctx.t.admin.deleteInUse(Number(err.details?.used ?? 0)), true);
        }
        if (isDomainError(err, 'NOT_FOUND')) return this.ui.answer(ctx, ctx.t.admin.productNotFound, true);
        throw err;
      }
      await this.showList(ctx);
    });

    bot.callbackQuery(CB.admin.productNew, async (ctx) => {
      await this.ui.answer(ctx);
      ctx.session.admin = { newProduct: {} };
      ctx.session.state = 'admin:product:create:name';
      await this.ui.reply(ctx, ctx.t.admin.askName, cancelKeyboard(ctx.t));
    });

    router
      .on('admin:product:create:name', adminOnly((ctx) => this.createName(ctx)))
      .on('admin:product:create:price', adminOnly((ctx) => this.createPrice(ctx)))
      .on('admin:product:create:description', adminOnly((ctx) => this.createDescription(ctx)))
      .on('admin:product:create:photo', adminOnly((ctx) => this.createPhoto(ctx)))
      .on('admin:product:edit', adminOnly((ctx) => this.onEditInput(ctx)));
  }

  // ---- views ---------------------------------------------------------------------------

  private async showList(ctx: BotContext): Promise<void> {
    const list = await this.products.listAll();
    const kb = new InlineKeyboard();
    for (const p of list) kb.text(ctx.t.admin.productButton(p.isActive, p.name, p.price), CB.admin.product(p.id)).row();
    kb.text(ctx.t.admin.newProduct, CB.admin.productNew).row().text(ctx.t.admin.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, list.length ? ctx.t.admin.productList : ctx.t.admin.productListEmpty, kb);
  }

  private async showCard(ctx: BotContext, productId: number, edit: boolean): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product) {
      await this.ui.answer(ctx, ctx.t.admin.productNotFound, true);
      return this.showList(ctx);
    }
    const usedCount = await this.products.countOrderItems(product.id);
    const t = ctx.t.admin;
    const text = t.productCard({
      name: product.name,
      price: product.price,
      description: product.description,
      hasImage: !!product.imageUrl,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
      usedCount,
    });
    const id = product.id;
    const kb = new InlineKeyboard()
      .text(t.editName, CB.admin.productEdit(id, 'name'))
      .text(t.editPrice, CB.admin.productEdit(id, 'price'))
      .row()
      .text(t.editDescription, CB.admin.productEdit(id, 'description'))
      .text(t.editPhoto, CB.admin.productEdit(id, 'photo'))
      .row()
      .text(t.editSortOrder, CB.admin.productEdit(id, 'sortOrder'))
      .text(product.isActive ? t.deactivate : t.activate, CB.admin.productToggle(id))
      .row()
      .text(t.delete, CB.admin.productDelete(id))
      .row()
      .text(t.backToProducts, CB.admin.products);
    if (edit) await this.ui.editOrReply(ctx, text, kb);
    else await this.ui.reply(ctx, text, kb);
  }

  /** After text input the cancel keyboard is on screen: restore the menu, then show the card. */
  private async finishEdit(ctx: BotContext, productId: number, message: string): Promise<void> {
    this.ui.resetFlow(ctx);
    await this.ui.showMainMenu(ctx, message);
    await this.showCard(ctx, productId, false);
  }

  // ---- edit ----------------------------------------------------------------------------

  private async askField(ctx: BotContext, productId: number, field: AdminProductField): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product) return this.ui.answer(ctx, ctx.t.admin.productNotFound, true);
    ctx.session.state = 'admin:product:edit';
    ctx.session.admin = { productId, field };
    const prompts: Record<AdminProductField, string> = {
      name: ctx.t.admin.askName,
      price: ctx.t.admin.askPrice,
      description: ctx.t.admin.askDescription,
      photo: ctx.t.admin.askPhoto,
      sortOrder: ctx.t.admin.askSortOrder,
    };
    await this.ui.reply(ctx, prompts[field], cancelKeyboard(ctx.t));
  }

  private async onEditInput(ctx: BotContext): Promise<void> {
    const { productId, field } = ctx.session.admin ?? {};
    const product = productId ? await this.products.findById(productId) : null;
    if (!product || !field) {
      this.ui.resetFlow(ctx);
      return this.ui.showMainMenu(ctx, ctx.t.admin.productNotFound);
    }
    const text = ctx.message?.text?.trim();
    const who = actor(ctx);

    switch (field) {
      case 'name': {
        if (!text || text.length > PRODUCT_LIMITS.nameMax) return this.ui.reply(ctx, ctx.t.admin.invalidName);
        await this.products.update(product.id, { name: text }, who);
        return this.finishEdit(ctx, product.id, ctx.t.admin.saved);
      }
      case 'price': {
        const price = text ? parseAmountInput(text) : null;
        if (price === null || price < PRODUCT_LIMITS.priceMin || price > PRODUCT_LIMITS.priceMax) {
          return this.ui.reply(ctx, ctx.t.admin.invalidPrice);
        }
        await this.products.update(product.id, { price }, who);
        return this.finishEdit(ctx, product.id, ctx.t.admin.priceUpdated(product.price, price));
      }
      case 'description': {
        if (!text) return this.ui.reply(ctx, ctx.t.admin.askDescription);
        if (!isClear(text) && text.length > PRODUCT_LIMITS.descriptionMax) return this.ui.reply(ctx, ctx.t.admin.invalidDescription);
        await this.products.update(product.id, { description: isClear(text) ? null : text }, who);
        return this.finishEdit(ctx, product.id, ctx.t.admin.saved);
      }
      case 'sortOrder': {
        if (!text || !/^\d{1,4}$/.test(text)) return this.ui.reply(ctx, ctx.t.admin.invalidSortOrder);
        await this.products.update(product.id, { sortOrder: Number(text) }, who);
        return this.finishEdit(ctx, product.id, ctx.t.admin.saved);
      }
      case 'photo': {
        if (isClear(text)) {
          await this.products.setImage(product.id, null, who);
          await this.storage.delete(product.imageUrl);
          return this.finishEdit(ctx, product.id, ctx.t.admin.saved);
        }
        const stored = await this.storeImage(ctx);
        if (!stored) return this.ui.reply(ctx, ctx.t.admin.invalidPhoto);
        await this.products.setImage(product.id, stored.url, who);
        if (stored.image.photoFileId) await this.products.cacheTelegramFileId(product.id, stored.image.photoFileId, String(ctx.me.id));
        await this.storage.delete(product.imageUrl);
        return this.finishEdit(ctx, product.id, ctx.t.admin.saved);
      }
    }
  }

  private async storeImage(ctx: BotContext): Promise<{ url: string; image: DownloadedImage } | null> {
    const image = await this.files.downloadImage(ctx);
    if (!image) return null;
    const saved = await this.storage.save(image.data, { folder: 'products', extension: image.extension });
    return { url: saved.url, image };
  }

  // ---- create wizard -------------------------------------------------------------------

  private draft(ctx: BotContext) {
    ctx.session.admin ??= {};
    ctx.session.admin.newProduct ??= {};
    return ctx.session.admin.newProduct;
  }

  private async createName(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text?.trim();
    if (!text || text.length > PRODUCT_LIMITS.nameMax) return this.ui.reply(ctx, ctx.t.admin.invalidName);
    this.draft(ctx).name = text;
    ctx.session.state = 'admin:product:create:price';
    await this.ui.reply(ctx, ctx.t.admin.askPrice, cancelKeyboard(ctx.t));
  }

  private async createPrice(ctx: BotContext): Promise<void> {
    const price = parseAmountInput(ctx.message?.text ?? '');
    if (price === null || price < PRODUCT_LIMITS.priceMin || price > PRODUCT_LIMITS.priceMax) {
      return this.ui.reply(ctx, ctx.t.admin.invalidPrice);
    }
    this.draft(ctx).price = price;
    ctx.session.state = 'admin:product:create:description';
    await this.ui.reply(ctx, ctx.t.admin.askDescriptionNew, skipKeyboard(ctx.t));
  }

  private async createDescription(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text?.trim();
    if (!text) return this.ui.reply(ctx, ctx.t.admin.askDescriptionNew, skipKeyboard(ctx.t));
    if (!isSkip(text) && text.length > PRODUCT_LIMITS.descriptionMax) return this.ui.reply(ctx, ctx.t.admin.invalidDescription);
    this.draft(ctx).description = isSkip(text) || isClear(text) ? null : text;
    ctx.session.state = 'admin:product:create:photo';
    await this.ui.reply(ctx, ctx.t.admin.askPhotoNew, skipKeyboard(ctx.t));
  }

  private async createPhoto(ctx: BotContext): Promise<void> {
    const draft = this.draft(ctx);
    if (!draft.name || draft.price === undefined) {
      this.ui.resetFlow(ctx);
      return this.ui.showMainMenu(ctx, ctx.t.common.staleButton);
    }

    let stored: { url: string; image: DownloadedImage } | null = null;
    if (!isSkip(ctx.message?.text)) {
      stored = await this.storeImage(ctx);
      if (!stored) return this.ui.reply(ctx, ctx.t.admin.invalidPhoto, skipKeyboard(ctx.t));
    }

    const product: Product = await this.products.create(
      { name: draft.name, price: draft.price, description: draft.description ?? null, imageUrl: stored?.url ?? null },
      actor(ctx),
    );
    if (stored?.image.photoFileId) await this.products.cacheTelegramFileId(product.id, stored.image.photoFileId, String(ctx.me.id));
    await this.finishEdit(ctx, product.id, ctx.t.admin.productCreated);
  }
}

function actor(ctx: BotContext): string {
  return `tg:${ctx.from?.id}`;
}
