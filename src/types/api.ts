export interface ApiError {
  error: string;
  details?: unknown;
}

export interface ApiSuccess<T = unknown> {
  data: T;
  message?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// DNS-specific API types using unified DNS types
export interface DnsApiResponse<T = unknown> extends ApiResponse<T> {
  timestamp: number;
  requestId?: string;
}

// DNS Server status types  
export interface DnsServerInfo {
  isRunning: boolean;
  port: number;
  providers?: string[];
}

export interface DnsStatus {
  enabled: boolean;
  server?: DnsServerInfo | null;
  currentNextDnsConfigId?: string;
}

export interface DnsActionResponse {
  message: string;
  status: DnsStatus;
}

export interface DnsToggleResponse extends DnsActionResponse {
  enabled: boolean;
}

// DNS Test types
export interface DnsTestRequest {
  domain: string;
  configId: string;
}

export interface DnsTestResponse {
  success: boolean;
  domain: string;
  configId: string;
  resolvedAddress?: string;
  error?: string;
}