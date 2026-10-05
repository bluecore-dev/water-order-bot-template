import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GrammyError, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { safeErrorMessage } from '../../common/utils/redact';
import { getMessages } from '../../i18n';
import { SettingsService } from '../../modules/settings/settings.service';
import { UsersService } from '../../modules/users/users.service';
import { BotApiHolder } from './bot-api.holder';
import { CB } from '../callbacks';

/** A reminder that could not go out on time (bot offline…) is dropped once it is this late. */
const GRACE_MS = 30 * 60 * 1000;
const BATCH = 50;
const SEND_GAP_MS = 60;

interface Stage {
  stage: 1 | 2;
  delayMs: number;
}

/**
 * Start reminders. Every /start opens a cycle; if the user then neither writes nor presses
 * any button, they get reminder 1 after `reminder_first_minutes` (default 10) and reminder 2
 * after `reminder_second_minutes` (default 60, counted from /start) — never more. Any
 * interaction cancels what is left; the next /start starts a new cycle.
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private running = false;
  /** Tests call runOnce() directly. */
  autoRun: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly bot: BotApiHolder,
  ) {
    this.autoRun = config.values.env !== 'test';
  }

  @Interval('reminders', 60 * 1000)
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
    const api = this.bot.api;
    if (!api) return 0;
    const stages: Stage[] = (
      [
        { stage: 1, delayMs: (await this.settings.getInt('reminder_first_minutes')) * 60_000 },
        { stage: 2, delayMs: (await this.settings.getInt('reminder_second_minutes')) * 60_000 },
      ] as Stage[]
    ).filter((s) => s.delayMs > 0);
    if (!stages.length) return 0;

    const minDelay = Math.min(...stages.map((s) => s.delayMs));
    const maxDelay = Math.max(...stages.map((s) => s.delayMs));
    const candidates = await this.prisma.user.findMany({
      where: {
        engagedAfterStart: false,
        startReminders: { lt: 2 },
        botBlockedAt: null,
        startedAt: { lte: new Date(now.getTime() - minDelay), gte: new Date(now.getTime() - maxDelay - GRACE_MS) },
      },
      orderBy: { startedAt: 'asc' },
      take: BATCH,
    });
    if (!candidates.length) return 0;

    const t = getMessages();
    const company = (await this.settings.get('company_name')) || this.bot.firstName || '';
    const custom1 = await this.settings.get('reminder_text');
    const custom2 = await this.settings.get('reminder_text_2');
    const text = (stage: 1 | 2) =>
      stage === 1
        ? custom1
          ? t.engage.customReminder(custom1)
          : t.engage.reminder(company)
        : custom2
          ? t.engage.customReminder(custom2)
          : t.engage.reminder2(company);
    const keyboard = new InlineKeyboard().text(t.engage.orderButton, CB.startOrder);

    let delivered = 0;
    for (const user of candidates) {
      const elapsed = now.getTime() - user.startedAt!.getTime();
      // The latest stage that is due and has not been sent yet (a missed stage 1 is skipped).
      const due = stages.filter((s) => s.delayMs <= elapsed && s.stage > user.startReminders).pop();
      if (!due) continue;

      // Claim the stage first: a parallel run, a new /start or a button press in the meantime
      // makes the claim fail, so the same reminder is never sent twice or after engagement.
      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, startReminders: user.startReminders, startedAt: user.startedAt, engagedAfterStart: false },
        data: { startReminders: due.stage },
      });
      if (!claimed.count || elapsed > due.delayMs + GRACE_MS) continue; // too late → closed silently

      try {
        await api.sendMessage(Number(user.telegramId), text(due.stage), { parse_mode: 'HTML', reply_markup: keyboard });
        delivered++;
      } catch (err) {
        if (isUnreachable(err)) await this.users.markBlocked(user.telegramId);
        else this.logger.warn({ msg: 'Reminder not delivered', userId: user.id, err: safeErrorMessage(err) });
      }
      await sleep(SEND_GAP_MS);
    }
    if (delivered) this.logger.log({ msg: 'Start reminders sent', count: delivered });
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
