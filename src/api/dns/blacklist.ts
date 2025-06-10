import { dnsManager } from "@src/dns/manager";
import { dnsResolver } from "@src/dns/resolver";
import { Auth, type AuthUser } from "@utils/auth";
import { DRIVER_TYPES, DRIVER_METHODS, type DriverConfig, type DriverContentResponse } from "@src/types/driver";
import { dnsEventService } from "@src/dns/DNSEventService";
import { 
  createBlacklistDriverInstance, 
  getDrivers, 
  isServerRunning, 
  createErrorResponse, 
  createSuccessResponse, 
  checkServerAvailability 
} from "./utils";

// GET /api/dns/blacklist - Get blacklist driver configuration
export async function GetBlacklistDriverInfo(_req: Request, _user: AuthUser): Promise<Response> {
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

// POST /api/dns/blacklist - Handle blacklist driver operations
export async function HandleBlacklistDriverOperation(req: Request, _user: AuthUser): Promise<Response> {
  try {
    const body = await req.json() as DriverConfig;
    
    if (!body.method) {
      return createErrorResponse('Missing required field', 'method is required', 400);
    }

    const config = { ...body, scope: DRIVER_TYPES.BLACKLIST };

    switch (config.method) {
      case DRIVER_METHODS.SET:
        return await setBlacklistDriver(config);
      case DRIVER_METHODS.GET:
        return await getBlacklistDriverContent(config);
      case DRIVER_METHODS.CLEAR:
        return await clearBlacklistDriver(config);
      case DRIVER_METHODS.ADD:
        return await addBlacklistEntry(config);
      case DRIVER_METHODS.REMOVE:
        return await removeBlacklistEntry(config);
      case DRIVER_METHODS.UPDATE:
        return await updateBlacklistEntry(config);
      case DRIVER_METHODS.IMPORT:
        return await importBlacklistEntries(config);
      case DRIVER_METHODS.EXPORT:
        return await exportBlacklistEntries(config);
      default:
        return createErrorResponse('Invalid method', 'method must be SET, GET, CLEAR, ADD, REMOVE, UPDATE, IMPORT, or EXPORT', 400);
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
    await dnsManager.updateDriverConfiguration(updatedDrivers);
    
    const status = dnsManager.getStatus();
    return createSuccessResponse({
      message: `Blacklist driver successfully changed to ${config.driver}`,
      scope: config.scope,
      driver: config.driver,
      options: config.options,
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
    
    if (blacklistDriver) {
      if (config.key) {
        // Get specific domain check
        content = await blacklistDriver.contains(config.key);
      } else {
        // Get all entries
        const category = config.filter?.category;
        content = await blacklistDriver.list(category);
        
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
      content = 'Blacklist driver not available';
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
      
      // Emit SSE event for blacklist update
      dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);
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

async function addBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for ADD method', 400);
  }

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.add !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support adding entries');
    }

    await blacklistDriver.add(config.key, config.reason, config.category);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Domain added to blacklist successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to add blacklist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function removeBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for REMOVE method', 400);
  }

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.remove !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support removing entries');
    }

    const removed = await blacklistDriver.remove(config.key);

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
  } catch (error) {
    return createErrorResponse(
      'Failed to remove blacklist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function updateBlacklistEntry(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.key) {
    return createErrorResponse('Missing required field', 'key (domain) is required for UPDATE method', 400);
  }

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.contains !== 'function' || typeof blacklistDriver.remove !== 'function' || typeof blacklistDriver.add !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support updating entries');
    }

    const exists = await blacklistDriver.contains(config.key);
    if (!exists) {
      return createErrorResponse('Entry not found', `Domain '${config.key}' is not in the blacklist`, 404);
    }

    // Remove and re-add with new values
    await blacklistDriver.remove(config.key);
    await blacklistDriver.add(config.key, config.reason, config.category);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Blacklist entry updated successfully`,
      domain: config.key,
      reason: config.reason,
      category: config.category,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to update blacklist entry',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function importBlacklistEntries(config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  if (!config.entries || !Array.isArray(config.entries)) {
    return createErrorResponse('Missing required field', 'entries array is required for IMPORT method', 400);
  }

  try {
    const drivers = getDrivers();
    const blacklistDriver = drivers.blacklist;

    if (!blacklistDriver || typeof blacklistDriver.import !== 'function') {
      return createErrorResponse('Blacklist driver not available', 'Blacklist driver does not support importing entries');
    }

    const entriesWithDefaults = config.entries.map(entry => ({
      domain: entry.domain || entry.key || '',
      reason: entry.reason || 'Imported entry',
      addedAt: new Date(),
      source: 'import' as const,
      category: entry.category || 'imported'
    }));

    const imported = await blacklistDriver.import(entriesWithDefaults);

    // Emit SSE event for blacklist update
    dnsEventService.refreshDriverContent(DRIVER_TYPES.BLACKLIST);

    return createSuccessResponse({
      message: `Successfully imported ${imported} blacklist entries`,
      imported,
      total: config.entries.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      'Failed to import blacklist entries',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function exportBlacklistEntries(_config: DriverConfig): Promise<Response> {
  const serverError = checkServerAvailability();
  if (serverError) return serverError;

  try {
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
  } catch (error) {
    return createErrorResponse(
      'Failed to export blacklist entries',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export default {
  blacklist: { 
    GET: Auth.guard(GetBlacklistDriverInfo), 
    POST: Auth.guard(HandleBlacklistDriverOperation) 
  },
};