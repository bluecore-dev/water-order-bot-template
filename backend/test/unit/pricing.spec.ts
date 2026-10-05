import { DomainError } from '../../src/common/errors';
import { priceOrder, PricedProduct } from '../../src/modules/orders/pricing';

const water: PricedProduct = { id: 1, name: '18.9 L suv', price: 15000, isActive: true };
const pump: PricedProduct = { id: 2, name: 'Pompa', price: 45000, isActive: true };
const hidden: PricedProduct = { id: 3, name: 'Eski', price: 1000, isActive: false };

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('priceOrder', () => {
  it('15 000 × 3 = 45 000', () => {
    const result = priceOrder([{ productId: 1, quantity: 3 }], [water], 50);
    expect(result.lines).toEqual([{ productId: 1, name: '18.9 L suv', unitPrice: 15000, quantity: 3, subtotal: 45000 }]);
    expect(result.total).toBe(45000);
    expect(result.totalQuantity).toBe(3);
  });

  it('sums several products', () => {
    const result = priceOrder(
      [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
      [water, pump],
      50,
    );
    expect(result.total).toBe(2 * 15000 + 45000);
  });

  it('merges duplicate lines so limits cannot be bypassed', () => {
    const result = priceOrder(
      [
        { productId: 1, quantity: 2 },
        { productId: 1, quantity: 3 },
      ],
      [water],
      50,
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].quantity).toBe(5);
    expect(code(() => priceOrder([{ productId: 1, quantity: 30 }, { productId: 1, quantity: 30 }], [water], 50))).toBe('QUANTITY_LIMIT');
  });

  it('uses only the prices passed from the database', () => {
    const cheaper = { ...water, price: 17000 };
    expect(priceOrder([{ productId: 1, quantity: 3 }], [cheaper], 50).total).toBe(51000);
  });

  it('enforces the minimum total quantity across all lines', () => {
    expect(code(() => priceOrder([{ productId: 1, quantity: 1 }], [water], 50, 2))).toBe('MIN_ORDER');
    expect(priceOrder([{ productId: 1, quantity: 2 }], [water], 50, 2).total).toBe(30000);
    // Two different products, one of each, also reach a minimum of 2.
    expect(priceOrder([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }], [water, pump], 50, 2).totalQuantity).toBe(2);
  });

  it('rejects inactive, unknown and invalid input', () => {
    expect(code(() => priceOrder([], [water], 50))).toBe('CART_EMPTY');
    expect(code(() => priceOrder([{ productId: 3, quantity: 1 }], [hidden], 50))).toBe('PRODUCT_UNAVAILABLE');
    expect(code(() => priceOrder([{ productId: 99, quantity: 1 }], [water], 50))).toBe('PRODUCT_UNAVAILABLE');
    expect(code(() => priceOrder([{ productId: 1, quantity: 0 }], [water], 50))).toBe('VALIDATION');
    expect(code(() => priceOrder([{ productId: 1, quantity: -2 }], [water], 50))).toBe('VALIDATION');
    expect(code(() => priceOrder([{ productId: 1, quantity: 1.5 }], [water], 50))).toBe('VALIDATION');
    expect(code(() => priceOrder([{ productId: 1, quantity: 51 }], [water], 50))).toBe('QUANTITY_LIMIT');
  });
});
