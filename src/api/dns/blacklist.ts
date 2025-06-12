import { dnsManager } from "@src/dns/manager";
import { dnsResolver } from "@src/dns/resolver";
import { Auth, type AuthUser } from "@utils/auth";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse, type DriverListResponse, type DriverCheckResponse, type DriverActionResponse, type DriverImportResponse, type DriverErrorResponse } from "@src/types/driver";
import type { BlacklistEntry } from "@src/dns/drivers/blacklist/BaseDriver";
import { dnsEventService } from "@src/dns/DNSEventService";
import { 
  createBlacklistDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability,
  getDriverName
} from "./utils";
import { trySync, tryAsync } from "@src/utils/try";

// GET /api/dns/blacklist - Get blacklist driver configuration
export async function GetBlacklistDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
    const drivers = getDrivers();
    const serverRunning = isServerRunning();

    const response = {
      current: {
        type: DRIVER_TYPES.BLACKLIST,
        implementation: getDriverName(drivers.blacklist),
        status: serverRunning ? 'active' : 'inactive'
      },
      available: ['inmemory', 'file', 'sqlite']
    };

    return createSuccessResponse(response);
  });

  if (error) {
    return createErrorResponse(
      'Failed to get blacklist driver configuration',
      error.message
    );
  }

  return result;
}

// POST /api/dns/blacklist - Handle blacklist driver operations
export async function HandleBlacklistDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const [body, parseError] = await tryAsync(() => req.json());
    if (parseError) {
      return createErrorResponse('Invalid JSON', parseError.message, 400);
    }
    
    const config = body as DriverConfig;
    if (!config.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const configWithScope = { ...config, scope: DRIVER_TYPES.BLACKLIST };

    switch (configWithScope.method) {
      case DRIVER_METHODS.SET:
        return await setBlacklistDriver(configWithScope);
      case DRIVER_METHODS.GET:
        return await getBlacklistDriverContent(configWithScope);
      case DRIVER_METHODS.CLEAR:
        return await clearBlacklistDriver(configWithScope);
      case DRIVER_METHODS.ADD:
        return await addBlacklistEntry(configWithScope);
      case DRIVER_METHODS.REMOVE:
        return await removeBlacklistEntry(configWithScope);
      case DRIVER_METHODS.UPDATE:
        return await updateBlacklistEntry(configWithScope);
      case DRIVER_METHODS.IMPORT:
        return await importBlacklistEntries(configWithScope);
      case DRIVER_METHODS.EXPORT:
        return await exportBlacklistEntries(configWithScope);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, UPDATE, IMPORT, or EXPORT', 400);
    }
  });

  if (error) {
    return createErrorResponse(
      'Failed to process blacklist driver operation',
      error.message
    );
  }

  return result;
}

async function setBlacklistDriver(config: DriverConfig): Promise<Response> {
  if (!config.driver) {
    return createErrorResponse('Missing driver field', 'driver field is required for SET method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const newDriverInstance = createBlacklistDriverInstance(config.driver!, config.options);
    const currentDrivers = dnsManager.getLastUsedDrivers();
    
    const updatedDrivers = { ...currentDrivers, blacklist: newDriverInstance };
    await dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    return createSuccessResponse({
      message: `Blacklist driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
      serverRunning: status.enabled
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to set blacklist driver',
      error.message
    );
  }

  return result;
}

async function getBlacklistDriverContent(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;
    
    if (!blacklistDriver) {
      const errorResponse: DriverErrorResponse = {
        success: false,
        scope: config.scope,
        driver: 'none',
        error: 'Blacklist driver not available',
        timestamp: Date.now()
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (config.key) {
      // Check if specific domain exists
      const exists = await blacklistDriver.contains(config.key!);
      const checkResponse: DriverCheckResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.blacklist),
        exists,
        key: config.key,
        timestamp: Date.now()
      };
      return createSuccessResponse(checkResponse);
    } else {
      // Get all entries
      const category = config.filter?.category;
      let entries = await blacklistDriver.list(category);
      
      // Apply additional filtering if specified
      if (config.filter) {
        if (config.filter.domain) {
          entries = entries.filter((entry: BlacklistEntry) => 
            entry.domain.toLowerCase().includes(config.filter!.domain.toLowerCase())
          );
        }
        if (config.filter.source) {
          entries = entries.filter((entry: BlacklistEntry) => entry.source === config.filter!.source);
        }
        if (config.filter.reason) {
          entries = entries.filter((entry: BlacklistEntry) => 
            entry.reason && entry.reason.toLowerCase().includes(config.filter!.reason.toLowerCase())
          );
        }
      }

      const listResponse: DriverListResponse = {
        success: true,
        scope: config.scope,
        driver: getDriverName(drivers.blacklist),
        entries,
        timestamp: Date.now(),
        metadata: {
          total: entries.length,
          filtered: config.filter ? entries.length : undefined,
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

async function clearBlacklistDriver(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;
    let cleared = false;
    let message = '';

    if (blacklistDriver && typeof blacklistDriver.clear === 'function') {
      await blacklistDriver.clear();
      cleared = true;
      message = 'Blacklist cleared successfully';
      
      // Emit SSE event for blacklist update
      dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);
    } else {
      message = 'Blacklist driver does not support clearing';
    }

    return createSuccessResponse({
      success: cleared,
      message,
      scope: config.scope,
      driver: getDriverName(drivers.blacklist),
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to clear blacklist driver',
      error.message
    );
  }

  return result;
}

async function addBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for ADD method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.add !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support adding entries');
    }

    await blacklistDriver.add(config.key!, config.reason, config.category);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Domain added to blacklist successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to add blacklist entry',
      error.message
    );
  }

  return result;
}

async function removeBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for REMOVE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.remove !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support removing entries');
    }

    const removed = await blacklistDriver.remove(config.key!);

    // Emit SSE event for blacklist update (only if removal was successful)
    if (removed) {
      dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);
    }

    return createSuccessResponse({
      message: removed ? `Domain removed from blacklist successfully` : `Domain not found in blacklist`,
      domain: config.key,
      removed,
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to remove blacklist entry',
      error.message
    );
  }

  return result;
}

async function updateBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for UPDATE method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.contains !== 'function' || typeof blacklistDriver.remove !== 'function' || typeof blacklistDriver.add !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support updating entries');
    }

    const exists = await blacklistDriver.contains(config.key!);
    if (!exists) {
      return createErrorResponse('Entry not found', `Domain '${config.key}' is not in the blacklist`, 404);
    }

    // Remove and re-add with new values
    await blacklistDriver.remove(config.key!);
    await blacklistDriver.add(config.key!, config.reason, config.category);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Blacklist entry updated successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to update blacklist entry',
      error.message
    );
  }

  return result;
}

async function importBlacklistEntries(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.entries || !Array.isArray(config.entries)) {
    return createErrorResponse('Missing required field', 'entries array is required for IMPORT method', 400);
  }

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.import !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support importing entries');
    }

    const entriesWithDefaults = config.entries!.map(entry => ({
      domain: entry.domain || entry.key || '',
      reason: entry.reason || 'Imported entry',
      addedAt: Date.now(),
      source: 'import' as const,
      category: entry.category || 'imported'
    }));

    const imported = await blacklistDriver.import(entriesWithDefaults);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Successfully imported ${imported} blacklist entries`,
      imported,
      total: config.entries!.length,
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to import blacklist entries',
      error.message
    );
  }

  return result;
}

async function exportBlacklistEntries(_config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  const [result, error] = await tryAsync(async () => {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.export !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support exporting entries');
    }

    const entries = await blacklistDriver.export();

    return createSuccessResponse({
      message: `Successfully exported ${entries.length} blacklist entries`,
      entries,
      count: entries.length,
      timestamp: new Date().toISOString()
    });
  });

  if (error) {
    return createErrorResponse(
      'Failed to export blacklist entries',
      error.message
    );
  }

  return result;
}

export default {
  blacklist: { 
    GET: Auth.guard(GetBlacklistDriverInfo), 
    POST: Auth.guard(HandleBlacklistDriverOperation) 
  },
};