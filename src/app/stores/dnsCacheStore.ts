import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse, type DriverStatus } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient, type DNSContentMessage } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';
import type { CachedDnsResponse, DecodedPacket } from '@src/types/dns-unified';

interface DnsCacheStore {
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
  addEntry: (key: string, value: DecodedPacket | CachedDnsResponse | Record<string, unknown>, ttl?: number) => Promise<boolean>;
  removeEntry: (key: string) => Promise<boolean>;
  clearError: () => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
}

// SSE subscription cleanup functions
let cacheSseUnsubscribers: (() => void)[] = [];

export const useDnsCacheStore = create<DnsCacheStore>((set, get) => ({
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
    
    const [data, error] = await tryAsync(() => api.get('/api/dns/cache'));
    
    if (error) {
      const errorMessage = error.message || 'Failed to fetch cache driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch cache driver info:', error);
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

    const [data, error] = await tryAsync(() => api.post('/api/dns/cache', config));
    
    if (error) {
      const errorMessage = error.message || 'Failed to get cache content';
      set({ error: errorMessage });
      console.error('Failed to get cache content:', error);
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

    const [, error] = await tryAsync(() => api.post('/api/dns/cache', config, {
      showSuccess: true,
      successMessage: 'Cache driver updated successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to set cache driver';
      set({ error: errorMessage });
      console.error('Failed to set cache driver:', error);
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

    const [, error] = await tryAsync(() => api.post('/api/dns/cache', config, {
      showSuccess: true,
      successMessage: 'Cache cleared successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to clear cache';
      set({ error: errorMessage });
      console.error('Failed to clear cache:', error);
    } else {
      // Clear the content in the store after successful API call
      set({ content: null });
    }
    
    set({ loading: false });
  },

  addEntry: async (key: string, value: DecodedPacket | CachedDnsResponse | Record<string, unknown>, ttl?: number) => {
    // First check if entry already exists
    const checkConfig: Partial<DriverConfig> = {
      method: DRIVER_METHODS.GET,
      key
    };

    const [checkResult, checkError] = await tryAsync(() => api.post('/api/dns/cache', checkConfig));
    
    if (checkError) {
      const errorMessage = checkError.message || 'Failed to add cache entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Cache Error");
      return false;
    }
    
    if ('exists' in checkResult && checkResult.exists === true) {
      useSnackbarStore.getState().showAlert(`Cache entry "${key}" already exists`, "Duplicate Entry");
      return false;
    }

    // Add the entry
    const addConfig: Partial<DriverConfig> = {
      method: DRIVER_METHODS.ADD,
      key,
      value,
      ttl
    };

    const [, addError] = await tryAsync(() => api.post('/api/dns/cache', addConfig, {
      showSuccess: true,
      successMessage: `Added "${key}" to cache`
    }));
    
    if (addError) {
      const errorMessage = addError.message || 'Failed to add cache entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Cache Error");
      return false;
    }
    
    // Immediately refresh content to ensure UI updates
    await get().getContent();
    
    return true;
  },

  removeEntry: async (key: string) => {
    const config: Partial<DriverConfig> = {
      method: DRIVER_METHODS.REMOVE,
      key
    };

    const [, error] = await tryAsync(() => api.post('/api/dns/cache', config, {
      showSuccess: true,
      successMessage: `Removed "${key}" from cache`
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to remove cache entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Cache Error");
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

    // Subscribe to cache content updates
    const contentUnsubscriber = sseClient.subscribe('dns/cache/', (cacheData) => {
      if (cacheData && 'driver' in cacheData) {
        const contentMessage = cacheData as DNSContentMessage;
        const content: DriverContentResponse = {
          success: true,
          scope: 'cache',
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
    cacheSseUnsubscribers = [contentUnsubscriber, connectionUnsubscriber];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    cacheSseUnsubscribers.forEach(unsubscribe => unsubscribe());
    cacheSseUnsubscribers = [];
  },
}));