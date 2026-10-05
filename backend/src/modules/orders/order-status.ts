import { OrderStatus } from '@prisma/client';

/**
 * Centralized order status enum. The source of truth is the Prisma enum (DB type), re-exported
 * here so application code imports statuses from one place and never uses raw strings.
 */
export { OrderStatus };

export const ORDER_STATUSES: readonly OrderStatus[] = Object.values(OrderStatus);

/** Statuses after which nothing else happens to an order. */
export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
