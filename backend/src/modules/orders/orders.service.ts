import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DomainError } from '../../common/errors';
import { Events, OrderCreatedEvent } from '../../common/events';
import { normalizePhone } from '../../common/utils/phone';
import { AddressesService } from '../addresses/addresses.service';
import { SettingsService } from '../settings/settings.service';
import { AMOCRM_SYNC_STEPS } from '../../integrations/amocrm/amocrm.constants';
import { CartItemInput, PricedOrder, priceOrder } from './pricing';

export type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
export type OrderFull = Prisma.OrderGetPayload<{
  include: { items: true; user: true; amocrmSyncs: { orderBy: { id: 'asc' } } };
}>;

export interface CartPreview extends PricedOrder {
  /** The cart after dropping unavailable products and clamping quantities — store it back. */
  items: CartItemInput[];
  removedProductIds: number[];
  clampedProductIds: number[];
  minOrderQuantity: number;
  /** Total quantity is below the configured minimum: checkout must not proceed. */
  belowMinimum: boolean;
}

export interface CreateOrderInput {
  userId: number;
  items: CartItemInput[];
  emptyBottleCount: number;
  phone: string;
  customerName?: string | null;
  address: { text: string; latitude?: number | null; longitude?: number | null };
  idempotencyKey: string;
  /** Total the customer saw on the summary. A mismatch means prices changed meanwhile. */
  expectedTotal?: number;
}

export interface CreateOrderResult {
  order: OrderWithItems;
  /** false when this idempotency key already produced an order (double tap). */
  created: boolean;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly addresses: AddressesService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Prices a cart against current DB state for display. Unlike createOrder it repairs the cart
   * (drops inactive products, clamps quantities) and reports what changed instead of failing.
   */
  async previewCart(items: CartItemInput[]): Promise<CartPreview> {
    const maxQty = await this.settings.getInt('max_item_quantity');
    const minOrderQuantity = await this.settings.getInt('min_order_quantity');
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, price: true, isActive: true } })
      : [];
    const active = new Set(products.filter((p) => p.isActive).map((p) => p.id));

    const merged = new Map<number, number>();
    for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);

    const removedProductIds: number[] = [];
    const clampedProductIds: number[] = [];
    const normalized: CartItemInput[] = [];
    for (const [productId, quantity] of merged) {
      if (!active.has(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        removedProductIds.push(productId);
        continue;
      }
      if (quantity > maxQty) clampedProductIds.push(productId);
      normalized.push({ productId, quantity: Math.min(quantity, maxQty) });
    }

    if (!normalized.length) {
      return {
        items: [],
        lines: [],
        total: 0,
        totalQuantity: 0,
        removedProductIds,
        clampedProductIds,
        minOrderQuantity,
        belowMinimum: true,
      };
    }
    const priced = priceOrder(normalized, products, maxQty);
    return {
      ...priced,
      items: normalized,
      removedProductIds,
      clampedProductIds,
      minOrderQuantity,
      belowMinimum: priced.totalQuantity < minOrderQuantity,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return { order: existing, created: false };

    const phone = normalizePhone(input.phone);
    if (!phone) throw new DomainError('VALIDATION', 'Invalid phone number');
    const maxBottles = await this.settings.getInt('max_empty_bottles');
    if (!Number.isInteger(input.emptyBottleCount) || input.emptyBottleCount < 0 || input.emptyBottleCount > maxBottles) {
      throw new DomainError('VALIDATION', 'Invalid empty bottle count', { max: maxBottles });
    }
    const addressText = AddressesService.validateText(input.address.text);
    AddressesService.validateCoordinates(input.address.latitude, input.address.longitude);
    const maxQty = await this.settings.getInt('max_item_quantity');
    const minQty = await this.settings.getInt('min_order_quantity');

    let order: OrderWithItems;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const ids = [...new Set(input.items.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, price: true, isActive: true },
        });
        const priced = priceOrder(input.items, products, maxQty, minQty);

        if (input.expectedTotal !== undefined && input.expectedTotal !== priced.total) {
          throw new DomainError('PRICE_CHANGED', 'Prices changed since the summary was shown', {
            expectedTotal: input.expectedTotal,
            total: priced.total,
          });
        }

        const created = await tx.order.create({
          data: {
            userId: input.userId,
            customerName: input.customerName?.trim() || null,
            phone,
            deliveryAddress: addressText,
            latitude: input.address.latitude ?? null,
            longitude: input.address.longitude ?? null,
            emptyBottleCount: input.emptyBottleCount,
            totalAmount: priced.total,
            idempotencyKey: input.idempotencyKey,
            items: {
              create: priced.lines.map((l) => ({
                productId: l.productId,
                productNameSnapshot: l.name,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
                subtotal: l.subtotal,
              })),
            },
            // Outbox rows: the amoCRM worker picks these up even if the process dies right now.
            amocrmSyncs: { create: AMOCRM_SYNC_STEPS.map((entityType) => ({ entityType })) },
          },
          include: { items: true },
        });

        await tx.user.update({ where: { id: input.userId }, data: { phone } });
        await this.addresses.rememberInTx(tx, input.userId, {
          address: addressText,
          latitude: input.address.latitude,
          longitude: input.address.longitude,
        });
        return created;
      });
    } catch (err) {
      // A concurrent confirm with the same key won the unique constraint: return its order.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findByIdempotencyKey(input.idempotencyKey);
        if (raced) return { order: raced, created: false };
      }
      throw err;
    }

    this.logger.log({
      msg: 'Order created',
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      total: order.totalAmount,
      items: order.items.length,
    });
    this.events.emit(Events.OrderCreated, { orderId: order.id } satisfies OrderCreatedEvent);
    return { order, created: true };
  }

  findByIdempotencyKey(key: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
  }

  async listForUser(userId: number, page: number, pageSize: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return { items, total };
  }

  /** Ownership is part of the query: a customer can never open someone else's order. */
  async getForUser(userId: number, orderId: number): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId }, include: { items: true } });
    if (!order) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
    return order;
  }

  async getFull(orderId: number): Promise<OrderFull> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, amocrmSyncs: { orderBy: { id: 'asc' } } },
    });
    if (!order) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
    return order;
  }

  async listRecent(page: number, pageSize: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        include: { amocrmSyncs: { select: { status: true } } },
      }),
      this.prisma.order.count(),
    ]);
    return { items, total };
  }
}
