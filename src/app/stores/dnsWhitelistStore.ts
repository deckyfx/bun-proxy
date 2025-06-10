import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';
import { api } from '@app/utils/fetchUtils';

interface DnsWhitelistStore {
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
    
    try {
      const data = await api.get('/api/dns/whitelist');
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch whitelist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch whitelist driver info:', error);
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

      const data: DriverContentResponse = await api.post('/api/dns/whitelist', config);
      set({ content: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get whitelist content';
      set({ error: errorMessage });
      console.error('Failed to get whitelist content:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Content Error');
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

      await api.post('/api/dns/whitelist', config, {
        showSuccess: true,
        successMessage: 'Whitelist driver updated successfully'
      });
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set whitelist driver';
      set({ error: errorMessage });
      console.error('Failed to set whitelist driver:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Driver Error');
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

      await api.post('/api/dns/whitelist', config, {
        showSuccess: true,
        successMessage: 'Whitelist cleared successfully'
      });
      
      // Clear the content in the store after successful API call
      set({ content: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear whitelist';
      set({ error: errorMessage });
      console.error('Failed to clear whitelist:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Whitelist Error');
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

      const checkResult = await api.post('/api/dns/whitelist', checkConfig);
      if (checkResult.content === true) {
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

      await api.post('/api/dns/whitelist', addConfig, {
        showSuccess: true,
        successMessage: `Added "${domain}" to whitelist`
      });
      
      // Immediately refresh content to ensure UI updates
      await get().getContent();
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add whitelist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Whitelist Error");
      return false;
    }
  },

  removeEntry: async (domain: string) => {
    try {
      const config: Partial<DriverConfig> = {
        method: DRIVER_METHODS.REMOVE,
        key: domain
      };

      await api.post('/api/dns/whitelist', config, {
        showSuccess: true,
        successMessage: `Removed "${domain}" from whitelist`
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove whitelist entry';
      useSnackbarStore.getState().showAlert(errorMessage, "Whitelist Error");
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to whitelist content updates
    const contentUnsubscriber = sseClient.subscribe('dns/whitelist/', (whitelistData) => {
      if (whitelistData) {
        set({ content: whitelistData });
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