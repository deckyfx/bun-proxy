import { jwtDecode } from 'jwt-decode';
import { useSnackbarStore } from '@app/stores/snackbarStore';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface FetchOptions extends RequestInit {
  showErrors?: boolean;
  showSuccess?: boolean;
  successMessage?: string;
  bypassAuth?: boolean;
}

class FetchClient {
  private static instance: FetchClient;

  private constructor() {}

  static getInstance(): FetchClient {
    if (!FetchClient.instance) {
      FetchClient.instance = new FetchClient();
    }
    return FetchClient.instance;
  }

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    
    const matches = document.cookie.match(
      new RegExp(
        "(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"
      )
    );
    return matches ? decodeURIComponent(matches[1]!) : null;
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getCookie('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    return data.accessToken;
  }

  private async getValidAccessToken(): Promise<string | null> {
    let accessToken = this.getCookie('access_token');
    
    if (!accessToken) {
      return null;
    }

    try {
      const { exp } = jwtDecode<{ exp: number }>(accessToken);
      // Check if token expires in the next 30 seconds
      if (Date.now() >= (exp - 30) * 1000) {
        accessToken = await this.refreshAccessToken();
      }
    } catch {
      try {
        accessToken = await this.refreshAccessToken();
      } catch {
        return null;
      }
    }

    return accessToken;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If we can't parse JSON, use the status text
      }
      
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    
    return response.text() as T;
  }

  private async fetch<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
    const {
      showErrors = true,
      showSuccess = false,
      successMessage,
      bypassAuth = false,
      ...fetchOptions
    } = options;

    try {
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string> || {}),
      };

      // Add authentication header unless bypassed
      if (!bypassAuth) {
        const accessToken = await this.getValidAccessToken();
        
        if (!accessToken) {
          const error = new Error('Authentication required');
          if (showErrors) {
            useSnackbarStore.getState().showAlert('Please log in to continue', 'Authentication Required');
          }
          throw error;
        }

        headers = {
          ...headers,
          'Authorization': `Bearer ${accessToken}`,
        };
      }

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      const data = await this.handleResponse<T>(response);
      
      if (showSuccess && successMessage) {
        useSnackbarStore.getState().showInfo(successMessage);
      }
      
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Request failed';
      
      if (showErrors) {
        useSnackbarStore.getState().showAlert(errorMessage, 'Request Error');
      }
      
      throw error;
    }
  }

  // HTTP methods - authentication included by default, use bypassAuth: true to skip
  async get<T = any>(url: string, options?: FetchOptions): Promise<T> {
    return this.fetch<T>(url, { ...options, method: 'GET' });
  }

  async post<T = any, B = any>(url: string, data?: B, options?: FetchOptions): Promise<T> {
    return this.fetch<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any, B = any>(url: string, data?: B, options?: FetchOptions): Promise<T> {
    return this.fetch<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any, B = any>(url: string, data?: B, options?: FetchOptions): Promise<T> {
    return this.fetch<T>(url, { 
      ...options, 
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Export singleton instance
export const api = FetchClient.getInstance();

// Export class for additional instances if needed
export { FetchClient };