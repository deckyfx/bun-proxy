import { create } from 'zustand';
import type { DNSStatus, DNSConfigResponse, DNSToggleResponse } from '@typed/dns';

interface DNSConfig {
  port: number;
  nextdnsConfigId?: string;
  providers: string[];
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
  enableWhitelist: boolean;
  secondaryDns: 'cloudflare' | 'google' | 'opendns';
}

interface DNSStore {
  // State
  status: DNSStatus;
  config: DNSConfig;
  loading: boolean;
  testLoading: boolean;
  testResult: string;
  connected: boolean;
  
  // Actions
  fetchStatus: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  startServer: (options: {
    port: number;
    enableWhitelist: boolean;
    secondaryDns: 'cloudflare' | 'google' | 'opendns';
    nextdnsConfigId?: string;
  }) => Promise<void>;
  stopServer: () => Promise<void>;
  toggleServer: () => Promise<void>;
  testDnsConfig: (configId: string) => Promise<void>;
  updateConfig: (updates: Partial<DNSConfig>) => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
}

// SSE instance
let eventSource: EventSource | null = null;

export const useDNSStore = create<DNSStore>((set, get) => ({
  // Initial state
  status: {
    enabled: false,
    server: null,
  },
  config: {
    port: 53,
    nextdnsConfigId: '',
    providers: [],
    canUseLowPorts: false,
    platform: 'unknown',
    isPrivilegedPort: true,
    enableWhitelist: false,
    secondaryDns: 'cloudflare',
  },
  loading: false,
  testLoading: false,
  testResult: '',
  connected: false,

  // Actions
  fetchStatus: async () => {
    try {
      const response = await fetch('/api/dns/status');
      const data: DNSStatus = await response.json();
      set({ status: data });
    } catch (error) {
      console.error('Failed to fetch DNS status:', error);
    }
  },

  fetchConfig: async () => {
    try {
      const response = await fetch('/api/dns/config');
      const data: DNSConfigResponse = await response.json();
      set({ config: data.config });
    } catch (error) {
      console.error('Failed to fetch DNS config:', error);
    }
  },

  startServer: async (options) => {
    set({ loading: true });
    try {
      const response = await fetch('/api/dns/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to start DNS server:', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  stopServer: async () => {
    set({ loading: true });
    try {
      const response = await fetch('/api/dns/stop', {
        method: 'POST',
      });

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to stop DNS server:', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  toggleServer: async () => {
    set({ loading: true });
    try {
      const response = await fetch('/api/dns/toggle', {
        method: 'POST',
      });

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to toggle DNS server:', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  testDnsConfig: async (configId: string) => {
    set({ testLoading: true, testResult: '' });
    
    try {
      const response = await fetch('/api/dns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'google.com',
          configId,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        set({ testResult: `✅ Success: ${data.result || 'DNS resolution working'}` });
      } else {
        set({ testResult: `❌ Failed: ${response.statusText}` });
      }
    } catch (error) {
      set({ 
        testResult: `❌ Error: ${error instanceof Error ? error.message : 'Test failed'}` 
      });
    } finally {
      set({ testLoading: false });
    }
  },

  updateConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates }
    }));
  },

  connectSSE: () => {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/dns/events');
    
    eventSource.onopen = () => {
      set({ connected: true });
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'status':
            set({ status: message.data });
            break;
          case 'error':
            console.error('DNS SSE error:', message.data);
            break;
          case 'keepalive':
            // Keep connection alive
            break;
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('DNS SSE error:', error);
      set({ connected: false });
      
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (get().connected === false) {
          get().connectSSE();
        }
      }, 5000);
    };

  },

  disconnectSSE: () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    set({ connected: false });
  },
}));