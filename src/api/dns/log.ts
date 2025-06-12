import { dnsManager } from "@src/dns/manager";
import { Auth, type AuthUser } from "@utils/auth";
import { 
  DRIVER_TYPES, 
  DRIVER_METHODS, 
  type DriverConfig, 
  type DriverListResponse, 
  type DriverActionResponse, 
  type DriverErrorResponse 
} from "@src/types/driver";
import { 
  createLogsDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability,
  getDriverName
} from "./utils";
import { trySync, tryAsync, tryParse } from "@src/utils/try";

// GET /api/dns/log - Get logs driver configuration
export async function GetLogsDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.LOGS,
        implementation: getDriverName(drivers.logs),
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['console', 'inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  });

  if (error) {
    return createErrorResponse(
      'Failed to get logs driver configuration',
      error.message
    );
  }

  return result;
}

// POST /api/dns/log - Handle logs driver operations (SET/GET/CLEAR)
export async function HandleLogsDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const [body, parseError] = await tryAsync(() => req.json());
    if (parseError) {
      return createErrorResponse('Invalid JSON', parseError.message, 400);
    }
    
    const config = body as DriverConfig;
    if (!config.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const configWithScope = { ...config, scope: DRIVER_TYPES.LOGS };

    if (configWithScope.method === DRIVER_METHODS.SET) {
      return await setLogsDriver(configWithScope);
    } else if (configWithScope.method === DRIVER_METHODS.GET) {
      return await getLogsDriverContent(configWithScope);
    } else if (configWithScope.method === DRIVER_METHODS.CLEAR) {
      return await clearLogsDriver(configWithScope);
    } else {
      return createErrorResponse('Invalid method', 'method must be SET, GET, or CLEAR', 400);
    }
  });

  if (error) {
    return createErrorResponse(
      'Failed to process logs driver operation',
      error.message
    );
  }

  return result;
}

async function setLogsDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const newDriverInstance = createLogsDriverInstance(config.driver!, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, logs: newDriverInstance };
    await dnsManager.updateDriverConfiguration(updatedDrivers);
    
    // Driver configuration is handled by updateDriverConfiguration above
    const status = dnsManager.getStatus();
    return createSuccessResponse({
      message: `Logs driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      serverRunning: status.enabled
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to set logs driver',
      error.message
    );
  }

  return result;
}

async function getLogsDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const logsDriver = drivers.logs;
    
    if (!logsDriver || typeof logsDriver.getLogs !== 'function') {
      const errorResponse: DriverErrorResponse = {
        success: false,
        scope: config.scope,
        driver: getDriverName(drivers.logs),
        error: 'Logs driver does not support content retrieval',
        timestamp: Date.now()
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const logEntries = await logsDriver.getLogs(config.filter);
    
    const listResponse: DriverListResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.logs),
      entries: logEntries || [],
      timestamp: Date.now(),
      metadata: {
        total: logEntries ? logEntries.length : 0,
        timestamp: new Date().toISOString()
      }
    };

    return createSuccessResponse(listResponse);
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

async function clearLogsDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
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

    const actionResponse: DriverActionResponse = {
      success: cleared,
      scope: config.scope,
      driver: getDriverName(drivers.logs),
      message,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to clear logs driver',
      error.message
    );
  }

  return result;
}

export default {
  log: { 
    GET: Auth.guard(GetLogsDriverInfo), 
    POST: Auth.guard(HandleLogsDriverOperation) 
  },
};