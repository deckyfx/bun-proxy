import { BaseDriver, type CacheOptions } from "./BaseDriver";
import type { CachedDnsResponse } from "@src/types/dns-unified";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { tryParse, tryAsync } from "@src/utils/try";

export class FileDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "file";

  private filePath: string;
  private cache = new Map<string, CachedDnsResponse>();
  private dirty = false;
  private saveTimer?: Timer;

  constructor(options: CacheOptions = {}) {
    super(options);
    this.filePath = options.filePath || "./data/dns-cache.json";
    this.startAutoSave();
  }

  async init(): Promise<void> {
    await this.ensureDirectoryExists();
    
    const [content, readError] = await tryAsync(() => readFile(this.filePath, "utf8"));
    if (readError) {
      if ((readError as any)?.code !== "ENOENT") {
        console.warn("Failed to load cache from file:", readError);
      }
      return;
    }

    const [data, parseError] = tryParse<Record<string, CachedDnsResponse>>(content);
    if (parseError) {
      console.warn("Failed to parse cache file:", parseError);
      return;
    }

    for (const [key, entry] of Object.entries(data)) {
      this.cache.set(key, entry);
    }
  }

  async get(key: string): Promise<CachedDnsResponse | null> {
    if (this.cache.size === 0) {
      await this.init();
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.markDirty();
      this.recordMiss();
      return null;
    }

    this.recordHit();
    return entry;
  }

  async set(
    key: string,
    value: CachedDnsResponse,
    ttl?: number
  ): Promise<void> {
    if (this.cache.size === 0) {
      await this.init();
    }

    // Use the TTL from the CachedDnsResponse or override with provided TTL
    if (ttl !== undefined) {
      // Override the cache TTL if specified
      const now = Date.now();
      value.cache.ttl = ttl;
      value.cache.expiresAt = now + ttl;
    }

    this.cache.set(key, value);
    this.markDirty();

    // Check if we need to evict entries
    if (this.cache.size > this.options.maxSize!) {
      await this.evictLRU(this.cache.size - this.options.maxSize!);
    }
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.markDirty();
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.markDirty();
  }

  async has(key: string): Promise<boolean> {
    if (this.cache.size === 0) {
      await this.init();
    }

    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.markDirty();
      return false;
    }

    return true;
  }

  async keys(): Promise<string[]> {
    if (this.cache.size === 0) {
      await this.init();
    }

    await this.evictExpired();
    return Array.from(this.cache.keys());
  }

  async size(): Promise<number> {
    if (this.cache.size === 0) {
      await this.init();
    }

    await this.evictExpired();
    return this.cache.size;
  }

  async cleanup(): Promise<void> {
    await this.evictExpired();
    await this.save();
  }

  async evictExpired(): Promise<number> {
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        evicted++;
        this.recordEviction();
      }
    }

    if (evicted > 0) {
      this.markDirty();
    }

    return evicted;
  }

  async evictLRU(count: number = 1): Promise<number> {
    if (this.cache.size === 0) return 0;

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.cache.timestamp - b.cache.timestamp
    );

    let evicted = 0;
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key] = entries[i]!;
      this.cache.delete(key);
      evicted++;
      this.recordEviction();
    }

    if (evicted > 0) {
      this.markDirty();
    }

    return evicted;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;

    await this.ensureDirectoryExists();
    const data = Object.fromEntries(this.cache.entries());
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
    this.dirty = false;
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.save().catch(console.error);
    }, 30000); // Save every 30 seconds
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }

  destroy(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    this.save().catch(console.error);
  }
}
