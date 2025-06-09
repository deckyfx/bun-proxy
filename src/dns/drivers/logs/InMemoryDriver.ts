import { BaseDriver, type LogEntry, type LogOptions, type LogFilter } from './BaseDriver';

export class InMemoryDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'inmemory';
  
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
      if (filter.type) {
        filtered = filtered.filter(log => log.type === filter.type);
      }
      if (filter.eventType) {
        filtered = filtered.filter(log => log.type === 'server_event' && log.eventType === filter.eventType);
      }
      if (filter.level) {
        filtered = filtered.filter(log => log.level === filter.level);
      }
      if (filter.domain) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && log.query.domain.includes(filter.domain!));
      }
      if (filter.provider) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && 'provider' in log && log.provider === filter.provider);
      }
      if (filter.success !== undefined) {
        filtered = filtered.filter(log => log.type === 'response' && log.success === filter.success);
      }
      if (filter.cached !== undefined) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && log.cached === filter.cached);
      }
      if (filter.blocked !== undefined) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && log.blocked === filter.blocked);
      }
      if (filter.whitelisted !== undefined) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && log.whitelisted === filter.whitelisted);
      }
      if (filter.clientIP) {
        filtered = filtered.filter(log => (log.type === 'request' || log.type === 'response') && log.query.clientIP === filter.clientIP);
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