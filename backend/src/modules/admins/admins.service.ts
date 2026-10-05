import { Injectable, Logger } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { DomainError } from '../../common/errors';

export interface AdminEntry {
  telegramId: string;
  name: string | null;
  role: AdminRole;
  /** Comes from ADMIN_TELEGRAM_IDS — cannot be removed from the bot. */
  fromEnv: boolean;
}

/**
 * Admin access for the in-bot admin mode. Telegram user ids in updates are set by Telegram
 * itself and cannot be spoofed by clients, so the id is a sufficient identity check.
 */
@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get envIds(): string[] {
    return this.config.bot.superAdminIds;
  }

  async getRole(telegramId: number | bigint | string): Promise<AdminRole | null> {
    const id = String(telegramId);
    if (this.envIds.includes(id)) return AdminRole.SUPER_ADMIN;
    const row = await this.prisma.adminUser.findUnique({ where: { telegramId: BigInt(id) } });
    return row?.isActive ? row.role : null;
  }

  async list(): Promise<AdminEntry[]> {
    const rows = await this.prisma.adminUser.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    const fromEnv: AdminEntry[] = this.envIds.map((id) => ({
      telegramId: id,
      name: null,
      role: AdminRole.SUPER_ADMIN,
      fromEnv: true,
    }));
    const fromDb: AdminEntry[] = rows
      .filter((r) => !this.envIds.includes(r.telegramId.toString()))
      .map((r) => ({ telegramId: r.telegramId.toString(), name: r.name, role: r.role, fromEnv: false }));
    return [...fromEnv, ...fromDb];
  }

  async add(telegramId: string, name: string | null, addedBy: string): Promise<void> {
    if (!/^\d{3,20}$/.test(telegramId)) throw new DomainError('VALIDATION', 'Invalid Telegram id');
    if (this.envIds.includes(telegramId)) return;
    await this.prisma.adminUser.upsert({
      where: { telegramId: BigInt(telegramId) },
      create: { telegramId: BigInt(telegramId), name, role: AdminRole.ADMIN, addedById: BigInt(addedBy) },
      update: { isActive: true, name: name ?? undefined },
    });
    this.logger.log({ msg: 'Admin added', telegramId, addedBy });
  }

  async remove(telegramId: string, removedBy: string): Promise<void> {
    if (this.envIds.includes(telegramId)) {
      throw new DomainError('FORBIDDEN', 'Super admins from ADMIN_TELEGRAM_IDS cannot be removed from the bot');
    }
    await this.prisma.adminUser.updateMany({ where: { telegramId: BigInt(telegramId) }, data: { isActive: false } });
    this.logger.log({ msg: 'Admin removed', telegramId, removedBy });
  }

  /** Everyone who should receive operational alerts. */
  async notifiableIds(): Promise<string[]> {
    const rows = await this.prisma.adminUser.findMany({ where: { isActive: true }, select: { telegramId: true } });
    return [...new Set([...this.envIds, ...rows.map((r) => r.telegramId.toString())])];
  }
}
