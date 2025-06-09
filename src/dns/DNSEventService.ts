import { sseResponder } from '@src/utils/SSEResponder';
import { dnsManager } from '@src/dns/manager';
import { logEventEmitter } from '@src/dns/server';
import { DRIVER_TYPES, type DriverType } from '@src/types/driver';
import type { LogEntry } from '@src/dns/drivers/logs/BaseDriver';

class DNSEventService {
  private static instance: DNSEventService;
  private logEventHandler: (logEntry: LogEntry) => void;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Bind log event handler
    this.logEventHandler = this.handleLogEvent.bind(this);
    
    // Start heartbeat
    this.startHeartbeat();
  }

  static getInstance(): DNSEventService {
    if (!DNSEventService.instance) {
      DNSEventService.instance = new DNSEventService();
    }
    return DNSEventService.instance;
  }

  // Initialize the service (call when first SSE client connects)
  initialize(): void {
    // Start listening to real-time log events
    logEventEmitter.addListener(this.logEventHandler);
    console.log('DNS Event Service initialized');
  }

  // Cleanup the service (call when last SSE client disconnects)
  cleanup(): void {
    // Stop listening to log events
    logEventEmitter.removeListener(this.logEventHandler);
    console.log('DNS Event Service cleaned up');
  }

  // Handle real-time log events from DNS server
  private handleLogEvent(logEntry: LogEntry): void {
    sseResponder.emitDNSLogEvent(logEntry);
  }

  // Emit DNS server status change (called by DNS manager)
  emitStatusChange(status: any): void {
    sseResponder.emitDNSStatus(status);
  }

  // Emit DNS configuration change (called when config updates)
  emitConfigChange(config: any): void {
    sseResponder.emitDNSInfo(config);
  }

  // Emit driver content updates (called when drivers change)
  emitDriverContentUpdate(driverType: DriverType, content: any): void {
    switch (driverType) {
      case DRIVER_TYPES.LOGS:
        sseResponder.emitDNSLogContent(content);
        break;
      case DRIVER_TYPES.CACHE:
        sseResponder.emitDNSCacheContent(content);
        break;
      case DRIVER_TYPES.BLACKLIST:
        sseResponder.emitDNSBlacklistContent(content);
        break;
      case DRIVER_TYPES.WHITELIST:
        sseResponder.emitDNSWhitelistContent(content);
        break;
    }
  }

  // Get current driver content and emit (for refresh operations)
  async refreshDriverContent(driverType: DriverType): Promise<void> {
    try {
      const status = dnsManager.getStatus();
      
      if (!status.enabled || !status.server) {
        // Server not running - emit empty content
        this.emitDriverContentUpdate(driverType, null);
        return;
      }

      const serverInstance = dnsManager.getServerInstance();
      if (!serverInstance) {
        this.emitDriverContentUpdate(driverType, null);
        return;
      }

      const drivers = (serverInstance as any).drivers || {};
      const driver = drivers[driverType];
      
      if (!driver) {
        this.emitDriverContentUpdate(driverType, null);
        return;
      }

      let content: any = null;

      switch (driverType) {
        case DRIVER_TYPES.LOGS:
          if (typeof driver.getLogs === 'function') {
            content = await driver.getLogs();
          }
          break;
        case DRIVER_TYPES.CACHE:
          if (typeof driver.getAll === 'function') {
            const cacheContent = await driver.getAll();
            const stats = typeof driver.stats === 'function' ? await driver.stats() : {};
            content = { entries: cacheContent, stats };
          }
          break;
        case DRIVER_TYPES.BLACKLIST:
        case DRIVER_TYPES.WHITELIST:
          if (typeof driver.getAll === 'function') {
            const listContent = await driver.getAll();
            const stats = typeof driver.stats === 'function' ? await driver.stats() : {};
            content = { entries: listContent, stats };
          }
          break;
      }

      this.emitDriverContentUpdate(driverType, {
        success: true,
        content,
        driver: driver.constructor.DRIVER_NAME || 'unknown',
        timestamp: Date.now()
      });

    } catch (error) {
      this.emitDriverContentUpdate(driverType, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  // Refresh all driver content
  async refreshAllDriverContent(): Promise<void> {
    const driverTypes = Object.values(DRIVER_TYPES) as DriverType[];
    await Promise.all(driverTypes.map(type => this.refreshDriverContent(type)));
  }

  // Start heartbeat mechanism
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      sseResponder.emitSystemHeartbeat();
    }, 30000); // Every 30 seconds
  }

  // Stop heartbeat mechanism
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Graceful shutdown
  shutdown(): void {
    this.cleanup();
    this.stopHeartbeat();
    console.log('DNS Event Service shut down');
  }
}

// Export singleton instance
export const dnsEventService = DNSEventService.getInstance();