import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Broadcast, BroadcastStatus } from '@prisma/client';
import { GrammyError, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { DomainError } from '../../common/errors';
import { safeErrorMessage } from '../../common/utils/redact';
import { getMessages } from '../../i18n';
import { UsersService } from '../../modules/users/users.service';
import { BotApiHolder } from './bot-api.holder';
import { CB } from '../callbacks';
import { isUnreachable, sleep } from './reminder.service';

/** ~25 messages/second keeps well under Telegram's broadcast limit (≈30/s). */
const SEND_GAP_MS = 40;
const PAGE = 100;
const PROGRESS_EVERY = 10;
const RESUME_DELAY_MS = 15_000;

/**
 * Admin announcements to every customer. The admin's own message is copied (text, photo,
 * video… with formatting) and gets an "Order" button. Runs in the background so the bot
 * keeps answering; progress is stored, so a restart resumes where it stopped.
 */
@Injectable()
export class BroadcastService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastService.name);
  private running: Promise<Broadcast | null> | null = null;
  private resumeTimer?: NodeJS.Timeout;
  private stopping = false;
  /** Pause between messages; tests set 0. */
  sendGapMs = SEND_GAP_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly users: UsersService,
    private readonly bot: BotApiHolder,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.values.env === 'test') return;
    // Give the bot time to connect, then continue anything a restart interrupted.
    this.resumeTimer = setTimeout(() => void this.resumePending(), RESUME_DELAY_MS);
  }

  onModuleDestroy(): void {
    this.stopping = true;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
  }

  countRecipients(excludeTelegramId?: number | bigint): Promise<number> {
    return this.prisma.user.count({ where: this.recipientFilter(excludeTelegramId) });
  }

  last(): Promise<Broadcast | null> {
    return this.prisma.broadcast.findFirst({ orderBy: { id: 'desc' } });
  }

  async isBusy(): Promise<boolean> {
    return !!this.running || (await this.prisma.broadcast.count({ where: { status: BroadcastStatus.SENDING } })) > 0;
  }

  /** Creates the broadcast and starts sending in the background. */
  async start(createdById: number, sourceChatId: number, sourceMessageId: number): Promise<Broadcast> {
    if (await this.isBusy()) throw new DomainError('VALIDATION', 'Another broadcast is still sending');
    const total = await this.countRecipients(createdById);
    const row = await this.prisma.broadcast.create({
      data: { createdById: BigInt(createdById), sourceChatId: BigInt(sourceChatId), sourceMessageId, total },
    });
    this.logger.log({ msg: 'Broadcast started', broadcastId: row.id, total, by: createdById });
    void this.run(row.id);
    return row;
  }

  /** Sends (or resumes) a broadcast; resolves when it is finished. */
  run(id: number): Promise<Broadcast | null> {
    this.running ??= this.send(id).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async resumePending(): Promise<void> {
    const pending = await this.prisma.broadcast.findMany({ where: { status: BroadcastStatus.SENDING }, orderBy: { id: 'asc' } });
    for (const b of pending) {
      this.logger.warn({ msg: 'Resuming interrupted broadcast', broadcastId: b.id, cursor: b.cursorUserId });
      await this.run(b.id);
    }
  }

  private async send(id: number): Promise<Broadcast | null> {
    const api = this.bot.api;
    let b = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!api || !b || b.status !== BroadcastStatus.SENDING) return b;

    const t = getMessages();
    const keyboard = new InlineKeyboard().text(t.engage.orderButton, CB.startOrder);
    let { sent, blocked, failed, cursorUserId } = b;
    let sinceSave = 0;
    const save = (data: Partial<Broadcast> = {}) =>
      this.prisma.broadcast.update({ where: { id }, data: { sent, blocked, failed, cursorUserId, ...data } });

    try {
      for (;;) {
        const page = await this.prisma.user.findMany({
          where: { ...this.recipientFilter(b.createdById), id: { gt: cursorUserId } },
          orderBy: { id: 'asc' },
          take: PAGE,
          select: { id: true, telegramId: true },
        });
        if (!page.length) break;

        for (const user of page) {
          if (this.stopping) {
            await save();
            return null; // resumed on next start
          }
          try {
            await api.copyMessage(Number(user.telegramId), Number(b.sourceChatId), b.sourceMessageId, { reply_markup: keyboard });
            sent++;
          } catch (err) {
            if (err instanceof GrammyError && /message to copy not found|message_id_invalid/i.test(err.description)) {
              b = await save({ status: BroadcastStatus.FAILED, finishedAt: new Date() });
              await this.notifyAuthor(b, t.admin.broadcastFailed);
              return b;
            }
            if (isUnreachable(err)) {
              blocked++;
              await this.users.markBlocked(user.telegramId);
            } else {
              failed++;
              this.logger.warn({ msg: 'Broadcast message not delivered', broadcastId: id, userId: user.id, err: safeErrorMessage(err) });
            }
          }
          cursorUserId = user.id;
          if (++sinceSave >= PROGRESS_EVERY) {
            sinceSave = 0;
            await save();
          }
          if (this.sendGapMs) await sleep(this.sendGapMs);
        }
      }

      b = await save({ status: BroadcastStatus.DONE, finishedAt: new Date() });
      this.logger.log({ msg: 'Broadcast finished', broadcastId: id, sent, blocked, failed });
      await this.notifyAuthor(b, t.admin.broadcastDone(sent, blocked, failed, b.total));
      return b;
    } catch (err) {
      // Unexpected (DB down…): keep SENDING with the cursor, so the next start resumes it.
      this.logger.error({ msg: 'Broadcast interrupted', broadcastId: id, err: safeErrorMessage(err) });
      await save().catch(() => undefined);
      return null;
    }
  }

  private recipientFilter(excludeTelegramId?: number | bigint) {
    return {
      botBlockedAt: null,
      ...(excludeTelegramId !== undefined ? { telegramId: { not: BigInt(excludeTelegramId) } } : {}),
    };
  }

  private async notifyAuthor(b: Broadcast, text: string): Promise<void> {
    await this.bot.api
      ?.sendMessage(Number(b.createdById), text, { parse_mode: 'HTML' })
      .catch((err) => this.logger.warn({ msg: 'Broadcast report not delivered', err: safeErrorMessage(err) }));
  }
}
