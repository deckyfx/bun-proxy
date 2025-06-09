import { BaseDriver, type WhitelistEntry, type WhitelistOptions, type WhitelistStats } from './BaseDriver';
import { DnsWhitelist } from '@src/models/DnsWhitelist';

export class SQLiteDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'sqlite';

  constructor(options: WhitelistOptions = {}) {
    super(options);
  }

  async init(): Promise<void> {
    // Drizzle handles initialization
  }

  async add(domain: string, reason?: string, category?: string): Promise<void> {
    await DnsWhitelist.add(domain, reason, category);
  }

  async remove(domain: string): Promise<boolean> {
    return DnsWhitelist.remove(domain);
  }

  async contains(domain: string): Promise<boolean> {
    return DnsWhitelist.contains(domain);
  }

  async list(category?: string): Promise<WhitelistEntry[]> {
    return DnsWhitelist.list(category);
  }

  async clear(): Promise<void> {
    await DnsWhitelist.clear();
  }

  async isAllowed(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    if (await DnsWhitelist.contains(normalizedDomain)) {
      return true;
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const allEntries = await DnsWhitelist.list();
      for (const entry of allEntries) {
        if (this.matchesPattern(normalizedDomain, entry.domain)) {
          return true;
        }
      }
    }

    return false;
  }

  async getAllowingRule(domain: string): Promise<WhitelistEntry | null> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactMatch = await DnsWhitelist.getAllowingRule(normalizedDomain);
    if (exactMatch) {
      return exactMatch;
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const allEntries = await DnsWhitelist.list();
      for (const entry of allEntries) {
        if (this.matchesPattern(normalizedDomain, entry.domain)) {
          return entry;
        }
      }
    }

    return null;
  }

  async import(entries: WhitelistEntry[]): Promise<number> {
    return DnsWhitelist.import(entries);
  }

  async export(): Promise<WhitelistEntry[]> {
    return DnsWhitelist.export();
  }

  async stats(): Promise<WhitelistStats> {
    return DnsWhitelist.stats();
  }

  async cleanup(): Promise<void> {
    // Could implement cleanup logic like removing duplicates
  }

  close(): void {
    // No cleanup needed with Drizzle
  }
}