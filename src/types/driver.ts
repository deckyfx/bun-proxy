// Driver types and method constants
export const DRIVER_TYPES = {
  LOGS: 'logs',
  CACHE: 'cache', 
  BLACKLIST: 'blacklist',
  WHITELIST: 'whitelist'
} as const;

export const DRIVER_METHODS = {
  SET: 'SET',
  GET: 'GET',
  CLEAR: 'CLEAR',
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  UPDATE: 'UPDATE',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT'
} as const;

export type DriverType = typeof DRIVER_TYPES[keyof typeof DRIVER_TYPES];
export type DriverMethod = typeof DRIVER_METHODS[keyof typeof DRIVER_METHODS];

export interface DriverConfig {
  method: DriverMethod;
  scope: DriverType;
  driver?: string;
  options?: Record<string, any>;
  filter?: Record<string, any>;
  
  // For CRUD operations
  key?: string;           // Cache key or domain for blacklist/whitelist
  value?: any;            // Cache value or entry data
  ttl?: number;           // Cache TTL
  reason?: string;        // Reason for blacklist/whitelist entry
  category?: string;      // Category for blacklist/whitelist entry
  
  // For bulk operations
  entries?: Array<{
    key?: string;
    value?: any;
    domain?: string;
    reason?: string;
    category?: string;
    ttl?: number;
  }>;
}

export interface DriverStatus {
  type: DriverType;
  implementation: string;
  options?: Record<string, any>;
  status: 'active' | 'inactive' | 'error';
}

export interface AvailableDrivers {
  [DRIVER_TYPES.LOGS]: string[];
  [DRIVER_TYPES.CACHE]: string[];
  [DRIVER_TYPES.BLACKLIST]: string[];
  [DRIVER_TYPES.WHITELIST]: string[];
}

export interface DriversResponse {
  current: {
    [DRIVER_TYPES.LOGS]: DriverStatus;
    [DRIVER_TYPES.CACHE]: DriverStatus;
    [DRIVER_TYPES.BLACKLIST]: DriverStatus;
    [DRIVER_TYPES.WHITELIST]: DriverStatus;
  };
  available: AvailableDrivers;
}

export interface DriverContentResponse {
  success: boolean;
  scope?: DriverType;
  driver?: string;
  content?: any;
  error?: string;
  timestamp?: number;
  metadata?: {
    total?: number;
    filtered?: number;
    timestamp?: string;
  };
}

export interface DriverSetResponse {
  message: string;
  scope: DriverType;
  driver: string;
  options?: Record<string, any>;
}