import { BaseDriver, type LogOptions, type LogFilter } from "./BaseDriver";
import type { LogEntry } from "@src/types/dns-unified";

export class InMemoryDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "inmemory";

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
        filtered = filtered.filter((log) => log.type === filter.type);
      }
      if (filter.level) {
        filtered = filtered.filter((log) => log.level === filter.level);
      }
      if (filter.domain && filter.domain.length > 0) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.query?.name &&
            log.query.name.includes(filter.domain!)
        );
      }
      if (filter.provider) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.provider === filter.provider
        );
      }
      if (filter.queryType) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" && log.query?.type === filter.queryType
        );
      }
      if (filter.transport) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.client.transport === filter.transport
        );
      }
      if (filter.success !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.success === filter.success
        );
      }
      if (filter.cached !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.cached === filter.cached
        );
      }
      if (filter.blocked !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.blocked === filter.blocked
        );
      }
      if (filter.whitelisted !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.whitelisted === filter.whitelisted
        );
      }
      if (filter.clientAddress) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.client.address === filter.clientAddress
        );
      }
      if (filter.clientPort) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" && log.client.port === filter.clientPort
        );
      }
      if (filter.hasError !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            Boolean(log.processing.error) === filter.hasError
        );
      }
      if (filter.startTime) {
        filtered = filtered.filter((log) => log.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filtered = filtered.filter((log) => log.timestamp <= filter.endTime!);
      }
      if (filter.id) {
        filtered = filtered.filter((log) => log.id === filter.id);
      }
      if (filter.minResponseTime !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.responseTime !== undefined &&
            log.processing.responseTime >= filter.minResponseTime!
        );
      }
      if (filter.maxResponseTime !== undefined) {
        filtered = filtered.filter(
          (log) =>
            log.type !== "server_event" &&
            log.processing.responseTime !== undefined &&
            log.processing.responseTime <= filter.maxResponseTime!
        );
      }
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
      if (filter.offset) {
        filtered = filtered.slice(filter.offset);
      }
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  async clear(): Promise<void> {
    this.logs = [];
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    this.logs = this.logs.filter((log) => log.timestamp > cutoffTimestamp);
  }

  async stats(): Promise<{
    totalEntries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    if (this.logs.length === 0) {
      return { totalEntries: 0 };
    }

    const sorted = this.logs.sort((a, b) => a.timestamp - b.timestamp);
    return {
      totalEntries: this.logs.length,
      oldestEntry: sorted[0]?.timestamp,
      newestEntry: sorted[sorted.length - 1]?.timestamp,
    };
  }
}
