import { dnsManager } from "@src/dns/manager";
import { Auth, type AuthUser } from "@utils/auth";
import {
  DRIVER_TYPES,
  type AvailableDrivers,
  type DriversResponse,
} from "@src/types/driver";


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


// GET /api/dns/driver - Get current driver configuration and available drivers
export async function GetDriverConfiguration(_req: Request, _user: AuthUser): Promise<Response> {
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

export default {
  driver: { 
    GET: Auth.guard(GetDriverConfiguration)
  },
};