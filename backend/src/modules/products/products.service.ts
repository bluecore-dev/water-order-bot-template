import { Injectable, Logger } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DomainError } from '../../common/errors';

export const PRODUCT_LIMITS = {
  nameMax: 100,
  // Telegram photo captions are limited to 1024 chars; the card adds name/price around it.
  descriptionMax: 800,
  priceMin: 1,
  priceMax: 100_000_000,
  sortOrderMax: 9999,
} as const;

export interface ProductInput {
  name: string;
  price: number;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export type ProductPatch = Partial<ProductInput>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** What customers see. Read on every request so admin changes show up immediately. */
  listActive(): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  listAll(): Promise<Product[]> {
    return this.prisma.product.findMany({ orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }] });
  }

  findById(id: number): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async getById(id: number): Promise<Product> {
    const product = await this.findById(id);
    if (!product) throw new DomainError('NOT_FOUND', `Product ${id} not found`);
    return product;
  }

  async create(input: ProductInput, actor?: string): Promise<Product> {
    const data = this.validate(input, true) as ProductInput;
    const sortOrder = data.sortOrder ?? (await this.nextSortOrder());
    const product = await this.prisma.product.create({
      data: {
        name: data.name,
        price: data.price,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder,
        isActive: data.isActive ?? true,
      },
    });
    this.logger.log({ msg: 'Product created', productId: product.id, price: product.price, actor });
    return product;
  }

  async update(id: number, patch: ProductPatch, actor?: string): Promise<Product> {
    const before = await this.getById(id);
    const data = this.validate(patch, false);
    const product = await this.prisma.product.update({ where: { id }, data });
    this.logger.log({
      msg: 'Product updated',
      productId: id,
      fields: Object.keys(data),
      ...(data.price !== undefined ? { oldPrice: before.price, newPrice: data.price } : {}),
      actor,
    });
    return product;
  }

  setActive(id: number, isActive: boolean, actor?: string): Promise<Product> {
    return this.update(id, { isActive }, actor);
  }

  /** New image invalidates the cached Telegram file_id. */
  async setImage(id: number, imageUrl: string | null, actor?: string): Promise<Product> {
    await this.getById(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { imageUrl, imageFileId: null, imageFileBotId: null },
    });
    this.logger.log({ msg: imageUrl ? 'Product image set' : 'Product image removed', productId: id, actor });
    return product;
  }

  async cacheTelegramFileId(id: number, fileId: string, botId: string): Promise<void> {
    await this.prisma.product.updateMany({ where: { id }, data: { imageFileId: fileId, imageFileBotId: botId } });
  }

  countOrderItems(id: number): Promise<number> {
    return this.prisma.orderItem.count({ where: { productId: id } });
  }

  /**
   * Hard delete is only allowed while no order references the product. Otherwise the admin
   * deactivates it — order history keeps its snapshots either way.
   */
  async delete(id: number, actor?: string): Promise<Product> {
    const product = await this.getById(id);
    const used = await this.countOrderItems(id);
    if (used > 0) throw new DomainError('PRODUCT_IN_USE', `Product ${id} is used in ${used} order items`, { used });
    await this.prisma.product.delete({ where: { id } });
    this.logger.log({ msg: 'Product deleted', productId: id, actor });
    return product;
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.product.aggregate({ _max: { sortOrder: true } });
    return Math.min((last._max.sortOrder ?? 0) + 10, PRODUCT_LIMITS.sortOrderMax);
  }

  private validate(input: ProductPatch, requireAll: boolean): ProductPatch {
    const out: ProductPatch = {};
    const fail = (msg: string) => {
      throw new DomainError('VALIDATION', msg);
    };

    if (input.name !== undefined || requireAll) {
      const name = (input.name ?? '').trim().replace(/\s+/g, ' ');
      if (!name || name.length > PRODUCT_LIMITS.nameMax) fail('Product name must be 1-100 characters');
      out.name = name;
    }
    if (input.price !== undefined || requireAll) {
      const price = input.price as number;
      if (!Number.isInteger(price) || price < PRODUCT_LIMITS.priceMin || price > PRODUCT_LIMITS.priceMax) {
        fail('Price must be a whole number between 1 and 100 000 000');
      }
      out.price = price;
    }
    if (input.description !== undefined) {
      const description = input.description?.trim() || null;
      if (description && description.length > PRODUCT_LIMITS.descriptionMax) fail('Description is too long');
      out.description = description;
    }
    if (input.sortOrder !== undefined) {
      if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > PRODUCT_LIMITS.sortOrderMax) {
        fail('Sort order must be 0-9999');
      }
      out.sortOrder = input.sortOrder;
    }
    if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
    if (input.imageUrl !== undefined) out.imageUrl = input.imageUrl;
    return out;
  }
}
