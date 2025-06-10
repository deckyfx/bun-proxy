import { create } from 'zustand';
import { type DriversResponse } from '@src/types/driver';
import { api } from '@app/utils/fetchUtils';
import { sseClient } from '@src/utils/SSEClient';

interface DnsDriverStore {
  // State
  drivers: DriversResponse | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchDrivers: () => Promise<void>;
  setDriver: (scope: string, driver: string) => Promise<void>;
  clearError: () => void;
  connectSSE: () => () => void; // Returns unsubscribe function
}

export const useDnsDriverStore = create<DnsDriverStore>((set, get) => ({
  // Initial state
  drivers: null,
  loading: false,
  error: null,

  // Actions
  fetchDrivers: async () => {
    // Only used for initial load if SSE hasn't connected yet
    const currentDrivers = get().drivers;
    set({ loading: true, error: null });
    
    try {
      const data = await api.get<DriversResponse>('/api/dns/driver');
      
      // Only update state if data actually changed
      if (JSON.stringify(currentDrivers) !== JSON.stringify(data)) {
        set({ drivers: data });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch driver info:', error);
    } finally {
      set({ loading: false });
    }
  },

  setDriver: async (scope: string, driver: string) => {
    set({ loading: true, error: null });
    
    try {
      await api.post<void, { method: string; driver: string }>(`/api/dns/${scope}`, {
        method: 'SET',
        driver: driver
      }, {
        showSuccess: true,
        successMessage: `${scope} driver updated to ${driver}`
      });
      
      // Don't fetch here - SSE will update automatically
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to set ${scope} driver`;
      set({ error: errorMessage });
      console.error(`Failed to set ${scope} driver:`, error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  connectSSE: () => {
    let fetchTimeout: NodeJS.Timeout | null = null;
    
    // Debounced fetch function to prevent multiple rapid calls
    const debouncedFetch = () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      fetchTimeout = setTimeout(() => {
        get().fetchDrivers();
        fetchTimeout = null;
      }, 100); // 100ms debounce
    };

    // Subscribe to DNS configuration changes (includes driver changes)
    const unsubscribeConfig = sseClient.subscribe('dns/info', (configData) => {
      // Only update if this event specifically relates to driver configuration changes
      if (configData && (configData.drivers || configData.timestamp)) {
        console.log('Received driver config update via SSE:', configData);
        debouncedFetch();
      }
    });

    // Return unsubscribe function
    return () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      unsubscribeConfig();
    };
  },
}));