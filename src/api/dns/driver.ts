import { dnsManager } from "@src/dns/manager";
import {
  DRIVER_TYPES,
  DRIVER_METHODS,
  type DriverConfig,
  type AvailableDrivers,
  type DriversResponse,
  type DriverContentResponse,
} from "@src/types/driver";

// Import driver classes
import { ConsoleDriver } from "@src/dns/drivers/logs/ConsoleDriver";
import { InMemoryDriver as LogsInMemoryDriver } from "@src/dns/drivers/logs/InMemoryDriver";
import { FileDriver as LogsFileDriver } from "@src/dns/drivers/logs/FileDriver";
import { SQLiteDriver as LogsSQLiteDriver } from "@src/dns/drivers/logs/SQLiteDriver";

import { InMemoryDriver as CacheInMemoryDriver } from "@src/dns/drivers/caches/InMemoryDriver";
import { FileDriver as CacheFileDriver } from "@src/dns/drivers/caches/FileDriver";
import { SQLiteDriver as CacheSQLiteDriver } from "@src/dns/drivers/caches/SQLiteDriver";

import { InMemoryDriver as BlacklistInMemoryDriver } from "@src/dns/drivers/blacklist/InMemoryDriver";
import { FileDriver as BlacklistFileDriver } from "@src/dns/drivers/blacklist/FileDriver";
import { SQLiteDriver as BlacklistSQLiteDriver } from "@src/dns/drivers/blacklist/SQLiteDriver";

import { InMemoryDriver as WhitelistInMemoryDriver } from "@src/dns/drivers/whitelist/InMemoryDriver";
import { FileDriver as WhitelistFileDriver } from "@src/dns/drivers/whitelist/FileDriver";
import { SQLiteDriver as WhitelistSQLiteDriver } from "@src/dns/drivers/whitelist/SQLiteDriver";

// Helper function to create driver instances
function createDriverInstance(scope: string, driverName: string, options?: Record<string, any>): any {
  const driverOptions = options || {};
  
  switch (scope) {
    case DRIVER_TYPES.LOGS:
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
      
    case DRIVER_TYPES.CACHE:
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
      
    case DRIVER_TYPES.BLACKLIST:
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
      
    case DRIVER_TYPES.WHITELIST:
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
      
    default:
      throw new Error(`Unknown driver scope: ${scope}`);
  }
}

// Get current driver status
function getCurrentDriverStatus(): DriversResponse['current'] {
  const status = dnsManager.getStatus();
  let drivers: any;

  if (status.server) {
    // Server is running - get current drivers from actual server instance
    const serverInstance = dnsManager.getServerInstance();
    if (serverInstance) {
      drivers = (serverInstance as any).drivers || {};
    } else {
      // Fallback to last used drivers if server instance not available
      drivers = dnsManager.getLastUsedDrivers();
    }
  } else {
    // Server is not running - use last used drivers or defaults
    const lastUsedDrivers = dnsManager.getLastUsedDrivers();
    drivers = lastUsedDrivers;
  }

  const isServerRunning = !!dnsManager.getStatus().server;

  return {
    [DRIVER_TYPES.LOGS]: {
      type: DRIVER_TYPES.LOGS,
      implementation: drivers.logs?.constructor.DRIVER_NAME || 'console',
      status: isServerRunning ? 'active' : 'inactive'
    },
    [DRIVER_TYPES.CACHE]: {
      type: DRIVER_TYPES.CACHE,
      implementation: drivers.cache?.constructor.DRIVER_NAME || 'inmemory',
      status: isServerRunning ? 'active' : 'inactive'
    },
    [DRIVER_TYPES.BLACKLIST]: {
      type: DRIVER_TYPES.BLACKLIST,
      implementation: drivers.blacklist?.constructor.DRIVER_NAME || 'inmemory',
      status: isServerRunning ? 'active' : 'inactive'
    },
    [DRIVER_TYPES.WHITELIST]: {
      type: DRIVER_TYPES.WHITELIST,
      implementation: drivers.whitelist?.constructor.DRIVER_NAME || 'inmemory',
      status: isServerRunning ? 'active' : 'inactive'
    }
  };
}

// Get available drivers
function getAvailableDrivers(): AvailableDrivers {
  return {
    [DRIVER_TYPES.LOGS]: ['console', 'inmemory', 'file', 'sqlite'],
    [DRIVER_TYPES.CACHE]: ['inmemory', 'file', 'sqlite'],
    [DRIVER_TYPES.BLACKLIST]: ['inmemory', 'file', 'sqlite'],
    [DRIVER_TYPES.WHITELIST]: ['inmemory', 'file', 'sqlite']
  };
}

// Set driver implementation
async function setDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return new Response(JSON.stringify({
      error: 'Missing driver field',
      message: 'driver field is required for SET method'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Create new driver instance
    const newDriverInstance = createDriverInstance(config.scope, config.driver, config.options);
    
    // Get current drivers configuration
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    // Update the specific driver
    const updatedDrivers = {
      ...currentDrivers,
      [config.scope]: newDriverInstance
    };
    
    // Update driver configuration in manager
    dnsManager.updateDriverConfiguration(updatedDrivers);
    
    // If server is running, hot-swap the driver without restart
    const status = dnsManager.getStatus();
    let driverUpdated = false;
    
    if (status.enabled && status.server) {
      console.log(`Hot-swapping ${config.scope} driver to: ${config.driver}`);
      
      // Get the actual server instance for hot-swapping
      const server = dnsManager.getServerInstance();
      
      if (!server) {
        console.warn('Server instance not available for hot-swapping');
        return new Response(JSON.stringify({
          error: 'Server not available',
          message: 'DNS server instance not available for driver hot-swapping',
          scope: config.scope,
          driver: config.driver
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      switch (config.scope) {
        case DRIVER_TYPES.LOGS:
          server.setLogDriver(newDriverInstance);
          driverUpdated = true;
          break;
        case DRIVER_TYPES.CACHE:
          server.setCacheDriver(newDriverInstance);
          driverUpdated = true;
          break;
        case DRIVER_TYPES.BLACKLIST:
          server.setBlacklistDriver(newDriverInstance);
          driverUpdated = true;
          break;
        case DRIVER_TYPES.WHITELIST:
          server.setWhitelistDriver(newDriverInstance);
          driverUpdated = true;
          break;
        default:
          console.warn(`Unknown driver scope for hot-swap: ${config.scope}`);
      }
      
      if (driverUpdated) {
        console.log(`Successfully hot-swapped ${config.scope} driver to: ${config.driver}`);
      }
    }
    
    return new Response(JSON.stringify({
      message: `${config.scope} driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      hotSwapped: driverUpdated,
      serverRunning: status.enabled
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error(`Failed to set ${config.scope} driver:`, error);
    
    return new Response(JSON.stringify({
      error: 'Failed to set driver',
      message: error instanceof Error ? error.message : 'Unknown error',
      scope: config.scope,
      driver: config.driver
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get driver content
async function getDriverContent(config: DriverConfig): Promise<Response> {
  const status = dnsManager.getStatus();
  let drivers: any;

  if (status.server) {
    // Server is running - get actual driver instances from server
    const serverInstance = dnsManager.getServerInstance();
    if (serverInstance) {
      drivers = (serverInstance as any).drivers || {};
    } else {
      return new Response(JSON.stringify({
        error: 'Cannot access server drivers',
        message: 'Server instance not available',
        scope: config.scope
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    // Server not running - cannot get content from inactive drivers
    return new Response(JSON.stringify({
      error: 'Cannot get driver content',
      message: 'DNS server must be running to access driver content',
      scope: config.scope
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  let content: any = null;
  let metadata: any = {};

  try {
    switch (config.scope) {
      case DRIVER_TYPES.LOGS:
        // Get logs from logs driver
        const logsDriver = drivers.logs;
        if (logsDriver && typeof logsDriver.getLogs === 'function') {
          content = await logsDriver.getLogs(config.filter);
          metadata.total = Array.isArray(content) ? content.length : 0;
        } else {
          content = 'Logs driver does not support content retrieval';
        }
        break;

      case DRIVER_TYPES.CACHE:
        // Get cache entries
        const cacheDriver = drivers.cache;
        if (cacheDriver && typeof cacheDriver.getAll === 'function') {
          content = await cacheDriver.getAll();
          metadata.total = Object.keys(content || {}).length;
        } else {
          content = 'Cache driver does not support content retrieval';
        }
        break;

      case DRIVER_TYPES.BLACKLIST:
        // Get blacklist entries
        const blacklistDriver = drivers.blacklist;
        if (blacklistDriver && typeof blacklistDriver.getAll === 'function') {
          content = await blacklistDriver.getAll();
          metadata.total = Array.isArray(content) ? content.length : 0;
        } else {
          content = 'Blacklist driver does not support content retrieval';
        }
        break;

      case DRIVER_TYPES.WHITELIST:
        // Get whitelist entries
        const whitelistDriver = drivers.whitelist;
        if (whitelistDriver && typeof whitelistDriver.getAll === 'function') {
          content = await whitelistDriver.getAll();
          metadata.total = Array.isArray(content) ? content.length : 0;
        } else {
          content = 'Whitelist driver does not support content retrieval';
        }
        break;

      default:
        return new Response(JSON.stringify({
          error: 'Invalid scope',
          message: 'scope must be logs, cache, blacklist, or whitelist'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers[config.scope]?.constructor.DRIVER_NAME || 'unknown',
      content,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const response: DriverContentResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Clear driver content
async function clearDriver(config: DriverConfig): Promise<Response> {
  const status = dnsManager.getStatus();
  let drivers: any;

  if (status.server) {
    // Server is running - get actual driver instances from server
    const serverInstance = dnsManager.getServerInstance();
    if (serverInstance) {
      drivers = (serverInstance as any).drivers || {};
    } else {
      return new Response(JSON.stringify({
        error: 'Cannot access server drivers',
        message: 'Server instance not available',
        scope: config.scope
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    // Server not running - cannot clear content from inactive drivers
    return new Response(JSON.stringify({
      error: 'Cannot clear driver content',
      message: 'DNS server must be running to clear driver content',
      scope: config.scope
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let cleared = false;
    let message = '';

    switch (config.scope) {
      case DRIVER_TYPES.LOGS:
        const logsDriver = drivers.logs;
        if (logsDriver && typeof logsDriver.clear === 'function') {
          await logsDriver.clear();
          cleared = true;
          message = 'Logs cleared successfully';
        } else {
          message = 'Logs driver does not support clearing';
        }
        break;

      case DRIVER_TYPES.CACHE:
        const cacheDriver = drivers.cache;
        if (cacheDriver && typeof cacheDriver.clear === 'function') {
          await cacheDriver.clear();
          cleared = true;
          message = 'Cache cleared successfully';
        } else {
          message = 'Cache driver does not support clearing';
        }
        break;

      case DRIVER_TYPES.BLACKLIST:
        const blacklistDriver = drivers.blacklist;
        if (blacklistDriver && typeof blacklistDriver.clear === 'function') {
          await blacklistDriver.clear();
          cleared = true;
          message = 'Blacklist cleared successfully';
        } else {
          message = 'Blacklist driver does not support clearing';
        }
        break;

      case DRIVER_TYPES.WHITELIST:
        const whitelistDriver = drivers.whitelist;
        if (whitelistDriver && typeof whitelistDriver.clear === 'function') {
          await whitelistDriver.clear();
          cleared = true;
          message = 'Whitelist cleared successfully';
        } else {
          message = 'Whitelist driver does not support clearing';
        }
        break;

      default:
        return new Response(JSON.stringify({
          error: 'Invalid scope',
          message: 'scope must be logs, cache, blacklist, or whitelist'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
      success: cleared,
      message,
      scope: config.scope,
      driver: drivers[config.scope]?.constructor.DRIVER_NAME || 'unknown',
      timestamp: new Date().toISOString()
    }), {
      status: cleared ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      scope: config.scope,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET /api/dns/driver - Get current driver configuration and available drivers
export async function GetDriverConfiguration(_req: Request): Promise<Response> {
  try {
    const current = getCurrentDriverStatus();
    const available = getAvailableDrivers();

    const response: DriversResponse = {
      current,
      available
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get driver configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST /api/dns/driver - Handle driver operations (SET/GET)
export async function HandleDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method || !body.scope) {
      return new Response(JSON.stringify({
        error: 'Missing required fields',
        message: 'method and scope are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.method === DRIVER_METHODS.SET) {
      return await setDriver(body);
    } else if (body.method === DRIVER_METHODS.GET) {
      return await getDriverContent(body);
    } else if (body.method === DRIVER_METHODS.CLEAR) {
      return await clearDriver(body);
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid method',
        message: 'method must be SET, GET, or CLEAR'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to process driver operation',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  driver: { 
    GET: GetDriverConfiguration, 
    POST: HandleDriverOperation 
  },
};