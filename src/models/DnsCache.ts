import { eq, sql, asc, lte } from "drizzle-orm";
import { db } from "@db/index";
import { dnsCache, type DnsCacheInsert } from "@db/schema";

export class DnsCache {
  static async get<T = any>(key: string): Promise<T | null> {
    const result = await db.select().from(dnsCache).where(eq(dnsCache.key, key)).limit(1);
    
    if (result.length === 0) {
      return null;
    }

    const entry = result[0]!;
    const now = Date.now();

    // Check if expired
    if (entry.createdAt + entry.ttl <= now) {
      await this.delete(key);
      return null;
    }

    // Update access tracking
    await db
      .update(dnsCache)
      .set({
        accessCount: (entry.accessCount || 0) + 1,
        lastAccessed: now,
      })
      .where(eq(dnsCache.key, key));

    return JSON.parse(entry.value) as T;
  }

  static async set<T = any>(key: string, value: T, ttl: number): Promise<void> {
    const now = Date.now();
    const insertData: DnsCacheInsert = {
      key,
      value: JSON.stringify(value),
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

  static async delete(key: string): Promise<boolean> {
    // Check if entry exists first
    const exists = await this.has(key);
    if (!exists) return false;
    
    await db.delete(dnsCache).where(eq(dnsCache.key, key));
    return true;
  }

  static async clear(): Promise<void> {
    await db.delete(dnsCache);
  }

  static async has(key: string): Promise<boolean> {
    const now = Date.now();
    const result = await db
      .select({ key: dnsCache.key })
      .from(dnsCache)
      .where(eq(dnsCache.key, key))
      .limit(1);

    if (result.length === 0) return false;

    const entry = await db.select().from(dnsCache).where(eq(dnsCache.key, key)).limit(1);
    if (entry.length === 0) return false;

    // Check if expired
    if (entry[0]!.createdAt + entry[0]!.ttl <= now) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  static async keys(): Promise<string[]> {
    await this.evictExpired();
    const result = await db.select({ key: dnsCache.key }).from(dnsCache);
    return result.map(row => row.key);
  }

  static async size(): Promise<number> {
    await this.evictExpired();
    const result = await db.select({ count: sql<number>`count(*)` }).from(dnsCache);
    return result[0]?.count || 0;
  }

  static async evictExpired(): Promise<number> {
    const now = Date.now();
    
    // Get count of expired entries first
    const expiredCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(dnsCache)
      .where(lte(sql`${dnsCache.createdAt} + ${dnsCache.ttl}`, now));
    
    const count = expiredCount[0]?.count || 0;
    
    if (count > 0) {
      await db.delete(dnsCache).where(lte(sql`${dnsCache.createdAt} + ${dnsCache.ttl}`, now));
    }
    
    return count;
  }

  static async evictLRU(count: number = 1): Promise<number> {
    const lruKeys = await db
      .select({ key: dnsCache.key })
      .from(dnsCache)
      .orderBy(asc(dnsCache.lastAccessed))
      .limit(count);

    if (lruKeys.length === 0) return 0;

    const keysToDelete = lruKeys.map(row => row.key);
    
    // Delete the entries
    for (const key of keysToDelete) {
      await db.delete(dnsCache).where(eq(dnsCache.key, key));
    }
    
    return keysToDelete.length;
  }
}