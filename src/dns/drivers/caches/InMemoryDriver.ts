import { BaseDriver, type CacheEntry, type CacheOptions } from './BaseDriver';

export class InMemoryDriver<T = any> extends BaseDriver<T> {
  static readonly DRIVER_NAME = 'inmemory';
  
  private cache = new Map<string, CacheEntry<T>>();
  private cleanupTimer?: Timer;

  constructor(options: CacheOptions = {}) {
    super(options);
    this.startCleanupTimer();
  }

  async get(key: string): Promise<T | null> {
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

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);
    
    this.recordHit();
    return entry.value;
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl || this.options.defaultTtl!;
    const now = Date.now();
    
    const entry: CacheEntry<T> = {
      value,
      ttl: effectiveTtl,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now
    };

    this.cache.set(key, entry);

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
    
    // Sort by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
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