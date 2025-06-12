import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse, type DriverStatus } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient, type DNSContentMessage } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';

interface DnsWhitelistStore {
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
  addEntry: (domain: string, reason?: string, category?: string) => Promise<boolean>;
  removeEntry: (domain: string) => Promise<boolean>;
  clearError: () => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
}

// SSE subscription cleanup functions
let whitelistSseUnsubscribers: (() => void)[] = [];

export const useDnsWhitelistStore = create<DnsWhitelistStore>((set, get) => ({
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
    
    const [data, error] = await tryAsync(() => api.get('/api/dns/whitelist'));
    
    if (error) {
      const errorMessage = error.message || 'Failed to fetch whitelist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch whitelist driver info:', error);
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

    const [data, error] = await tryAsync(() => api.post('/api/dns/whitelist', config));
    
    if (error) {
      const errorMessage = error.message || 'Failed to get whitelist content';
      set({ error: errorMessage });
      console.error('Failed to get whitelist content:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Content Error');
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

    const [, error1] = await tryAsync(() => api.post('/api/dns/whitelist', config, {
      showSuccess: true,
      successMessage: 'Whitelist driver updated successfully'
    }));
    
    if (error1) {
      const errorMessage = error1.message || 'Failed to set whitelist driver';
      set({ error: errorMessage });
      console.error('Failed to set whitelist driver:', error1);
      useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Driver Error');
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

    const [, error] = await tryAsync(() => api.post('/api/dns/whitelist', config, {
      showSuccess: true,
      successMessage: 'Whitelist cleared successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to clear whitelist';
      set({ error: errorMessage });
      console.error('Failed to clear whitelist:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Whitelist Error');
    } else {
      // Clear the content in the store after successful API call
      set({ content: null });
    }
    
    set({ loading: false });
  },

  addEntry: async (domain: string, reason?: string, category?: string) => {
    // First check if entry already exists
    const checkConfig: Partial<DriverConfig> = {
      method: DRIVER_METHODS.GET,
      key: domain
    };

    const [checkResult, checkError] = await tryAsync(() => api.post('/api/dns/whitelist', checkConfig));
    
    if (checkError) {
      const errorMessage = checkError.message || 'Failed to add whitelist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Whitelist Error");
      return false;
    }
    
    if ('exists' in checkResult && checkResult.exists === true) {
      useSnackbarStore.getState().showAlert(`Domain "${domain}" is already in whitelist`, "Duplicate Entry");
      return false;
    }

    // Add the entry
    const addConfig: Partial<DriverConfig> = {
      method: DRIVER_METHODS.ADD,
      key: domain,
      reason: reason || 'Added from DNS logs',
      category: category || 'logs'
    };

    const [, addError] = await tryAsync(() => api.post('/api/dns/whitelist', addConfig, {
      showSuccess: true,
      successMessage: `Added "${domain}" to whitelist`
    }));
    
    if (addError) {
      const errorMessage = addError.message || 'Failed to add whitelist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Whitelist Error");
      return false;
    }
    
    // Immediately refresh content to ensure UI updates
    await get().getContent();
    
    return true;
  },

  removeEntry: async (domain: string) => {
    const config: Partial<DriverConfig> = {
      method: DRIVER_METHODS.REMOVE,
      key: domain
    };

    const [, error] = await tryAsync(() => api.post('/api/dns/whitelist', config, {
      showSuccess: true,
      successMessage: `Removed "${domain}" from whitelist`
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to remove whitelist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Whitelist Error");
      return false;
    }
    
    return true;
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to whitelist content updates
    const contentUnsubscriber = sseClient.subscribe('dns/whitelist/', (whitelistData) => {
      if (whitelistData && 'driver' in whitelistData) {
        const contentMessage = whitelistData as DNSContentMessage;
        const content: DriverContentResponse = {
          success: true,
          scope: 'whitelist',
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

    // Subscribe to connection state changes
    const connectionUnsubscriber = sseClient.onConnectionChange((connected) => {
      set({ connected });
    });

    // Store unsubscribers for cleanup
    whitelistSseUnsubscribers = [contentUnsubscriber, connectionUnsubscriber];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    whitelistSseUnsubscribers.forEach(unsubscribe => unsubscribe());
    whitelistSseUnsubscribers = [];
  },
}));