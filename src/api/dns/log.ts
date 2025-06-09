import { dnsManager } from "@src/dns/manager";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from "@src/types/driver";
import { 
  createLogsDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability 
} from "./utils";

// GET /api/dns/log - Get logs driver configuration
export async function GetLogsDriverInfo(_req: Request): Promise<Response> {
  try {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.LOGS,
        implementation: drivers.logs?.constructor.DRIVER_NAME || 'console',
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['console', 'inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(
      'Failed to get logs driver configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// POST /api/dns/log - Handle logs driver operations (SET/GET/CLEAR)
export async function HandleLogsDriverOperation(req: Request): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.LOGS };

    if (config.method === DRIVER_METHODS.SET) {
      return await setLogsDriver(config);
    } else if (config.method === DRIVER_METHODS.GET) {
      return await getLogsDriverContent(config);
    } else if (config.method === DRIVER_METHODS.CLEAR) {
      return await clearLogsDriver(config);
    } else {
      return createErrorResponse('Invalid method', 'method must be SET, GET, or CLEAR', 400);
    }
  } catch (error) {
    return createErrorResponse(
      'Failed to process logs driver operation',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function setLogsDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  try {
    const newDriverInstance = createLogsDriverInstance(config.driver, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, logs: newDriverInstance };
    dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    let driverUpdated = false;
    
    if (status.enabled && status.server) {
      const server = dnsManager.getServerInstance();
      if (server) {
        server.setLogDriver(newDriverInstance);
        driverUpdated = true;
      }
    }
    
    return createSuccessResponse({
      message: `Logs driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      hotSwapped: driverUpdated,
      serverRunning: status.enabled
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to set logs driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function getLogsDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const logsDriver = drivers.logs;
    let content: any = null;
    
    if (logsDriver && typeof logsDriver.getLogs === 'function') {
      content = await logsDriver.getLogs(config.filter);
    } else {
      content = 'Logs driver does not support content retrieval';
    }

    const response: DriverContentResponse = {
      success: true,
      scope: config.scope,
      driver: drivers.logs?.constructor.DRIVER_NAME || 'unknown',
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

async function clearLogsDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const logsDriver = drivers.logs;
    let cleared = false;
    let message = '';

    if (logsDriver && typeof logsDriver.clear === 'function') {
      await logsDriver.clear();
      cleared = true;
      message = 'Logs cleared successfully';
    } else {
      message = 'Logs driver does not support clearing';
    }

    return createSuccessResponse({
      success: cleared,
      message,
      scope: config.scope,
      driver: drivers.logs?.constructor.DRIVER_NAME || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to clear logs driver',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  log: { 
    GET: GetLogsDriverInfo, 
    POST: HandleLogsDriverOperation 
  },
};