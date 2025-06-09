import { create } from 'zustand';
import {
  DRIVER_TYPES,
  DRIVER_METHODS,
  type DriverType,
  type DriversResponse,
  type DriverConfig,
  type DriverContentResponse,
  type DriverSetResponse
} from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';
import { sseClient } from '@src/utils/SSEClient';

interface DriverStore {
  // State
  drivers: DriversResponse | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  
  // Driver content state
  contentLoading: boolean;
  driverContent: Record<DriverType, DriverContentResponse | null>;
  
  // Actions
  fetchDrivers: () => Promise<void>;
  getDriverContent: (scope: DriverType, filter?: Record<string, any>) => Promise<void>;
  setDriver: (scope: DriverType, driver: string, options?: Record<string, any>) => Promise<void>;
  clearLogs: () => Promise<void>;
  clearError: () => void;
  clearContent: (scope?: DriverType) => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
}

// SSE subscription cleanup functions for driver store
let driverSseUnsubscribers: (() => void)[] = [];

export const useDriverStore = create<DriverStore>((set, get) => ({
  // Initial state
  drivers: null,
  loading: false,
  error: null,
  connected: false,
  contentLoading: false,
  driverContent: {
    [DRIVER_TYPES.LOGS]: null,
    [DRIVER_TYPES.CACHE]: null,
    [DRIVER_TYPES.BLACKLIST]: null,
    [DRIVER_TYPES.WHITELIST]: null,
  },

  // Actions
  fetchDrivers: async () => {
    set({ loading: true, error: null });
    
    try {
      const response = await fetch('/api/dns/driver');
      
      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = 'Failed to fetch drivers';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Driver Fetch Error');
        return;
      }
      
      const data: DriversResponse = await response.json();
      set({ drivers: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch drivers';
      set({ error: errorMessage });
      console.error('Failed to fetch drivers:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Driver Fetch Error');
    } finally {
      set({ loading: false });
    }
  },

  getDriverContent: async (scope: DriverType, filter?: Record<string, any>) => {
    set({ contentLoading: true, error: null });
    
    try {
      const { drivers } = get();
      const currentDriver = drivers?.current?.[scope]?.implementation;
      
      const config: DriverConfig = {
        method: DRIVER_METHODS.GET,
        scope,
        driver: currentDriver, // Include the current driver implementation
        filter
      };

      const response = await fetch('/api/dns/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = `Failed to get ${scope} content`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Driver Content Error');
        return;
      }
      
      const data: DriverContentResponse = await response.json();
      
      set((state) => ({
        driverContent: {
          ...state.driverContent,
          [scope]: data
        }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to get ${scope} content`;
      set({ error: errorMessage });
      console.error(`Failed to get ${scope} content:`, error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Driver Content Error');
    } finally {
      set({ contentLoading: false });
    }
  },

  setDriver: async (scope: DriverType, driver: string, options?: Record<string, any>) => {
    set({ loading: true, error: null });
    
    try {
      const config: DriverConfig = {
        method: DRIVER_METHODS.SET,
        scope,
        driver,
        options
      };

      const response = await fetch('/api/dns/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        // Handle HTTP error responses
        let errorMessage = `Failed to set ${scope} driver`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Driver Set Error');
        return;
      }
      
      const data: DriverSetResponse = await response.json();
      
      // Refresh drivers list after successful change
      await get().fetchDrivers();
      
      useSnackbarStore.getState().showInfo(`${scope} driver updated successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to set ${scope} driver`;
      set({ error: errorMessage });
      console.error(`Failed to set ${scope} driver:`, error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Driver Set Error');
      // Don't re-throw to prevent uncaught errors that might cause page reloads
    } finally {
      set({ loading: false });
    }
  },

  clearLogs: async () => {
    set({ loading: true, error: null });
    
    try {
      const config: DriverConfig = {
        method: DRIVER_METHODS.CLEAR,
        scope: DRIVER_TYPES.LOGS
      };

      const response = await fetch('/api/dns/driver', {
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
      get().clearContent(DRIVER_TYPES.LOGS);
      
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

  clearContent: (scope?: DriverType) => {
    if (scope) {
      set((state) => ({
        driverContent: {
          ...state.driverContent,
          [scope]: null
        }
      }));
    } else {
      set({
        driverContent: {
          [DRIVER_TYPES.LOGS]: null,
          [DRIVER_TYPES.CACHE]: null,
          [DRIVER_TYPES.BLACKLIST]: null,
          [DRIVER_TYPES.WHITELIST]: null,
        }
      });
    }
  },

  connectSSE: () => {
    // Clean up existing subscriptions
    get().disconnectSSE();

    // Subscribe to individual driver content updates
    const logsUnsubscriber = sseClient.subscribe('dns/log/', (logData) => {
      if (logData) {
        set((state) => ({
          driverContent: {
            ...state.driverContent,
            [DRIVER_TYPES.LOGS]: logData
          }
        }));
      }
    });

    const cacheUnsubscriber = sseClient.subscribe('dns/cache/', (cacheData) => {
      if (cacheData) {
        set((state) => ({
          driverContent: {
            ...state.driverContent,
            [DRIVER_TYPES.CACHE]: cacheData
          }
        }));
      }
    });

    const blacklistUnsubscriber = sseClient.subscribe('dns/blacklist/', (blacklistData) => {
      if (blacklistData) {
        set((state) => ({
          driverContent: {
            ...state.driverContent,
            [DRIVER_TYPES.BLACKLIST]: blacklistData
          }
        }));
      }
    });

    const whitelistUnsubscriber = sseClient.subscribe('dns/whitelist/', (whitelistData) => {
      if (whitelistData) {
        set((state) => ({
          driverContent: {
            ...state.driverContent,
            [DRIVER_TYPES.WHITELIST]: whitelistData
          }
        }));
      }
    });

    // Subscribe to real-time log events (for live streaming)
    const logEventUnsubscriber = sseClient.subscribe('dns/log/event', (logEntry) => {
      if (logEntry) {
        // Handle real-time log events - could update a separate live log stream
        console.log('Real-time log event:', logEntry);
      }
    });

    // Subscribe to connection state changes (no snackbar - DNS store handles this)
    const connectionUnsubscriber = sseClient.onConnectionChange((connected) => {
      set({ connected });
      // Don't show connection messages from driver store to avoid duplicates
    });

    // Subscribe to error events
    const errorUnsubscriber = sseClient.subscribe('error', (errorData) => {
      if (errorData) {
        useSnackbarStore.getState().showAlert('Driver SSE connection error', 'Connection Error');
      }
    });

    // Store unsubscribers for cleanup
    driverSseUnsubscribers = [
      logsUnsubscriber, cacheUnsubscriber, blacklistUnsubscriber, whitelistUnsubscriber,
      logEventUnsubscriber, connectionUnsubscriber, errorUnsubscriber
    ];
  },

  disconnectSSE: () => {
    // Clean up all subscriptions
    driverSseUnsubscribers.forEach(unsubscribe => unsubscribe());
    driverSseUnsubscribers = [];
  },
}));