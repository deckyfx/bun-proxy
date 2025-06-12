import { dnsManager } from "@src/dns/manager";
import { Auth, type AuthUser } from "@utils/auth";
import { 
  DRIVER_TYPES, 
  DRIVER_METHODS, 
  type DriverConfig, 
  type DriverListResponse, 
  type DriverCheckResponse, 
  type DriverActionResponse, 
  type DriverErrorResponse 
} from "@src/types/driver";
import { dnsEventService } from "@src/dns/DNSEventService";
import { 
  createCacheDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability,
  getDriverName
} from "./utils";
import { trySync, tryAsync } from "@src/utils/try";

// GET /api/dns/cache - Get cache driver configuration
export async function GetCacheDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.CACHE,
        implementation: getDriverName(drivers.cache),
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  });

  if (error) {
    return createErrorResponse(
      'Failed to get cache driver configuration',
      error.message
    );
  }

  return result;
}

// POST /api/dns/cache - Handle cache driver operations
export async function HandleCacheDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const [body, parseError] = await tryAsync(() => req.json());
    if (parseError) {
      return createErrorResponse('Invalid JSON', parseError.message, 400);
    }
    
    const config = body as DriverConfig;
    if (!config.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const configWithScope = { ...config, scope: DRIVER_TYPES.CACHE };

    switch (configWithScope.method) {
      case DRIVER_METHODS.SET:
        return await setCacheDriver(configWithScope);
      case DRIVER_METHODS.GET:
        return await getCacheDriverContent(configWithScope);
      case DRIVER_METHODS.CLEAR:
        return await clearCacheDriver(configWithScope);
      case DRIVER_METHODS.ADD:
        return await addCacheEntry(configWithScope);
      case DRIVER_METHODS.REMOVE:
        return await removeCacheEntry(configWithScope);
      case DRIVER_METHODS.UPDATE:
        return await updateCacheEntry(configWithScope);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, or UPDATE', 400);
    }
  });

  if (error) {
    return createErrorResponse(
      'Failed to process cache driver operation',
      error.message
    );
  }

  return result;
}

async function setCacheDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const newDriverInstance = createCacheDriverInstance(config.driver!, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, cache: newDriverInstance };
    await dnsManager.updateDriverConfiguration(updatedDrivers);
    
    // Driver configuration is handled by updateDriverConfiguration above
    
    const status = dnsManager.getStatus();
    return createSuccessResponse({
      message: `Cache driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      serverRunning: status.enabled
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to set cache driver',
      error.message
    );
  }

  return result;
}

async function getCacheDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;
    
    if (!cacheDriver) {
      const errorResponse: DriverErrorResponse = {
        success: false,
        scope: config.scope,
        driver: getDriverName(drivers.cache),
        error: 'Cache driver not available',
        timestamp: Date.now()
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (config.key) {
      // Check specific entry
      const exists = await cacheDriver.has(config.key!);
      const checkResponse: DriverCheckResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.cache),
        exists,
        key: config.key,
        timestamp: Date.now()
      };
      return createSuccessResponse(checkResponse);
    } else {
      // Get all entries with their keys
      const keys = await cacheDriver.keys();
      const cacheEntries = await Promise.all(
        keys.map(async (key: string) => {
          const value = await cacheDriver.get(key);
          return value ? { key, ...value } : null; // Add key to the CachedDnsResponse
        })
      );
      
      // Filter out null entries and apply additional filtering
      let filteredEntries = cacheEntries.filter(entry => entry !== null);
      
      if (config.filter && config.filter.key) {
        filteredEntries = filteredEntries.filter(entry => 
          entry && entry.packet && entry.packet.questions && entry.packet.questions.length > 0 &&
          entry.packet.questions[0]!.name.toLowerCase().includes(config.filter!.key.toLowerCase())
        );
      }
      
      const listResponse: DriverListResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.cache),
        entries: filteredEntries,
        timestamp: Date.now(),
        metadata: {
          total: filteredEntries.length,
          filtered: config.filter ? filteredEntries.length : undefined,
          timestamp: new Date().toISOString()
        }
      };
      return createSuccessResponse(listResponse);
    }
  });

  if (error) {
    const errorResponse: DriverErrorResponse = {
      success: false,
      scope: config.scope,
      error: error.message,
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return result;
}

async function clearCacheDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;
    let cleared = false;
    let message = '';

    if (cacheDriver && typeof cacheDriver.clear === 'function') {
      await cacheDriver.clear();
      cleared = true;
      message = 'Cache cleared successfully';
      
      // Emit SSE event for cache update
      dnsEventService.refreshDriverContent(DRIVER_TYPES.CACHE);
    } else {
      message = 'Cache driver does not support clearing';
    }

    const actionResponse: DriverActionResponse = {
      success: cleared,
      scope: config.scope,
      driver: getDriverName(drivers.cache),
      message,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to clear cache driver',
      error.message
    );
  }

  return result;
}

async function addCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key || config.value === undefined) {
    return createErrorResponse('Missing required fields', 'key and value are required for ADD method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.set !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support adding entries');
    }

    await cacheDriver.set(config.key!, config.value, config.ttl);

    // Emit SSE event for cache update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.CACHE);

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.cache),
      message: `Cache entry added successfully`,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to add cache entry',
      error.message
    );
  }

  return result;
}

async function removeCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key is required for REMOVE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.delete !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support removing entries');
    }

    const deleted = await cacheDriver.delete(config.key!);

    // Emit SSE event for cache update if something was deleted
    if (deleted) {
      dnsEventService.refreshDriverContent(DRIVER_TYPES.CACHE);
    }

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.cache),
      message: deleted ? `Cache entry removed successfully` : `Cache entry not found`,
      timestamp: Date.now(),
      affected: deleted ? 1 : 0
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to remove cache entry',
      error.message
    );
  }

  return result;
}

async function updateCacheEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key || config.value === undefined) {
    return createErrorResponse('Missing required fields', 'key and value are required for UPDATE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const cacheDriver = drivers.cache;

    if (!cacheDriver || typeof cacheDriver.set !== 'function' || typeof cacheDriver.has !== 'function') {
      return createErrorResponse('Cache driver not available', 'Cache driver does not support updating entries');
    }

    const exists = await cacheDriver.has(config.key!);
    if (!exists) {
      return createErrorResponse('Entry not found', `Cache entry with key '${config.key}' does not exist`, 404);
    }

    await cacheDriver.set(config.key!, config.value, config.ttl);

    // Emit SSE event for cache update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.CACHE);

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.cache),
      message: `Cache entry updated successfully`,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to update cache entry',
      error.message
    );
  }

  return result;
}

export default {
  cache: { 
    GET: Auth.guard(GetCacheDriverInfo), 
    POST: Auth.guard(HandleCacheDriverOperation) 
  },
};