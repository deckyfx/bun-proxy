import { dnsManager } from "@src/dns/manager";

// Helper functions to create driver instances
export function createLogsDriverInstance(driverName: string, options?: Record<string, any>): any {
  const { ConsoleDriver } = require("@src/dns/drivers/logs/ConsoleDriver");
  const { InMemoryDriver: LogsInMemoryDriver } = require("@src/dns/drivers/logs/InMemoryDriver");
  const { FileDriver: LogsFileDriver } = require("@src/dns/drivers/logs/FileDriver");
  const { SQLiteDriver: LogsSQLiteDriver } = require("@src/dns/drivers/logs/SQLiteDriver");
  
  const driverOptions = options || {};
  
  switch (driverName.toLowerCase()) {
    case 'console':
      return new ConsoleDriver(driverOptions);
    case 'inmemory':
      return new LogsInMemoryDriver(driverOptions);
    case 'file':
      return new LogsFileDriver(driverOptions);
    case 'sqlite':
      return new LogsSQLiteDriver(driverOptions);
    default:
      throw new Error(`Unknown logs driver: ${driverName}`);
  }
}

export function createCacheDriverInstance(driverName: string, options?: Record<string, any>): any {
  const { InMemoryDriver: CacheInMemoryDriver } = require("@src/dns/drivers/caches/InMemoryDriver");
  const { FileDriver: CacheFileDriver } = require("@src/dns/drivers/caches/FileDriver");
  const { SQLiteDriver: CacheSQLiteDriver } = require("@src/dns/drivers/caches/SQLiteDriver");
  
  const driverOptions = options || {};
  
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new CacheInMemoryDriver(driverOptions);
    case 'file':
      return new CacheFileDriver(driverOptions);
    case 'sqlite':
      return new CacheSQLiteDriver(driverOptions);
    default:
      throw new Error(`Unknown cache driver: ${driverName}`);
  }
}

export function createBlacklistDriverInstance(driverName: string, options?: Record<string, any>): any {
  const { InMemoryDriver: BlacklistInMemoryDriver } = require("@src/dns/drivers/blacklist/InMemoryDriver");
  const { FileDriver: BlacklistFileDriver } = require("@src/dns/drivers/blacklist/FileDriver");
  const { SQLiteDriver: BlacklistSQLiteDriver } = require("@src/dns/drivers/blacklist/SQLiteDriver");
  
  const driverOptions = options || {};
  
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new BlacklistInMemoryDriver(driverOptions);
    case 'file':
      return new BlacklistFileDriver(driverOptions);
    case 'sqlite':
      return new BlacklistSQLiteDriver(driverOptions);
    default:
      throw new Error(`Unknown blacklist driver: ${driverName}`);
  }
}

export function createWhitelistDriverInstance(driverName: string, options?: Record<string, any>): any {
  const { InMemoryDriver: WhitelistInMemoryDriver } = require("@src/dns/drivers/whitelist/InMemoryDriver");
  const { FileDriver: WhitelistFileDriver } = require("@src/dns/drivers/whitelist/FileDriver");
  const { SQLiteDriver: WhitelistSQLiteDriver } = require("@src/dns/drivers/whitelist/SQLiteDriver");
  
  const driverOptions = options || {};
  
  switch (driverName.toLowerCase()) {
    case 'inmemory':
      return new WhitelistInMemoryDriver(driverOptions);
    case 'file':
      return new WhitelistFileDriver(driverOptions);
    case 'sqlite':
      return new WhitelistSQLiteDriver(driverOptions);
    default:
      throw new Error(`Unknown whitelist driver: ${driverName}`);
  }
}

// Common helper functions
export function getDrivers(): any {
  const status = dnsManager.getStatus();
  
  if (status.server) {
    const serverInstance = dnsManager.getServerInstance();
    if (serverInstance) {
      return (serverInstance as any).drivers || {};
    } else {
      return dnsManager.getLastUsedDrivers();
    }
  } else {
    return dnsManager.getLastUsedDrivers();
  }
}

export function isServerRunning(): boolean {
  return !!dnsManager.getStatus().server;
}

export function createErrorResponse(error: string, message: string, status: number = 500): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createSuccessResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
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