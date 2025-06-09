import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const dnsCache = sqliteTable("dns_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON string
  ttl: integer("ttl").notNull(),
  createdAt: integer("created_at").notNull(),
  accessCount: integer("access_count").default(0),
  lastAccessed: integer("last_accessed").notNull(),
});

export type DnsCacheType = InferSelectModel<typeof dnsCache>;
export type DnsCacheInsert = InferInsertModel<typeof dnsCache>;