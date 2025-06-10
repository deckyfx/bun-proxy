import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { api } from '@app/utils/fetchUtils';
import { sseClient } from '@src/utils/SSEClient';
import { useSnackbarStore } from './snackbarStore';

interface DnsBlacklistStore {
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
    
    try {
      const data = await api.get('/api/dns/blacklist');
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch blacklist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch blacklist driver info:', error);
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

      const data: DriverContentResponse = await api.post('/api/dns/blacklist', config);
      set({ content: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get blacklist content';
      set({ error: errorMessage });
      console.error('Failed to get blacklist content:', error);
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

      await api.post<void, Partial<DriverConfig>>('/api/dns/blacklist', config, {
        showSuccess: true,
        successMessage: 'Blacklist driver updated successfully'
      });
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set blacklist driver';
      set({ error: errorMessage });
      console.error('Failed to set blacklist driver:', error);
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

      await api.post('/api/dns/blacklist', config, {
        showSuccess: true,
        successMessage: 'Blacklist cleared successfully'
      });
      
      // Clear the content in the store after successful API call
      set({ content: null });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear blacklist';
      set({ error: errorMessage });
      console.error('Failed to clear blacklist:', error);
    } finally {
      set({ loading: false });
    }
  },

  addEntry: async (domain: string, reason?: string, category?: string) => {
    try {
      // First check if entry already exists
      const checkConfig: Partial<DriverConfig> = {
        method: DRIVER_METHODS.GET,
        key: domain
      };

      const checkResult = await api.post('/api/dns/blacklist', checkConfig);
      if (checkResult.content === true) {
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

      await api.post('/api/dns/blacklist', addConfig, {
        showSuccess: true,
        successMessage: `Added "${domain}" to blacklist`
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add blacklist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Blacklist Error");
      return false;
    }
  },

  removeEntry: async (domain: string) => {
    try {
      const config: Partial<DriverConfig> = {
        method: DRIVER_METHODS.REMOVE,
        key: domain
      };

      await api.post('/api/dns/blacklist', config, {
        showSuccess: true,
        successMessage: `Removed "${domain}" from blacklist`
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove blacklist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Blacklist Error");
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to blacklist content updates
    const contentUnsubscriber = sseClient.subscribe('dns/blacklist/', (blacklistData) => {
      if (blacklistData) {
        set({ content: blacklistData });
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