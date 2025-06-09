import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@app/utils/fetchUtils';
import type { 
  AuthResponse, 
  LoginRequest, 
  SignupRequest, 
  UserProfile, 
  HealthResponse 
} from '@src/types';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  isLoading: boolean;
  
  // Actions
  setTokens: (tokens: AuthTokens) => void;
  clearTokens: () => void;
  
  // API methods
  signin: (payload: LoginRequest) => Promise<boolean>;
  signup: (payload: SignupRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  me: () => Promise<void>;
  health: () => Promise<HealthResponse>;
  
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


      me: async (): Promise<void> => {
        try {
          set({ isLoading: true });
          const user: UserProfile = await api.post("/api/user/me", undefined, { showErrors: false });
          set({ user });
        } catch (err: any) {
          get().clearTokens();
          window.location.reload();
        } finally {
          set({ isLoading: false });
        }
      },

      signin: async (payload: LoginRequest): Promise<boolean> => {
        try {
          set({ isLoading: true });
          const tokens: AuthResponse = await api.post("/api/auth/signin", payload, { 
            showErrors: false 
          });
          get().setTokens(tokens);
          window.location.reload();
          return true;
        } catch (err: any) {
          throw new Error(err.message || "Login failed");
        } finally {
          set({ isLoading: false });
        }
      },

      signup: async (payload: SignupRequest): Promise<boolean> => {
        try {
          set({ isLoading: true });
          await api.post("/api/auth/signup", payload, { 
            showErrors: false 
          });
          return true;
        } catch (err: any) {
          throw new Error(err.message || "Registration failed");
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async (): Promise<void> => {
        try {
          await api.post("/api/auth/logout", undefined, { showErrors: false });
        } finally {
          get().clearTokens();
          window.location.reload();
        }
      },

      health: async (): Promise<HealthResponse> => {
        return api.get("/api/system/health");
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ tokens: state.tokens }),
    }
  )
);