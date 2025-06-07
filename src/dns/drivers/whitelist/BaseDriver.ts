export interface WhitelistEntry {
  domain: string;
  reason?: string;
  addedAt: Date;
  source: 'manual' | 'auto' | 'import';
  category?: string;
}

export interface WhitelistOptions {
  filePath?: string;
  dbPath?: string;
  caseSensitive?: boolean;
  enableWildcards?: boolean;
}

export interface WhitelistStats {
  totalEntries: number;
  categories: Record<string, number>;
  sources: Record<string, number>;
  recentlyAdded: number; // last 24h
}

export abstract class BaseDriver {
  protected options: WhitelistOptions;

  constructor(options: WhitelistOptions = {}) {
    this.options = {
      caseSensitive: false,
      enableWildcards: true,
      ...options
    };
  }

  abstract add(domain: string, reason?: string, category?: string): Promise<void>;
  abstract remove(domain: string): Promise<boolean>;
  abstract contains(domain: string): Promise<boolean>;
  abstract list(category?: string): Promise<WhitelistEntry[]>;
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
  abstract isAllowed(domain: string): Promise<boolean>;
  abstract getAllowingRule(domain: string): Promise<WhitelistEntry | null>;
  
  // Management
  abstract import(entries: WhitelistEntry[]): Promise<number>;
  abstract export(): Promise<WhitelistEntry[]>;
  abstract stats(): Promise<WhitelistStats>;
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