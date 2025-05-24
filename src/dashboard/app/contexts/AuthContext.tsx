// auth/AuthContext.tsx
import React, { createContext, useContext, useState } from "react";

import { jwtDecode } from "jwt-decode";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextType {
  tokens: AuthTokens | null;
  setTokens: (tokens: AuthTokens) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => {
    const stored = localStorage.getItem("tokens");
    return stored ? JSON.parse(stored) : null;
  });

  const setTokens = (tokens: AuthTokens) => {
    setTokensState(tokens);
    localStorage.setItem("tokens", JSON.stringify(tokens));
  };

  return (
    <AuthContext.Provider value={{ tokens, setTokens }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export const useAuthFetch = () => {
  const { tokens, setTokens } = useAuth();

  const refreshToken = async () => {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens?.refreshToken}` },
    });
    if (!res.ok) throw new Error("Failed to refresh");
    const data = await res.json();
    setTokens(data);
    return data.accessToken;
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
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
  };

  return fetchWithAuth;
};
