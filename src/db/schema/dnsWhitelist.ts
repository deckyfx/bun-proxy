import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const dnsWhitelist = sqliteTable("dns_whitelist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(),
  addedAt: integer("added_at").notNull(),
  source: text("source").notNull(),
  data: text("data").notNull(), // JSON string containing reason, category, etc
  createdAt: integer("created_at").default(Date.now()),
});

export type DnsWhitelistType = InferSelectModel<typeof dnsWhitelist>;
export type DnsWhitelistInsert = InferInsertModel<typeof dnsWhitelist>;