import { BaseDriver, type LogEntry, type LogOptions, type LogFilter } from './BaseDriver';
import { DnsLog } from '@src/models/DnsLog';

export class SQLiteDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'sqlite';

  constructor(options: LogOptions = {}) {
    super(options);
  }

  async init(): Promise<void> {
    // Drizzle handles initialization
  }

  async log(entry: LogEntry): Promise<void> {
    await DnsLog.create(entry);
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    return DnsLog.findMany(filter);
  }

  async clear(): Promise<void> {
    await DnsLog.clear();
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    await DnsLog.cleanup(retentionDays);
  }

  async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    return DnsLog.stats();
  }

  close(): void {
    // No cleanup needed with Drizzle
  }
}