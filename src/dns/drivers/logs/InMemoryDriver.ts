import { BaseDriver, type LogEntry, type LogOptions, type LogFilter } from './BaseDriver';

export class InMemoryDriver extends BaseDriver {
  private logs: LogEntry[] = [];
  private maxEntries: number;

  constructor(options: LogOptions = {}) {
    super(options);
    this.maxEntries = options.maxEntries || 10000;
  }

  async log(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
    
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.level) {
        filtered = filtered.filter(log => log.level === filter.level);
      }
      if (filter.domain) {
        filtered = filtered.filter(log => log.query.domain.includes(filter.domain!));
      }
      if (filter.provider) {
        filtered = filtered.filter(log => log.provider === filter.provider);
      }
      if (filter.startTime) {
        filtered = filtered.filter(log => log.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filtered = filtered.filter(log => log.timestamp <= filter.endTime!);
      }
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async clear(): Promise<void> {
    this.logs = [];
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    this.logs = this.logs.filter(log => log.timestamp > cutoffDate);
  }

  async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    if (this.logs.length === 0) {
      return { totalEntries: 0 };
    }

    const sorted = this.logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return {
      totalEntries: this.logs.length,
      oldestEntry: sorted[0]?.timestamp,
      newestEntry: sorted[sorted.length - 1]?.timestamp
    };
  }
}