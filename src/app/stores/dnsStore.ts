import { create } from 'zustand';
import type { DnsServerStatus } from '@src/types/dns-unified';
import { useSnackbarStore } from './snackbarStore';
import { sseClient, type DNSStatusMessage } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';

interface DNSStatus {
  enabled: boolean;
  isRunning: boolean;
  port: number;
  nextdnsConfigId?: string;
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
  enableWhitelist: boolean;
  secondaryDns: 'cloudflare' | 'google' | 'opendns';
  server?: {
    port: number;
    providers: string[];
  };
  providers: string[];
}

interface DNSConfigResponse {
  config: DNSStatus;
}

interface DNSToggleResponse {
  isRunning: boolean;
  port?: number;
  error?: string;
  status?: DNSStatus;
}

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
  initialConnectionEstablished: boolean;
  
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

// SSE subscription cleanup functions
let sseUnsubscribers: (() => void)[] = [];

export const useDNSStore = create<DNSStore>((set, get) => ({
  // Initial state
  status: {
    enabled: false,
    isRunning: false,
    port: 53,
    canUseLowPorts: false,
    platform: 'unknown',
    isPrivilegedPort: true,
    enableWhitelist: false,
    secondaryDns: 'cloudflare' as const,
    providers: [],
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
  initialConnectionEstablished: false,

  // Actions
  fetchStatus: async () => {
    const [data, error] = await tryAsync(() => api.get('/api/dns/status'));
    
    if (error) {
      console.error('Failed to fetch DNS status:', error);
    } else {
      set({ status: data as DNSStatus });
    }
  },

  fetchConfig: async () => {
    const [data, error] = await tryAsync(() => api.get('/api/dns/config'));
    
    if (error) {
      console.error('Failed to fetch DNS config:', error);
    } else {
      set({ config: (data as DNSConfigResponse).config });
    }
  },

  startServer: async (options) => {
    set({ loading: true });
    
    const [data, error] = await tryAsync(() => api.post('/api/dns/start', options, {
      showSuccess: true,
      successMessage: 'DNS server started successfully'
    }));
    
    if (error) {
      console.error('Failed to start DNS server:', error);
      // Don't re-throw to prevent uncaught errors
    } else {
      if ((data as DNSToggleResponse).status) {
        set({ status: (data as DNSToggleResponse).status! });
      }
    }
    
    set({ loading: false });
  },

  stopServer: async () => {
    set({ loading: true });
    
    const [data, error] = await tryAsync(() => api.post('/api/dns/stop', undefined, {
      showSuccess: true,
      successMessage: 'DNS server stopped successfully'
    }));
    
    if (error) {
      console.error('Failed to stop DNS server:', error);
      // Don't re-throw to prevent uncaught errors
    } else {
      if ((data as DNSToggleResponse).status) {
        set({ status: (data as DNSToggleResponse).status! });
      }
    }
    
    set({ loading: false });
  },

  toggleServer: async () => {
    set({ loading: true });
    
    const [data, error] = await tryAsync(() => api.post('/api/dns/toggle', undefined, {
      showSuccess: true,
      successMessage: 'DNS server toggled successfully'
    }));
    
    if (error) {
      console.error('Failed to toggle DNS server:', error);
      // Don't re-throw to prevent uncaught errors
    } else {
      if ((data as DNSToggleResponse).status) {
        set({ status: (data as DNSToggleResponse).status! });
      }
    }
    
    set({ loading: false });
  },

  testDnsConfig: async (configId: string) => {
    set({ testLoading: true, testResult: '' });
    
    const [data, error] = await tryAsync(() => api.post('/api/dns/test', {
      domain: 'google.com',
      configId,
    }));
    
    if (error) {
      set({ 
        testResult: `❌ Error: ${error.message || 'Test failed'}` 
      });
    } else {
      set({ testResult: `✅ Success: ${(data as any).result || 'DNS resolution working'}` });
    }
    
    set({ testLoading: false });
  },

  updateConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates }
    }));
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to DNS status updates (server start/stop)
    const statusUnsubscriber = sseClient.subscribe('dns/status', (data) => {
      if (data && 'enabled' in data) {
        const statusMessage = data as DNSStatusMessage;
        const status: DNSStatus = {
          enabled: statusMessage.enabled,
          isRunning: statusMessage.server?.isRunning || false,
          port: statusMessage.server?.port || 53,
          canUseLowPorts: false,
          platform: 'unknown',
          isPrivilegedPort: (statusMessage.server?.port || 53) < 1024,
          enableWhitelist: false,
          secondaryDns: 'cloudflare' as const,
          providers: statusMessage.server?.providers || [],
          server: statusMessage.server ? {
            port: statusMessage.server.port,
            providers: statusMessage.server.providers || []
          } : undefined
        };
        set({ status });
      }
    });

    // Subscribe to DNS info updates (config changes)
    const infoUnsubscriber = sseClient.subscribe('dns/info', (data) => {
      if (data && 'config' in data) {
        const configData = data as { config: DNSConfig };
        set({ config: configData.config });
      }
    });

    // Subscribe to connection state changes
    const connectionUnsubscriber = sseClient.onConnectionChange((connected) => {
      const currentState = get();
      
      set({ 
        connected,
        // Mark that we've established initial connection once we connect for the first time
        initialConnectionEstablished: currentState.initialConnectionEstablished || connected
      });
      
      // Only show reconnection message after initial connection was established
      // and only from DNS store (not driver store) to avoid duplicates
      if (!connected && currentState.initialConnectionEstablished) {
        setTimeout(() => {
          // Double check connection is still down before showing message
          if (!sseClient.isConnected()) {
            useSnackbarStore.getState().showWarning('Connection lost, attempting to reconnect...', 'Connection Warning');
          }
        }, 1000); // Wait 1 second before showing warning
      }
    });

    // Subscribe to error events
    const errorUnsubscriber = sseClient.subscribe('error', (errorData) => {
      if (errorData) {
        useSnackbarStore.getState().showAlert('DNS SSE connection error', 'Connection Error');
      }
    });

    // Store unsubscribers for cleanup
    sseUnsubscribers = [statusUnsubscriber, infoUnsubscriber, connectionUnsubscriber, errorUnsubscriber];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    sseUnsubscribers.forEach(unsubscribe => unsubscribe());
    sseUnsubscribers = [];
  },
}));