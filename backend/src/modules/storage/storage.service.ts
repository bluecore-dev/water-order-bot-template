import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { LocalStorageProvider } from './local-storage.provider';
import { ResolvedFile, StorageProvider, StoredFile } from './storage.types';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: StorageProvider;

  constructor(config: AppConfigService) {
    const { driver, localDir } = config.values.storage;
    switch (driver) {
      case 'local':
        this.provider = new LocalStorageProvider(localDir);
        break;
      default:
        throw new Error(`Unsupported STORAGE_DRIVER: ${driver as string}`);
    }
  }

  save(data: Buffer, opts: { folder: string; extension: string }): Promise<StoredFile> {
    return this.provider.save(data, opts);
  }

  /** Stored reference → local path or URL. External http(s) URLs are passed through. */
  resolve(url: string): ResolvedFile | null {
    const own = this.provider.resolve(url);
    if (own) return own;
    return /^https:\/\//i.test(url) ? { kind: 'url', url } : null;
  }

  async delete(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      await this.provider.delete(url);
    } catch (err) {
      this.logger.warn({ msg: 'Failed to delete stored file', err });
    }
  }
}
