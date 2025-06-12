import { v4 as uuidv4 } from 'uuid';
import type { LogEntry } from '@src/types/dns-unified';

export interface LogOptions {
  maxEntries?: number;
  filePath?: string;
  dbPath?: string;
  retention?: number; // days
  
  // Filtering options
  includeSuccessful?: boolean;
  includeErrors?: boolean;
  includeCached?: boolean;
  includeBlocked?: boolean;
  
  // Performance options
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
  enableDetailedDNSInfo?: boolean;
}

export interface LogFilter {
  // Entry type
  type?: 'request' | 'response' | 'error';
  
  // Basic filters
  level?: 'info' | 'warn' | 'error';
  domain?: string;
  provider?: string;
  queryType?: string;
  transport?: 'udp' | 'tcp' | 'doh';
  
  // State filters
  success?: boolean;
  cached?: boolean;
  blocked?: boolean;
  whitelisted?: boolean;
  
  // Timing filters
  startTime?: number; // timestamp
  endTime?: number; // timestamp
  minResponseTime?: number;
  maxResponseTime?: number;
  
  // Request correlation
  id?: string; // Get specific log entry
  
  // Client filters
  clientAddress?: string;
  clientPort?: number;
  
  // Error filters
  hasError?: boolean;
  
  // Pagination
  limit?: number;
  offset?: number;
}

export abstract class BaseDriver {
  static readonly DRIVER_NAME: string = 'base';
  protected options: LogOptions;

  constructor(options: LogOptions = {}) {
    this.options = options;
  }

  abstract log(entry: LogEntry): Promise<void>;
  abstract getLogs(filter?: LogFilter): Promise<LogEntry[]>;
  abstract clear(): Promise<void>;
  abstract cleanup(): Promise<void>;
  abstract stats(): Promise<{ totalEntries: number; oldestEntry?: number; newestEntry?: number }>;

  // Helper methods for different log types
  async getRequestsOnly(filter?: Omit<LogFilter, 'type'>): Promise<LogEntry[]> {
    return await this.getLogs({ ...filter, type: 'request' });
  }

  async getResponsesOnly(filter?: Omit<LogFilter, 'type'>): Promise<LogEntry[]> {
    return await this.getLogs({ ...filter, type: 'response' });
  }

  async getErrorsOnly(filter?: Omit<LogFilter, 'type'>): Promise<LogEntry[]> {
    return await this.getLogs({ ...filter, type: 'error' });
  }

  async getAllLogs(filter?: Omit<LogFilter, 'type'>): Promise<LogEntry[]> {
    return await this.getLogs(filter); // No type filter = get all
  }

  // Utility method to generate request IDs
  protected generateRequestId(): string {
    return uuidv4();
  }
}