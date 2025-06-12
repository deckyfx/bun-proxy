import { dnsManager } from "@src/dns";
import { dnsResolver } from "@src/dns/resolver";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsLogEntry, ServerEventLogEntry } from "@src/types/dns-unified";
import { tryAsync } from "@src/utils/try";

interface MetricsQuery {
  range: '1h' | '6h' | '24h' | '7d';
}

export async function GetMetrics(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
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

    // Get drivers from resolver
    const drivers = dnsResolver.getDrivers();
    
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
      const [logEntries, logError] = await tryAsync(() => drivers.logs!.getAllLogs());
      if (logEntries) {
        
        // Filter by time range and separate DNS entries from server events
        const relevantDnsEntries = logEntries.filter((entry): entry is DnsLogEntry => 
          entry.type !== 'server_event' && entry.timestamp >= fromTime.getTime()
        );
        
        // Extract server events separately
        const relevantServerEvents = logEntries.filter((entry): entry is ServerEventLogEntry => 
          entry.type === 'server_event' && entry.timestamp >= fromTime.getTime()
        );
        
        // Add server events to the response
        serverEvents.push(...relevantServerEvents.map(event => ({
          type: event.eventType,
          timestamp: new Date(event.timestamp),
          message: event.message,
          port: event.port,
        })));

        // Track domain counts
        const domainCounts: Record<string, number> = {};
        let totalResponseTime = 0;
        let responseTimeCount = 0;

        // Process each DNS log entry
        for (const entry of relevantDnsEntries) {
          if (entry.type === 'response') {
            queryMetrics.totalQueries++;

            if (entry.processing.success) {
              queryMetrics.successfulQueries++;
            } else {
              queryMetrics.failedQueries++;
            }

            if (entry.processing.cached) {
              queryMetrics.cachedQueries++;
            }

            if (entry.processing.blocked) {
              queryMetrics.blockedQueries++;
            }

            if (entry.processing.whitelisted) {
              queryMetrics.whitelistedQueries++;
            }

            // Track query types
            if (entry.query?.type) {
              queryMetrics.queryTypes[entry.query.type] = 
                (queryMetrics.queryTypes[entry.query.type] || 0) + 1;
            }

            // Track domains
            if (entry.query?.name) {
              domainCounts[entry.query.name] = 
                (domainCounts[entry.query.name] || 0) + 1;
            }

            // Track providers
            if (entry.processing.provider) {
              queryMetrics.topProviders[entry.processing.provider] = 
                (queryMetrics.topProviders[entry.processing.provider] || 0) + 1;

              if (!providerMetrics[entry.processing.provider]) {
                providerMetrics[entry.processing.provider] = {
                  totalQueries: 0,
                  successfulQueries: 0,
                  failedQueries: 0,
                  averageResponseTime: 0,
                };
              }

              const providerMetric = providerMetrics[entry.processing.provider]!;
              providerMetric.totalQueries++;
              providerMetric.lastUsed = new Date(entry.timestamp);

              if (entry.processing.success) {
                providerMetric.successfulQueries++;
              } else {
                providerMetric.failedQueries++;
                queryMetrics.errorsByProvider[entry.processing.provider] = 
                  (queryMetrics.errorsByProvider[entry.processing.provider] || 0) + 1;
              }

              // Track response times
              if (entry.processing.responseTime && entry.processing.responseTime > 0) {
                totalResponseTime += entry.processing.responseTime;
                responseTimeCount++;
                
                // Update provider response time
                const totalProviderResponseTime = 
                  providerMetric.averageResponseTime * (providerMetric.totalQueries - 1);
                providerMetric.averageResponseTime = 
                  (totalProviderResponseTime + entry.processing.responseTime) / providerMetric.totalQueries;
              }
            }
          } else if (entry.type === 'error') {
            // Handle DNS error events - count as failures but don't add to server events
            queryMetrics.totalQueries++;
            queryMetrics.failedQueries++;
            
            // Track provider errors
            if (entry.processing.provider) {
              queryMetrics.errorsByProvider[entry.processing.provider] = 
                (queryMetrics.errorsByProvider[entry.processing.provider] || 0) + 1;
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
      } else if (logError) {
        console.warn('Failed to aggregate metrics from logs driver:', logError);
      }
    }

    // Get cache statistics
    let cacheStats = { hitRate: 0, entries: 0 };
    if (drivers.cache) {
      const [cacheSize, cacheError] = await tryAsync(() => drivers.cache!.size());
      if (cacheSize !== null) {
        cacheStats.entries = cacheSize;
        // Cache hit rate is calculated from query metrics above
        cacheStats.hitRate = queryMetrics.totalQueries > 0 
          ? (queryMetrics.cachedQueries / queryMetrics.totalQueries) * 100 
          : 0;
      } else if (cacheError) {
        console.warn('Failed to get cache statistics:', cacheError);
      }
    }

    // Get blacklist/whitelist statistics
    let blacklistEntries = 0;
    let whitelistEntries = 0;
    
    if (drivers.blacklist) {
      const [blacklistData, blacklistError] = await tryAsync(() => drivers.blacklist!.list());
      if (blacklistData) {
        blacklistEntries = blacklistData.length;
      } else if (blacklistError) {
        console.warn('Failed to get blacklist statistics:', blacklistError);
      }
    }

    if (drivers.whitelist) {
      const [whitelistData, whitelistError] = await tryAsync(() => drivers.whitelist!.list());
      if (whitelistData) {
        whitelistEntries = whitelistData.length;
      } else if (whitelistError) {
        console.warn('Failed to get whitelist statistics:', whitelistError);
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
  });

  if (error) {
    console.error("DNS metrics error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to get DNS metrics",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return result;
}

export default {
  metrics: { GET: Auth.guard(GetMetrics) },
};