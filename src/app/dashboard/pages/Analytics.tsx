import { useEffect, useState } from "react";
import { PageContainer } from "../components/PageContainer";
import { CollapsibleCard, RippleButton, Select } from "@app/components/index";
import { useDNSMetricsStore } from "@app/stores/dnsMetricsStore";
import { useDNSStore } from "@app/stores/dnsStore";

export default function Analytics() {
  const {
    metrics,
    loading,
    connected,
    timeRange,
    fetchMetrics,
    setTimeRange,
    connectSSE,
    resetMetrics,
  } = useDNSMetricsStore();

  const { status: dnsStatus } = useDNSStore();


  useEffect(() => {
    // Initial fetch
    fetchMetrics();

    // Connect to SSE for real-time updates
    const unsubscribeSSE = connectSSE();

    // Set up periodic refresh for server metrics
    const interval = setInterval(() => {
      if (dnsStatus.enabled) {
        fetchMetrics();
      }
    }, 30000); // Refresh every 30 seconds

    // Cleanup
    return () => {
      unsubscribeSSE();
      if (interval) clearInterval(interval);
    };
  }, []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatResponseTime = (ms: number): string => {
    return ms.toFixed(1) + 'ms';
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getSuccessRate = (): string => {
    const { successfulQueries, totalQueries } = metrics.queryMetrics;
    if (totalQueries === 0) return '0%';
    return ((successfulQueries / totalQueries) * 100).toFixed(1) + '%';
  };

  const getCacheHitRate = (): string => {
    const { cachedQueries, totalQueries } = metrics.queryMetrics;
    if (totalQueries === 0) return '0%';
    return ((cachedQueries / totalQueries) * 100).toFixed(1) + '%';
  };

  const getBlockRate = (): string => {
    const { blockedQueries, totalQueries } = metrics.queryMetrics;
    if (totalQueries === 0) return '0%';
    return ((blockedQueries / totalQueries) * 100).toFixed(1) + '%';
  };

  return (
    <PageContainer title="DNS Analytics & Metrics">
      <div className="space-y-6">
        {/* Connection Status & Controls */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${connected ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium">
                {connected ? 'Live Updates' : 'Disconnected'}
              </span>
            </div>
            
            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value as '1h' | '6h' | '24h' | '7d')}
              options={[
                { value: '1h', label: 'Last Hour' },
                { value: '6h', label: 'Last 6 Hours' },
                { value: '24h', label: 'Last 24 Hours' },
                { value: '7d', label: 'Last 7 Days' },
              ]}
            />
          </div>

          <div className="flex gap-3">
            <RippleButton variant="soft" color="green" onClick={fetchMetrics} loading={loading}>
              <span className="material-icons">refresh</span>
              <span>Refresh</span>
            </RippleButton>
            <RippleButton variant="soft" color="red" onClick={resetMetrics}>
              <span className="material-icons">restart_alt</span>
              <span>Reset</span>
            </RippleButton>
          </div>
        </div>

        {/* Server Status */}
        <CollapsibleCard title="Server Status">
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {dnsStatus.enabled ? 'Running' : 'Stopped'}
                </div>
                <div className="text-sm text-gray-600">Status</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {metrics.serverMetrics.currentPort}
                </div>
                <div className="text-sm text-gray-600">Port</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {formatUptime(metrics.serverMetrics.uptime)}
                </div>
                <div className="text-sm text-gray-600">Uptime</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {formatNumber(metrics.serverMetrics.requestsPerSecond)}/s
                </div>
                <div className="text-sm text-gray-600">Requests/sec</div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Query Metrics Overview */}
        <CollapsibleCard title="Query Metrics">
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatNumber(metrics.queryMetrics.totalQueries)}
                </div>
                <div className="text-sm text-gray-600">Total Queries</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {getSuccessRate()}
                </div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {getCacheHitRate()}
                </div>
                <div className="text-sm text-gray-600">Cache Hit Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {getBlockRate()}
                </div>
                <div className="text-sm text-gray-600">Block Rate</div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-lg font-semibold text-yellow-600">
                    {formatResponseTime(metrics.queryMetrics.averageResponseTime)}
                  </div>
                  <div className="text-sm text-gray-600">Avg Response Time</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-indigo-600">
                    {formatNumber(metrics.queryMetrics.whitelistedQueries)}
                  </div>
                  <div className="text-sm text-gray-600">Whitelisted</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-red-600">
                    {formatNumber(metrics.queryMetrics.failedQueries)}
                  </div>
                  <div className="text-sm text-gray-600">Failed Queries</div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Top Domains & Query Types */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CollapsibleCard title="Top Domains">
            <div className="p-6">
              <div className="space-y-2">
                {metrics.queryMetrics.topDomains.slice(0, 10).map((domain) => (
                  <div key={domain.domain} className="flex justify-between items-center">
                    <span className="text-sm font-medium truncate pr-2">{domain.domain}</span>
                    <span className="text-sm text-gray-600 flex-shrink-0">{domain.count}</span>
                  </div>
                ))}
                {metrics.queryMetrics.topDomains.length === 0 && (
                  <div className="text-sm text-gray-500">No data available</div>
                )}
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Query Types">
            <div className="p-6">
              <div className="space-y-2">
                {Object.entries(metrics.queryMetrics.queryTypes)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 10)
                  .map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-sm font-medium">{type}</span>
                      <span className="text-sm text-gray-600">{count}</span>
                    </div>
                  ))}
                {Object.keys(metrics.queryMetrics.queryTypes).length === 0 && (
                  <div className="text-sm text-gray-500">No data available</div>
                )}
              </div>
            </div>
          </CollapsibleCard>
        </div>

        {/* Provider Performance */}
        <CollapsibleCard title="Provider Performance">
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Provider</th>
                    <th className="text-left py-2">Total Queries</th>
                    <th className="text-left py-2">Success Rate</th>
                    <th className="text-left py-2">Avg Response</th>
                    <th className="text-left py-2">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.providerMetrics).map(([provider, stats]) => (
                    <tr key={provider} className="border-b">
                      <td className="py-2 font-medium">{provider}</td>
                      <td className="py-2">{formatNumber(stats.totalQueries)}</td>
                      <td className="py-2">
                        {stats.totalQueries > 0 
                          ? ((stats.successfulQueries / stats.totalQueries) * 100).toFixed(1) + '%'
                          : '0%'
                        }
                      </td>
                      <td className="py-2">{formatResponseTime(stats.averageResponseTime)}</td>
                      <td className="py-2">
                        {stats.lastUsed 
                          ? new Date(stats.lastUsed).toLocaleTimeString()
                          : 'Never'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Object.keys(metrics.providerMetrics).length === 0 && (
                <div className="text-sm text-gray-500 py-4">No provider data available</div>
              )}
            </div>
          </div>
        </CollapsibleCard>

        {/* Last Updated */}
        <div className="text-sm text-gray-500 text-center">
          Last updated: {metrics.lastUpdated.toLocaleString()}
        </div>
      </div>
    </PageContainer>
  );
}