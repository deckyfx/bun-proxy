import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse, type DriverStatus } from '@src/types/driver';
import { api } from '@app/utils/fetchUtils';
import { sseClient, type DNSContentMessage } from '@src/utils/SSEClient';
import { useSnackbarStore } from './snackbarStore';
import { tryAsync } from '@src/utils/try';

interface DnsBlacklistStore {
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
let blacklistSseUnsubscribers: (() => void)[] = [];

export const useDnsBlacklistStore = create<DnsBlacklistStore>((set, get) => ({
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
    
    const [data, error] = await tryAsync(() => api.get('/api/dns/blacklist'));
    
    if (error) {
      const errorMessage = error.message || 'Failed to fetch blacklist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch blacklist driver info:', error);
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

    const [data, error] = await tryAsync(() => api.post('/api/dns/blacklist', config));
    
    if (error) {
      const errorMessage = error.message || 'Failed to get blacklist content';
      set({ error: errorMessage });
      console.error('Failed to get blacklist content:', error);
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

    const [, error] = await tryAsync(() => api.post<void, Partial<DriverConfig>>('/api/dns/blacklist', config, {
      showSuccess: true,
      successMessage: 'Blacklist driver updated successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to set blacklist driver';
      set({ error: errorMessage });
      console.error('Failed to set blacklist driver:', error);
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

    const [, error] = await tryAsync(() => api.post('/api/dns/blacklist', config, {
      showSuccess: true,
      successMessage: 'Blacklist cleared successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to clear blacklist';
      set({ error: errorMessage });
      console.error('Failed to clear blacklist:', error);
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

    const [checkResult, checkError] = await tryAsync(() => api.post('/api/dns/blacklist', checkConfig));
    
    if (checkError) {
      const errorMessage = checkError.message || 'Failed to add blacklist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Blacklist Error");
      return false;
    }
    
    if ('exists' in checkResult && checkResult.exists === true) {
      useSnackbarStore.getState().showAlert(`Domain "${domain}" is already in blacklist`, "Duplicate Entry");
      return false;
    }

    // Add the entry
    const addConfig: Partial<DriverConfig> = {
      method: DRIVER_METHODS.ADD,
      key: domain,
      reason: reason || 'Added from DNS logs',
      category: category || 'logs'
    };

    const [, addError] = await tryAsync(() => api.post('/api/dns/blacklist', addConfig, {
      showSuccess: true,
      successMessage: `Added "${domain}" to blacklist`
    }));
    
    if (addError) {
      const errorMessage = addError.message || 'Failed to add blacklist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Blacklist Error");
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

    const [, error] = await tryAsync(() => api.post('/api/dns/blacklist', config, {
      showSuccess: true,
      successMessage: `Removed "${domain}" from blacklist`
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to remove blacklist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Blacklist Error");
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

    // Subscribe to blacklist content updates
    const contentUnsubscriber = sseClient.subscribe('dns/blacklist/', (blacklistData) => {
      if (blacklistData && 'driver' in blacklistData) {
        const contentMessage = blacklistData as DNSContentMessage;
        const content: DriverContentResponse = {
          success: true,
          scope: 'blacklist',
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
    blacklistSseUnsubscribers = [contentUnsubscriber, connectionUnsubscriber];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    blacklistSseUnsubscribers.forEach(unsubscribe => unsubscribe());
    blacklistSseUnsubscribers = [];
  },
}));