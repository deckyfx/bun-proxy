import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { CachedDnsResponse } from "../../types/dns-unified";
import { trySync } from "@src/utils/try";

export const dnsCache = sqliteTable("dns_cache", {
  key: text("key").primaryKey(), // Format: "domain:type:class"
  value: text("value").notNull(), // JSON string containing CachedDnsResponse
  ttl: integer("ttl").notNull(), // TTL in seconds
  createdAt: integer("created_at").notNull(), // Unix timestamp
  accessCount: integer("access_count").default(0),
  lastAccessed: integer("last_accessed").notNull(), // Unix timestamp
});

export type DnsCacheType = InferSelectModel<typeof dnsCache>;
export type DnsCacheInsert = InferInsertModel<typeof dnsCache>;

// Type-safe helpers for JSON data handling
export interface DnsCacheRow extends Omit<DnsCacheType, 'value'> {
  value: CachedDnsResponse;
}

export interface DnsCacheInsertData extends Omit<DnsCacheInsert, 'value'> {
  value: CachedDnsResponse;
}

// Validation and serialization utilities
export function serializeDnsCacheData(cachedResponse: CachedDnsResponse): string {
  const [result, error] = trySync(() => JSON.stringify(cachedResponse));
  if (error) {
    throw new Error(`Failed to serialize DNS cache entry: ${error.message}`);
  }
  return result;
}

export function deserializeDnsCacheData(jsonString: string): CachedDnsResponse {
  const [data, parseError] = trySync(() => JSON.parse(jsonString) as CachedDnsResponse);
  if (parseError) {
    throw new Error(`Failed to deserialize DNS cache data: ${parseError.message}`);
  }
  
  // Runtime validation to ensure data matches CachedDnsResponse structure
  if (!validateCachedDnsResponse(data)) {
    throw new Error('Invalid CachedDnsResponse structure');
  }
  return data;
}

export function validateCachedDnsResponse(data: unknown): data is CachedDnsResponse {
  if (!data || typeof data !== 'object') return false;
  
  const cached = data as Record<string, unknown>;
  
  // Required packet object from CachedDnsResponse interface
  if (!cached.packet || typeof cached.packet !== 'object') return false;
  
  // Required cache object from CachedDnsResponse interface
  if (!cached.cache || typeof cached.cache !== 'object') return false;
  const cache = cached.cache as Record<string, unknown>;
  
  if (typeof cache.timestamp !== 'number' || cache.timestamp <= 0) return false;
  if (typeof cache.ttl !== 'number' || cache.ttl < 0) return false;
  if (typeof cache.expiresAt !== 'number' || cache.expiresAt <= 0) return false;
  
  return true;
}

// Cache key utilities
export function createCacheKey(domain: string, type: string, recordClass: string = 'IN'): string {
  return `${domain}:${type}:${recordClass}`;
}

export function parseCacheKey(key: string): { domain: string; type: string; class: string } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  
  return {
    domain: parts[0]!,
    type: parts[1]!,
    class: parts[2]!
  };
}

// Cache expiration utilities
export function isCacheEntryExpired(cacheEntry: DnsCacheRow): boolean {
  return Date.now() > cacheEntry.value.cache.expiresAt;
}

export function getRemainingTtl(cacheEntry: DnsCacheRow): number {
  const remaining = Math.floor((cacheEntry.value.cache.expiresAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}