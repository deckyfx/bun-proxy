import { dnsManager } from "@src/dns/manager";
import {
  DRIVER_TYPES,
  DRIVER_METHODS,
  type DriverConfig,
  type DriverStatus,
  type AvailableDrivers,
  type DriversResponse,
  type DriverContentResponse,
  type DriverSetResponse
} from "@src/types/driver";

// Get current driver status
function getCurrentDriverStatus(): DriversResponse['current'] {
  const status = dnsManager.getStatus();
  let drivers: any;

  if (status.server) {
    // Server is running - get current drivers from server
    drivers = (status.server as any).drivers || {};
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

  // TODO: Implement driver switching logic
  // This would require adding methods to DNSProxyServer to update drivers at runtime
  
  return new Response(JSON.stringify({
    message: 'Driver switching not yet implemented',
    scope: config.scope,
    driver: config.driver,
    options: config.options
  }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Get driver content
async function getDriverContent(config: DriverConfig): Promise<Response> {
  const status = dnsManager.getStatus();
  let drivers: any;

  if (status.server) {
    // Server is running - get drivers from server
    drivers = (status.server as any).drivers || {};
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
    return new Response(JSON.stringify({
      error: 'Failed to get driver content',
      message: error instanceof Error ? error.message : 'Unknown error',
      scope: config.scope
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
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid method',
        message: 'method must be SET or GET'
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