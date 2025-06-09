import { create } from 'zustand';
import { type DriversResponse } from '@src/types/driver';
import { api } from '@app/utils/fetchUtils';

interface DnsDriverStore {
  // State
  drivers: DriversResponse | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchDrivers: () => Promise<void>;
  setDriver: (scope: string, driver: string) => Promise<void>;
  clearError: () => void;
}

export const useDnsDriverStore = create<DnsDriverStore>((set, get) => ({
  // Initial state
  drivers: null,
  loading: false,
  error: null,

  // Actions
  fetchDrivers: async () => {
    set({ loading: true, error: null });
    
    try {
      const data = await api.get<DriversResponse>('/api/dns/driver');
      set({ drivers: data });
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
      
      // Refresh driver data
      await get().fetchDrivers();
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
}));