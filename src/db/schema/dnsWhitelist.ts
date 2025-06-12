import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { DnsWhitelistEntry } from "../../types/dns-unified";
import { trySync } from "@src/utils/try";

export const dnsWhitelist = sqliteTable("dns_whitelist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(),
  addedAt: integer("added_at").notNull(), // Unix timestamp
  source: text("source").notNull(), // Source of the whitelist entry
  data: text("data").notNull(), // JSON string containing DnsWhitelistEntry
  createdAt: integer("created_at").default(Date.now()),
});

export type DnsWhitelistType = InferSelectModel<typeof dnsWhitelist>;
export type DnsWhitelistInsert = InferInsertModel<typeof dnsWhitelist>;

// Type-safe helpers for JSON data handling
export interface DnsWhitelistRow extends Omit<DnsWhitelistType, 'data'> {
  data: DnsWhitelistEntry;
}

export interface DnsWhitelistInsertData extends Omit<DnsWhitelistInsert, 'data'> {
  data: DnsWhitelistEntry;
}

// Validation and serialization utilities
export function serializeDnsWhitelistData(entry: DnsWhitelistEntry): string {
  const [result, error] = trySync(() => JSON.stringify(entry));
  if (error) {
    throw new Error(`Failed to serialize DNS whitelist entry: ${error.message}`);
  }
  return result;
}

export function deserializeDnsWhitelistData(jsonString: string): DnsWhitelistEntry {
  const [data, parseError] = trySync(() => JSON.parse(jsonString) as DnsWhitelistEntry);
  if (parseError) {
    throw new Error(`Failed to deserialize DNS whitelist data: ${parseError.message}`);
  }
  
  // Runtime validation to ensure data matches DnsWhitelistEntry structure
  if (!validateDnsWhitelistEntry(data)) {
    throw new Error('Invalid DnsWhitelistEntry structure');
  }
  return data;
}

export function validateDnsWhitelistEntry(data: unknown): data is DnsWhitelistEntry {
  if (!data || typeof data !== 'object') return false;
  
  const entry = data as Record<string, unknown>;
  
  // Required properties from DnsWhitelistEntry interface
  if (typeof entry.domain !== 'string' || entry.domain.length === 0) return false;
  if (typeof entry.addedAt !== 'number' || entry.addedAt <= 0) return false;
  
  // Optional properties from DnsWhitelistEntry interface
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