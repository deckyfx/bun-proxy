import { BaseDriver, type LogEntry, type LogOptions, type LogFilter } from './BaseDriver';

export class ConsoleDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'console';
  
  private logCount = 0;
  private firstLogTime?: Date;
  private lastLogTime?: Date;

  constructor(options: LogOptions = {}) {
    super(options);
  }

  async log(entry: LogEntry): Promise<void> {
    this.logCount++;
    this.lastLogTime = new Date();
    if (!this.firstLogTime) {
      this.firstLogTime = new Date();
    }

    // Format log entry for console output
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const requestId = entry.requestId.substring(0, 8); // Short ID for display
    
    let logMessage: string;
    
    if (entry.type === 'server_event') {
      // Server event log format
      logMessage = `[${timestamp}] ${level} ➤ SRV ${entry.eventType?.toUpperCase() || 'UNKNOWN'}: ${entry.message} [${requestId}]`;
      
      if (entry.port) {
        logMessage += ` (port: ${entry.port})`;
      }
      
      if (entry.error) {
        logMessage += ` - Error: ${entry.error}`;
      }
      
      if (entry.uptime) {
        logMessage += ` (uptime: ${Math.floor(entry.uptime / 60)}m ${entry.uptime % 60}s)`;
      }
      
    } else if (entry.type === 'request') {
      // Request log format
      const domain = entry.query.domain;
      const queryType = entry.query.type;
      
      const indicators = [];
      if (entry.cached) indicators.push('🔄');
      if (entry.blocked) indicators.push('🚫');
      if (entry.whitelisted) indicators.push('✅');
      const statusStr = indicators.length > 0 ? ` ${indicators.join('')}` : '';
      
      const providerStr = entry.provider ? ` → ${entry.provider}` : ' → selecting...';
      const attemptStr = entry.attempt > 1 ? ` [attempt ${entry.attempt}]` : '';
      
      logMessage = `[${timestamp}] ${level} ➤ REQ ${domain} (${queryType})${providerStr}${statusStr}${attemptStr} [${requestId}]`;
      
    } else if (entry.type === 'response') {
      // Response log format
      const domain = entry.query.domain;
      const queryType = entry.query.type;
      const success = entry.success ? '✓' : '✗';
      const responseTime = `${entry.responseTime}ms`;
      
      const indicators = [];
      if (entry.cached) indicators.push('🔄');
      if (entry.blocked) indicators.push('🚫');
      if (entry.whitelisted) indicators.push('✅');
      const statusStr = indicators.length > 0 ? ` ${indicators.join('')}` : '';
      
      const attemptStr = entry.attempt > 1 ? ` [attempt ${entry.attempt}]` : '';
      
      logMessage = `[${timestamp}] ${level} ➤ RES ${success} ${domain} (${queryType}) via ${entry.provider} (${responseTime})${statusStr}${attemptStr} [${requestId}]`;
      
      if (entry.response?.resolvedAddresses?.length) {
        logMessage += ` → ${entry.response.resolvedAddresses.slice(0, 2).join(', ')}${entry.response.resolvedAddresses.length > 2 ? '...' : ''}`;
      }
      
      if (entry.error) {
        logMessage += ` - Error: ${entry.error}`;
        if (entry.errorCode) {
          logMessage += ` (${entry.errorCode})`;
        }
      }
    } else {
      // Fallback for unknown log types
      logMessage = `[${timestamp}] ${level} ➤ UNKNOWN ${(entry as any).type}: ${JSON.stringify(entry)} [${requestId}]`;
    }

    // Use appropriate console method based on log level
    switch (entry.level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        console.debug(logMessage);
        break;
      case 'info':
      default:
        console.log(logMessage);
        break;
    }
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    // Console driver doesn't persist logs, so return empty array
    console.warn('ConsoleDriver: getLogs() called but no logs are persisted. Consider using FileDriver or SQLiteDriver for log retrieval.');
    return [];
  }

  async clear(): Promise<void> {
    // Reset internal counters
    this.logCount = 0;
    this.firstLogTime = undefined;
    this.lastLogTime = undefined;
    console.log('ConsoleDriver: Log counters reset');
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for console output
    console.log('ConsoleDriver: No cleanup required for console output');
  }

  async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    return {
      totalEntries: this.logCount,
      oldestEntry: this.firstLogTime,
      newestEntry: this.lastLogTime
    };
  }
}