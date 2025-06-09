import { dnsManager } from "@src/dns/manager";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from "@src/types/driver";
import { 
  createCacheDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability 
} from "./utils";

// GET /api/dns/cache - Get cache driver configuration
export async function GetCacheDriverInfo(_req: Request): Promise<Response> {
  try {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.CACHE,
        implementation: drivers.cache?.constructor.DRIVER_NAME || 'inmemory',
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(
      'Failed to get cache driver configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// POST /api/dns/cache - Handle cache driver operations (SET/GET/CLEAR)
export async function HandleCacheDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.CACHE };

    if (config.method === DRIVER_METHODS.SET) {
      return await setCacheDriver(config);
    } else if (config.method === DRIVER_METHODS.GET) {
      return await getCacheDriverContent(config);
    } else if (config.method === DRIVER_METHODS.CLEAR) {
      return await clearCacheDriver(config);
    } else {
      return createErrorResponse('Invalid method', 'method must be SET, GET, or CLEAR', 400);
    }
  } catch (error) {
    return createErrorResponse(
      'Failed to process cache driver operation',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function setCacheDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  try {
    const newDriverInstance = createCacheDriverInstance(config.driver, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, cache: newDriverInstance };
    dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    let driverUpdated = false;
    
    if (status.enabled && status.server) {
      const server = dnsManager.getServerInstance();
      if (server) {
        server.setCacheDriver(newDriverInstance);
        driverUpdated = true;
      }
    }
    
    return createSuccessResponse({
      message: `Cache driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      hotSwapped: driverUpdated,
      serverRunning: status.enabled
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to set cache driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function getCacheDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;
    let content: any = null;
    
    if (cacheDriver && typeof cacheDriver.getAll === 'function') {
      content = await cacheDriver.getAll();
    } else {
      content = 'Cache driver does not support content retrieval';
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers.cache?.constructor.DRIVER_NAME || 'unknown',
      content,
      metadata: {
        total: Object.keys(content || {}).length,
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

async function clearCacheDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;
    let cleared = false;
    let message = '';

    if (cacheDriver && typeof cacheDriver.clear === 'function') {
      await cacheDriver.clear();
      cleared = true;
      message = 'Cache cleared successfully';
    } else {
      message = 'Cache driver does not support clearing';
    }

    return createSuccessResponse({
      success: cleared,
      message,
      scope: config.scope,
      driver: drivers.cache?.constructor.DRIVER_NAME || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to clear cache driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  cache: { 
    GET: GetCacheDriverInfo, 
    POST: HandleCacheDriverOperation 
  },
};