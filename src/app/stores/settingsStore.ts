import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@app/utils/fetchUtils';
import type { DnsServerStatus } from '@src/types/dns-unified';
import { tryAsync } from '@src/utils/try';

interface DNSStatus {
  enabled: boolean;
  isRunning: boolean;
  port: number;
  nextdnsConfigId?: string;
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
  enableWhitelist: boolean;
  secondaryDns: string;
  server?: {
    port: number;
    providers: string[];
  };
  providers: string[];
}

interface DNSToggleResponse {
  isRunning: boolean;
  port?: number;
  error?: string;
  status?: DNSStatus;
}

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
        
        const [, error] = await tryAsync(() => new Promise(resolve => setTimeout(resolve, 500)));
        
        if (error) {
          const errorMessage = error.message || 'Failed to save settings';
          set({ error: errorMessage });
          console.error('Failed to save settings:', error);
        } else {
          // Show success message using the api utility's built-in success handling
          console.log('Settings saved successfully!');
        }
        
        set({ isLoading: false });
      },

      fetchDnsStatus: async () => {
        set({ dnsLoading: true, error: null });
        
        const [data, error] = await tryAsync(() => api.get('/api/dns/status'));
        
        if (error) {
          const errorMessage = error.message || 'Failed to fetch DNS status';
          set({ error: errorMessage });
          console.error('Failed to fetch DNS status:', error);
        } else {
          set({ dnsStatus: data as DNSStatus });
        }
        
        set({ dnsLoading: false });
      },

      toggleDnsServer: async () => {
        set({ dnsLoading: true, error: null });
        
        const [data, error] = await tryAsync(() => api.post('/api/dns/toggle', undefined, {
          showSuccess: true,
          successMessage: 'DNS server toggled successfully'
        }));
        
        if (error) {
          const errorMessage = error.message || 'Failed to toggle DNS server';
          set({ error: errorMessage });
          console.error('Failed to toggle DNS server:', error);
        } else {
          set({ dnsStatus: (data as DNSToggleResponse).status });
        }
        
        set({ dnsLoading: false });
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