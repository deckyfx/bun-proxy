import { dnsManager } from "@src/dns/manager";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from "@src/types/driver";
import { 
  createBlacklistDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability 
} from "./utils";

// GET /api/dns/blacklist - Get blacklist driver configuration
export async function GetBlacklistDriverInfo(_req: Request): Promise<Response> {
  try {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.BLACKLIST,
        implementation: drivers.blacklist?.constructor.DRIVER_NAME || 'inmemory',
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(
      'Failed to get blacklist driver configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// POST /api/dns/blacklist - Handle blacklist driver operations (SET/GET/CLEAR)
export async function HandleBlacklistDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.BLACKLIST };

    if (config.method === DRIVER_METHODS.SET) {
      return await setBlacklistDriver(config);
    } else if (config.method === DRIVER_METHODS.GET) {
      return await getBlacklistDriverContent(config);
    } else if (config.method === DRIVER_METHODS.CLEAR) {
      return await clearBlacklistDriver(config);
    } else {
      return createErrorResponse('Invalid method', 'method must be SET, GET, or CLEAR', 400);
    }
  } catch (error) {
    return createErrorResponse(
      'Failed to process blacklist driver operation',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function setBlacklistDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  try {
    const newDriverInstance = createBlacklistDriverInstance(config.driver, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, blacklist: newDriverInstance };
    dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    let driverUpdated = false;
    
    if (status.enabled && status.server) {
      const server = dnsManager.getServerInstance();
      if (server) {
        server.setBlacklistDriver(newDriverInstance);
        driverUpdated = true;
      }
    }
    
    return createSuccessResponse({
      message: `Blacklist driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      hotSwapped: driverUpdated,
      serverRunning: status.enabled
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to set blacklist driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function getBlacklistDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;
    let content: any = null;
    
    if (blacklistDriver && typeof blacklistDriver.getAll === 'function') {
      content = await blacklistDriver.getAll();
    } else {
      content = 'Blacklist driver does not support content retrieval';
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers.blacklist?.constructor.DRIVER_NAME || 'unknown',
      content,
      metadata: {
        total: Array.isArray(content) ? content.length : 0,
        timestamp: new Date().toISOString()
      }
    };

    return createSuccessResponse(response);
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

async function clearBlacklistDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;
    let cleared = false;
    let message = '';

    if (blacklistDriver && typeof blacklistDriver.clear === 'function') {
      await blacklistDriver.clear();
      cleared = true;
      message = 'Blacklist cleared successfully';
    } else {
      message = 'Blacklist driver does not support clearing';
    }

    return createSuccessResponse({
      success: cleared,
      message,
      scope: config.scope,
      driver: drivers.blacklist?.constructor.DRIVER_NAME || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to clear blacklist driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  blacklist: { 
    GET: GetBlacklistDriverInfo, 
    POST: HandleBlacklistDriverOperation 
  },
};