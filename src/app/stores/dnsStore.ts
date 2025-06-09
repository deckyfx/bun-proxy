import { create } from 'zustand';
import type { DNSStatus, DNSConfigResponse, DNSToggleResponse } from '@typed/dns';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';

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
  initialConnectionEstablished: false,

  // Actions
  fetchStatus: async () => {
    try {
      const response = await fetch('/api/dns/status');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch DNS status';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'DNS Status Error');
        return;
      }
      
      const data: DNSStatus = await response.json();
      set({ status: data });
    } catch (error) {
      console.error('Failed to fetch DNS status:', error);
      useSnackbarStore.getState().showAlert('Failed to fetch DNS status', 'DNS Status Error');
    }
  },

  fetchConfig: async () => {
    try {
      const response = await fetch('/api/dns/config');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch DNS config';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'DNS Config Error');
        return;
      }
      
      const data: DNSConfigResponse = await response.json();
      set({ config: data.config });
    } catch (error) {
      console.error('Failed to fetch DNS config:', error);
      useSnackbarStore.getState().showAlert('Failed to fetch DNS config', 'DNS Config Error');
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

      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = 'Failed to start DNS server';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
            // Handle specific EADDRINUSE error
            if (errorMessage.includes('EADDRINUSE')) {
              errorMessage = 'Port is already in use. The DNS server may already be running.';
            }
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'DNS Start Error');
        return;
      }

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to start DNS server:', error);
      useSnackbarStore.getState().showAlert('Failed to start DNS server', 'DNS Start Error');
      // Don't re-throw to prevent uncaught errors
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

      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = 'Failed to stop DNS server';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'DNS Stop Error');
        return;
      }

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to stop DNS server:', error);
      useSnackbarStore.getState().showAlert('Failed to stop DNS server', 'DNS Stop Error');
      // Don't re-throw to prevent uncaught errors
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

      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = 'Failed to toggle DNS server';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'DNS Toggle Error');
        return;
      }

      const data: DNSToggleResponse = await response.json();
      set({ status: data.status });
    } catch (error) {
      console.error('Failed to toggle DNS server:', error);
      useSnackbarStore.getState().showAlert('Failed to toggle DNS server', 'DNS Toggle Error');
      // Don't re-throw to prevent uncaught errors
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
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Keep the default statusText
        }
        set({ testResult: `❌ Failed: ${errorMessage}` });
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
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to DNS status updates (server start/stop)
    const statusUnsubscriber = sseClient.subscribe('dns/status', (data) => {
      if (data) {
        set({ status: data });
      }
    });

    // Subscribe to DNS info updates (config changes)
    const infoUnsubscriber = sseClient.subscribe('dns/info', (data) => {
      if (data && data.config) {
        set({ config: data.config });
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