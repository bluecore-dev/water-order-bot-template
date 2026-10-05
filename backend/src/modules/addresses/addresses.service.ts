import { Injectable } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DomainError } from '../../common/errors';
import { truncate } from '../../common/utils/format';

export const ADDRESS_LIMITS = { textMin: 3, textMax: 300, perUser: 10 } as const;

export interface AddressInput {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: number): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      take: ADDRESS_LIMITS.perUser,
    });
  }

  async getForUser(userId: number, id: number): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new DomainError('NOT_FOUND', `Address ${id} not found`);
    return address;
  }

  static validateText(text: string): string {
    const value = text.trim().replace(/\s+/g, ' ');
    if (value.length < ADDRESS_LIMITS.textMin || value.length > ADDRESS_LIMITS.textMax) {
      throw new DomainError('VALIDATION', 'Address must be 3-300 characters');
    }
    return value;
  }

  static validateCoordinates(lat?: number | null, lng?: number | null): void {
    if (lat == null && lng == null) return;
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new DomainError('VALIDATION', 'Invalid coordinates');
    }
  }

  /** Saves an address, or refreshes an identical one. Used both by "My addresses" and by checkout. */
  remember(userId: number, input: AddressInput): Promise<Address> {
    return this.prisma.$transaction((tx) => this.rememberInTx(tx, userId, input));
  }

  async rememberInTx(tx: Tx, userId: number, input: AddressInput): Promise<Address> {
    const text = AddressesService.validateText(input.address);
    AddressesService.validateCoordinates(input.latitude, input.longitude);
    const latitude = input.latitude ?? null;
    const longitude = input.longitude ?? null;

    const existing = await tx.address.findMany({ where: { userId } });
    const same = existing.find(
      (a) =>
        a.address.toLowerCase() === text.toLowerCase() &&
        sameCoord(a.latitude, latitude) &&
        sameCoord(a.longitude, longitude),
    );
    if (same) return tx.address.update({ where: { id: same.id }, data: { updatedAt: new Date() } });

    const created = await tx.address.create({
      data: {
        userId,
        address: text,
        latitude,
        longitude,
        title: truncate(input.title?.trim() || text, 40),
        isDefault: existing.length === 0,
      },
    });

    // Keep the list short: drop the oldest non-default addresses beyond the limit.
    if (existing.length + 1 > ADDRESS_LIMITS.perUser) {
      const overflow = existing
        .filter((a) => !a.isDefault)
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
        .slice(0, existing.length + 1 - ADDRESS_LIMITS.perUser);
      if (overflow.length) await tx.address.deleteMany({ where: { id: { in: overflow.map((a) => a.id) } } });
    }
    return created;
  }

  async setDefault(userId: number, id: number): Promise<void> {
    await this.getForUser(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  async remove(userId: number, id: number): Promise<void> {
    const address = await this.getForUser(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}

function sameCoord(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == b;
  return Math.abs(a - b) < 0.0001; // ~10 m
}
