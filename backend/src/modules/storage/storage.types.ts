/**
 * Storage abstraction for product images. `Product.imageUrl` holds a reference produced by a
 * provider: `local:<key>` for local disk, or a plain https URL for remote providers
 * (S3-compatible, Cloudinary…) added later behind the same interface.
 */
export interface StoredFile {
  /** Value to persist in Product.imageUrl. */
  url: string;
  sizeBytes: number;
}

export type ResolvedFile = { kind: 'path'; path: string } | { kind: 'url'; url: string };

export interface StorageProvider {
  readonly name: string;
  save(data: Buffer, opts: { folder: string; extension: string }): Promise<StoredFile>;
  /** How to read a stored reference: a local path or a public URL. null when it is not ours. */
  resolve(url: string): ResolvedFile | null;
  delete(url: string): Promise<void>;
}

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
