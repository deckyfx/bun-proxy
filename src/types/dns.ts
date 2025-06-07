export interface DNSProviderStats {
  totalQueries: number;
  hourlyQueries: number;
  failures: number;
  failureRate: number;
  lastQuery: Date;
  lastHourReset: Date;
}

export interface DNSServerStats {
  providers: Record<string, DNSProviderStats>;
  cacheSize: number;
  totalQueries: number;
}

export interface DNSServerInfo {
  isRunning: boolean;
  port: number;
  providers: string[];
  stats: DNSServerStats;
}

export interface DNSConfig {
  port: number;
  nextdnsConfigId?: string;
  providers: string[];
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
}

export interface DNSStatus {
  enabled: boolean;
  server: DNSServerInfo | null;
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