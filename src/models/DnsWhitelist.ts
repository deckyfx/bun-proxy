import { eq, desc, sql } from "drizzle-orm";
import { db } from "@db/index";
import { dnsWhitelist, type DnsWhitelistType, type DnsWhitelistInsert } from "@db/schema";
import type { WhitelistEntry, WhitelistStats } from "@src/dns/drivers/whitelist/BaseDriver";
import { tryAsync } from "@src/utils/try";

export class DnsWhitelist {
  static async add(domain: string, reason?: string, category?: string): Promise<DnsWhitelistType> {
    const now = Date.now();
    const data = { reason, category };
    
    const insertData: DnsWhitelistInsert = {
      domain: this.normalizeDomain(domain),
      addedAt: now,
      source: "manual",
      data: JSON.stringify(data),
    };

    const result = await db.insert(dnsWhitelist).values(insertData).onConflictDoUpdate({
      target: dnsWhitelist.domain,
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
    
    await db.delete(dnsWhitelist).where(eq(dnsWhitelist.domain, normalizedDomain));
    return true;
  }

  static async contains(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    const result = await db
      .select({ domain: dnsWhitelist.domain })
      .from(dnsWhitelist)
      .where(eq(dnsWhitelist.domain, normalizedDomain))
      .limit(1);
    return result.length > 0;
  }

  static async list(category?: string): Promise<WhitelistEntry[]> {
    const baseQuery = db.select().from(dnsWhitelist);
    const whereQuery = category 
      ? baseQuery.where(sql`json_extract(${dnsWhitelist.data}, '$.category') = ${category}`)
      : baseQuery;
    
    const results = await whereQuery.orderBy(desc(dnsWhitelist.addedAt));
    return results.map(row => {
      const data: WhitelistEntry = JSON.parse(row.data);
      return {
        domain: row.domain,
        reason: data.reason,
        addedAt: row.addedAt,
        source: row.source as "manual" | "auto" | "import",
        category: data.category,
      };
    });
  }

  static async clear(): Promise<void> {
    await db.delete(dnsWhitelist);
  }

  static async isAllowed(domain: string): Promise<boolean> {
    return this.contains(domain);
  }

  static async getAllowingRule(domain: string): Promise<WhitelistEntry | null> {
    const normalizedDomain = this.normalizeDomain(domain);
    const result = await db
      .select()
      .from(dnsWhitelist)
      .where(eq(dnsWhitelist.domain, normalizedDomain))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    const data: WhitelistEntry = JSON.parse(row.data);
    return {
      domain: row.domain,
      reason: data.reason,
      addedAt: row.addedAt,
      source: row.source as "manual" | "auto" | "import",
      category: data.category,
    };
  }

  static async import(entries: WhitelistEntry[]): Promise<number> {
    let imported = 0;
    
    for (const entry of entries) {
      const data = { reason: entry.reason, category: entry.category };
      const insertData: DnsWhitelistInsert = {
        domain: this.normalizeDomain(entry.domain),
        addedAt: entry.addedAt,
        source: "import" as const,
        data: JSON.stringify(data),
      };

      const [, error] = await tryAsync(() => 
        db.insert(dnsWhitelist).values(insertData).onConflictDoNothing()
      );
      if (!error) {
        imported++;
      }
      // Skip duplicates on error
    }
    
    return imported;
  }

  static async export(): Promise<WhitelistEntry[]> {
    const results = await db.select().from(dnsWhitelist).orderBy(desc(dnsWhitelist.addedAt));
    return results.map(row => {
      const data: WhitelistEntry = JSON.parse(row.data);
      return {
        domain: row.domain,
        reason: data.reason,
        addedAt: row.addedAt,
        source: row.source as "manual" | "auto" | "import",
        category: data.category,
      };
    });
  }

  static async stats(): Promise<WhitelistStats> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(dnsWhitelist);
    const totalEntries = countResult[0]?.count || 0;

    // Categories
    const categoriesResult = await db
      .select({
        category: sql<string>`COALESCE(json_extract(${dnsWhitelist.data}, '$.category'), 'uncategorized')`,
        count: sql<number>`count(*)`,
      })
      .from(dnsWhitelist)
      .groupBy(sql`json_extract(${dnsWhitelist.data}, '$.category')`);

    const categories: Record<string, number> = {};
    for (const row of categoriesResult) {
      categories[row.category] = row.count;
    }

    // Sources
    const sourcesResult = await db
      .select({
        source: dnsWhitelist.source,
        count: sql<number>`count(*)`,
      })
      .from(dnsWhitelist)
      .groupBy(dnsWhitelist.source);

    const sources: Record<string, number> = {};
    for (const row of sourcesResult) {
      sources[row.source] = row.count;
    }

    // Recently added (last 24h)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(dnsWhitelist)
      .where(sql`${dnsWhitelist.addedAt} > ${oneDayAgo}`);

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