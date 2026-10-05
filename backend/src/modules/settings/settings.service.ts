import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DomainError } from '../../common/errors';
import { SETTING_DEFINITIONS, SETTING_KEYS, SettingKey } from './settings.registry';

export type SettingsSnapshot = Record<SettingKey, string>;

/** Values are read fresh from the DB on every call, so admin edits apply to the very next message. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<SettingsSnapshot> {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(
      SETTING_KEYS.map((key) => [key, stored.get(key) ?? SETTING_DEFINITIONS[key].defaultValue]),
    ) as SettingsSnapshot;
  }

  async get(key: SettingKey): Promise<string> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row?.value ?? SETTING_DEFINITIONS[key].defaultValue;
  }

  async getInt(key: SettingKey): Promise<number> {
    const value = Number(await this.get(key));
    return Number.isFinite(value) ? value : Number(SETTING_DEFINITIONS[key].defaultValue);
  }

  /** `rawValue === null` clears an optional setting back to its default. */
  async set(key: SettingKey, rawValue: string | null, changedBy?: string): Promise<string> {
    const def = SETTING_DEFINITIONS[key];
    let value: string;
    if (rawValue === null) {
      if (!def.optional) throw new DomainError('VALIDATION', `Setting ${key} cannot be empty`);
      value = def.defaultValue;
    } else {
      const normalized = def.normalize(rawValue);
      if (normalized === null) throw new DomainError('VALIDATION', `Invalid value for ${key}`);
      value = normalized;
    }

    // A minimum above the per-item maximum would make single-product orders impossible.
    if (key === 'min_order_quantity' && Number(value) > (await this.getInt('max_item_quantity'))) {
      throw new DomainError('VALIDATION', 'min_order_quantity cannot exceed max_item_quantity');
    }
    if (key === 'max_item_quantity' && Number(value) < (await this.getInt('min_order_quantity'))) {
      throw new DomainError('VALIDATION', 'max_item_quantity cannot be below min_order_quantity');
    }

    await this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    this.logger.log({ msg: 'Setting changed', key, changedBy });
    return value;
  }
}
