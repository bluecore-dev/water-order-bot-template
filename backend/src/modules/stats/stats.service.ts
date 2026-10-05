import { Injectable } from '@nestjs/common';
import { OrderStatus, SyncStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { startOfDayInTz } from '../../common/utils/time';

export interface StatsSummary {
  today: { orders: number; amount: number };
  last7Days: { orders: number; amount: number };
  last30Days: { orders: number; amount: number };
  totalOrders: number;
  newOrders: number;
  activeProducts: number;
  customers: number;
  botUsers: number;
  blockedUsers: number;
  amocrm: { pendingOrders: number; failedOrders: number };
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async summary(now = new Date()): Promise<StatsSummary> {
    const tz = this.config.timezone;
    const todayStart = startOfDayInTz(now, tz);
    const weekStart = startOfDayInTz(now, tz, -6);
    const monthStart = startOfDayInTz(now, tz, -29);
    const notCancelled = { status: { not: OrderStatus.CANCELLED } };

    const window = (from: Date) =>
      this.prisma.order.aggregate({ where: { createdAt: { gte: from }, ...notCancelled }, _count: true, _sum: { totalAmount: true } });

    const [today, week, month, totalOrders, newOrders, activeProducts, customers, botUsers, blockedUsers, pending, failed] = await Promise.all([
      window(todayStart),
      window(weekStart),
      window(monthStart),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.NEW } }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { orders: { some: {} } } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { botBlockedAt: { not: null } } }),
      this.countOrdersWithSync([SyncStatus.PENDING, SyncStatus.PROCESSING]),
      this.countOrdersWithSync([SyncStatus.FAILED]),
    ]);

    const pick = (a: { _count: number; _sum: { totalAmount: number | null } }) => ({
      orders: a._count,
      amount: a._sum.totalAmount ?? 0,
    });

    return {
      today: pick(today),
      last7Days: pick(week),
      last30Days: pick(month),
      totalOrders,
      newOrders,
      activeProducts,
      customers,
      botUsers,
      blockedUsers,
      amocrm: { pendingOrders: pending, failedOrders: failed },
    };
  }

  private countOrdersWithSync(statuses: SyncStatus[]): Promise<number> {
    return this.prisma.order.count({ where: { amocrmSyncs: { some: { status: { in: statuses } } } } });
  }
}
