import { randomUUID } from 'crypto';
import { AmocrmEntityType, SyncStatus } from '@prisma/client';
import { DomainError } from '../../src/common/errors';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { UsersService } from '../../src/modules/users/users.service';
import { createTestApp, resetDb, TestApp } from '../helpers';

describe('Products, users and orders (database)', () => {
  let t: TestApp;
  let products: ProductsService;
  let orders: OrdersService;
  let users: UsersService;

  beforeAll(async () => {
    t = await createTestApp();
    products = t.get(ProductsService);
    orders = t.get(OrdersService);
    users = t.get(UsersService);
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const newUser = (id = 555001) => users.upsertFromTelegram({ id, first_name: 'Ali', username: 'ali' });
  const order = (userId: number, items: { productId: number; quantity: number }[], extra: Record<string, unknown> = {}) =>
    orders.createOrder({
      userId,
      items,
      emptyBottleCount: 2,
      phone: '+998 90 123 45 67',
      customerName: 'Ali',
      address: { text: 'Chilonzor 9-kvartal, 12-uy' },
      idempotencyKey: randomUUID(),
      ...extra,
    });

  describe('products', () => {
    it('creates and updates a product; validation rejects bad data', async () => {
      const p = await products.create({ name: '  18.9 L   suv ', price: 15000 });
      expect(p).toMatchObject({ name: '18.9 L suv', price: 15000, isActive: true });

      const updated = await products.update(p.id, { price: 17000, description: 'Toza suv' });
      expect(updated).toMatchObject({ price: 17000, description: 'Toza suv' });

      await expect(products.create({ name: '', price: 100 })).rejects.toBeInstanceOf(DomainError);
      await expect(products.update(p.id, { price: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(products.update(p.id, { price: 1.5 })).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('deactivated products disappear from the customer catalog immediately', async () => {
      const p = await products.create({ name: 'Suv', price: 15000 });
      expect((await products.listActive()).map((x) => x.id)).toEqual([p.id]);
      await products.setActive(p.id, false);
      expect(await products.listActive()).toEqual([]);
      expect(await products.listAll()).toHaveLength(1);
    });

    it('deletes only products that no order references', async () => {
      const unused = await products.create({ name: 'Bo‘sh', price: 100 });
      await products.delete(unused.id);
      expect(await products.findById(unused.id)).toBeNull();

      const used = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();
      await order(user.id, [{ productId: used.id, quantity: 1 }]);
      await expect(products.delete(used.id)).rejects.toMatchObject({ code: 'PRODUCT_IN_USE' });
    });
  });

  describe('users', () => {
    it('one user per Telegram account; profile refreshed on change', async () => {
      const a = await newUser();
      const b = await users.upsertFromTelegram({ id: 555001, first_name: 'Ali', username: 'ali' });
      expect(b.id).toBe(a.id);
      const c = await users.upsertFromTelegram({ id: 555001, first_name: 'Alisher', username: 'ali' });
      expect(c.firstName).toBe('Alisher');
      expect(await t.prisma.user.count()).toBe(1);
    });

    it('two Telegram accounts may share a phone (family) without merging users', async () => {
      const p = await products.create({ name: 'Suv', price: 15000 });
      const a = await newUser(1);
      const b = await newUser(2);
      await order(a.id, [{ productId: p.id, quantity: 1 }]);
      await order(b.id, [{ productId: p.id, quantity: 1 }]);
      const all = await t.prisma.user.findMany({ orderBy: { id: 'asc' } });
      expect(all.map((u) => u.phone)).toEqual(['+998901234567', '+998901234567']);
    });
  });

  describe('orders', () => {
    it('backend calculates the total, snapshots prices and numbers orders from #1001', async () => {
      const water = await products.create({ name: '18.9 L suv', price: 15000 });
      const user = await newUser();
      const { order: o, created } = await order(user.id, [{ productId: water.id, quantity: 3 }]);

      expect(created).toBe(true);
      expect(o.orderNumber).toBe(1001);
      expect(o.totalAmount).toBe(45000);
      expect(o.phone).toBe('+998901234567');
      expect(o.items).toEqual([
        expect.objectContaining({ productNameSnapshot: '18.9 L suv', unitPrice: 15000, quantity: 3, subtotal: 45000 }),
      ]);
      const second = await order(user.id, [{ productId: water.id, quantity: 1 }]);
      expect(second.order.orderNumber).toBe(1002);
    });

    it('historical orders keep their price after the product price changes', async () => {
      const water = await products.create({ name: '18.9 L suv', price: 15000 });
      const user = await newUser();
      const { order: old } = await order(user.id, [{ productId: water.id, quantity: 3 }]);

      await products.update(water.id, { price: 17000, name: '18.9 L suv (yangi)' });

      const reloaded = await orders.getForUser(user.id, old.id);
      expect(reloaded.totalAmount).toBe(45000);
      expect(reloaded.items[0]).toMatchObject({ unitPrice: 15000, subtotal: 45000, productNameSnapshot: '18.9 L suv' });

      const { order: fresh } = await order(user.id, [{ productId: water.id, quantity: 3 }]);
      expect(fresh.totalAmount).toBe(51000);
    });

    it('creates the amoCRM outbox rows in the same transaction', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();
      const { order: o } = await order(user.id, [{ productId: water.id, quantity: 1 }]);
      const rows = await t.prisma.amocrmSync.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' } });
      expect(rows.map((r) => [r.entityType, r.status])).toEqual([
        [AmocrmEntityType.CONTACT, SyncStatus.PENDING],
        [AmocrmEntityType.LEAD, SyncStatus.PENDING],
        [AmocrmEntityType.NOTE, SyncStatus.PENDING],
      ]);
    });

    it('saves the phone on the user and remembers the address', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();
      await order(user.id, [{ productId: water.id, quantity: 1 }]);
      await order(user.id, [{ productId: water.id, quantity: 1 }]);
      expect((await users.findById(user.id))!.phone).toBe('+998901234567');
      const addresses = await t.prisma.address.findMany({ where: { userId: user.id } });
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({ address: 'Chilonzor 9-kvartal, 12-uy', isDefault: true });
    });

    it('the same idempotency key never creates two orders', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();
      const key = randomUUID();
      const [a, b] = await Promise.all([
        order(user.id, [{ productId: water.id, quantity: 1 }], { idempotencyKey: key }),
        order(user.id, [{ productId: water.id, quantity: 1 }], { idempotencyKey: key }),
      ]);
      expect(a.order.id).toBe(b.order.id);
      expect([a.created, b.created].sort()).toEqual([false, true]);
      expect(await t.prisma.order.count()).toBe(1);
    });

    it('rejects stale totals, inactive products and invalid input — and stores nothing', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();

      await expect(order(user.id, [{ productId: water.id, quantity: 3 }], { expectedTotal: 30000 })).rejects.toMatchObject({
        code: 'PRICE_CHANGED',
      });
      await products.setActive(water.id, false);
      await expect(order(user.id, [{ productId: water.id, quantity: 1 }])).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
      await products.setActive(water.id, true);
      await expect(order(user.id, [{ productId: water.id, quantity: 1 }], { phone: '123' })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(order(user.id, [{ productId: water.id, quantity: 1 }], { emptyBottleCount: -1 })).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      await expect(order(user.id, [{ productId: water.id, quantity: 51 }])).rejects.toMatchObject({ code: 'QUANTITY_LIMIT' });
      expect(await t.prisma.order.count()).toBe(0);
      expect(await t.prisma.amocrmSync.count()).toBe(0);
    });

    it('previewCart repairs a cart with removed products and lowered limits', async () => {
      const a = await products.create({ name: 'A', price: 1000 });
      const b = await products.create({ name: 'B', price: 2000 });
      await products.setActive(b.id, false);
      const preview = await orders.previewCart([
        { productId: a.id, quantity: 80 },
        { productId: b.id, quantity: 1 },
      ]);
      expect(preview.items).toEqual([{ productId: a.id, quantity: 50 }]);
      expect(preview.removedProductIds).toEqual([b.id]);
      expect(preview.clampedProductIds).toEqual([a.id]);
      expect(preview.total).toBe(50000);
    });

    it('minimum order: enforced by the backend and reported by previewCart', async () => {
      const settings = t.get(SettingsService);
      await settings.set('min_order_quantity', '2');
      const water = await products.create({ name: 'Suv', price: 15000 });
      const user = await newUser();

      await expect(order(user.id, [{ productId: water.id, quantity: 1 }])).rejects.toMatchObject({ code: 'MIN_ORDER' });
      expect((await orders.previewCart([{ productId: water.id, quantity: 1 }])).belowMinimum).toBe(true);
      expect((await orders.previewCart([{ productId: water.id, quantity: 2 }])).belowMinimum).toBe(false);
      expect((await order(user.id, [{ productId: water.id, quantity: 2 }])).order.totalAmount).toBe(30000);

      // The minimum can never exceed the per-item maximum (single-product orders would be impossible).
      await expect(settings.set('min_order_quantity', '51')).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(settings.set('max_item_quantity', '1')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('a customer cannot open another customer’s order', async () => {
      const water = await products.create({ name: 'Suv', price: 15000 });
      const owner = await newUser(1);
      const stranger = await newUser(2);
      const { order: o } = await order(owner.id, [{ productId: water.id, quantity: 1 }]);
      await expect(orders.getForUser(stranger.id, o.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
