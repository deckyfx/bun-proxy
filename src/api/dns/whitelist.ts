import { dnsManager } from "@src/dns/manager";
import { Auth, type AuthUser } from "@utils/auth";
import { 
  DRIVER_TYPES, 
  DRIVER_METHODS, 
  type DriverConfig, 
  type DriverListResponse, 
  type DriverCheckResponse, 
  type DriverActionResponse, 
  type DriverImportResponse, 
  type DriverErrorResponse 
} from "@src/types/driver";
import type { WhitelistEntry } from "@src/dns/drivers/whitelist/BaseDriver";
import { dnsEventService } from "@src/dns/DNSEventService";
import { 
  createWhitelistDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability,
  getDriverName
} from "./utils";
import { trySync, tryAsync } from "@src/utils/try";

// GET /api/dns/whitelist - Get whitelist driver configuration
export async function GetWhitelistDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.WHITELIST,
        implementation: getDriverName(drivers.whitelist),
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  });

  if (error) {
    return createErrorResponse(
      'Failed to get whitelist driver configuration',
      error.message
    );
  }

  return result;
}

// POST /api/dns/whitelist - Handle whitelist driver operations
export async function HandleWhitelistDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const [body, parseError] = await tryAsync(() => req.json());
    if (parseError) {
      return createErrorResponse('Invalid JSON', parseError.message, 400);
    }
    
    const config = body as DriverConfig;
    if (!config.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const configWithScope = { ...config, scope: DRIVER_TYPES.WHITELIST };

    switch (configWithScope.method) {
      case DRIVER_METHODS.SET:
        return await setWhitelistDriver(configWithScope);
      case DRIVER_METHODS.GET:
        return await getWhitelistDriverContent(configWithScope);
      case DRIVER_METHODS.CLEAR:
        return await clearWhitelistDriver(configWithScope);
      case DRIVER_METHODS.ADD:
        return await addWhitelistEntry(configWithScope);
      case DRIVER_METHODS.REMOVE:
        return await removeWhitelistEntry(configWithScope);
      case DRIVER_METHODS.UPDATE:
        return await updateWhitelistEntry(configWithScope);
      case DRIVER_METHODS.IMPORT:
        return await importWhitelistEntries(configWithScope);
      case DRIVER_METHODS.EXPORT:
        return await exportWhitelistEntries(configWithScope);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, UPDATE, IMPORT, or EXPORT', 400);
    }
  });

  if (error) {
    return createErrorResponse(
      'Failed to process whitelist driver operation',
      error.message
    );
  }

  return result;
}

async function setWhitelistDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const newDriverInstance = createWhitelistDriverInstance(config.driver!, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, whitelist: newDriverInstance };
    await dnsManager.updateDriverConfiguration(updatedDrivers);
    
    // Driver configuration is handled by updateDriverConfiguration above
    const status = dnsManager.getStatus();
    return createSuccessResponse({
      message: `Whitelist driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      serverRunning: status.enabled
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to set whitelist driver',
      error.message
    );
  }

  return result;
}

async function getWhitelistDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;
    
    if (!whitelistDriver) {
      const errorResponse: DriverErrorResponse = {
        success: false,
        scope: config.scope,
        driver: getDriverName(drivers.whitelist),
        error: 'Whitelist driver not available',
        timestamp: Date.now()
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (config.key) {
      // Check specific domain
      const exists = await whitelistDriver.contains(config.key);
      const checkResponse: DriverCheckResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.whitelist),
        exists,
        key: config.key,
        timestamp: Date.now()
      };
      return createSuccessResponse(checkResponse);
    } else {
      // Get all entries
      const category = config.filter?.category;
      let whitelistEntries: WhitelistEntry[] = await whitelistDriver.list(category);
      
      // Apply additional filtering if specified
      if (config.filter) {
        if (config.filter.domain) {
          whitelistEntries = whitelistEntries.filter((entry: WhitelistEntry) => 
            entry.domain.toLowerCase().includes(config.filter!.domain.toLowerCase())
          );
        }
        if (config.filter.source) {
          whitelistEntries = whitelistEntries.filter((entry: WhitelistEntry) => entry.source === config.filter!.source);
        }
        if (config.filter.reason) {
          whitelistEntries = whitelistEntries.filter((entry: WhitelistEntry) => 
            entry.reason && entry.reason.toLowerCase().includes(config.filter!.reason.toLowerCase())
          );
        }
      }
      
      const listResponse: DriverListResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.whitelist),
        entries: whitelistEntries,
        timestamp: Date.now(),
        metadata: {
          total: whitelistEntries.length,
          filtered: config.filter ? whitelistEntries.length : undefined,
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

async function clearWhitelistDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;
    let cleared = false;
    let message = '';

    if (whitelistDriver && typeof whitelistDriver.clear === 'function') {
      await whitelistDriver.clear();
      cleared = true;
      message = 'Whitelist cleared successfully';
      
      // Emit SSE event for whitelist update
      dnsEventService.refreshDriverContent(DRIVER_TYPES.WHITELIST);
    } else {
      message = 'Whitelist driver does not support clearing';
    }

    const actionResponse: DriverActionResponse = {
      success: cleared,
      scope: config.scope,
      driver: getDriverName(drivers.whitelist),
      message,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to clear whitelist driver',
      error.message
    );
  }

  return result;
}

async function addWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for ADD method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.add !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support adding entries');
    }

    await whitelistDriver.add(config.key!, config.reason, config.category);

    // Emit SSE event for whitelist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.WHITELIST);

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.whitelist),
      message: `Domain added to whitelist successfully`,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to add whitelist entry',
      error.message
    );
  }

  return result;
}

async function removeWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for REMOVE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.remove !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support removing entries');
    }

    const removed = await whitelistDriver.remove(config.key!);

    // Emit SSE event for whitelist update (only if removal was successful)
    if (removed) {
      dnsEventService.refreshDriverContent(DRIVER_TYPES.WHITELIST);
    }

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.whitelist),
      message: removed ? `Domain removed from whitelist successfully` : `Domain not found in whitelist`,
      timestamp: Date.now(),
      affected: removed ? 1 : 0
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to remove whitelist entry',
      error.message
    );
  }

  return result;
}

async function updateWhitelistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for UPDATE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.contains !== 'function' || typeof whitelistDriver.remove !== 'function' || typeof whitelistDriver.add !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support updating entries');
    }

    const exists = await whitelistDriver.contains(config.key!);
    if (!exists) {
      return createErrorResponse('Entry not found', `Domain '${config.key}' is not in the whitelist`, 404);
    }

    // Remove and re-add with new values
    await whitelistDriver.remove(config.key!);
    await whitelistDriver.add(config.key!, config.reason, config.category);

    // Emit SSE event for whitelist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.WHITELIST);

    const actionResponse: DriverActionResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.whitelist),
      message: `Whitelist entry updated successfully`,
      timestamp: Date.now()
    };
    return createSuccessResponse(actionResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to update whitelist entry',
      error.message
    );
  }

  return result;
}

async function importWhitelistEntries(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.entries || !Array.isArray(config.entries)) {
    return createErrorResponse('Missing required field', 'entries array is required for IMPORT method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const whitelistDriver = drivers.whitelist;

    if (!whitelistDriver || typeof whitelistDriver.import !== 'function') {
      return createErrorResponse('Whitelist driver not available', 'Whitelist driver does not support importing entries');
    }

    const entriesWithDefaults = config.entries!.map(entry => ({
      domain: entry.domain || entry.key || '',
      reason: entry.reason || 'Imported entry',
      addedAt: Date.now(),
      source: 'import' as const,
      category: entry.category || 'imported'
    }));

    const imported = await whitelistDriver.import(entriesWithDefaults);

    // Emit SSE event for whitelist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.WHITELIST);

    const importResponse: DriverImportResponse = {
      success: true,
      scope: config.scope,
      driver: getDriverName(drivers.whitelist),
      message: `Successfully imported ${imported} whitelist entries`,
      imported,
      timestamp: Date.now()
    };
    return createSuccessResponse(importResponse);
  });

  if (error) {
    return createErrorResponse(
      'Failed to import whitelist entries',
      error.message
    );
  }

  return result;
}

async function exportWhitelistEntries(_config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
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
  });

  if (error) {
    return createErrorResponse(
      'Failed to export whitelist entries',
      error.message
    );
  }

  return result;
}

export default {
  whitelist: { 
    GET: Auth.guard(GetWhitelistDriverInfo), 
    POST: Auth.guard(HandleWhitelistDriverOperation) 
  },
};