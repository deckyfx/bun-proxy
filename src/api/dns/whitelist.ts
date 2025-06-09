import { dnsManager } from "@src/dns/manager";
import { Auth, type AuthUser } from "@utils/auth";
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
export async function GetWhitelistDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
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

// POST /api/dns/whitelist - Handle whitelist driver operations
export async function HandleWhitelistDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.WHITELIST };

    switch (config.method) {
      case DRIVER_METHODS.SET:
        return await setWhitelistDriver(config);
      case DRIVER_METHODS.GET:
        return await getWhitelistDriverContent(config);
      case DRIVER_METHODS.CLEAR:
        return await clearWhitelistDriver(config);
      case DRIVER_METHODS.ADD:
        return await addWhitelistEntry(config);
      case DRIVER_METHODS.REMOVE:
        return await removeWhitelistEntry(config);
      case DRIVER_METHODS.UPDATE:
        return await updateWhitelistEntry(config);
      case DRIVER_METHODS.IMPORT:
        return await importWhitelistEntries(config);
      case DRIVER_METHODS.EXPORT:
        return await exportWhitelistEntries(config);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, UPDATE, IMPORT, or EXPORT', 400);
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
    
    if (whitelistDriver) {
      if (config.key) {
        // Get specific domain check
        content = await whitelistDriver.contains(config.key);
      } else {
        // Get all entries
        const category = config.filter?.category;
        content = await whitelistDriver.list(category);
        
        // Apply additional filtering if specified
        if (config.filter) {
          if (config.filter.domain) {
            content = content.filter((entry: any) => 
              entry.domain.toLowerCase().includes(config.filter!.domain.toLowerCase())
            );
          }
          if (config.filter.source) {
            content = content.filter((entry: any) => entry.source === config.filter!.source);
          }
          if (config.filter.reason) {
            content = content.filter((entry: any) => 
              entry.reason && entry.reason.toLowerCase().includes(config.filter!.reason.toLowerCase())
            );
          }
        }
      }
    } else {
      content = 'Whitelist driver not available';
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

async function addWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for ADD method', 400);
  }

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.add !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support adding entries');
    }

    await whitelistDriver.add(config.key, config.reason, config.category);

    return createSuccessResponse({
      message: `Domain added to whitelist successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to add whitelist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function removeWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for REMOVE method', 400);
  }

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.remove !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support removing entries');
    }

    const removed = await whitelistDriver.remove(config.key);

    return createSuccessResponse({
      message: removed ? `Domain removed from whitelist successfully` : `Domain not found in whitelist`,
      domain: config.key,
      removed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to remove whitelist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function updateWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for UPDATE method', 400);
  }

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.contains !== 'function' || typeof whitelistDriver.remove !== 'function' || typeof whitelistDriver.add !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support updating entries');
    }

    const exists = await whitelistDriver.contains(config.key);
    if (!exists) {
      return createErrorResponse('Entry not found', `Domain '${config.key}' is not in the whitelist`, 404);
    }

    // Remove and re-add with new values
    await whitelistDriver.remove(config.key);
    await whitelistDriver.add(config.key, config.reason, config.category);

    return createSuccessResponse({
      message: `Whitelist entry updated successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to update whitelist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function importWhitelistEntries(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.entries || !Array.isArray(config.entries)) {
    return createErrorResponse('Missing required field', 'entries array is required for IMPORT method', 400);
  }

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.import !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support importing entries');
    }

    const entriesWithDefaults = config.entries.map(entry => ({
      domain: entry.domain || entry.key || '',
      reason: entry.reason || 'Imported entry',
      addedAt: new Date(),
      source: 'import' as const,
      category: entry.category || 'imported'
    }));

    const imported = await whitelistDriver.import(entriesWithDefaults);

    return createSuccessResponse({
      message: `Successfully imported ${imported} whitelist entries`,
      imported,
      total: config.entries.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to import whitelist entries',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function exportWhitelistEntries(_config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.export !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support exporting entries');
    }

    const entries = await whitelistDriver.export();

    return createSuccessResponse({
      message: `Successfully exported ${entries.length} whitelist entries`,
      entries,
      count: entries.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to export whitelist entries',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  whitelist: { 
    GET: Auth.guard(GetWhitelistDriverInfo), 
    POST: Auth.guard(HandleWhitelistDriverOperation) 
  },
};