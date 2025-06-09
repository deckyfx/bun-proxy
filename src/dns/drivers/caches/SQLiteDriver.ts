import { BaseDriver, type CacheOptions } from './BaseDriver';
import { DnsCache } from '@src/models/DnsCache';

export class SQLiteDriver<T = any> extends BaseDriver<T> {
  static readonly DRIVER_NAME = 'sqlite';
  
  private cleanupTimer?: Timer;

  constructor(options: CacheOptions = {}) {
    super(options);
    this.startCleanupTimer();
  }

  async init(): Promise<void> {
    // Drizzle handles initialization
  }

  async get(key: string): Promise<T | null> {
    const result = await DnsCache.get<T>(key);
    if (result) {
      this.recordHit();
      return result;
    } else {
      this.recordMiss();
      return null;
    }
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl || this.options.defaultTtl!;
    await DnsCache.set(key, value, effectiveTtl);

    // Check if we need to evict entries
    const sizeResult = await this.size();
    if (sizeResult > this.options.maxSize!) {
      await this.evictLRU(sizeResult - this.options.maxSize!);
    }
  }

  async delete(key: string): Promise<boolean> {
    return DnsCache.delete(key);
  }

  async clear(): Promise<void> {
    await DnsCache.clear();
  }

  async has(key: string): Promise<boolean> {
    return DnsCache.has(key);
  }

  async keys(): Promise<string[]> {
    return DnsCache.keys();
  }

  async size(): Promise<number> {
    return DnsCache.size();
  }

  async cleanup(): Promise<void> {
    await this.evictExpired();
  }

  async evictExpired(): Promise<number> {
    const evicted = await DnsCache.evictExpired();
    for (let i = 0; i < evicted; i++) {
      this.recordEviction();
    }
    return evicted;
  }

  async evictLRU(count: number = 1): Promise<number> {
    const evicted = await DnsCache.evictLRU(count);
    for (let i = 0; i < evicted; i++) {
      this.recordEviction();
    }
    return evicted;
  }

  private startCleanupTimer(): void {
    if (this.options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired().catch(console.error);
      }, this.options.cleanupInterval);
    }
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  destroy(): void {
    this.close();
  }
}