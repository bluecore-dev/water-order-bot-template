import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MAX_IMAGE_BYTES } from '../../modules/storage/storage.types';
import { BotContext } from '../context';

export interface DownloadedImage {
  data: Buffer;
  extension: string;
  /** Reusable for sendPhoto only when the image came in as a photo (not as a document). */
  photoFileId: string | null;
}

const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

/** Downloads images admins send to the bot so they survive a bot token switch. */
@Injectable()
export class TelegramFilesService {
  private readonly logger = new Logger(TelegramFilesService.name);

  constructor(private readonly config: AppConfigService) {}

  /** null = the message holds no acceptable image (wrong type or too large). */
  async downloadImage(ctx: BotContext): Promise<DownloadedImage | null> {
    const msg = ctx.message;
    let fileId: string;
    let size: number | undefined;
    let photo = false;

    if (msg?.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      fileId = largest.file_id;
      size = largest.file_size;
      photo = true;
    } else if (msg?.document && IMAGE_MIME.test(msg.document.mime_type ?? '')) {
      fileId = msg.document.file_id;
      size = msg.document.file_size;
    } else {
      return null;
    }
    if (size !== undefined && size > MAX_IMAGE_BYTES) return null;

    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) return null;
    const extension = (file.file_path.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
    if (!['jpg', 'png', 'webp'].includes(extension)) return null;

    // The URL embeds the bot token: never log it (errors are logged without the URL).
    const url = `https://api.telegram.org/file/bot${this.config.bot.token}/${file.file_path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch((err: Error) => {
      throw new Error(`Telegram file download failed: ${err.name}`);
    });
    if (!res.ok) throw new Error(`Telegram file download failed: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_IMAGE_BYTES) return null;

    return { data, extension, photoFileId: photo ? fileId : null };
  }
}
