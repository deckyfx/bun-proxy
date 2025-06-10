import { BaseProvider } from "./providers";
import type { BaseDriver as LogsBaseDriver, LogEntry } from "./drivers/logs/BaseDriver";
import type { BaseDriver as CachesBaseDriver } from "./drivers/caches/BaseDriver";
import type { BaseDriver as BlacklistBaseDriver } from "./drivers/blacklist/BaseDriver";
import type { BaseDriver as WhitelistBaseDriver } from "./drivers/whitelist/BaseDriver";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";
import { DNSParser, type CachedDNSResponse } from "./parser";
import { logEventEmitter } from "./server";

export interface DNSResolverDrivers {
  logs?: LogsBaseDriver;
  cache?: CachesBaseDriver;
  blacklist?: BlacklistBaseDriver;
  whitelist?: WhitelistBaseDriver;
}

export interface DNSQuery {
  domain: string;
  type: string;
  typeCode: number;
  querySize: number;
}

export interface ClientInfo {
  address?: string;
  port?: number;
  transport: 'udp' | 'tcp' | 'doh';
}

export interface DNSResolutionResult {
  responseBuffer: Buffer;
  logEntries: LogEntry[];
  responseTime: number;
  cached: boolean;
  blocked: boolean;
  whitelisted: boolean;
  provider?: string;
  success: boolean;
  error?: string;
}

export class DNSResolver {
  private static instance: DNSResolver;
  private providers: BaseProvider[];
  private drivers: DNSResolverDrivers = {};
  private initialized: boolean = false;

  private constructor() {
    this.providers = [];
    
    // Set default drivers - logs: Console, others: InMemory
    this.drivers = {
      logs: new ConsoleDriver(),
      cache: new CacheInMemoryDriver(),
      blacklist: new BlacklistInMemoryDriver(),
      whitelist: new WhitelistInMemoryDriver(),
    };
  }

  static getInstance(): DNSResolver {
    if (!DNSResolver.instance) {
      DNSResolver.instance = new DNSResolver();
    }
    return DNSResolver.instance;
  }

  async initialize(providers: BaseProvider[], drivers?: DNSResolverDrivers): Promise<void> {
    this.providers = providers;
    
    if (drivers) {
      this.drivers = { ...this.drivers, ...drivers };
    }
    
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async resolve(queryBuffer: Buffer, clientInfo: ClientInfo): Promise<DNSResolutionResult> {
    const startTime = Date.now();
    const { v4: uuidv4 } = require('uuid');
    const requestId = uuidv4();
    const logEntries: LogEntry[] = [];
    
    // Parse DNS query
    let parsedQuery: any;
    let queryInfo: DNSQuery;
    
    try {
      parsedQuery = require('dns-packet').decode(queryBuffer);
      const question = parsedQuery.questions?.[0];
      if (!question) {
        throw new Error('No question in DNS request');
      }
      
      queryInfo = {
        domain: question.name,
        type: this.getTypeString(question.type),
        typeCode: question.type,
        querySize: queryBuffer.length
      };
    } catch (error) {
      return this.createErrorResponse(
        queryBuffer, 
        requestId, 
        startTime, 
        clientInfo, 
        error instanceof Error ? error.message : String(error),
        logEntries
      );
    }

    // Check blacklist/whitelist first (before cache)
    let blocked = false;
    let whitelisted = false;
    let whitelistEmpty = true;
    
    if (this.drivers.blacklist) {
      try {
        blocked = await this.drivers.blacklist.contains(queryInfo.domain);
      } catch (error) {
        console.warn('Blacklist check failed:', error);
      }
    }
    
    if (this.drivers.whitelist) {
      try {
        // Check if whitelist has entries
        const whitelistStats = await this.drivers.whitelist.stats();
        whitelistEmpty = whitelistStats.totalEntries === 0;
        
        if (!whitelistEmpty) {
          whitelisted = await this.drivers.whitelist.contains(queryInfo.domain);
        }
      } catch (error) {
        console.warn('Whitelist check failed:', error);
      }
    }
    
    // Determine if request should be blocked:
    // 1. If blacklisted and not whitelisted -> block
    // 2. If whitelist is not empty and domain not in whitelist -> block
    const shouldBlock = (blocked && !whitelisted) || (!whitelistEmpty && !whitelisted);
    
    if (shouldBlock) {
      return this.createBlockedResponse(
        queryBuffer,
        parsedQuery,
        requestId,
        startTime,
        queryInfo,
        clientInfo,
        blocked,
        whitelisted,
        logEntries
      );
    }
    
    // Check cache after blacklist/whitelist checks
    const cacheKey = `${queryInfo.domain}:${queryInfo.type}`;
    let cached = false;
    
    if (this.drivers.cache) {
      try {
        const cachedData = await this.drivers.cache.get(cacheKey) as CachedDNSResponse | null;
        if (cachedData && !this.isCachedResponseExpired(cachedData)) {
          // Create DNS response from cached detailed JSON data
          const responseBuffer = DNSParser.createDNSResponseFromCachedData(queryBuffer, cachedData);
          cached = true;
          
          // Extract IP addresses from cached data for logging
          const resolvedAddresses = cachedData.answers
            .filter(record => record.type === 'A' || record.type === 'AAAA')
            .map(record => record.data as string);
          
          const responseTime = Date.now() - startTime;
          
          const responseLogEntry: LogEntry = {
            type: 'response',
            requestId,
            timestamp: new Date(),
            level: 'info',
            query: {
              domain: queryInfo.domain,
              type: queryInfo.type,
              querySize: queryInfo.querySize,
              clientIP: clientInfo?.address,
              clientPort: clientInfo?.port
            },
            provider: 'cache',
            attempt: 1,
            responseTime,
            response: {
              responseSize: responseBuffer.length,
              resolvedAddresses: resolvedAddresses.length > 0 ? resolvedAddresses : undefined
            },
            success: true,
            cached: true,
            blocked: false,
            whitelisted: false,
            source: 'client'
          };
          
          logEntries.push(responseLogEntry);
          this.emitLogEntry(responseLogEntry);
          
          return {
            responseBuffer,
            logEntries,
            responseTime,
            cached: true,
            blocked: false,
            whitelisted: false,
            provider: 'cache',
            success: true
          };
        }
      } catch (error) {
        console.warn('Cache lookup failed:', error);
      }
    }
    
    // Log the incoming request
    const requestLogEntry: LogEntry = {
      type: 'request',
      requestId,
      timestamp: new Date(),
      level: 'info',
      query: {
        domain: queryInfo.domain,
        type: queryInfo.type,
        querySize: queryInfo.querySize,
        clientIP: clientInfo?.address,
        clientPort: clientInfo?.port
      },
      source: 'client',
      cached,
      blocked,
      whitelisted,
      attempt: 1
    };
    
    logEntries.push(requestLogEntry);
    this.emitLogEntry(requestLogEntry);

    // Try providers in order
    for (const provider of this.getOptimizedProviderOrder()) {
      try {
        const responseBuffer = await provider.resolve(queryBuffer);
        const responseTime = Date.now() - startTime;
        
        // Parse the response using detailed JSON parsing for caching
        let resolvedAddresses: string[] = [];
        try {
          const detailedResponse = DNSParser.parseDetailedDNSResponse(responseBuffer);
          
          // Cache the detailed JSON response
          if (this.drivers.cache) {
            const cacheKey = `${queryInfo.domain}:${queryInfo.type}`;
            const cacheTTL = detailedResponse.ttl * 1000; // Convert to milliseconds
            await this.drivers.cache.set(cacheKey, detailedResponse, cacheTTL);
          }
          
          // Extract addresses for logging
          resolvedAddresses = detailedResponse.answers
            .filter(record => record.type === 'A' || record.type === 'AAAA')
            .map(record => record.data as string);
        } catch (parseError) {
          console.warn('Failed to parse DNS response for caching:', parseError);
          // Fallback to old caching method
          try {
            const parsedResponse = DNSParser.parseDNSResponse(responseBuffer);
            const cacheableRecords = DNSParser.extractCacheableRecords(parsedResponse);
            resolvedAddresses = cacheableRecords.flatMap(record => record.addresses);
          } catch (fallbackError) {
            console.warn('Fallback parsing also failed:', fallbackError);
          }
        }
        
        // Log the successful response
        const responseLogEntry: LogEntry = {
          type: 'response',
          requestId,
          timestamp: new Date(),
          level: 'info',
          query: {
            domain: queryInfo.domain,
            type: queryInfo.type,
            querySize: queryInfo.querySize,
            clientIP: clientInfo?.address,
            clientPort: clientInfo?.port
          },
          provider: provider.name,
          attempt: 1,
          responseTime,
          response: {
            responseSize: responseBuffer.length,
            resolvedAddresses: resolvedAddresses.length > 0 ? resolvedAddresses : undefined
          },
          success: true,
          cached: false,
          blocked,
          whitelisted,
          source: 'client'
        };
        
        logEntries.push(responseLogEntry);
        this.emitLogEntry(responseLogEntry);
        
        return {
          responseBuffer,
          logEntries,
          responseTime,
          cached: false,
          blocked,
          whitelisted,
          provider: provider.name,
          success: true
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        const errorLogEntry: LogEntry = {
          type: 'response',
          requestId,
          timestamp: new Date(),
          level: 'error',
          query: {
            domain: queryInfo.domain,
            type: queryInfo.type,
            querySize: queryInfo.querySize,
            clientIP: clientInfo?.address,
            clientPort: clientInfo?.port
          },
          provider: provider.name,
          attempt: 1,
          responseTime,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          cached: false,
          blocked,
          whitelisted,
          source: 'client'
        };
        
        logEntries.push(errorLogEntry);
        this.emitLogEntry(errorLogEntry);
        
        console.warn(`Provider ${provider.name} failed:`, error);
        continue;
      }
    }

    // If all providers fail, return SERVFAIL
    return this.createServFailResponse(
      queryBuffer,
      parsedQuery,
      requestId,
      startTime,
      queryInfo,
      clientInfo,
      blocked,
      whitelisted,
      logEntries
    );
  }

  private createErrorResponse(
    queryBuffer: Buffer,
    requestId: string,
    startTime: number,
    clientInfo: ClientInfo,
    error: string,
    logEntries: LogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;
    
    const errorLogEntry: LogEntry = {
      type: 'response',
      requestId,
      timestamp: new Date(),
      level: 'error',
      query: {
        domain: 'unknown',
        type: 'UNKNOWN',
        querySize: queryBuffer.length,
        clientIP: clientInfo?.address,
        clientPort: clientInfo?.port
      },
      provider: 'dns_resolver',
      attempt: 1,
      responseTime,
      success: false,
      cached: false,
      blocked: false,
      whitelisted: false,
      source: 'client',
      error
    };
    
    logEntries.push(errorLogEntry);
    this.emitLogEntry(errorLogEntry);
    
    // Send SERVFAIL response as buffer
    const errorBuffer = require('dns-packet').encode({
      id: 0,
      type: 'response',
      flags: 384, // QR=1, RD=1
      questions: [],
      answers: [],
      rcode: 2 // SERVFAIL
    });
    
    return {
      responseBuffer: errorBuffer,
      logEntries,
      responseTime,
      cached: false,
      blocked: false,
      whitelisted: false,
      success: false,
      error
    };
  }

  private createBlockedResponse(
    queryBuffer: Buffer,
    parsedQuery: any,
    requestId: string,
    startTime: number,
    queryInfo: DNSQuery,
    clientInfo: ClientInfo,
    blocked: boolean,
    whitelisted: boolean,
    logEntries: LogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;
    
    // Safely extract questions data
    const questions = parsedQuery.questions?.map((q: any) => ({
      name: q.name || queryInfo.domain,
      type: typeof q.type === 'string' ? q.type : this.getTypeString(q.type) || 'A',
      class: typeof q.class === 'string' ? q.class : 'IN'
    })) || [{
      name: queryInfo.domain,
      type: queryInfo.type,
      class: 'IN'
    }];
    
    const blockedResponseBuffer = require('dns-packet').encode({
      id: parsedQuery.id || 0,
      type: 'response',
      flags: 384, // QR=1, RD=1
      questions,
      answers: [],
      rcode: 3 // NXDOMAIN
    });
    
    const requestLogEntry: LogEntry = {
      type: 'request',
      requestId,
      timestamp: new Date(),
      level: 'info',
      query: {
        domain: queryInfo.domain,
        type: queryInfo.type,
        querySize: queryInfo.querySize,
        clientIP: clientInfo?.address,
        clientPort: clientInfo?.port
      },
      source: 'client',
      cached: false,
      blocked: true,
      whitelisted,
      attempt: 1
    };
    
    const responseLogEntry: LogEntry = {
      type: 'response',
      requestId,
      timestamp: new Date(),
      level: 'info',
      query: {
        domain: queryInfo.domain,
        type: queryInfo.type,
        querySize: queryInfo.querySize,
        clientIP: clientInfo?.address,
        clientPort: clientInfo?.port
      },
      provider: blocked ? 'blacklist' : 'whitelist',
      attempt: 1,
      responseTime,
      response: {
        responseSize: blockedResponseBuffer.length
      },
      success: true,
      cached: false,
      blocked: true,
      whitelisted,
      source: 'client'
    };
    
    logEntries.push(requestLogEntry, responseLogEntry);
    this.emitLogEntry(requestLogEntry);
    this.emitLogEntry(responseLogEntry);
    
    return {
      responseBuffer: blockedResponseBuffer,
      logEntries,
      responseTime,
      cached: false,
      blocked: true,
      whitelisted,
      provider: blocked ? 'blacklist' : 'whitelist',
      success: true
    };
  }

  private createServFailResponse(
    queryBuffer: Buffer,
    parsedQuery: any,
    requestId: string,
    startTime: number,
    queryInfo: DNSQuery,
    clientInfo: ClientInfo,
    blocked: boolean,
    whitelisted: boolean,
    logEntries: LogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;
    
    const failResponseBuffer = require('dns-packet').encode({
      id: parsedQuery.id || 0,
      type: 'response',
      flags: 384, // QR=1, RD=1
      questions: parsedQuery.questions || [],
      answers: [],
      rcode: 2 // SERVFAIL
    });
    
    return {
      responseBuffer: failResponseBuffer,
      logEntries,
      responseTime,
      cached: false,
      blocked,
      whitelisted,
      success: false,
      error: 'All providers failed'
    };
  }

  private isCachedResponseExpired(response: CachedDNSResponse): boolean {
    return Date.now() > response.timestamp + (response.ttl * 1000);
  }

  private getOptimizedProviderOrder(): BaseProvider[] {
    // Return providers in original order (no optimization for now)
    return this.providers;
  }

  private getTypeString(typeCode: number): string {
    const typeMap: Record<number, string> = {
      1: 'A',
      28: 'AAAA',
      15: 'MX',
      5: 'CNAME',
      2: 'NS',
      12: 'PTR',
      16: 'TXT'
    };
    return typeMap[typeCode] || typeCode.toString();
  }

  private emitLogEntry(logEntry: LogEntry): void {
    // Emit to SSE
    logEventEmitter.emit(logEntry);
    
    // Save to persistent driver
    if (this.drivers.logs) {
      this.drivers.logs.log(logEntry).catch(error => {
        console.warn('Failed to save log entry:', error);
      });
    }
  }

  // Driver configuration methods
  setLogDriver(driver: LogsBaseDriver): void {
    this.drivers.logs = driver;
  }

  setCacheDriver(driver: CachesBaseDriver): void {
    this.drivers.cache = driver;
  }

  setBlacklistDriver(driver: BlacklistBaseDriver): void {
    this.drivers.blacklist = driver;
  }

  setWhitelistDriver(driver: WhitelistBaseDriver): void {
    this.drivers.whitelist = driver;
  }

  setDrivers(drivers: DNSResolverDrivers): void {
    this.drivers = { ...this.drivers, ...drivers };
  }

  getDrivers(): DNSResolverDrivers {
    return { ...this.drivers };
  }

  // Individual driver getters (with defaults, so they're never undefined)
  getLogDriver(): LogsBaseDriver {
    return this.drivers.logs!;
  }

  getCacheDriver(): CachesBaseDriver {
    return this.drivers.cache!;
  }

  getBlacklistDriver(): BlacklistBaseDriver {
    return this.drivers.blacklist!;
  }

  getWhitelistDriver(): WhitelistBaseDriver {
    return this.drivers.whitelist!;
  }

  // Check if drivers are configured
  hasLogDriver(): boolean {
    return !!this.drivers.logs;
  }

  hasCacheDriver(): boolean {
    return !!this.drivers.cache;
  }

  hasBlacklistDriver(): boolean {
    return !!this.drivers.blacklist;
  }

  hasWhitelistDriver(): boolean {
    return !!this.drivers.whitelist;
  }

  getProviders(): BaseProvider[] {
    return [...this.providers];
  }

  updateProviders(providers: BaseProvider[]): void {
    this.providers = providers;
  }
}

// Export singleton instance
export const dnsResolver = DNSResolver.getInstance();