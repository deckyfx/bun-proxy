import { BaseDriver, type LogOptions, type LogFilter } from "./BaseDriver";
import type { LogEntry } from "@src/types/dns-unified";
import { DnsLog } from "@src/models/DnsLog";

export class SQLiteDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "sqlite";

  constructor(options: LogOptions = {}) {
    super(options);
  }

  async init(): Promise<void> {
    // Drizzle handles initialization
  }

  async log(entry: LogEntry): Promise<void> {
    // Only log DNS entries to database, skip server events
    if (entry.type !== "server_event") {
      await DnsLog.create(entry);
    }
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    // Convert LogFilter to DnsLogFilter and return as LogEntry[]
    // SQLiteDriver only stores DNS entries, not server events
    const dnsFilter = filter
      ? {
          ...filter,
          startTime: filter.startTime ? new Date(filter.startTime) : undefined,
          endTime: filter.endTime ? new Date(filter.endTime) : undefined,
        }
      : undefined;

    const dnsLogs = await DnsLog.findMany(dnsFilter);
    return dnsLogs as unknown as LogEntry[];
  }

  async clear(): Promise<void> {
    await DnsLog.clear();
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    await DnsLog.cleanup(retentionDays);
  }

  async stats(): Promise<{
    totalEntries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    const fullStats = await DnsLog.stats();
    return {
      totalEntries: fullStats.totalEntries,
      oldestEntry: fullStats.oldestEntry?.getTime(),
      newestEntry: fullStats.newestEntry?.getTime(),
    };
  }

  close(): void {
    // No cleanup needed with Drizzle
  }
}
