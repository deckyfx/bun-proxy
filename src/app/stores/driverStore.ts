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

// SSE instance for driver store
let driverEventSource: EventSource | null = null;

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
      
      console.log(`Driver set successfully:`, data);
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
    if (driverEventSource) {
      driverEventSource.close();
    }

    driverEventSource = new EventSource('/api/dns/events');
    
    driverEventSource.onopen = () => {
      set({ connected: true });
    };

    driverEventSource.onmessage = (event) => {
      try {
        // Validate event data before parsing
        if (!event.data || event.data.trim() === '') {
          return; // Skip empty messages
        }

        const message = JSON.parse(event.data);
        
        // Validate message structure
        if (!message || typeof message !== 'object') {
          return; // Skip invalid messages
        }
        
        switch (message.type) {
          case 'drivers':
            // Use the correct property name from SSE payload
            const driversData = message.drivers || message.data;
            
            // Validate drivers data exists
            if (!driversData || typeof driversData !== 'object') {
              return;
            }

            // Convert the raw driver data to DriverContentResponse format
            // Preserve existing logs data to avoid interfering with real-time stream
            const currentState = get();
            const formattedContent: Record<DriverType, DriverContentResponse | null> = {
              [DRIVER_TYPES.LOGS]: currentState.driverContent[DRIVER_TYPES.LOGS],
              [DRIVER_TYPES.CACHE]: null,
              [DRIVER_TYPES.BLACKLIST]: null,
              [DRIVER_TYPES.WHITELIST]: null,
            };

            for (const [scope, data] of Object.entries(driversData)) {
              const typedData = data as any;
              
              // Skip logs updates from automatic SSE to prevent interference with real-time stream
              // Logs will only be updated by explicit getDriverContent calls (refresh button)
              if (scope === DRIVER_TYPES.LOGS) {
                continue;
              }
              
              if (typedData && typedData.success) {
                formattedContent[scope as DriverType] = {
                  success: true,
                  content: typedData.content,
                  driver: typedData.driver,
                  timestamp: typedData.timestamp
                };
              } else if (typedData && !typedData.success) {
                formattedContent[scope as DriverType] = {
                  success: false,
                  error: typedData.error,
                  timestamp: typedData.timestamp
                };
              }
            }

            set({ driverContent: formattedContent });
            break;
          case 'error':
            console.error('Driver SSE error:', message.data);
            // Only show snackbar for actual error messages, not parsing issues
            if (message.data) {
              useSnackbarStore.getState().showAlert('Driver SSE connection error', 'Connection Error');
            }
            break;
          case 'keepalive':
            // Keep connection alive - no action needed
            break;
          default:
            // Unknown message type - just log it, don't show snackbar
            console.log('Unknown SSE message type:', message.type);
            break;
        }
      } catch (error) {
        // Only log parsing errors, don't spam snackbars for them
        console.error('Failed to parse driver SSE message:', error, 'Raw data:', event.data);
      }
    };

    driverEventSource.onerror = (error) => {
      console.error('Driver SSE error:', error);
      set({ connected: false });
      useSnackbarStore.getState().showWarning('Driver connection lost, attempting to reconnect...', 'Connection Warning');
      
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (get().connected === false) {
          get().connectSSE();
        }
      }, 5000);
    };

  },

  disconnectSSE: () => {
    if (driverEventSource) {
      driverEventSource.close();
      driverEventSource = null;
    }
    set({ connected: false });
  },
}));