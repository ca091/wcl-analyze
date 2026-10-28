import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cached } from './types.ts';

export class Cache {
  private directory: string;
  private now: () => number;
  private warn: (message: string) => void;
  constructor(directory: string, options: { now?: () => number; warn?: (message: string) => void } = {}) {
    this.directory = directory;
    this.now = options.now ?? Date.now;
    this.warn = options.warn ?? (() => {});
  }

  async load<T>(key: string, ttlMs: number, bypass: boolean, loader: () => Promise<T>,
    validate: (value: unknown) => T): Promise<Cached<T>> {
    const file = join(this.directory, createHash('sha256').update(key).digest('hex') + '.json');
    if (!bypass) {
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        const at = Date.parse(saved.fetchedAt);
        if (saved.version === 1 && Number.isFinite(at) && this.now() >= at && this.now() - at < ttlMs) {
          return { value: validate(saved.value), info: { hit: true, fetchedAt: saved.fetchedAt } };
        }
      } catch { /* Corrupt, incompatible or missing cache: fetch again. */ }
    }
    const value = validate(await loader());
    const fetchedAt = new Date(this.now()).toISOString();
    if (!bypass) {
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(temp, JSON.stringify({ version: 1, fetchedAt, value }), { mode: 0o600 });
        await rename(temp, file);
      } catch {
        await rm(temp, { force: true }).catch(() => {});
        this.warn('无法写入本地缓存，本次数据仍可使用。');
      }
    }
    return { value, info: { hit: false, fetchedAt } };
  }
}
