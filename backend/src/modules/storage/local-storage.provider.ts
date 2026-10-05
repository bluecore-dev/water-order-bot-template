import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'path';
import { ResolvedFile, StorageProvider, StoredFile } from './storage.types';

const PREFIX = 'local:';

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(dir: string) {
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async save(data: Buffer, opts: { folder: string; extension: string }): Promise<StoredFile> {
    const folder = opts.folder.replace(/[^a-z0-9_-]/gi, '');
    const ext = opts.extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = `${folder}/${randomUUID()}.${ext}`;
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(join(this.root, key), data, { mode: 0o640 });
    return { url: PREFIX + key, sizeBytes: data.length };
  }

  resolve(url: string): ResolvedFile | null {
    if (!url.startsWith(PREFIX)) return null;
    const path = normalize(join(this.root, url.slice(PREFIX.length)));
    // Reject anything that escapes the storage root (e.g. "local:../../etc/passwd").
    if (!path.startsWith(this.root + sep)) return null;
    return { kind: 'path', path };
  }

  async delete(url: string): Promise<void> {
    const resolved = this.resolve(url);
    if (resolved?.kind === 'path') await unlink(resolved.path).catch(() => undefined);
  }
}
