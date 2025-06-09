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

// POST /api/dns/cache - Handle cache driver operations
export async function HandleCacheDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.CACHE };

    switch (config.method) {
      case DRIVER_METHODS.SET:
        return await setCacheDriver(config);
      case DRIVER_METHODS.GET:
        return await getCacheDriverContent(config);
      case DRIVER_METHODS.CLEAR:
        return await clearCacheDriver(config);
      case DRIVER_METHODS.ADD:
        return await addCacheEntry(config);
      case DRIVER_METHODS.REMOVE:
        return await removeCacheEntry(config);
      case DRIVER_METHODS.UPDATE:
        return await updateCacheEntry(config);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, or UPDATE', 400);
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
    
    if (cacheDriver) {
      if (config.key) {
        // Get specific entry
        content = await cacheDriver.get(config.key);
      } else {
        // Get all entries
        const keys = await cacheDriver.keys();
        const entries = await Promise.all(
          keys.map(async (key: string) => ({
            key,
            value: await cacheDriver.get(key)
          }))
        );
        
        // Apply filtering if specified
        let filtered = entries.filter(entry => entry.value !== null);
        
        if (config.filter) {
          if (config.filter.key) {
            filtered = filtered.filter(entry => 
              entry.key.toLowerCase().includes(config.filter!.key.toLowerCase())
            );
          }
        }
        
        content = filtered;
      }
    } else {
      content = 'Cache driver not available';
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers.cache?.constructor.DRIVER_NAME || 'unknown',
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

async function addCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key || config.value === undefined) {
    return createErrorResponse('Missing required fields', 'key and value are required for ADD method', 400);
  }

  try {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.set !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support adding entries');
    }

    await cacheDriver.set(config.key, config.value, config.ttl);

    return createSuccessResponse({
      message: `Cache entry added successfully`,
      key: config.key,
      value: config.value,
      ttl: config.ttl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to add cache entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function removeCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key is required for REMOVE method', 400);
  }

  try {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.delete !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support removing entries');
    }

    const deleted = await cacheDriver.delete(config.key);

    return createSuccessResponse({
      message: deleted ? `Cache entry removed successfully` : `Cache entry not found`,
      key: config.key,
      deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to remove cache entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function updateCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key || config.value === undefined) {
    return createErrorResponse('Missing required fields', 'key and value are required for UPDATE method', 400);
  }

  try {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.set !== 'function' || typeof cacheDriver.has !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support updating entries');
    }

    const exists = await cacheDriver.has(config.key);
    if (!exists) {
      return createErrorResponse('Entry not found', `Cache entry with key '${config.key}' does not exist`, 404);
    }

    await cacheDriver.set(config.key, config.value, config.ttl);

    return createSuccessResponse({
      message: `Cache entry updated successfully`,
      key: config.key,
      value: config.value,
      ttl: config.ttl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to update cache entry',
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