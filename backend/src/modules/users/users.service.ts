import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DomainError } from '../../common/errors';
import { normalizePhone } from '../../common/utils/phone';

/** lastActivityAt is refreshed at most this often, so ordinary messages don't each cause a write. */
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export interface TelegramProfile {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * One User per Telegram account (telegramId is unique). Profile fields are refreshed only
   * when they actually changed, so ordinary messages don't cause a write.
   */
  async upsertFromTelegram(profile: TelegramProfile): Promise<User> {
    const telegramId = BigInt(profile.id);
    const data = {
      telegramUsername: profile.username ?? null,
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
    };

    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (!existing) {
      try {
        const created = await this.prisma.user.create({ data: { telegramId, ...data } });
        this.logger.log({ msg: 'User created', userId: created.id });
        return created;
      } catch (err) {
        // Two updates from a brand-new user can race; the loser just reads the winner's row.
        const raced = await this.prisma.user.findUnique({ where: { telegramId } });
        if (raced) return raced;
        throw err;
      }
    }

    const changed =
      existing.telegramUsername !== data.telegramUsername ||
      existing.firstName !== data.firstName ||
      existing.lastName !== data.lastName;
    return changed ? this.prisma.user.update({ where: { id: existing.id }, data }) : existing;
  }

  /** Records that the user is active (and therefore not blocking the bot any more). */
  async touchActivity(user: User, now = new Date()): Promise<User> {
    const stale = now.getTime() - user.lastActivityAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS;
    if (!stale && !user.botBlockedAt) return user;
    return this.prisma.user.update({ where: { id: user.id }, data: { lastActivityAt: now, botBlockedAt: null } });
  }

  /** Telegram answered 403: the user blocked the bot or deleted the account. */
  async markBlocked(telegramId: number | bigint | string): Promise<void> {
    await this.prisma.user.updateMany({ where: { telegramId: BigInt(telegramId), botBlockedAt: null }, data: { botBlockedAt: new Date() } });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByTelegramId(telegramId: number | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  async setPhone(userId: number, rawPhone: string): Promise<User> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new DomainError('VALIDATION', 'Invalid phone number');
    return this.prisma.user.update({ where: { id: userId }, data: { phone } });
  }

  countOrders(userId: number): Promise<number> {
    return this.prisma.order.count({ where: { userId } });
  }

  /** Display name for operators: Telegram name, falling back to @username. */
  static displayName(user: Pick<User, 'firstName' | 'lastName' | 'telegramUsername'>): string | null {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || (user.telegramUsername ? `@${user.telegramUsername}` : null);
  }
}
