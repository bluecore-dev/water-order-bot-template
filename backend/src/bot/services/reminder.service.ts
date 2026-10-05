import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GrammyError, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { safeErrorMessage } from '../../common/utils/redact';
import { hourInTz } from '../../common/utils/time';
import { getMessages } from '../../i18n';
import { AdminsService } from '../../modules/admins/admins.service';
import { SettingsService } from '../../modules/settings/settings.service';
import { UsersService } from '../../modules/users/users.service';
import { BotApiHolder } from './bot-api.holder';
import { CB } from '../callbacks';

/** Reminders go out only in daytime (business timezone): [09:00, 21:00). */
export const REMINDER_WINDOW = { fromHour: 9, toHour: 21 } as const;
/** People who opened the bot long ago are not chased. */
const LOOKBACK_DAYS = 7;
const BATCH = 30;
const SEND_GAP_MS = 60;

/**
 * "You opened the bot but haven't ordered yet" — one gentle nudge per user.
 * Candidates: no orders, no reminder sent yet, not blocking the bot, not an admin, and
 * inactive for `reminder_after_hours` (0 disables the feature).
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private running = false;
  /** Tests call runOnce() directly. */
  autoRun: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly admins: AdminsService,
    private readonly users: UsersService,
    private readonly bot: BotApiHolder,
  ) {
    this.autoRun = config.values.env !== 'test';
  }

  @Interval('reminders', 10 * 60 * 1000)
  async tick(): Promise<void> {
    if (!this.autoRun || this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error({ msg: 'Reminder run failed', err: safeErrorMessage(err) });
    } finally {
      this.running = false;
    }
  }

  /** Returns the number of reminders delivered. */
  async runOnce(now = new Date()): Promise<number> {
    const hours = await this.settings.getInt('reminder_after_hours');
    const api = this.bot.api;
    if (hours <= 0 || !api) return 0;
    const hour = hourInTz(now, this.config.timezone);
    if (hour < REMINDER_WINDOW.fromHour || hour >= REMINDER_WINDOW.toHour) return 0;

    const adminIds = (await this.admins.notifiableIds()).map((id) => BigInt(id));
    const candidates = await this.prisma.user.findMany({
      where: {
        reminderSentAt: null,
        botBlockedAt: null,
        orders: { none: {} },
        telegramId: { notIn: adminIds },
        lastActivityAt: {
          lte: new Date(now.getTime() - hours * 3_600_000),
          gte: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000),
        },
      },
      orderBy: { lastActivityAt: 'asc' },
      take: BATCH,
    });
    if (!candidates.length) return 0;

    const t = getMessages();
    const custom = await this.settings.get('reminder_text');
    const company = (await this.settings.get('company_name')) || this.bot.firstName || '';
    const text = custom ? t.engage.customReminder(custom) : t.engage.reminder(company);
    const keyboard = new InlineKeyboard().text(t.engage.orderButton, CB.startOrder);

    let delivered = 0;
    for (const user of candidates) {
      // Claim first, so a crash or a parallel run can never send the same reminder twice.
      const claimed = await this.prisma.user.updateMany({ where: { id: user.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!claimed.count) continue;
      try {
        await api.sendMessage(Number(user.telegramId), text, { parse_mode: 'HTML', reply_markup: keyboard });
        delivered++;
      } catch (err) {
        if (isUnreachable(err)) await this.users.markBlocked(user.telegramId);
        else this.logger.warn({ msg: 'Reminder not delivered', userId: user.id, err: safeErrorMessage(err) });
      }
      await sleep(SEND_GAP_MS);
    }
    if (delivered) this.logger.log({ msg: 'Reminders sent', count: delivered });
    return delivered;
  }
}

/** The user blocked the bot, deleted the account, or never had a chat with it. */
export function isUnreachable(err: unknown): boolean {
  return (
    err instanceof GrammyError &&
    (err.error_code === 403 || (err.error_code === 400 && /chat not found|user not found/i.test(err.description)))
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
