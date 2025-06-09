import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";
import { db } from "@db/index";
import { dnsLogs, type DnsLogType, type DnsLogInsert } from "@db/schema";
import type { LogEntry, LogFilter } from "@src/dns/drivers/logs/BaseDriver";

export class DnsLog {
  static async create(entry: LogEntry): Promise<DnsLogType> {
    const domain = entry.type === 'server_event' 
      ? 'server_event' 
      : 'query' in entry ? entry.query.domain : 'unknown';
    
    const insertData: DnsLogInsert = {
      requestId: entry.requestId,
      entryType: entry.type,
      timestamp: entry.timestamp.getTime(),
      level: entry.level,
      domain,
      data: JSON.stringify(entry),
    };

    const result = await db.insert(dnsLogs).values(insertData).returning();
    return result[0]!;
  }

  static async findMany(filter?: LogFilter): Promise<LogEntry[]> {
    const conditions = [];

    if (filter) {
      if (filter.level) {
        conditions.push(eq(dnsLogs.level, filter.level));
      }
      if (filter.domain) {
        conditions.push(like(dnsLogs.domain, `%${filter.domain}%`));
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
    
    const orderedQuery = whereQuery.orderBy(desc(dnsLogs.timestamp));
    const finalQuery = filter?.limit 
      ? orderedQuery.limit(filter.limit)
      : orderedQuery;

    const results = await finalQuery;
    return results.map(row => JSON.parse(row.data) as LogEntry);
  }

  static async clear(): Promise<void> {
    await db.delete(dnsLogs);
  }

  static async cleanup(retentionDays: number = 7): Promise<void> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    await db.delete(dnsLogs).where(lte(dnsLogs.timestamp, cutoffTime));
  }

  static async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(dnsLogs);
    const totalEntries = countResult[0]?.count || 0;

    if (totalEntries === 0) {
      return { totalEntries: 0 };
    }

    const rangeResult = await db
      .select({
        oldest: sql<number>`min(${dnsLogs.timestamp})`,
        newest: sql<number>`max(${dnsLogs.timestamp})`,
      })
      .from(dnsLogs);

    const range = rangeResult[0]!;
    return {
      totalEntries,
      oldestEntry: new Date(range.oldest),
      newestEntry: new Date(range.newest),
    };
  }
}