import { Controller, NotFoundException, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { BotService } from './bot.service';

/**
 * Telegram webhook endpoint (BOT_MODE=webhook). grammY verifies the
 * X-Telegram-Bot-Api-Secret-Token header against BOT_WEBHOOK_SECRET and rejects others.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly bot: BotService) {}

  @Post('webhook')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const handler = this.bot.getWebhookHandler();
    if (!handler) throw new NotFoundException();
    await handler(req, res, () => undefined);
  }
}
