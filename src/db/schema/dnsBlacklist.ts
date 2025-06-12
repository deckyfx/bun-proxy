import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { DnsBlacklistEntry } from "../../types/dns-unified";
import { trySync } from "@src/utils/try";

export const dnsBlacklist = sqliteTable("dns_blacklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(),
  addedAt: integer("added_at").notNull(), // Unix timestamp
  source: text("source").notNull(), // Source of the blacklist entry
  data: text("data").notNull(), // JSON string containing DnsBlacklistEntry
  createdAt: integer("created_at").default(Date.now()),
});

export type DnsBlacklistType = InferSelectModel<typeof dnsBlacklist>;
export type DnsBlacklistInsert = InferInsertModel<typeof dnsBlacklist>;

// Type-safe helpers for JSON data handling
export interface DnsBlacklistRow extends Omit<DnsBlacklistType, 'data'> {
  data: DnsBlacklistEntry;
}

export interface DnsBlacklistInsertData extends Omit<DnsBlacklistInsert, 'data'> {
  data: DnsBlacklistEntry;
}

// Validation and serialization utilities
export function serializeDnsBlacklistData(entry: DnsBlacklistEntry): string {
  const [result, error] = trySync(() => JSON.stringify(entry));
  if (error) {
    throw new Error(`Failed to serialize DNS blacklist entry: ${error.message}`);
  }
  return result;
}

export function deserializeDnsBlacklistData(jsonString: string): DnsBlacklistEntry {
  const [data, parseError] = trySync(() => JSON.parse(jsonString) as DnsBlacklistEntry);
  if (parseError) {
    throw new Error(`Failed to deserialize DNS blacklist data: ${parseError.message}`);
  }
  
  // Runtime validation to ensure data matches DnsBlacklistEntry structure
  if (!validateDnsBlacklistEntry(data)) {
    throw new Error('Invalid DnsBlacklistEntry structure');
  }
  return data;
}

export function validateDnsBlacklistEntry(data: unknown): data is DnsBlacklistEntry {
  if (!data || typeof data !== 'object') return false;
  
  const entry = data as Record<string, unknown>;
  
  // Required properties from DnsBlacklistEntry interface
  if (typeof entry.domain !== 'string' || entry.domain.length === 0) return false;
  if (typeof entry.addedAt !== 'number' || entry.addedAt <= 0) return false;
  
  // Optional properties from DnsBlacklistEntry interface
  if (entry.source !== undefined && typeof entry.source !== 'string') return false;
  if (entry.reason !== undefined && typeof entry.reason !== 'string') return false;
  if (entry.category !== undefined && typeof entry.category !== 'string') return false;
  
  return true;
}

// Domain validation utilities
export function isValidDomain(domain: string): boolean {
  // Basic domain validation - could be enhanced with more robust regex
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim();
}