import { eq, desc, sql } from "drizzle-orm";
import { db } from "@db/index";
import { dnsBlacklist, type DnsBlacklistType, type DnsBlacklistInsert } from "@db/schema";
import type { BlacklistEntry, BlacklistStats } from "@src/dns/drivers/blacklist/BaseDriver";

export class DnsBlacklist {
  static async add(domain: string, reason?: string, category?: string): Promise<DnsBlacklistType> {
    const now = Date.now();
    const data = { reason, category };
    
    const insertData: DnsBlacklistInsert = {
      domain: this.normalizeDomain(domain),
      addedAt: now,
      source: "manual",
      data: JSON.stringify(data),
    };

    const result = await db.insert(dnsBlacklist).values(insertData).onConflictDoUpdate({
      target: dnsBlacklist.domain,
      set: {
        addedAt: now,
        source: "manual",
        data: JSON.stringify(data),
      },
    }).returning();

    return result[0]!;
  }

  static async remove(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check if entry exists first
    const exists = await this.contains(normalizedDomain);
    if (!exists) return false;
    
    await db.delete(dnsBlacklist).where(eq(dnsBlacklist.domain, normalizedDomain));
    return true;
  }

  static async contains(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    const result = await db
      .select({ domain: dnsBlacklist.domain })
      .from(dnsBlacklist)
      .where(eq(dnsBlacklist.domain, normalizedDomain))
      .limit(1);
    return result.length > 0;
  }

  static async list(category?: string): Promise<BlacklistEntry[]> {
    const baseQuery = db.select().from(dnsBlacklist);
    const whereQuery = category 
      ? baseQuery.where(sql`json_extract(${dnsBlacklist.data}, '$.category') = ${category}`)
      : baseQuery;
    
    const results = await whereQuery.orderBy(desc(dnsBlacklist.addedAt));
    return results.map(row => {
      const data = JSON.parse(row.data);
      return {
        domain: row.domain,
        reason: data.reason,
        addedAt: new Date(row.addedAt),
        source: row.source as "manual" | "auto" | "import",
        category: data.category,
      };
    });
  }

  static async clear(): Promise<void> {
    await db.delete(dnsBlacklist);
  }

  static async isBlocked(domain: string): Promise<boolean> {
    return this.contains(domain);
  }

  static async getBlockingRule(domain: string): Promise<BlacklistEntry | null> {
    const normalizedDomain = this.normalizeDomain(domain);
    const result = await db
      .select()
      .from(dnsBlacklist)
      .where(eq(dnsBlacklist.domain, normalizedDomain))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    const data = JSON.parse(row.data);
    return {
      domain: row.domain,
      reason: data.reason,
      addedAt: new Date(row.addedAt),
      source: row.source as "manual" | "auto" | "import",
      category: data.category,
    };
  }

  static async import(entries: BlacklistEntry[]): Promise<number> {
    let imported = 0;
    
    for (const entry of entries) {
      const data = { reason: entry.reason, category: entry.category };
      const insertData: DnsBlacklistInsert = {
        domain: this.normalizeDomain(entry.domain),
        addedAt: entry.addedAt.getTime(),
        source: "import" as const,
        data: JSON.stringify(data),
      };

      try {
        await db.insert(dnsBlacklist).values(insertData).onConflictDoNothing();
        imported++;
      } catch (error) {
        // Skip duplicates
      }
    }
    
    return imported;
  }

  static async export(): Promise<BlacklistEntry[]> {
    const results = await db.select().from(dnsBlacklist).orderBy(desc(dnsBlacklist.addedAt));
    return results.map(row => {
      const data = JSON.parse(row.data);
      return {
        domain: row.domain,
        reason: data.reason,
        addedAt: new Date(row.addedAt),
        source: row.source as "manual" | "auto" | "import",
        category: data.category,
      };
    });
  }

  static async stats(): Promise<BlacklistStats> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(dnsBlacklist);
    const totalEntries = countResult[0]?.count || 0;

    // Categories
    const categoriesResult = await db
      .select({
        category: sql<string>`COALESCE(json_extract(${dnsBlacklist.data}, '$.category'), 'uncategorized')`,
        count: sql<number>`count(*)`,
      })
      .from(dnsBlacklist)
      .groupBy(sql`json_extract(${dnsBlacklist.data}, '$.category')`);

    const categories: Record<string, number> = {};
    for (const row of categoriesResult) {
      categories[row.category] = row.count;
    }

    // Sources
    const sourcesResult = await db
      .select({
        source: dnsBlacklist.source,
        count: sql<number>`count(*)`,
      })
      .from(dnsBlacklist)
      .groupBy(dnsBlacklist.source);

    const sources: Record<string, number> = {};
    for (const row of sourcesResult) {
      sources[row.source] = row.count;
    }

    // Recently added (last 24h)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(dnsBlacklist)
      .where(sql`${dnsBlacklist.addedAt} > ${oneDayAgo}`);

    return {
      totalEntries,
      categories,
      sources,
      recentlyAdded: recentResult[0]?.count || 0,
    };
  }

  private static normalizeDomain(domain: string): string {
    return domain.toLowerCase().trim();
  }
}