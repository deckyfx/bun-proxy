import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';
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
        set({ isLoading: true });
        const [user, error] = await tryAsync<UserProfile>(() => 
          api.post("/api/user/me", undefined, { showErrors: false })
        );
        
        if (error) {
          get().clearTokens();
          window.location.reload();
        } else {
          set({ user });
        }
        
        set({ isLoading: false });
      },

      signin: async (payload: LoginRequest): Promise<boolean> => {
        set({ isLoading: true });
        const [tokens, error] = await tryAsync<AuthResponse>(() => 
          api.post("/api/auth/signin", payload, { showErrors: false })
        );
        
        set({ isLoading: false });
        
        if (error) {
          throw new Error(error.message);
        }
        
        get().setTokens(tokens);
        window.location.reload();
        return true;
      },

      signup: async (payload: SignupRequest): Promise<boolean> => {
        set({ isLoading: true });
        const [, error] = await tryAsync(() => 
          api.post("/api/auth/signup", payload, { showErrors: false })
        );
        
        set({ isLoading: false });
        
        if (error) {
          throw new Error(error.message);
        }
        
        return true;
      },

      logout: async (): Promise<void> => {
        await tryAsync(() => 
          api.post("/api/auth/logout", undefined, { showErrors: false })
        );
        
        get().clearTokens();
        window.location.reload();
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