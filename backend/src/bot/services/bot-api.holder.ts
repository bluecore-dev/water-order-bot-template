import { Injectable } from '@nestjs/common';
import type { Api, Bot, RawApi } from 'grammy';
import type { BotContext } from '../context';

/**
 * Shares the running bot with background services (notifications, reminders, broadcasts)
 * without making them depend on BotService — BotService depends on the handlers, and some
 * handlers depend on those services, so a direct dependency would be circular.
 */
@Injectable()
export class BotApiHolder {
  bot?: Bot<BotContext>;

  get api(): Api<RawApi> | undefined {
    return this.bot?.api;
  }

  /** Bot display name from getMe (available once the bot is initialized). */
  get firstName(): string | undefined {
    try {
      return this.bot?.botInfo.first_name;
    } catch {
      return undefined; // botInfo throws before init
    }
  }
}
