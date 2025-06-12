import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse, type DriverStatus } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient, type DNSContentMessage } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';

interface DnsLogStore {
  // State
  driverInfo: { current: DriverStatus; available: string[] } | null;
  content: DriverContentResponse | null;
  loading: boolean;
  contentLoading: boolean;
  error: string | null;
  connected: boolean;
  
  // Actions
  fetchDriverInfo: () => Promise<void>;
  getContent: (filter?: Record<string, unknown>) => Promise<void>;
  setDriver: (driver: string, options?: Record<string, unknown>) => Promise<void>;
  clearContent: () => Promise<void>;
  clearError: () => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
}

// SSE subscription cleanup functions
let logSseUnsubscribers: (() => void)[] = [];

export const useDnsLogStore = create<DnsLogStore>((set, get) => ({
  // Initial state
  driverInfo: null,
  content: null,
  loading: false,
  contentLoading: false,
  error: null,
  connected: false,

  // Actions
  fetchDriverInfo: async () => {
    set({ loading: true, error: null });
    
    const [data, error] = await tryAsync(() => api.get('/api/dns/log'));
    
    if (error) {
      const errorMessage = error.message || 'Failed to fetch logs driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch logs driver info:', error);
    } else {
      set({ driverInfo: data });
    }
    
    set({ loading: false });
  },

  getContent: async (filter?: Record<string, unknown>) => {
    set({ contentLoading: true, error: null });
    
    const config: Partial<DriverConfig> = {
      method: DRIVER_METHODS.GET,
      filter
    };

    const [data, error] = await tryAsync(() => api.post('/api/dns/log', config));
    
    if (error) {
      const errorMessage = error.message || 'Failed to get logs content';
      set({ error: errorMessage });
      console.error('Failed to get logs content:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Logs Content Error');
    } else {
      set({ content: data as DriverContentResponse });
    }
    
    set({ contentLoading: false });
  },

  setDriver: async (driver: string, options?: Record<string, unknown>) => {
    set({ loading: true, error: null });
    
    const config: Partial<DriverConfig> = {
      method: DRIVER_METHODS.SET,
      driver,
      options
    };

    const [, error] = await tryAsync(() => api.post('/api/dns/log', config, {
      showSuccess: true,
      successMessage: 'Logs driver updated successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to set logs driver';
      set({ error: errorMessage });
      console.error('Failed to set logs driver:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Logs Driver Error');
    } else {
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
    }
    
    set({ loading: false });
  },

  clearContent: async () => {
    set({ loading: true, error: null });
    
    const config: Partial<DriverConfig> = {
      method: DRIVER_METHODS.CLEAR
    };

    const [, error] = await tryAsync(() => api.post('/api/dns/log', config, {
      showSuccess: true,
      successMessage: 'Logs cleared successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to clear logs';
      set({ error: errorMessage });
      console.error('Failed to clear logs:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Logs Error');
    } else {
      // Clear the content in the store after successful API call
      set({ content: null });
    }
    
    set({ loading: false });
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to logs content updates
    const contentUnsubscriber = sseClient.subscribe('dns/log/', (logData) => {
      if (logData && 'driver' in logData) {
        const contentMessage = logData as DNSContentMessage;
        const content: DriverContentResponse = {
          success: true,
          scope: 'logs',
          driver: contentMessage.driver,
          entries: contentMessage.entries || [],
          timestamp: contentMessage.lastUpdated,
          metadata: {
            total: contentMessage.count,
            timestamp: new Date(contentMessage.lastUpdated).toISOString()
          }
        };
        set({ content });
      }
    });

    // Subscribe to real-time log events (for live streaming)
    const eventUnsubscriber = sseClient.subscribe('dns/log/event', (logEntry) => {
      if (logEntry) {
        // Handle real-time log events - could update a separate live log stream
        console.log('Real-time log event:', logEntry);
        // You could emit this to a separate live logs view if needed
      }
    });

    // Subscribe to connection state changes
    const connectionUnsubscriber = sseClient.onConnectionChange((connected) => {
      set({ connected });
    });

    // Store unsubscribers for cleanup
    logSseUnsubscribers = [contentUnsubscriber, eventUnsubscriber, connectionUnsubscriber];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    logSseUnsubscribers.forEach(unsubscribe => unsubscribe());
    logSseUnsubscribers = [];
  },
}));