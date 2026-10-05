import { DomainError } from '../../common/errors';

export interface CartItemInput {
  productId: number;
  quantity: number;
}

export interface PricedProduct {
  id: number;
  name: string;
  price: number;
  isActive: boolean;
}

export interface PricedLine {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  totalQuantity: number;
  total: number;
}

export const MAX_ORDER_TOTAL = 1_000_000_000;

/**
 * The single place where order money is calculated. Prices always come from the database
 * rows passed in — never from the client, the cart, or a previously shown summary.
 * Duplicate product lines are merged so a crafted cart cannot bypass per-item limits.
 */
export function priceOrder(
  items: CartItemInput[],
  products: PricedProduct[],
  maxQuantityPerItem: number,
  minTotalQuantity = 1,
): PricedOrder {
  if (!items.length) throw new DomainError('CART_EMPTY', 'Cart is empty');

  const merged = new Map<number, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DomainError('VALIDATION', `Invalid quantity for product ${item.productId}`);
    }
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];

  for (const [productId, quantity] of merged) {
    const product = byId.get(productId);
    if (!product || !product.isActive) {
      throw new DomainError('PRODUCT_UNAVAILABLE', `Product ${productId} is not available`, { productId });
    }
    if (quantity > maxQuantityPerItem) {
      throw new DomainError('QUANTITY_LIMIT', `Quantity ${quantity} exceeds limit ${maxQuantityPerItem}`, {
        productId,
        max: maxQuantityPerItem,
      });
    }
    if (!Number.isInteger(product.price) || product.price <= 0) {
      throw new DomainError('PRODUCT_UNAVAILABLE', `Product ${productId} has no valid price`, { productId });
    }
    lines.push({ productId, name: product.name, unitPrice: product.price, quantity, subtotal: product.price * quantity });
  }

  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  if (total > MAX_ORDER_TOTAL) throw new DomainError('VALIDATION', 'Order total is out of range');
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  if (totalQuantity < minTotalQuantity) {
    throw new DomainError('MIN_ORDER', `Order has ${totalQuantity} items, minimum is ${minTotalQuantity}`, { min: minTotalQuantity });
  }

  return { lines, totalQuantity, total };
}
