import { create } from 'zustand';
import type { LogEntry, DnsLogEntry } from '@src/types/dns-unified';
import { sseClient } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';

interface QueryMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  cachedQueries: number;
  blockedQueries: number;
  whitelistedQueries: number;
  averageResponseTime: number;
  queryTypes: Record<string, number>;
  topDomains: Array<{ domain: string; count: number }>;
  topProviders: Record<string, number>;
  errorsByProvider: Record<string, number>;
}

interface ServerMetrics {
  uptime: number;
  startTime?: Date;
  currentPort: number;
  isRunning: boolean;
  requestsPerSecond: number;
  peakRequestsPerSecond: number;
  serverEvents: Array<{
    type: 'started' | 'stopped' | 'crashed';
    timestamp: Date;
    message: string;
    port?: number;
  }>;
}

interface ProviderMetrics {
  [providerName: string]: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
    lastUsed?: Date;
  };
}

interface DNSMetrics {
  queryMetrics: QueryMetrics;
  serverMetrics: ServerMetrics;
  providerMetrics: ProviderMetrics;
  lastUpdated: Date;
}

interface DNSMetricsStore {
  metrics: DNSMetrics;
  loading: boolean;
  connected: boolean;
  timeRange: '1h' | '6h' | '24h' | '7d';
  
  // Actions
  fetchMetrics: () => Promise<void>;
  setTimeRange: (range: '1h' | '6h' | '24h' | '7d') => void;
  connectSSE: () => () => void;
  updateMetricsFromLogEntry: (logEntry: LogEntry) => void;
  resetMetrics: () => void;
}

// SSE subscription cleanup
let sseUnsubscriber: (() => void) | null = null;

export const useDNSMetricsStore = create<DNSMetricsStore>((set, get) => ({
  metrics: {
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
      currentPort: 53,
      isRunning: false,
      requestsPerSecond: 0,
      peakRequestsPerSecond: 0,
      serverEvents: [],
    },
    providerMetrics: {},
    lastUpdated: new Date(),
  },
  loading: false,
  connected: false,
  timeRange: '1h',

  fetchMetrics: async () => {
    set({ loading: true });
    
    const { timeRange } = get();
    const [data, error] = await tryAsync(() => api.get(`/api/dns/metrics?range=${timeRange}`));
    
    if (error) {
      console.error('Failed to fetch DNS metrics:', error);
    } else {
      set({ 
        metrics: {
          ...data,
          lastUpdated: new Date()
        }
      });
    }
    
    set({ loading: false });
  },

  setTimeRange: (range) => {
    set({ timeRange: range });
    get().fetchMetrics();
  },

  connectSSE: () => {
    // Clean up existing subscription
    if (sseUnsubscriber) {
      sseUnsubscriber();
    }

    // Subscribe to DNS log events for real-time metrics updates
    sseUnsubscriber = sseClient.subscribe('dns/log/event', (logEntry) => {
      if (logEntry && 'type' in logEntry && 'timestamp' in logEntry) {
        get().updateMetricsFromLogEntry(logEntry as LogEntry);
      }
    });

    // Subscribe to connection state
    const connectionUnsubscriber = sseClient.onConnectionChange((connected) => {
      set({ connected });
    });

    // Return cleanup function
    return () => {
      if (sseUnsubscriber) {
        sseUnsubscriber();
        sseUnsubscriber = null;
      }
      connectionUnsubscriber();
    };
  },

  updateMetricsFromLogEntry: (logEntry: LogEntry) => {
    const currentMetrics = get().metrics;
    
    // Only process DNS log entries for metrics (not server events)
    if (logEntry.type === 'server_event' || !('processing' in logEntry)) return;

    const newQueryMetrics = { ...currentMetrics.queryMetrics };
    const newProviderMetrics = { ...currentMetrics.providerMetrics };

    // Update total queries
    newQueryMetrics.totalQueries += 1;

    // Update success/failure counts
    const dnsLogEntry = logEntry as DnsLogEntry;
    if (dnsLogEntry.processing.success) {
      newQueryMetrics.successfulQueries += 1;
    } else {
      newQueryMetrics.failedQueries += 1;
    }

    // Update cached queries
    if (dnsLogEntry.processing.cached) {
      newQueryMetrics.cachedQueries += 1;
    }

    // Update blocked queries
    if (dnsLogEntry.processing.blocked) {
      newQueryMetrics.blockedQueries += 1;
    }

    // Update whitelisted queries
    if (dnsLogEntry.processing.whitelisted) {
      newQueryMetrics.whitelistedQueries += 1;
    }

    // Update query types
    if (dnsLogEntry.query?.type) {
      newQueryMetrics.queryTypes[dnsLogEntry.query.type] = 
        (newQueryMetrics.queryTypes[dnsLogEntry.query.type] || 0) + 1;
    }

    // Update top domains
    if (dnsLogEntry.query?.name) {
      const existingDomain = newQueryMetrics.topDomains.find(d => d.domain === dnsLogEntry.query!.name);
      if (existingDomain) {
        existingDomain.count += 1;
      } else {
        newQueryMetrics.topDomains.push({ domain: dnsLogEntry.query.name, count: 1 });
      }
      // Keep only top 10 domains
      newQueryMetrics.topDomains.sort((a, b) => b.count - a.count).splice(10);
    }

    // Update provider metrics
    if (dnsLogEntry.processing.provider) {
      const provider = dnsLogEntry.processing.provider;
      newQueryMetrics.topProviders[provider] = 
        (newQueryMetrics.topProviders[provider] || 0) + 1;

      if (!newProviderMetrics[provider]) {
        newProviderMetrics[provider] = {
          totalQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          averageResponseTime: 0,
        };
      }

      const providerMetric = newProviderMetrics[provider]!;
      providerMetric.totalQueries += 1;
      providerMetric.lastUsed = new Date();

      if (dnsLogEntry.processing.success) {
        providerMetric.successfulQueries += 1;
      } else {
        providerMetric.failedQueries += 1;
        newQueryMetrics.errorsByProvider[provider] = 
          (newQueryMetrics.errorsByProvider[provider] || 0) + 1;
      }

      // Update average response time
      if (dnsLogEntry.processing.responseTime) {
        const totalResponseTime = providerMetric.averageResponseTime * (providerMetric.totalQueries - 1);
        providerMetric.averageResponseTime = 
          (totalResponseTime + dnsLogEntry.processing.responseTime) / providerMetric.totalQueries;
      }
    }

    // Update overall average response time
    if (dnsLogEntry.processing.responseTime) {
      const totalResponseTime = newQueryMetrics.averageResponseTime * (newQueryMetrics.totalQueries - 1);
      newQueryMetrics.averageResponseTime = 
        (totalResponseTime + dnsLogEntry.processing.responseTime) / newQueryMetrics.totalQueries;
    }

    set({
      metrics: {
        ...currentMetrics,
        queryMetrics: newQueryMetrics,
        providerMetrics: newProviderMetrics,
        lastUpdated: new Date(),
      }
    });
  },

  resetMetrics: () => {
    set({
      metrics: {
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
          currentPort: 53,
          isRunning: false,
          requestsPerSecond: 0,
          peakRequestsPerSecond: 0,
          serverEvents: [],
        },
        providerMetrics: {},
        lastUpdated: new Date(),
      }
    });
  },
}));