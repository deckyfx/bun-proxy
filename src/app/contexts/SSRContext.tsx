import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface SSRContextType {
  isClient: boolean;
  isServer: boolean;
}

const SSRContext = createContext<SSRContextType>({
  isClient: false,
  isServer: true,
});

export const useSSR = () => useContext(SSRContext);

interface SSRProviderProps {
  children: ReactNode;
}

export function SSRProvider({ children }: SSRProviderProps) {
  const [isClient, setIsClient] = useState(typeof window !== 'undefined');

  useEffect(() => {
    setIsClient(true);
  }, []);

  const value = {
    isClient,
    isServer: !isClient,
  };

  // Show loading on server-side until client hydrates
  if (!isClient) {
    return (
      <SSRContext.Provider value={value}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </SSRContext.Provider>
    );
  }

  return (
    <SSRContext.Provider value={value}>
      {children}
    </SSRContext.Provider>
  );
}