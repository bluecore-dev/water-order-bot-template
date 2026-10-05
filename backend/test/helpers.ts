import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Bot } from 'grammy';
import type { InlineKeyboardButton, Update } from 'grammy/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfigService } from '../src/config/app-config.service';
import { PrismaService } from '../src/database/prisma.service';
import { BotService } from '../src/bot/bot.service';
import type { BotContext } from '../src/bot/context';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  get<T>(token: new (...args: any[]) => T): T;
  close(): Promise<void>;
}

/** Full application (all modules) against the *_test database, with the bot not started. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, app.get(AppConfigService).values);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    get: (token) => app.get(token),
    close: () => app.close(),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AmocrmSync","OrderItem","Order","Address","BotSession","Product","Setting","AdminUser","IntegrationToken","User" RESTART IDENTITY CASCADE',
  );
}

export interface ApiCall {
  method: string;
  payload: Record<string, any>;
}

export interface TgUser {
  id: number;
  is_bot: false;
  first_name: string;
  last_name?: string;
  username?: string;
}

/**
 * Drives the real bot (all handlers, middlewares, DB-backed session) with synthetic updates.
 * Outgoing Bot API calls are captured instead of being sent to Telegram.
 */
export class FakeTelegram {
  readonly calls: ApiCall[] = [];
  readonly bot: Bot<BotContext>;
  /** chat ids for which Telegram answers with an error (e.g. 403 "bot was blocked"). */
  readonly failFor = new Map<number, { error_code: number; description: string }>();
  private messageId = 1000;
  private updateId = 1;

  constructor(botService: BotService) {
    this.bot = botService.build({
      id: 4242,
      is_bot: true,
      first_name: 'Test Suv Bot',
      username: 'test_suv_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as any);
    this.bot.api.config.use(async (_prev, method, payload) => {
      this.calls.push({ method, payload: payload as Record<string, any> });
      const failure = this.failFor.get(Number((payload as Record<string, any>).chat_id));
      if (failure) return { ok: false, ...failure } as any;
      return { ok: true, result: this.result(method, payload as Record<string, any>) } as any;
    });
  }

  private result(method: string, payload: Record<string, any>): unknown {
    const base = { message_id: ++this.messageId, date: now(), chat: { id: payload.chat_id, type: 'private' } };
    switch (method) {
      case 'sendMessage':
      case 'editMessageText':
        return { ...base, text: payload.text };
      case 'sendPhoto':
        return { ...base, caption: payload.caption, photo: [{ file_id: 'sent-photo-file-id', file_unique_id: 'u1', width: 800, height: 800 }] };
      case 'copyMessage':
        return { message_id: ++this.messageId };
      case 'getFile':
        return { file_id: payload.file_id, file_unique_id: 'f1', file_path: 'photos/file_1.jpg', file_size: 1000 };
      default:
        return true;
    }
  }

  static user(id: number, first_name = 'Ali', username = 'ali_test'): TgUser {
    return { id, is_bot: false, first_name, username };
  }

  private chat(user: TgUser) {
    return { id: user.id, type: 'private' as const, first_name: user.first_name };
  }

  private async send(update: Omit<Update, 'update_id'>): Promise<void> {
    await this.bot.handleUpdate({ update_id: this.updateId++, ...update } as Update);
  }

  async text(user: TgUser, text: string): Promise<void> {
    const command = text.startsWith('/') ? text.split(' ')[0] : null;
    await this.send({
      message: {
        message_id: ++this.messageId,
        date: now(),
        chat: this.chat(user),
        from: user,
        text,
        ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: command.length }] } : {}),
      },
    } as any);
  }

  async callback(user: TgUser, data: string): Promise<void> {
    await this.send({
      callback_query: {
        id: `cb${this.updateId}`,
        from: user,
        chat_instance: 'ci',
        data,
        message: { message_id: ++this.messageId, date: now(), chat: this.chat(user), text: 'previous message' },
      },
    } as any);
  }

  async contact(user: TgUser, phone: string, ownerId = user.id): Promise<void> {
    await this.send({
      message: {
        message_id: ++this.messageId,
        date: now(),
        chat: this.chat(user),
        from: user,
        contact: { phone_number: phone, first_name: user.first_name, user_id: ownerId },
      },
    } as any);
  }

  async location(user: TgUser, latitude: number, longitude: number): Promise<void> {
    await this.send({
      message: { message_id: ++this.messageId, date: now(), chat: this.chat(user), from: user, location: { latitude, longitude } },
    } as any);
  }

  async message(user: TgUser, extra: Record<string, unknown>): Promise<void> {
    await this.send({ message: { message_id: ++this.messageId, date: now(), chat: this.chat(user), from: user, ...extra } } as any);
  }

  clear(): void {
    this.calls.length = 0;
  }

  /** Texts/captions of messages sent or edited, in order. */
  texts(): string[] {
    return this.calls
      .filter((c) => ['sendMessage', 'editMessageText', 'sendPhoto'].includes(c.method))
      .map((c) => String(c.payload.text ?? c.payload.caption ?? ''));
  }

  lastText(): string {
    return this.texts().at(-1) ?? '';
  }

  alerts(): string[] {
    return this.calls.filter((c) => c.method === 'answerCallbackQuery' && c.payload.text).map((c) => String(c.payload.text));
  }

  /** All inline buttons from the most recent message that had an inline keyboard. */
  lastInlineButtons(): InlineKeyboardButton[] {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const kb = this.calls[i].payload.reply_markup?.inline_keyboard;
      if (kb) return kb.flat();
    }
    return [];
  }

  /** callback_data of the latest inline button whose text contains `label`. */
  button(label: string): string {
    const btn = this.lastInlineButtons().find((b) => b.text.includes(label));
    if (!btn || !('callback_data' in btn)) {
      throw new Error(`Button "${label}" not found. Have: ${this.lastInlineButtons().map((b) => b.text).join(' | ')}`);
    }
    return btn.callback_data;
  }

  /** Reply-keyboard button labels from the most recent message that set one. */
  lastReplyKeyboard(): string[] {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const kb = this.calls[i].payload.reply_markup?.keyboard;
      if (kb) return kb.flat().map((b: { text: string } | string) => (typeof b === 'string' ? b : b.text));
    }
    return [];
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
