import type { BaseDriver, BlacklistEntry, BlacklistOptions, BlacklistStats } from './BaseDriver';
import { BaseDriver as BaseDriverClass } from './BaseDriver';

export class InMemoryDriver extends BaseDriverClass {
  static override readonly DRIVER_NAME = 'inmemory';
  
  private entries = new Map<string, BlacklistEntry>();

  constructor(options: BlacklistOptions = {}) {
    super(options);
  }

  async add(domain: string, reason?: string, category?: string): Promise<void> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    const entry: BlacklistEntry = {
      domain: normalizedDomain,
      reason,
      addedAt: Date.now(),
      source: 'manual',
      category
    };

    this.entries.set(normalizedDomain, entry);
  }

  async remove(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.entries.delete(normalizedDomain);
  }

  async contains(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.entries.has(normalizedDomain);
  }

  async list(category?: string): Promise<BlacklistEntry[]> {
    const allEntries = Array.from(this.entries.values());
    
    if (category) {
      return allEntries.filter(entry => entry.category === category);
    }
    
    return allEntries.sort((a, b) => b.addedAt - a.addedAt);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async isBlocked(domain: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    if (this.entries.has(normalizedDomain)) {
      return true;
    }

    // Check pattern matches
    for (const entry of this.entries.values()) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return true;
      }
    }

    return false;
  }

  async getBlockingRule(domain: string): Promise<BlacklistEntry | null> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactMatch = this.entries.get(normalizedDomain);
    if (exactMatch) {
      return exactMatch;
    }

    // Check pattern matches
    for (const entry of this.entries.values()) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return entry;
      }
    }

    return null;
  }

  async import(entries: BlacklistEntry[]): Promise<number> {
    let imported = 0;
    
    for (const entry of entries) {
      const normalizedDomain = this.normalizeDomain(entry.domain);
      if (!this.entries.has(normalizedDomain)) {
        this.entries.set(normalizedDomain, {
          ...entry,
          domain: normalizedDomain,
          source: 'import'
        });
        imported++;
      }
    }
    
    return imported;
  }

  async export(): Promise<BlacklistEntry[]> {
    return Array.from(this.entries.values());
  }

  async stats(): Promise<BlacklistStats> {
    const entries = Array.from(this.entries.values());
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const categories: Record<string, number> = {};
    const sources: Record<string, number> = {};
    let recentlyAdded = 0;

    for (const entry of entries) {
      // Count categories
      const category = entry.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
      
      // Count sources
      const source = entry.source || 'unknown';
      sources[source] = (sources[source] || 0) + 1;
      
      // Count recent additions
      if (entry.addedAt > oneDayAgo) {
        recentlyAdded++;
      }
    }

    return {
      totalEntries: entries.length,
      categories,
      sources,
      recentlyAdded
    };
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for in-memory storage
  }
}