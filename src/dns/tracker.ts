interface QueryStats {
  totalQueries: number;
  hourlyQueries: number;
  failures: number;
  lastQuery: Date;
  lastHourReset: Date;
}

interface ProviderStats extends QueryStats {
  failureRate: number;
}

export class DNSQueryTracker {
  private stats: Map<string, QueryStats> = new Map();
  private domainCache: Map<string, { provider: string; timestamp: Date }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  recordQuery(provider: string, domain: string, failed: boolean = false): void {
    const now = new Date();
    const stats = this.getOrCreateStats(provider);

    // Reset hourly counter if needed
    if (now.getTime() - stats.lastHourReset.getTime() > 60 * 60 * 1000) {
      stats.hourlyQueries = 0;
      stats.lastHourReset = now;
    }

    stats.totalQueries++;
    stats.hourlyQueries++;
    stats.lastQuery = now;

    if (failed) {
      stats.failures++;
    } else {
      // Cache successful resolution
      this.domainCache.set(domain, { provider, timestamp: now });
    }

    this.stats.set(provider, stats);
    this.cleanupCache();
  }

  getProviderUsage(provider: string): ProviderStats {
    const stats = this.stats.get(provider) || this.createEmptyStats();
    const failureRate = stats.totalQueries > 0 ? stats.failures / stats.totalQueries : 0;

    return {
      ...stats,
      failureRate
    };
  }

  getStats() {
    const result: Record<string, ProviderStats> = {};
    
    for (const [provider, stats] of this.stats) {
      result[provider] = this.getProviderUsage(provider);
    }

    return {
      providers: result,
      cacheSize: this.domainCache.size,
      totalQueries: Array.from(this.stats.values()).reduce((sum, s) => sum + s.totalQueries, 0)
    };
  }

  getCachedProvider(domain: string): string | null {
    const cached = this.domainCache.get(domain);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.CACHE_TTL) {
      this.domainCache.delete(domain);
      return null;
    }

    return cached.provider;
  }

  private getOrCreateStats(provider: string): QueryStats {
    if (!this.stats.has(provider)) {
      this.stats.set(provider, this.createEmptyStats());
    }
    return this.stats.get(provider)!;
  }

  private createEmptyStats(): QueryStats {
    const now = new Date();
    return {
      totalQueries: 0,
      hourlyQueries: 0,
      failures: 0,
      lastQuery: now,
      lastHourReset: now
    };
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [domain, cached] of this.domainCache) {
      if (now - cached.timestamp.getTime() > this.CACHE_TTL) {
        this.domainCache.delete(domain);
      }
    }
  }
}