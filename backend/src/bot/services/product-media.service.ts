import { Injectable, Logger } from '@nestjs/common';
import { InlineKeyboard, InputFile } from 'grammy';
import { Product } from '@prisma/client';
import { ProductsService } from '../../modules/products/products.service';
import { StorageService } from '../../modules/storage/storage.service';
import { BotContext } from '../context';

/**
 * Sends product cards with photos. Telegram file_ids are reused only when they belong to the
 * current bot; otherwise (first send, or after switching BOT_TOKEN) the image is uploaded from
 * storage and the new file_id is cached.
 */
@Injectable()
export class ProductMediaService {
  private readonly logger = new Logger(ProductMediaService.name);

  constructor(
    private readonly products: ProductsService,
    private readonly storage: StorageService,
  ) {}

  async sendCard(ctx: BotContext, product: Product, caption: string, keyboard: InlineKeyboard): Promise<void> {
    const botId = String(ctx.me.id);
    const cachedFileId = product.imageFileId && product.imageFileBotId === botId ? product.imageFileId : null;
    const input = cachedFileId ?? this.storageInput(product.imageUrl);

    if (input) {
      try {
        const msg = await ctx.replyWithPhoto(input, { caption, parse_mode: 'HTML', reply_markup: keyboard });
        const fileId = msg.photo?.at(-1)?.file_id;
        if (fileId && fileId !== cachedFileId) await this.products.cacheTelegramFileId(product.id, fileId, botId);
        return;
      } catch (err) {
        this.logger.warn({ msg: 'Product photo could not be sent, falling back to text', productId: product.id, err });
      }
    }
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  private storageInput(imageUrl: string | null): InputFile | string | null {
    if (!imageUrl) return null;
    const resolved = this.storage.resolve(imageUrl);
    if (!resolved) return null;
    return resolved.kind === 'path' ? new InputFile(resolved.path) : resolved.url;
  }
}
