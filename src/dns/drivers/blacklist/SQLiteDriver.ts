import type { BlacklistEntry, BlacklistOptions, BlacklistStats } from './BaseDriver';
import { BaseDriver } from './BaseDriver';
import { DnsBlacklist } from '@src/models/DnsBlacklist';

export class SQLiteDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'sqlite';

  constructor(options: BlacklistOptions = {}) {
    super(options);
  }

  async init(): Promise<void> {
    // Drizzle handles initialization
  }

  async add(domain: string, reason?: string, category?: string): Promise<void> {
    await DnsBlacklist.add(domain, reason, category);
  }

  async remove(domain: string): Promise<boolean> {
    return DnsBlacklist.remove(domain);
  }

  async contains(domain: string): Promise<boolean> {
    return DnsBlacklist.contains(domain);
  }

  async list(category?: string): Promise<BlacklistEntry[]> {
    return DnsBlacklist.list(category);
  }

  async clear(): Promise<void> {
    await DnsBlacklist.clear();
  }

  async isBlocked(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    if (await DnsBlacklist.contains(normalizedDomain)) {
      return true;
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const allEntries = await DnsBlacklist.list();
      for (const entry of allEntries) {
        if (this.matchesPattern(normalizedDomain, entry.domain)) {
          return true;
        }
      }
    }

    return false;
  }

  async getBlockingRule(domain: string): Promise<BlacklistEntry | null> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactMatch = await DnsBlacklist.getBlockingRule(normalizedDomain);
    if (exactMatch) {
      return exactMatch;
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const allEntries = await DnsBlacklist.list();
      for (const entry of allEntries) {
        if (this.matchesPattern(normalizedDomain, entry.domain)) {
          return entry;
        }
      }
    }

    return null;
  }

  async import(entries: BlacklistEntry[]): Promise<number> {
    return DnsBlacklist.import(entries);
  }

  async export(): Promise<BlacklistEntry[]> {
    return DnsBlacklist.export();
  }

  async stats(): Promise<BlacklistStats> {
    return DnsBlacklist.stats();
  }

  async cleanup(): Promise<void> {
    // Could implement cleanup logic like removing duplicates
  }

  close(): void {
    // No cleanup needed with Drizzle
  }
}