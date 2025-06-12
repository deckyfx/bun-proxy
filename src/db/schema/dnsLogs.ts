import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { DnsLogEntry } from "../../types/dns-unified";
import { trySync } from "@src/utils/try";

export const dnsLogs = sqliteTable("dns_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull(),
  entryType: text("entry_type").notNull(), // 'request' | 'response' | 'error'
  timestamp: integer("timestamp").notNull(),
  level: text("level").notNull(), // 'info' | 'warn' | 'error'
  domain: text("domain").notNull(),
  data: text("data").notNull(), // JSON string containing DnsLogEntry
  createdAt: integer("created_at").default(Date.now()),
});

export type DnsLogType = InferSelectModel<typeof dnsLogs>;
export type DnsLogInsert = InferInsertModel<typeof dnsLogs>;

// Type-safe helpers for JSON data handling
export interface DnsLogRow extends Omit<DnsLogType, 'data'> {
  data: DnsLogEntry;
}

export interface DnsLogInsertData extends Omit<DnsLogInsert, 'data'> {
  data: DnsLogEntry;
}

// Validation and serialization utilities
export function serializeDnsLogData(logEntry: DnsLogEntry): string {
  const [result, error] = trySync(() => JSON.stringify(logEntry));
  if (error) {
    throw new Error(`Failed to serialize DNS log entry: ${error.message}`);
  }
  return result;
}

export function deserializeDnsLogData(jsonString: string): DnsLogEntry {
  const [data, parseError] = trySync(() => JSON.parse(jsonString) as DnsLogEntry);
  if (parseError) {
    throw new Error(`Failed to deserialize DNS log data: ${parseError.message}`);
  }
  
  // Runtime validation to ensure data matches DnsLogEntry structure
  if (!validateDnsLogEntry(data)) {
    throw new Error('Invalid DnsLogEntry structure');
  }
  return data;
}

export function validateDnsLogEntry(data: unknown): data is DnsLogEntry {
  if (!data || typeof data !== 'object') return false;
  
  const entry = data as Record<string, unknown>;
  
  // Required properties from DnsLogEntry interface
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  if (typeof entry.timestamp !== 'number' || entry.timestamp <= 0) return false;
  if (typeof entry.type !== 'string' || !['request', 'response', 'error'].includes(entry.type)) return false;
  if (typeof entry.level !== 'string' || !['info', 'warn', 'error'].includes(entry.level)) return false;
  
  // Required client object
  if (!entry.client || typeof entry.client !== 'object') return false;
  const client = entry.client as Record<string, unknown>;
  if (typeof client.transport !== 'string' || !['udp', 'tcp', 'doh'].includes(client.transport)) return false;
  
  // Required processing object
  if (!entry.processing || typeof entry.processing !== 'object') return false;
  const processing = entry.processing as Record<string, unknown>;
  if (typeof processing.cached !== 'boolean') return false;
  if (typeof processing.blocked !== 'boolean') return false;
  if (typeof processing.whitelisted !== 'boolean') return false;
  if (typeof processing.success !== 'boolean') return false;
  
  return true;
}