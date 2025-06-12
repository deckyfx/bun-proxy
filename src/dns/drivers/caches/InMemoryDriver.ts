import { BaseDriver, type CacheOptions } from "./BaseDriver";
import type { CachedDnsResponse } from "@src/types/dns-unified";

export class InMemoryDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "inmemory";

  private cache = new Map<string, CachedDnsResponse>();
  private cleanupTimer?: Timer;

  constructor(options: CacheOptions = {}) {
    super(options);
    this.startCleanupTimer();
  }

  async get(key: string): Promise<CachedDnsResponse | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
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
    // Use the TTL from the CachedDnsResponse or override with provided TTL
    if (ttl !== undefined) {
      // Override the cache TTL if specified
      const now = Date.now();
      value.cache.ttl = ttl;
      value.cache.expiresAt = now + ttl;
    }

    this.cache.set(key, value);

    // Check if we need to evict entries
    if (this.cache.size > this.options.maxSize!) {
      await this.evictLRU(this.cache.size - this.options.maxSize!);
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async keys(): Promise<string[]> {
    await this.evictExpired();
    return Array.from(this.cache.keys());
  }

  async size(): Promise<number> {
    await this.evictExpired();
    return this.cache.size;
  }

  async cleanup(): Promise<void> {
    await this.evictExpired();
  }

  async evictExpired(): Promise<number> {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        evicted++;
        this.recordEviction();
      }
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

    return evicted;
  }

  private startCleanupTimer(): void {
    if (this.options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired().catch(console.error);
      }, this.options.cleanupInterval);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
