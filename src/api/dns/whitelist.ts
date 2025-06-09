import { dnsManager } from "@src/dns/manager";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from "@src/types/driver";
import { 
  createWhitelistDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability 
} from "./utils";

// GET /api/dns/whitelist - Get whitelist driver configuration
export async function GetWhitelistDriverInfo(_req: Request): Promise<Response> {
  try {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.WHITELIST,
        implementation: drivers.whitelist?.constructor.DRIVER_NAME || 'inmemory',
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(
      'Failed to get whitelist driver configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// POST /api/dns/whitelist - Handle whitelist driver operations (SET/GET/CLEAR)
export async function HandleWhitelistDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.WHITELIST };

    if (config.method === DRIVER_METHODS.SET) {
      return await setWhitelistDriver(config);
    } else if (config.method === DRIVER_METHODS.GET) {
      return await getWhitelistDriverContent(config);
    } else if (config.method === DRIVER_METHODS.CLEAR) {
      return await clearWhitelistDriver(config);
    } else {
      return createErrorResponse('Invalid method', 'method must be SET, GET, or CLEAR', 400);
    }
  } catch (error) {
    return createErrorResponse(
      'Failed to process whitelist driver operation',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function setWhitelistDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  try {
    const newDriverInstance = createWhitelistDriverInstance(config.driver, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, whitelist: newDriverInstance };
    dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    let driverUpdated = false;
    
    if (status.enabled && status.server) {
      const server = dnsManager.getServerInstance();
      if (server) {
        server.setWhitelistDriver(newDriverInstance);
        driverUpdated = true;
      }
    }
    
    return createSuccessResponse({
      message: `Whitelist driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      hotSwapped: driverUpdated,
      serverRunning: status.enabled
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to set whitelist driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function getWhitelistDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;
    let content: any = null;
    
    if (whitelistDriver && typeof whitelistDriver.getAll === 'function') {
      content = await whitelistDriver.getAll();
    } else {
      content = 'Whitelist driver does not support content retrieval';
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers.whitelist?.constructor.DRIVER_NAME || 'unknown',
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

async function clearWhitelistDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;
    let cleared = false;
    let message = '';

    if (whitelistDriver && typeof whitelistDriver.clear === 'function') {
      await whitelistDriver.clear();
      cleared = true;
      message = 'Whitelist cleared successfully';
    } else {
      message = 'Whitelist driver does not support clearing';
    }

    return createSuccessResponse({
      success: cleared,
      message,
      scope: config.scope,
      driver: drivers.whitelist?.constructor.DRIVER_NAME || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to clear whitelist driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  whitelist: { 
    GET: GetWhitelistDriverInfo, 
    POST: HandleWhitelistDriverOperation 
  },
};