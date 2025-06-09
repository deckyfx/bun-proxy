export interface DNSServerInfo {
  isRunning: boolean;
  port: number;
  providers: string[];
}

export interface DNSConfig {
  port: number;
  nextdnsConfigId?: string;
  providers: string[];
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
  enableWhitelist: boolean;
  secondaryDns: 'cloudflare' | 'google' | 'opendns';
}

export interface DNSStatus {
  enabled: boolean;
  server: DNSServerInfo | null;
}

export interface DNSConfigResponse {
  config: DNSConfig;
}

export interface DNSToggleResponse {
  message: string;
  enabled: boolean;
  status: DNSStatus;
}

export interface DNSActionResponse {
  message: string;
  status: DNSStatus;
}

export interface DNSTestRequest {
  domain: string;
  configId: string;
}

export interface DNSTestResponse {
  success: boolean;
  domain: string;
  configId: string;
  resolvedAddress?: string;
  error?: string;
}