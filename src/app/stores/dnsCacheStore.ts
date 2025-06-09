import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';

interface DnsCacheStore {
  // State
  driverInfo: { current: any; available: string[] } | null;
  content: DriverContentResponse | null;
  loading: boolean;
  contentLoading: boolean;
  error: string | null;
  connected: boolean;
  
  // Actions
  fetchDriverInfo: () => Promise<void>;
  getContent: (filter?: Record<string, any>) => Promise<void>;
  setDriver: (driver: string, options?: Record<string, any>) => Promise<void>;
  clearContent: () => Promise<void>;
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
    
    try {
      const data = await api.get('/api/dns/cache');
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch cache driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch cache driver info:', error);
    } finally {
      set({ loading: false });
    }
  },

  getContent: async (filter?: Record<string, any>) => {
    set({ contentLoading: true, error: null });
    
    try {
      const config: Partial<DriverConfig> = {
        method: DRIVER_METHODS.GET,
        filter
      };

      const data: DriverContentResponse = await api.post('/api/dns/cache', config);
      set({ content: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get cache content';
      set({ error: errorMessage });
      console.error('Failed to get cache content:', error);
    } finally {
      set({ contentLoading: false });
    }
  },

  setDriver: async (driver: string, options?: Record<string, any>) => {
    set({ loading: true, error: null });
    
    try {
      const config: Partial<DriverConfig> = {
        method: DRIVER_METHODS.SET,
        driver,
        options
      };

      await api.post('/api/dns/cache', config, {
        showSuccess: true,
        successMessage: 'Cache driver updated successfully'
      });
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set cache driver';
      set({ error: errorMessage });
      console.error('Failed to set cache driver:', error);
    } finally {
      set({ loading: false });
    }
  },

  clearContent: async () => {
    set({ loading: true, error: null });
    
    try {
      const config: Partial<DriverConfig> = {
        method: DRIVER_METHODS.CLEAR
      };

      await api.post('/api/dns/cache', config, {
        showSuccess: true,
        successMessage: 'Cache cleared successfully'
      });
      
      // Clear the content in the store after successful API call
      set({ content: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear cache';
      set({ error: errorMessage });
      console.error('Failed to clear cache:', error);
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to cache content updates
    const contentUnsubscriber = sseClient.subscribe('dns/cache/', (cacheData) => {
      if (cacheData) {
        set({ content: cacheData });
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