import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const dnsLogs = sqliteTable("dns_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull(),
  entryType: text("entry_type").notNull(),
  timestamp: integer("timestamp").notNull(),
  level: text("level").notNull(),
  domain: text("domain").notNull(),
  data: text("data").notNull(), // JSON string containing full log entry
  createdAt: integer("created_at").default(Date.now()),
});

export type DnsLogType = InferSelectModel<typeof dnsLogs>;
export type DnsLogInsert = InferInsertModel<typeof dnsLogs>;