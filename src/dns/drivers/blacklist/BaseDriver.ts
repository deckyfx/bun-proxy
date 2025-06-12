import type { DnsBlacklistEntry } from '@src/types/dns-unified';

// Re-export unified blacklist entry type with extended options
export interface BlacklistEntry extends DnsBlacklistEntry {
  reason?: string;
  category?: string;
}

export interface BlacklistOptions {
  filePath?: string;
  dbPath?: string;
  caseSensitive?: boolean;
  enableWildcards?: boolean;
}

export interface BlacklistStats {
  totalEntries: number;
  categories: Record<string, number>;
  sources: Record<string, number>;
  recentlyAdded: number; // last 24h
}

export abstract class BaseDriver {
  static readonly DRIVER_NAME: string = 'base';
  protected options: BlacklistOptions;

  constructor(options: BlacklistOptions = {}) {
    this.options = {
      caseSensitive: false,
      enableWildcards: true,
      ...options
    };
  }

  abstract add(domain: string, reason?: string, category?: string): Promise<void>;
  abstract remove(domain: string): Promise<boolean>;
  abstract contains(domain: string): Promise<boolean>;
  abstract list(category?: string): Promise<BlacklistEntry[]>;
  abstract clear(): Promise<void>;
  
  // Bulk operations
  async addMany(entries: Array<{ domain: string; reason?: string; category?: string }>): Promise<void> {
    await Promise.all(entries.map(({ domain, reason, category }) => this.add(domain, reason, category)));
  }

  async removeMany(domains: string[]): Promise<boolean[]> {
    return Promise.all(domains.map(domain => this.remove(domain)));
  }

  async containsMany(domains: string[]): Promise<boolean[]> {
    return Promise.all(domains.map(domain => this.contains(domain)));
  }

  // Pattern matching
  abstract isBlocked(domain: string): Promise<boolean>;
  abstract getBlockingRule(domain: string): Promise<BlacklistEntry | null>;
  
  // Management
  abstract import(entries: BlacklistEntry[]): Promise<number>;
  abstract export(): Promise<BlacklistEntry[]>;
  abstract stats(): Promise<BlacklistStats>;
  abstract cleanup(): Promise<void>;

  // Utility methods
  protected normalizeDomain(domain: string): string {
    let normalized = domain.trim().toLowerCase();
    if (normalized.startsWith('*.')) {
      normalized = normalized.substring(2);
    }
    return normalized;
  }

  protected matchesPattern(domain: string, pattern: string): boolean {
    if (!this.options.enableWildcards) {
      return this.options.caseSensitive ? domain === pattern : domain.toLowerCase() === pattern.toLowerCase();
    }

    const normalizedDomain = this.options.caseSensitive ? domain : domain.toLowerCase();
    const normalizedPattern = this.options.caseSensitive ? pattern : pattern.toLowerCase();

    // Exact match
    if (normalizedDomain === normalizedPattern) {
      return true;
    }

    // Wildcard patterns
    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(normalizedDomain);
    }

    // Subdomain matching (implicit wildcard)
    return normalizedDomain.endsWith(`.${normalizedPattern}`);
  }
}