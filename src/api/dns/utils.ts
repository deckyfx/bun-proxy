import { dnsManager } from "@src/dns/manager";

// Import driver types
import type { LogOptions, BaseDriver as BaseLogDriver } from "@src/dns/drivers/logs/BaseDriver";
import type { CacheOptions, BaseDriver as BaseCacheDriver } from "@src/dns/drivers/caches/BaseDriver";
import type { BlacklistOptions, BaseDriver as BaseBlacklistDriver } from "@src/dns/drivers/blacklist/BaseDriver";
import type { WhitelistOptions, BaseDriver as BaseWhitelistDriver } from "@src/dns/drivers/whitelist/BaseDriver";
import type { DNSResolverDrivers } from "@src/dns/resolver";

// Import driver implementations
import { 
  ConsoleDriver,
  InMemoryDriver as LogsInMemoryDriver,
  FileDriver as LogsFileDriver,
  SQLiteDriver as LogsSQLiteDriver 
} from "@src/dns/drivers/logs";

import {
  InMemoryDriver as CacheInMemoryDriver,
  FileDriver as CacheFileDriver,
  SQLiteDriver as CacheSQLiteDriver
} from "@src/dns/drivers/caches";

import {
  InMemoryDriver as BlacklistInMemoryDriver,
  FileDriver as BlacklistFileDriver,
  SQLiteDriver as BlacklistSQLiteDriver
} from "@src/dns/drivers/blacklist";

import {
  InMemoryDriver as WhitelistInMemoryDriver,
  FileDriver as WhitelistFileDriver,
  SQLiteDriver as WhitelistSQLiteDriver
} from "@src/dns/drivers/whitelist";

// Type definitions for driver instances
type LogsDriverInstance = ConsoleDriver | LogsInMemoryDriver | LogsFileDriver | LogsSQLiteDriver;
type CacheDriverInstance = CacheInMemoryDriver | CacheFileDriver | CacheSQLiteDriver;
type BlacklistDriverInstance = BlacklistInMemoryDriver | BlacklistFileDriver | BlacklistSQLiteDriver;
type WhitelistDriverInstance = WhitelistInMemoryDriver | WhitelistFileDriver | WhitelistSQLiteDriver;

// DNS Server drivers interface (concrete instances)
export interface DNSServerDrivers {
  logs: LogsDriverInstance;
  cache: CacheDriverInstance;
  blacklist: BlacklistDriverInstance;
  whitelist: WhitelistDriverInstance;
}

// Helper functions to create driver instances
export function createLogsDriverInstance(driverName: string, options: LogOptions = {}): LogsDriverInstance {
  switch (driverName.toLowerCase()) {
    case 'console':
      return new ConsoleDriver(options);
    case 'inmemory':
      return new LogsInMemoryDriver(options);
    case 'file':
      return new LogsFileDriver(options);
    case 'sqlite':
      return new LogsSQLiteDriver(options);
    default:
      throw new Error(`Unknown logs driver: ${driverName}`);
  }
}

export function createCacheDriverInstance(driverName: string, options: CacheOptions = {}): CacheDriverInstance {
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new CacheInMemoryDriver(options);
    case 'file':
      return new CacheFileDriver(options);
    case 'sqlite':
      return new CacheSQLiteDriver(options);
    default:
      throw new Error(`Unknown cache driver: ${driverName}`);
  }
}

export function createBlacklistDriverInstance(driverName: string, options: BlacklistOptions = {}): BlacklistDriverInstance {
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new BlacklistInMemoryDriver(options);
    case 'file':
      return new BlacklistFileDriver(options);
    case 'sqlite':
      return new BlacklistSQLiteDriver(options);
    default:
      throw new Error(`Unknown blacklist driver: ${driverName}`);
  }
}

export function createWhitelistDriverInstance(driverName: string, options: WhitelistOptions = {}): WhitelistDriverInstance {
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new WhitelistInMemoryDriver(options);
    case 'file':
      return new WhitelistFileDriver(options);
    case 'sqlite':
      return new WhitelistSQLiteDriver(options);
    default:
      throw new Error(`Unknown whitelist driver: ${driverName}`);
  }
}

// Common helper functions
export function getDrivers(): DNSResolverDrivers {
  const status = dnsManager.getStatus();
  
  if (status.server) {
    const serverInstance = dnsManager.getServerInstance();
    if (serverInstance && 'getResolver' in serverInstance) {
      // Get drivers from the resolver instance
      const resolver = (serverInstance as { getResolver(): { getDrivers(): DNSResolverDrivers } }).getResolver();
      return resolver.getDrivers();
    }
  }
  
  // Fallback to manager's last used drivers
  return dnsManager.getLastUsedDrivers() as DNSResolverDrivers;
}

export function isServerRunning(): boolean {
  return !!dnsManager.getStatus().server;
}

// Helper function to get driver name safely
export function getDriverName(driver: BaseLogDriver | BaseCacheDriver | BaseBlacklistDriver | BaseWhitelistDriver | undefined): string {
  if (!driver) return 'unknown';
  return (driver.constructor as unknown as { DRIVER_NAME: string }).DRIVER_NAME;
}

// Response helper types
export interface ErrorResponse {
  error: string;
  message: string;
}

export interface SuccessResponse<T = unknown> {
  data: T;
  timestamp?: number;
}

export function createErrorResponse(error: string, message: string, status: number = 500): Response {
  const responseData: ErrorResponse = { error, message };
  return new Response(JSON.stringify(responseData), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createSuccessResponse<T>(data: T): Response {
  const responseData: SuccessResponse<T> = { 
    data,
    timestamp: Date.now()
  };
  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Server availability checks
export function checkServerAvailability(): Response | null {
  const status = dnsManager.getStatus();
  
  // If server is running, check for server instance
  if (status.server) {
    const serverInstance = dnsManager.getServerInstance();
    if (!serverInstance) {
      return createErrorResponse(
        'Cannot access server drivers',
        'Server instance not available',
        503
      );
    }
  }
  
  // Server can be stopped - we'll use lastUsedDrivers for safe operations
  // The getDrivers() function handles both running and stopped states
  return null;
}

// More restrictive check for operations that truly need the server running
export function checkServerRunning(): Response | null {
  const status = dnsManager.getStatus();
  
  if (!status.server) {
    return createErrorResponse(
      'Server not running',
      'DNS server must be running for this operation',
      503
    );
  }
  
  const serverInstance = dnsManager.getServerInstance();
  if (!serverInstance) {
    return createErrorResponse(
      'Cannot access server drivers',
      'Server instance not available',
      503
    );
  }
  
  return null;
}