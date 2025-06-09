import { create } from 'zustand';
import { type DriversResponse } from '@src/types/driver';
import { useSnackbarStore } from './snackbarStore';

interface DnsDriverStore {
  // State
  drivers: DriversResponse | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchDrivers: () => Promise<void>;
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
      const response = await fetch('/api/dns/driver');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch driver info';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        useSnackbarStore.getState().showAlert(errorMessage, 'Driver Info Error');
        return;
      }
      
      const data: DriversResponse = await response.json();
      set({ drivers: data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch driver info';
      set({ error: errorMessage });
      console.error('Failed to fetch driver info:', error);
      useSnackbarStore.getState().showAlert(errorMessage, 'Driver Info Error');
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));