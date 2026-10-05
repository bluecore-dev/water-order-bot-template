import { StorageAdapter } from 'grammy';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SessionData, sanitizeSession } from '../context';

/** grammY session storage in PostgreSQL — no Redis needed, carts survive restarts. */
export class PrismaSessionStorage implements StorageAdapter<SessionData> {
  constructor(private readonly prisma: PrismaService) {}

  async read(key: string): Promise<SessionData | undefined> {
    const row = await this.prisma.botSession.findUnique({ where: { key } });
    return row ? sanitizeSession(row.value) : undefined;
  }

  async write(key: string, value: SessionData): Promise<void> {
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.botSession.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.botSession.deleteMany({ where: { key } });
  }
}
