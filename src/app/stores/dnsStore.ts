import { create } from 'zustand';
import type { DNSStatus, DNSConfigResponse, DNSToggleResponse } from '@typed/dns';
import { useSnackbarStore } from './snackbarStore';

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
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/dns/events');
    
    eventSource.onopen = () => {
      set({ connected: true });
    };

    eventSource.onmessage = (event) => {
      try {
        // Validate event data before parsing
        if (!event.data || event.data.trim() === '') {
          return; // Skip empty messages
        }

        const message = JSON.parse(event.data);
        
        // Validate message structure
        if (!message || typeof message !== 'object') {
          return; // Skip invalid messages
        }
        
        switch (message.type) {
          case 'status':
            if (message.data) {
              set({ status: message.data });
            }
            break;
          case 'error':
            console.error('DNS SSE error:', message.data);
            // Only show snackbar for actual error messages, not parsing issues
            if (message.data) {
              useSnackbarStore.getState().showAlert('DNS SSE connection error', 'Connection Error');
            }
            break;
          case 'keepalive':
            // Keep connection alive - no action needed
            break;
          default:
            // Unknown message type - just log it, don't show snackbar
            console.log('Unknown DNS SSE message type:', message.type);
            break;
        }
      } catch (error) {
        // Only log parsing errors, don't spam snackbars for them
        console.error('Failed to parse DNS SSE message:', error, 'Raw data:', event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('DNS SSE error:', error);
      set({ connected: false });
      useSnackbarStore.getState().showWarning('DNS connection lost, attempting to reconnect...', 'Connection Warning');
      
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