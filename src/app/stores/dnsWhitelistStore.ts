import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';

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
      const response = await fetch('/api/dns/whitelist');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch whitelist driver info';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Driver Error');
        return;
      }
      
      const data = await response.json();
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch whitelist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch whitelist driver info:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Driver Error');
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

      const response = await fetch('/api/dns/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to get whitelist content';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Content Error');
        return;
      }
      
      const data: DriverContentResponse = await response.json();
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

      const response = await fetch('/api/dns/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to set whitelist driver';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Whitelist Driver Error');
        return;
      }
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
      
      useSnackbarStore.getState().showInfo('Whitelist driver updated successfully');
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

      const response = await fetch('/api/dns/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to clear whitelist';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Clear Whitelist Error');
        return;
      }
      
      // Clear the content in the store after successful API call
      set({ content: null });
      
      useSnackbarStore.getState().showInfo('Whitelist cleared successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear whitelist';
      set({ error: errorMessage });
      console.error('Failed to clear whitelist:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Whitelist Error');
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