import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";
import { db } from "@db/index";
import { 
  dnsLogs, 
  type DnsLogType, 
  type DnsLogInsert,
  type DnsLogRow,
  type DnsLogInsertData,
  serializeDnsLogData,
  deserializeDnsLogData,
  validateDnsLogEntry
} from "@db/schema";
import type { DnsLogEntry } from "@src/types/dns-unified";

// Filter interface for querying logs
export interface DnsLogFilter {
  level?: 'info' | 'warn' | 'error';
  type?: 'request' | 'response' | 'error';
  domain?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  requestId?: string;
  provider?: string;
  cached?: boolean;
  blocked?: boolean;
  success?: boolean;
}

export class DnsLog {
  /**
   * Create a new DNS log entry
   */
  static async create(entry: DnsLogEntry): Promise<DnsLogRow> {
    // Validate the entry
    if (!validateDnsLogEntry(entry)) {
      throw new Error('Invalid DNS log entry structure');
    }

    const domain = entry.query?.name || 'unknown';
    
    const insertData: DnsLogInsert = {
      requestId: entry.id,
      entryType: entry.type,
      timestamp: entry.timestamp,
      level: entry.level,
      domain,
      data: serializeDnsLogData(entry),
    };

    const result = await db.insert(dnsLogs).values(insertData).returning();
    const rawRow = result[0]!;
    
    // Return typed row with deserialized data
    return {
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    };
  }

  /**
   * Create multiple DNS log entries in a batch
   */
  static async createMany(entries: DnsLogEntry[]): Promise<DnsLogRow[]> {
    if (entries.length === 0) return [];

    // Validate all entries first
    for (const entry of entries) {
      if (!validateDnsLogEntry(entry)) {
        throw new Error('Invalid DNS log entry structure in batch');
      }
    }

    const insertData: DnsLogInsert[] = entries.map(entry => ({
      requestId: entry.id,
      entryType: entry.type,
      timestamp: entry.timestamp,
      level: entry.level,
      domain: entry.query?.name || 'unknown',
      data: serializeDnsLogData(entry),
    }));

    const results = await db.insert(dnsLogs).values(insertData).returning();
    
    return results.map(rawRow => ({
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    }));
  }

  /**
   * Find DNS log entries with optional filtering
   */
  static async findMany(filter?: DnsLogFilter): Promise<DnsLogRow[]> {
    const conditions = [];

    if (filter) {
      if (filter.level) {
        conditions.push(eq(dnsLogs.level, filter.level));
      }
      if (filter.type) {
        conditions.push(eq(dnsLogs.entryType, filter.type));
      }
      if (filter.domain) {
        conditions.push(like(dnsLogs.domain, `%${filter.domain}%`));
      }
      if (filter.requestId) {
        conditions.push(eq(dnsLogs.requestId, filter.requestId));
      }
      if (filter.startTime) {
        conditions.push(gte(dnsLogs.timestamp, filter.startTime.getTime()));
      }
      if (filter.endTime) {
        conditions.push(lte(dnsLogs.timestamp, filter.endTime.getTime()));
      }
    }

    const baseQuery = db.select().from(dnsLogs);
    const whereQuery = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    let orderedQuery = whereQuery.orderBy(desc(dnsLogs.timestamp));
    
    if (filter?.offset) {
      orderedQuery = orderedQuery.offset(filter.offset) as any;
    }
    
    const finalQuery = filter?.limit 
      ? orderedQuery.limit(filter.limit)
      : orderedQuery;

    const results = await finalQuery;
    
    // Convert raw rows to typed rows with deserialized data
    return results.map(rawRow => ({
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    }));
  }

  /**
   * Find a specific DNS log entry by ID
   */
  static async findById(id: number): Promise<DnsLogRow | null> {
    const results = await db.select().from(dnsLogs).where(eq(dnsLogs.id, id));
    const rawRow = results[0];
    
    if (!rawRow) return null;
    
    return {
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    };
  }

  /**
   * Find DNS log entries by request ID
   */
  static async findByRequestId(requestId: string): Promise<DnsLogRow[]> {
    const results = await db.select().from(dnsLogs)
      .where(eq(dnsLogs.requestId, requestId))
      .orderBy(desc(dnsLogs.timestamp));
    
    return results.map(rawRow => ({
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    }));
  }

  /**
   * Clear all DNS log entries
   */
  static async clear(): Promise<void> {
    await db.delete(dnsLogs);
  }

  /**
   * Clean up old DNS log entries based on retention policy
   */
  static async cleanup(retentionDays: number = 7): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    // Get count before deletion
    const countBefore = await db.select({ count: sql<number>`count(*)` }).from(dnsLogs).where(lte(dnsLogs.timestamp, cutoffTime));
    const deletedCount = countBefore[0]?.count || 0;
    // Perform deletion
    await db.delete(dnsLogs).where(lte(dnsLogs.timestamp, cutoffTime));
    return deletedCount;
  }

  /**
   * Get statistics about DNS log entries
   */
  static async stats(): Promise<{
    totalEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    byLevel: Record<string, number>;
    byType: Record<string, number>;
    lastHour: number;
    last24Hours: number;
  }> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(dnsLogs);
    const totalEntries = countResult[0]?.count || 0;

    if (totalEntries === 0) {
      return {
        totalEntries: 0,
        byLevel: {},
        byType: {},
        lastHour: 0,
        last24Hours: 0
      };
    }

    // Get time range
    const rangeResult = await db
      .select({
        oldest: sql<number>`min(${dnsLogs.timestamp})`,
        newest: sql<number>`max(${dnsLogs.timestamp})`,
      })
      .from(dnsLogs);

    // Get counts by level
    const levelResult = await db
      .select({
        level: dnsLogs.level,
        count: sql<number>`count(*)`
      })
      .from(dnsLogs)
      .groupBy(dnsLogs.level);

    // Get counts by type
    const typeResult = await db
      .select({
        type: dnsLogs.entryType,
        count: sql<number>`count(*)`
      })
      .from(dnsLogs)
      .groupBy(dnsLogs.entryType);

    // Get recent activity
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentResult = await db
      .select({
        lastHour: sql<number>`count(*) filter (where ${dnsLogs.timestamp} >= ${oneHourAgo})`,
        last24Hours: sql<number>`count(*) filter (where ${dnsLogs.timestamp} >= ${oneDayAgo})`
      })
      .from(dnsLogs);

    const range = rangeResult[0]!;
    const recent = recentResult[0]!;

    return {
      totalEntries,
      oldestEntry: new Date(range.oldest),
      newestEntry: new Date(range.newest),
      byLevel: Object.fromEntries(levelResult.map(r => [r.level, r.count])),
      byType: Object.fromEntries(typeResult.map(r => [r.type, r.count])),
      lastHour: recent.lastHour || 0,
      last24Hours: recent.last24Hours || 0
    };
  }

  /**
   * Delete a specific DNS log entry
   */
  static async deleteById(id: number): Promise<boolean> {
    const result = await db.delete(dnsLogs).where(eq(dnsLogs.id, id));
    // Check if entry was actually deleted by checking if it still exists
    const exists = await db.select({ id: dnsLogs.id }).from(dnsLogs).where(eq(dnsLogs.id, id)).limit(1);
    return exists.length === 0;
  }

  /**
   * Search DNS logs by domain pattern
   */
  static async searchByDomain(domainPattern: string, limit: number = 100): Promise<DnsLogRow[]> {
    const results = await db.select().from(dnsLogs)
      .where(like(dnsLogs.domain, `%${domainPattern}%`))
      .orderBy(desc(dnsLogs.timestamp))
      .limit(limit);
    
    return results.map(rawRow => ({
      ...rawRow,
      data: deserializeDnsLogData(rawRow.data)
    }));
  }
}