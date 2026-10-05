import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { BotService } from '../../bot/bot.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotService,
  ) {}

  /** Liveness/readiness for monitors and deploy scripts. Deliberately reveals no counts or config. */
  @Get()
  @SkipThrottle()
  @HttpCode(200)
  @ApiOkResponse({ description: 'Service status', schema: { example: { status: 'ok', database: 'up', bot: 'running' } } })
  async check(@Res({ passthrough: true }) res: Response) {
    const dbUp = await this.prisma.isHealthy();
    const bot = this.bot.status();
    const ok = dbUp && (bot === 'running' || bot === 'disabled');
    if (!ok) res.status(503);
    return { status: ok ? 'ok' : 'degraded', database: dbUp ? 'up' : 'down', bot };
  }
}
