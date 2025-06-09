import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';

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
      const response = await fetch('/api/dns/blacklist');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch blacklist driver info';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Driver Error');
        return;
      }
      
      const data = await response.json();
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch blacklist driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch blacklist driver info:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Driver Error');
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

      const response = await fetch('/api/dns/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to get blacklist content';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Content Error');
        return;
      }
      
      const data: DriverContentResponse = await response.json();
      set({ content: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get blacklist content';
      set({ error: errorMessage });
      console.error('Failed to get blacklist content:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Content Error');
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

      const response = await fetch('/api/dns/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to set blacklist driver';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Driver Error');
        return;
      }
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
      
      useSnackbarStore.getState().showInfo('Blacklist driver updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set blacklist driver';
      set({ error: errorMessage });
      console.error('Failed to set blacklist driver:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Blacklist Driver Error');
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

      const response = await fetch('/api/dns/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to clear blacklist';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Clear Blacklist Error');
        return;
      }
      
      // Clear the content in the store after successful API call
      set({ content: null });
      
      useSnackbarStore.getState().showInfo('Blacklist cleared successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear blacklist';
      set({ error: errorMessage });
      console.error('Failed to clear blacklist:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Blacklist Error');
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