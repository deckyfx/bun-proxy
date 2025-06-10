import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";

interface MetricsQuery {
  range: '1h' | '6h' | '24h' | '7d';
}

export async function GetMetrics(req: Request, _user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const range = url.searchParams.get('range') as MetricsQuery['range'] || '1h';
    
    // Get DNS server instance and current status
    const serverInstance = dnsManager.getServerInstance();
    const status = dnsManager.getStatus();
    
    if (!serverInstance) {
      // Return empty metrics if server is not running
      return new Response(JSON.stringify({
        queryMetrics: {
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          cachedQueries: 0,
          blockedQueries: 0,
          whitelistedQueries: 0,
          averageResponseTime: 0,
          queryTypes: {},
          topDomains: [],
          topProviders: {},
          errorsByProvider: {},
        },
        serverMetrics: {
          uptime: 0,
          currentPort: status.server?.port || 53,
          isRunning: status.enabled,
          requestsPerSecond: 0,
          peakRequestsPerSecond: 0,
          serverEvents: [],
        },
        providerMetrics: {},
        lastUpdated: new Date(),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate time range in milliseconds
    const now = Date.now();
    const timeRanges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const timeRangeMs = timeRanges[range];
    const fromTime = new Date(now - timeRangeMs);

    // Get drivers from server instance
    const drivers = serverInstance.getDrivers();
    
    // Aggregate metrics from logs driver
    let queryMetrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cachedQueries: 0,
      blockedQueries: 0,
      whitelistedQueries: 0,
      averageResponseTime: 0,
      queryTypes: {} as Record<string, number>,
      topDomains: [] as Array<{ domain: string; count: number }>,
      topProviders: {} as Record<string, number>,
      errorsByProvider: {} as Record<string, number>,
    };

    let serverEvents: Array<{
      type: 'started' | 'stopped' | 'crashed';
      timestamp: Date;
      message: string;
      port?: number;
    }> = [];

    let providerMetrics: Record<string, {
      totalQueries: number;
      successfulQueries: number;
      failedQueries: number;
      averageResponseTime: number;
      lastUsed?: Date;
    }> = {};

    // Aggregate from logs driver if available
    if (drivers.logs) {
      try {
        const logEntries = await drivers.logs.getAllLogs();
        
        // Filter by time range
        const relevantEntries = logEntries.filter((entry: any) => 
          entry.timestamp >= fromTime
        );

        // Track domain counts
        const domainCounts: Record<string, number> = {};
        let totalResponseTime = 0;
        let responseTimeCount = 0;

        // Process each log entry
        for (const entry of relevantEntries) {
          if (entry.type === 'response') {
            queryMetrics.totalQueries++;

            if (entry.success) {
              queryMetrics.successfulQueries++;
            } else {
              queryMetrics.failedQueries++;
            }

            if (entry.cached) {
              queryMetrics.cachedQueries++;
            }

            if (entry.blocked) {
              queryMetrics.blockedQueries++;
            }

            if (entry.whitelisted) {
              queryMetrics.whitelistedQueries++;
            }

            // Track query types
            if (entry.query?.type) {
              queryMetrics.queryTypes[entry.query.type] = 
                (queryMetrics.queryTypes[entry.query.type] || 0) + 1;
            }

            // Track domains
            if (entry.query?.domain) {
              domainCounts[entry.query.domain] = 
                (domainCounts[entry.query.domain] || 0) + 1;
            }

            // Track providers
            if (entry.provider) {
              queryMetrics.topProviders[entry.provider] = 
                (queryMetrics.topProviders[entry.provider] || 0) + 1;

              if (!providerMetrics[entry.provider]) {
                providerMetrics[entry.provider] = {
                  totalQueries: 0,
                  successfulQueries: 0,
                  failedQueries: 0,
                  averageResponseTime: 0,
                };
              }

              const providerMetric = providerMetrics[entry.provider]!;
              providerMetric.totalQueries++;
              providerMetric.lastUsed = entry.timestamp;

              if (entry.success) {
                providerMetric.successfulQueries++;
              } else {
                providerMetric.failedQueries++;
                queryMetrics.errorsByProvider[entry.provider] = 
                  (queryMetrics.errorsByProvider[entry.provider] || 0) + 1;
              }

              // Track response times
              if (entry.responseTime && entry.responseTime > 0) {
                totalResponseTime += entry.responseTime;
                responseTimeCount++;
                
                // Update provider response time
                const totalProviderResponseTime = 
                  providerMetric.averageResponseTime * (providerMetric.totalQueries - 1);
                providerMetric.averageResponseTime = 
                  (totalProviderResponseTime + entry.responseTime) / providerMetric.totalQueries;
              }
            }
          } else if (entry.type === 'server_event') {
            if (entry.eventType === 'started' || entry.eventType === 'stopped' || entry.eventType === 'crashed') {
              serverEvents.push({
                type: entry.eventType,
                timestamp: entry.timestamp,
                message: entry.message || `Server ${entry.eventType}`,
                port: entry.port,
              });
            }
          }
        }

        // Calculate average response time
        queryMetrics.averageResponseTime = responseTimeCount > 0 
          ? totalResponseTime / responseTimeCount 
          : 0;

        // Sort and limit top domains
        queryMetrics.topDomains = Object.entries(domainCounts)
          .map(([domain, count]) => ({ domain, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

      } catch (error) {
        console.warn('Failed to aggregate metrics from logs driver:', error);
      }
    }

    // Get cache statistics
    let cacheStats = { hitRate: 0, entries: 0 };
    if (drivers.cache) {
      try {
        const cacheSize = await drivers.cache.size();
        cacheStats.entries = cacheSize;
        // Cache hit rate is calculated from query metrics above
        cacheStats.hitRate = queryMetrics.totalQueries > 0 
          ? (queryMetrics.cachedQueries / queryMetrics.totalQueries) * 100 
          : 0;
      } catch (error) {
        console.warn('Failed to get cache statistics:', error);
      }
    }

    // Get blacklist/whitelist statistics
    let blacklistEntries = 0;
    let whitelistEntries = 0;
    
    if (drivers.blacklist) {
      try {
        const blacklistData = await drivers.blacklist.list();
        blacklistEntries = blacklistData.length;
      } catch (error) {
        console.warn('Failed to get blacklist statistics:', error);
      }
    }

    if (drivers.whitelist) {
      try {
        const whitelistData = await drivers.whitelist.list();
        whitelistEntries = whitelistData.length;
      } catch (error) {
        console.warn('Failed to get whitelist statistics:', error);
      }
    }

    // Calculate server uptime (rough estimate based on server events)
    let uptime = 0;
    const startEvent = serverEvents
      .filter(e => e.type === 'started')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    if (startEvent && status.enabled) {
      uptime = Math.floor((now - startEvent.timestamp.getTime()) / 1000);
    }

    // Calculate requests per second
    const requestsPerSecond = uptime > 0 ? queryMetrics.totalQueries / uptime : 0;

    const response = {
      queryMetrics,
      serverMetrics: {
        uptime,
        startTime: startEvent?.timestamp,
        currentPort: status.server?.port || 53,
        isRunning: status.enabled,
        requestsPerSecond,
        peakRequestsPerSecond: requestsPerSecond, // Could be enhanced with more sophisticated tracking
        serverEvents: serverEvents.slice(0, 10), // Last 10 events
        cacheStats: {
          entries: cacheStats.entries,
          hitRate: cacheStats.hitRate,
        },
        driverStats: {
          blacklistEntries,
          whitelistEntries,
        },
      },
      providerMetrics,
      lastUpdated: new Date(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS metrics error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to get DNS metrics",
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  metrics: { GET: Auth.guard(GetMetrics) },
};