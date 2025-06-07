import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';
import type { UserType } from '@db/schema';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  tokens: AuthTokens | null;
  user: UserType | null;
  isLoading: boolean;
  
  // Actions
  setTokens: (tokens: AuthTokens) => void;
  clearTokens: () => void;
  
  // API methods
  signin: (payload: Pick<UserType, "email" | "password">) => Promise<boolean>;
  signup: (payload: Pick<UserType, "email" | "password" | "name">) => Promise<boolean>;
  logout: () => Promise<void>;
  me: () => Promise<void>;
  health: () => Promise<{ status: string }>;
  
  // Helper methods
  getCookie: (name: string) => string | null;
  refreshToken: () => Promise<string>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      tokens: null,
      user: null,
      isLoading: false,

      setTokens: (tokens: AuthTokens) => {
        set({ tokens });
      },

      clearTokens: () => {
        set({ tokens: null, user: null });
      },

      getCookie: (name: string): string | null => {
        const matches = document.cookie.match(
          new RegExp(
            "(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"
          )
        );
        return matches ? decodeURIComponent(matches[1]!) : null;
      },

      refreshToken: async (): Promise<string> => {
        const { tokens, setTokens } = get();
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens?.refreshToken}` },
        });
        if (!res.ok) throw new Error("Failed to refresh");
        const data = await res.json();
        setTokens(data);
        return data.accessToken;
      },

      fetchWithAuth: async (url: string, options: RequestInit = {}): Promise<Response> => {
        const { tokens, refreshToken } = get();
        let accessToken = tokens?.accessToken;

        try {
          const { exp } = jwtDecode<{ exp: number }>(accessToken || "");
          if (Date.now() >= exp * 1000) {
            accessToken = await refreshToken();
          }
        } catch {
          accessToken = await refreshToken();
        }

        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });
      },

      me: async (): Promise<void> => {
        const { getCookie, clearTokens } = get();
        try {
          set({ isLoading: true });
          const accessToken = getCookie("access_token");
          if (!accessToken) {
            return;
          }
          const res = await fetch("/api/user/me", { method: "POST" });
          if (!res.ok) throw new Error(await res.text());
          const user = await res.json();
          set({ user });
        } catch (err: any) {
          clearTokens();
          window.location.reload();
        } finally {
          set({ isLoading: false });
        }
      },

      signin: async (payload: Pick<UserType, "email" | "password">): Promise<boolean> => {
        try {
          set({ isLoading: true });
          const res = await fetch("/api/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          const tokens = await res.json();
          get().setTokens(tokens);
          window.location.reload();
          return true;
        } catch (err: any) {
          throw new Error(err.message || "Login failed");
        } finally {
          set({ isLoading: false });
        }
      },

      signup: async (payload: Pick<UserType, "email" | "password" | "name">): Promise<boolean> => {
        try {
          set({ isLoading: true });
          const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          return true;
        } catch (err: any) {
          throw new Error(err.message || "Registration failed");
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async (): Promise<void> => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          get().clearTokens();
          window.location.reload();
        }
      },

      health: async (): Promise<{ status: string }> => {
        const res = await fetch("/api/system/health");
        if (!res.ok) throw new Error("Health check failed");
        return res.json();
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ tokens: state.tokens }),
    }
  )
);