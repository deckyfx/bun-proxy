import { eq, sql, asc, lte, desc } from "drizzle-orm";
import { db } from "@db/index";
import { 
  dnsCache, 
  type DnsCacheInsert,
  type DnsCacheRow,
  type DnsCacheInsertData,
  serializeDnsCacheData,
  deserializeDnsCacheData,
  validateCachedDnsResponse,
  createCacheKey,
  parseCacheKey,
  isCacheEntryExpired,
  getRemainingTtl
} from "@db/schema";
import type { CachedDnsResponse, Question, RecordType, RecordClass } from "@src/types/dns-unified";
import { trySync } from "@src/utils/try";

export class DnsCache {
  /**
   * Get a cached DNS response by key
   */
  static async get(key: string): Promise<CachedDnsResponse | null> {
    const result = await db.select().from(dnsCache).where(eq(dnsCache.key, key)).limit(1);
    
    if (result.length === 0) {
      return null;
    }

    const rawEntry = result[0]!;
    const now = Date.now();

    // Check if expired using TTL
    if (rawEntry.createdAt + (rawEntry.ttl * 1000) <= now) {
      await this.delete(key);
      return null;
    }

    // Deserialize and validate
    const [cachedResponse, deserializeError] = trySync(() => deserializeDnsCacheData(rawEntry.value));
    if (deserializeError) {
      console.warn(`Failed to deserialize cache entry ${key}:`, deserializeError);
      await this.delete(key);
      return null;
    }

    // Double-check expiration using cached response metadata
    const entry: DnsCacheRow = {
      ...rawEntry,
      value: cachedResponse
    };

    if (isCacheEntryExpired(entry)) {
      await this.delete(key);
      return null;
    }

    // Update access tracking
    await db
      .update(dnsCache)
      .set({
        accessCount: (rawEntry.accessCount || 0) + 1,
        lastAccessed: now,
      })
      .where(eq(dnsCache.key, key));

    return cachedResponse;
  }

  /**
   * Set a cached DNS response
   */
  static async set(key: string, cachedResponse: CachedDnsResponse, ttlSeconds?: number): Promise<void> {
    // Validate the cached response
    if (!validateCachedDnsResponse(cachedResponse)) {
      throw new Error('Invalid cached DNS response structure');
    }

    const now = Date.now();
    const ttl = ttlSeconds || cachedResponse.cache.ttl;
    
    const insertData: DnsCacheInsert = {
      key,
      value: serializeDnsCacheData(cachedResponse),
      ttl,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
    };

    await db.insert(dnsCache).values(insertData).onConflictDoUpdate({
      target: dnsCache.key,
      set: {
        value: insertData.value,
        ttl: insertData.ttl,
        createdAt: insertData.createdAt,
        accessCount: 0,
        lastAccessed: insertData.lastAccessed,
      },
    });
  }

  /**
   * Set a cached DNS response by domain and type (convenience method)
   */
  static async setByDomainType(
    domain: string, 
    type: RecordType, 
    cachedResponse: CachedDnsResponse,
    recordClass: RecordClass = 'IN'
  ): Promise<void> {
    const key = createCacheKey(domain, type, recordClass);
    await this.set(key, cachedResponse);
  }

  /**
   * Get a cached DNS response by domain and type (convenience method)
   */
  static async getByDomainType(
    domain: string, 
    type: RecordType, 
    recordClass: RecordClass = 'IN'
  ): Promise<CachedDnsResponse | null> {
    const key = createCacheKey(domain, type, recordClass);
    return await this.get(key);
  }

  /**
   * Delete a cache entry by key
   */
  static async delete(key: string): Promise<boolean> {
    const result = await db.delete(dnsCache).where(eq(dnsCache.key, key));
    // Check if entry was actually deleted by checking if it still exists
    const exists = await db.select({ key: dnsCache.key }).from(dnsCache).where(eq(dnsCache.key, key)).limit(1);
    return exists.length === 0;
  }

  /**
   * Delete a cache entry by domain and type (convenience method)
   */
  static async deleteByDomainType(
    domain: string, 
    type: RecordType, 
    recordClass: RecordClass = 'IN'
  ): Promise<boolean> {
    const key = createCacheKey(domain, type, recordClass);
    return await this.delete(key);
  }

  /**
   * Clear all cache entries
   */
  static async clear(): Promise<void> {
    await db.delete(dnsCache);
  }

  /**
   * Check if a cache entry exists and is not expired
   */
  static async has(key: string): Promise<boolean> {
    const result = await db
      .select()
      .from(dnsCache)
      .where(eq(dnsCache.key, key))
      .limit(1);

    if (result.length === 0) return false;

    const rawEntry = result[0]!;
    const now = Date.now();

    // Check if expired using TTL
    if (rawEntry.createdAt + (rawEntry.ttl * 1000) <= now) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get all cache keys (excluding expired entries)
   */
  static async keys(): Promise<string[]> {
    await this.evictExpired();
    const result = await db.select({ key: dnsCache.key }).from(dnsCache);
    return result.map(row => row.key);
  }

  /**
   * Get the number of cache entries (excluding expired entries)
   */
  static async size(): Promise<number> {
    await this.evictExpired();
    const result = await db.select({ count: sql<number>`count(*)` }).from(dnsCache);
    return result[0]?.count || 0;
  }

  /**
   * Get cache statistics
   */
  static async stats(): Promise<{
    totalEntries: number;
    activeEntries: number;
    expiredEntries: number;
    memoryUsage: number;
    hitRate?: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    avgTtl: number;
  }> {
    const now = Date.now();
    
    // Get total count
    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(dnsCache);
    const totalEntries = totalResult[0]?.count || 0;

    if (totalEntries === 0) {
      return {
        totalEntries: 0,
        activeEntries: 0,
        expiredEntries: 0,
        memoryUsage: 0,
        avgTtl: 0
      };
    }

    // Get expired count
    const expiredResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(dnsCache)
      .where(lte(sql`${dnsCache.createdAt} + (${dnsCache.ttl} * 1000)`, now));
    const expiredEntries = expiredResult[0]?.count || 0;
    const activeEntries = totalEntries - expiredEntries;

    // Get time range and averages
    const statsResult = await db
      .select({
        oldest: sql<number>`min(${dnsCache.createdAt})`,
        newest: sql<number>`max(${dnsCache.createdAt})`,
        avgTtl: sql<number>`avg(${dnsCache.ttl})`,
        totalSize: sql<number>`sum(length(${dnsCache.value}))`
      })
      .from(dnsCache);

    const stats = statsResult[0]!;

    return {
      totalEntries,
      activeEntries,
      expiredEntries,
      memoryUsage: stats.totalSize || 0,
      oldestEntry: stats.oldest ? new Date(stats.oldest) : undefined,
      newestEntry: stats.newest ? new Date(stats.newest) : undefined,
      avgTtl: Math.round(stats.avgTtl || 0)
    };
  }

  /**
   * Remove expired cache entries
   */
  static async evictExpired(): Promise<number> {
    const now = Date.now();
    
    // Get count of expired entries first
    const expiredCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(dnsCache)
      .where(lte(sql`${dnsCache.createdAt} + (${dnsCache.ttl} * 1000)`, now));
    
    const count = expiredCount[0]?.count || 0;
    
    if (count > 0) {
      await db.delete(dnsCache).where(lte(sql`${dnsCache.createdAt} + (${dnsCache.ttl} * 1000)`, now));
    }
    
    return count;
  }

  /**
   * Remove least recently used cache entries
   */
  static async evictLRU(count: number = 1): Promise<number> {
    const lruKeys = await db
      .select({ key: dnsCache.key })
      .from(dnsCache)
      .orderBy(asc(dnsCache.lastAccessed))
      .limit(count);

    if (lruKeys.length === 0) return 0;

    const keysToDelete = lruKeys.map(row => row.key);
    
    // Delete the entries in batch
    for (const key of keysToDelete) {
      await db.delete(dnsCache).where(eq(dnsCache.key, key));
    }
    
    return keysToDelete.length;
  }

  /**
   * Find cache entries by domain pattern
   */
  static async findByDomain(domainPattern: string, limit: number = 100): Promise<DnsCacheRow[]> {
    await this.evictExpired();
    
    const results = await db.select().from(dnsCache)
      .where(sql`${dnsCache.key} LIKE ${'%' + domainPattern + '%'}`)
      .orderBy(desc(dnsCache.lastAccessed))
      .limit(limit);
    
    return results.map(rawRow => ({
      ...rawRow,
      value: deserializeDnsCacheData(rawRow.value)
    }));
  }

  /**
   * Get cache entries with their remaining TTL
   */
  static async getAllWithTtl(): Promise<Array<DnsCacheRow & { remainingTtl: number }>> {
    await this.evictExpired();
    
    const results = await db.select().from(dnsCache)
      .orderBy(desc(dnsCache.lastAccessed));
    
    return results.map(rawRow => {
      const typedRow: DnsCacheRow = {
        ...rawRow,
        value: deserializeDnsCacheData(rawRow.value)
      };
      
      return {
        ...typedRow,
        remainingTtl: getRemainingTtl(typedRow)
      };
    });
  }
}