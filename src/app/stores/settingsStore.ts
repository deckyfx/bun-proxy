import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@app/utils/fetchUtils';
import type { DNSStatus, DNSToggleResponse } from '@src/types';

interface GeneralSettings {
  siteName: string;
  siteDescription: string;
  emailNotifications: boolean;
  maintenanceMode: boolean;
  apiRateLimit: string;
}

interface SettingsState {
  // General settings
  settings: GeneralSettings;
  
  // DNS settings
  dnsStatus: DNSStatus | null;
  dnsLoading: boolean;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  updateSetting: (field: keyof GeneralSettings, value: string | boolean) => void;
  saveSettings: () => Promise<void>;
  fetchDnsStatus: () => Promise<void>;
  toggleDnsServer: () => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Initial state
      settings: {
        siteName: "My Application",
        siteDescription: "A modern web application", 
        emailNotifications: true,
        maintenanceMode: false,
        apiRateLimit: "1000"
      },
      dnsStatus: null,
      dnsLoading: false,
      isLoading: false,
      error: null,

      // Actions
      updateSetting: (field: keyof GeneralSettings, value: string | boolean) => {
        set(state => ({
          settings: { ...state.settings, [field]: value }
        }));
      },

      saveSettings: async () => {
        set({ isLoading: true, error: null });
        
        try {
          // For now, just simulate saving - you can implement actual API call later
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Show success message using the api utility's built-in success handling
          console.log('Settings saved successfully!');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
          set({ error: errorMessage });
          console.error('Failed to save settings:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      fetchDnsStatus: async () => {
        set({ dnsLoading: true, error: null });
        
        try {
          const data: DNSStatus = await api.get('/api/dns/status');
          set({ dnsStatus: data });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch DNS status';
          set({ error: errorMessage });
          console.error('Failed to fetch DNS status:', error);
        } finally {
          set({ dnsLoading: false });
        }
      },

      toggleDnsServer: async () => {
        set({ dnsLoading: true, error: null });
        
        try {
          const data: DNSToggleResponse = await api.post('/api/dns/toggle', undefined, {
            showSuccess: true,
            successMessage: 'DNS server toggled successfully'
          });
          set({ dnsStatus: data.status });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to toggle DNS server';
          set({ error: errorMessage });
          console.error('Failed to toggle DNS server:', error);
        } finally {
          set({ dnsLoading: false });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);