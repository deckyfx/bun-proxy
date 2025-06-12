import type { CachedDnsResponse } from '@src/types/dns-unified';

export interface CacheOptions {
  maxSize?: number;
  defaultTtl?: number; // milliseconds
  filePath?: string;
  dbPath?: string;
  cleanupInterval?: number; // milliseconds
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  oldestEntry?: number;
  newestEntry?: number;
}

export abstract class BaseDriver {
  static readonly DRIVER_NAME: string = 'base';
  protected options: CacheOptions;
  protected hits: number = 0;
  protected misses: number = 0;
  protected evictions: number = 0;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSize: 10000,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      ...options
    };
  }

  abstract get(key: string): Promise<CachedDnsResponse | null>;
  abstract set(key: string, value: CachedDnsResponse, ttl?: number): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract has(key: string): Promise<boolean>;
  abstract keys(): Promise<string[]>;
  abstract size(): Promise<number>;

  // Bulk operations
  async getMany(keys: string[]): Promise<(CachedDnsResponse | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  async setMany(entries: Array<{ key: string; value: CachedDnsResponse; ttl?: number }>): Promise<void> {
    await Promise.all(entries.map(({ key, value, ttl }) => this.set(key, value, ttl)));
  }

  async deleteMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map(key => this.delete(key)));
  }

  // Cache management
  abstract cleanup(): Promise<void>;
  abstract evictExpired(): Promise<number>;
  abstract evictLRU(count?: number): Promise<number>;
  
  async stats(): Promise<CacheStats> {
    const size = await this.size();
    const hitRate = this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0;
    
    return {
      size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      evictions: this.evictions
    };
  }

  protected recordHit(): void {
    this.hits++;
  }

  protected recordMiss(): void {
    this.misses++;
  }

  protected recordEviction(): void {
    this.evictions++;
  }

  protected isExpired(entry: CachedDnsResponse): boolean {
    return Date.now() > entry.cache.expiresAt;
  }
}