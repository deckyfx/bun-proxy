import { create } from 'zustand';
import { DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';

interface DnsLogStore {
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
    
    try {
      const response = await fetch('/api/dns/log');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch logs driver info';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Logs Driver Error');
        return;
      }
      
      const data = await response.json();
      set({ driverInfo: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch logs driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch logs driver info:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Logs Driver Error');
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

      const response = await fetch('/api/dns/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to get logs content';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Logs Content Error');
        return;
      }
      
      const data: DriverContentResponse = await response.json();
      set({ content: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get logs content';
      set({ error: errorMessage });
      console.error('Failed to get logs content:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Logs Content Error');
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

      const response = await fetch('/api/dns/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to set logs driver';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Logs Driver Error');
        return;
      }
      
      // Refresh driver info after successful change
      await get().fetchDriverInfo();
      
      useSnackbarStore.getState().showInfo('Logs driver updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set logs driver';
      set({ error: errorMessage });
      console.error('Failed to set logs driver:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Logs Driver Error');
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

      const response = await fetch('/api/dns/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to clear logs';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Clear Logs Error');
        return;
      }
      
      // Clear the content in the store after successful API call
      set({ content: null });
      
      useSnackbarStore.getState().showInfo('Logs cleared successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear logs';
      set({ error: errorMessage });
      console.error('Failed to clear logs:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Clear Logs Error');
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

    // Subscribe to logs content updates
    const contentUnsubscriber = sseClient.subscribe('dns/log/', (logData) => {
      if (logData) {
        set({ content: logData });
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