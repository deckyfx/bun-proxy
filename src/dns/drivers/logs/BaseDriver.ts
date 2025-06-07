import { v4 as uuidv4 } from 'uuid';

export interface DNSQueryInfo {
  domain: string;
  type: 'A' | 'AAAA' | 'MX' | 'CNAME' | 'UNKNOWN' | string;
  querySize: number;
  clientIP?: string;
  clientPort?: number;
  dnsFlags?: {
    recursionDesired: boolean;
    recursionAvailable?: boolean;
    authenticated?: boolean;
    truncated?: boolean;
  };
}

export interface DNSResponseInfo {
  responseSize: number;
  ttl?: number;
  answerCount?: number;
  authorityCount?: number;
  additionalCount?: number;
  resolvedAddresses?: string[];
  dnsFlags?: {
    recursionAvailable: boolean;
    authenticated: boolean;
    truncated: boolean;
  };
}

// Base interface for all log entries
export interface BaseLogEntry {
  // Correlation
  requestId: string; // UUID to correlate request/response pairs
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  
  // Request context
  query: DNSQueryInfo;
  source: 'client' | 'internal' | 'upstream';
}

// Request log entry - logged immediately when request arrives
export interface RequestLogEntry extends BaseLogEntry {
  type: 'request';
  
  // Routing decisions
  provider?: string; // Selected provider (if determined)
  providerEndpoint?: string;
  
  // Pre-processing results
  cached: boolean; // Will be served from cache?
  blocked: boolean; // Blocked by blacklist?
  whitelisted: boolean; // Explicitly allowed?
  
  // Request routing info
  attempt: number; // Which attempt this is (for retries)
}

// Response log entry - logged when response received or error occurs
export interface ResponseLogEntry extends BaseLogEntry {
  type: 'response';
  
  // Provider that handled the request
  provider: string;
  providerEndpoint?: string;
  attempt: number;
  
  // Timing
  responseTime: number; // Total time from request to response
  
  // Response data
  response?: DNSResponseInfo;
  success: boolean;
  
  // Error information
  error?: string;
  errorCode?: string;
  
  // Final state
  cached: boolean; // Was served from cache?
  blocked: boolean; // Was blocked?
  whitelisted: boolean; // Was whitelisted?
}

// Union type for all log entries
export type LogEntry = RequestLogEntry | ResponseLogEntry;

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
  type?: 'request' | 'response';
  
  // Basic filters
  level?: string;
  domain?: string;
  provider?: string;
  queryType?: string;
  source?: 'client' | 'internal' | 'upstream';
  
  // State filters
  success?: boolean; // Only for response entries
  cached?: boolean;
  blocked?: boolean;
  whitelisted?: boolean;
  
  // Timing filters
  startTime?: Date;
  endTime?: Date;
  minResponseTime?: number; // Only for response entries
  maxResponseTime?: number; // Only for response entries
  
  // Request correlation
  requestId?: string; // Get specific request/response pair
  
  // Client filters
  clientIP?: string;
  
  // Error filters
  errorCode?: string; // Only for response entries
  hasError?: boolean; // Only for response entries
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Advanced filters
  attempt?: number; // Filter by retry attempt
  orphanRequests?: boolean; // Requests without responses
  orphanResponses?: boolean; // Responses without requests
}

export abstract class BaseDriver {
  protected options: LogOptions;

  constructor(options: LogOptions = {}) {
    this.options = options;
  }

  abstract log(entry: LogEntry): Promise<void>;
  abstract getLogs(filter?: LogFilter): Promise<LogEntry[]>;
  abstract clear(): Promise<void>;
  abstract cleanup(): Promise<void>;
  abstract stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }>;

  // Helper methods for request/response correlation
  async getRequestResponsePair(requestId: string): Promise<{ request?: RequestLogEntry; response?: ResponseLogEntry }> {
    const logs = await this.getLogs({ requestId });
    const request = logs.find(log => log.type === 'request') as RequestLogEntry;
    const response = logs.find(log => log.type === 'response') as ResponseLogEntry;
    return { request, response };
  }

  async getOrphanRequests(): Promise<RequestLogEntry[]> {
    return await this.getLogs({ orphanRequests: true }) as RequestLogEntry[];
  }

  async getOrphanResponses(): Promise<ResponseLogEntry[]> {
    return await this.getLogs({ orphanResponses: true }) as ResponseLogEntry[];
  }

  async getRequestsOnly(filter?: Omit<LogFilter, 'type'>): Promise<RequestLogEntry[]> {
    return await this.getLogs({ ...filter, type: 'request' }) as RequestLogEntry[];
  }

  async getResponsesOnly(filter?: Omit<LogFilter, 'type'>): Promise<ResponseLogEntry[]> {
    return await this.getLogs({ ...filter, type: 'response' }) as ResponseLogEntry[];
  }

  async getAllLogs(filter?: Omit<LogFilter, 'type'>): Promise<LogEntry[]> {
    return await this.getLogs(filter); // No type filter = get all
  }

  // Utility method to generate request IDs
  protected generateRequestId(): string {
    return uuidv4();
  }
}