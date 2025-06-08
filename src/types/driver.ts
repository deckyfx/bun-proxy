// Driver types and method constants
export const DRIVER_TYPES = {
  LOGS: 'logs',
  CACHE: 'cache', 
  BLACKLIST: 'blacklist',
  WHITELIST: 'whitelist'
} as const;

export const DRIVER_METHODS = {
  SET: 'SET',
  GET: 'GET'
} as const;

export type DriverType = typeof DRIVER_TYPES[keyof typeof DRIVER_TYPES];
export type DriverMethod = typeof DRIVER_METHODS[keyof typeof DRIVER_METHODS];

export interface DriverConfig {
  method: DriverMethod;
  scope: DriverType;
  driver?: string;
  options?: Record<string, any>;
  filter?: Record<string, any>;
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
  scope: DriverType;
  driver: string;
  content: any;
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