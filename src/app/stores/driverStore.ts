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
        throw new Error(`Failed to fetch drivers: ${response.statusText}`);
      }
      
      const data: DriversResponse = await response.json();
      set({ drivers: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch drivers';
      set({ error: errorMessage });
      console.error('Failed to fetch drivers:', error);
    } finally {
      set({ loading: false });
    }
  },

  getDriverContent: async (scope: DriverType, filter?: Record<string, any>) => {
    set({ contentLoading: true, error: null });
    
    try {
      const config: DriverConfig = {
        method: DRIVER_METHODS.GET,
        scope,
        filter
      };

      const response = await fetch('/api/dns/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get ${scope} content: ${response.statusText}`);
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
        throw new Error(`Failed to set ${scope} driver: ${response.statusText}`);
      }
      
      const data: DriverSetResponse = await response.json();
      
      // Refresh drivers list after successful change
      await get().fetchDrivers();
      
      console.log(`Driver set successfully:`, data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to set ${scope} driver`;
      set({ error: errorMessage });
      console.error(`Failed to set ${scope} driver:`, error);
      throw error; // Re-throw for UI error handling
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
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'drivers':
            // Convert the raw driver data to DriverContentResponse format
            const formattedContent: Record<DriverType, DriverContentResponse | null> = {
              [DRIVER_TYPES.LOGS]: null,
              [DRIVER_TYPES.CACHE]: null,
              [DRIVER_TYPES.BLACKLIST]: null,
              [DRIVER_TYPES.WHITELIST]: null,
            };

            for (const [scope, data] of Object.entries(message.data)) {
              const typedData = data as any;
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
            break;
          case 'keepalive':
            // Keep connection alive
            break;
        }
      } catch (error) {
        console.error('Failed to parse driver SSE message:', error);
      }
    };

    driverEventSource.onerror = (error) => {
      console.error('Driver SSE error:', error);
      set({ connected: false });
      
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