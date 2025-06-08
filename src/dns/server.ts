import * as dgram from "dgram";
import { BaseProvider } from "./providers";
import { DNSQueryTracker } from "./tracker";
import type { BaseDriver as LogsBaseDriver, LogEntry } from "./drivers/logs/BaseDriver";
import type { BaseDriver as CachesBaseDriver } from "./drivers/caches/BaseDriver";
import type { BaseDriver as BlacklistBaseDriver } from "./drivers/blacklist/BaseDriver";
import type { BaseDriver as WhitelistBaseDriver } from "./drivers/whitelist/BaseDriver";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";
import { DNSParser, type CacheableRecord } from "./parser";

// Global log event emitter for SSE
class LogEventEmitter {
  private static instance: LogEventEmitter;
  private listeners: Set<(logEntry: LogEntry) => void> = new Set();

  static getInstance(): LogEventEmitter {
    if (!LogEventEmitter.instance) {
      LogEventEmitter.instance = new LogEventEmitter();
    }
    return LogEventEmitter.instance;
  }

  addListener(callback: (logEntry: LogEntry) => void): void {
    this.listeners.add(callback);
  }

  removeListener(callback: (logEntry: LogEntry) => void): void {
    this.listeners.delete(callback);
  }

  emit(logEntry: LogEntry): void {
    this.listeners.forEach(callback => {
      try {
        callback(logEntry);
      } catch (error) {
        console.error('Error in log event listener:', error);
      }
    });
  }
}

export const logEventEmitter = LogEventEmitter.getInstance();

export interface DNSServerDrivers {
  logs?: LogsBaseDriver;
  cache?: CachesBaseDriver;
  blacklist?: BlacklistBaseDriver;
  whitelist?: WhitelistBaseDriver;
}

export class DNSProxyServer {
  private server?: dgram.Socket;
  private isRunning: boolean = false;
  private port: number;
  private providers: BaseProvider[];
  private tracker: DNSQueryTracker;
  private drivers: DNSServerDrivers = {};

  constructor(port: number = 53, providers: BaseProvider[], drivers?: DNSServerDrivers) {
    this.port = port;
    this.providers = providers;
    this.tracker = new DNSQueryTracker();
    
    // Set default drivers - logs: Console, others: InMemory
    this.drivers = {
      logs: new ConsoleDriver(),
      cache: new CacheInMemoryDriver(),
      blacklist: new BlacklistInMemoryDriver(),
      whitelist: new WhitelistInMemoryDriver(),
      ...drivers // Override defaults with provided drivers
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("DNS server is already running");
    }

    this.server = dgram.createSocket("udp4");

    this.server.on("message", async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      try {
        const response = await this.handleDNSQuery(msg, { address: rinfo.address, port: rinfo.port });
        this.server?.send(response, rinfo.port, rinfo.address);
      } catch (error) {
        console.error("DNS query handling error:", error);
      }
    });

    this.server.on("error", (error) => {
      console.error("DNS server error:", error);
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.on("listening", () => {
        this.isRunning = true;
        console.log(`DNS proxy server started on port ${this.port}`);
        resolve();
      });

      this.server?.on("error", (error) => {
        reject(error);
      });

      this.server?.bind(this.port);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise<void>((resolve) => {
      this.server?.close(() => {
        this.isRunning = false;
        console.log("DNS proxy server stopped");
        resolve();
      });
    });
  }

  private async handleDNSQuery(query: Buffer, clientInfo?: { address: string; port: number }): Promise<Buffer> {
    const startTime = Date.now();
    const queryInfo = DNSParser.parseDNSQuery(query);
    const { v4: uuidv4 } = require('uuid');
    const requestId = uuidv4();
    
    // Check cache first
    const cacheKey = `${queryInfo.domain}:${queryInfo.type}`;
    let cached = false;
    let cachedResponse: Buffer | null = null;
    
    if (this.drivers.cache) {
      try {
        const cachedRecord = await this.drivers.cache.get(cacheKey) as CacheableRecord | null;
        if (cachedRecord && !this.isCacheEntryExpired(cachedRecord)) {
          // Create DNS response from cached data
          cachedResponse = DNSParser.createDNSResponse(query, [cachedRecord]);
          cached = true;
        }
      } catch (error) {
        console.warn('Cache lookup failed:', error);
      }
    }
    
    // Check blacklist
    let blocked = false;
    if (this.drivers.blacklist) {
      try {
        blocked = await this.drivers.blacklist.contains(queryInfo.domain);
      } catch (error) {
        console.warn('Blacklist check failed:', error);
      }
    }
    
    // Check whitelist
    let whitelisted = false;
    if (this.drivers.whitelist) {
      try {
        whitelisted = await this.drivers.whitelist.contains(queryInfo.domain);
      } catch (error) {
        console.warn('Whitelist check failed:', error);
      }
    }
    
    // Log the incoming request (dual-pipe: SSE + persistent driver)
    const requestLogEntry: LogEntry = {
      type: 'request',
      requestId,
      timestamp: new Date(),
      level: 'info',
      query: {
        domain: queryInfo.domain,
        type: queryInfo.type,
        querySize: query.length,
        clientIP: clientInfo?.address,
        clientPort: clientInfo?.port
      },
      source: 'client',
      cached,
      blocked,
      whitelisted,
      attempt: 1
    };
    
    // Pipe to both SSE and persistent driver
    logEventEmitter.emit(requestLogEntry);
    if (this.drivers.logs) {
      await this.drivers.logs.log(requestLogEntry);
    }

    // If cached, return cached response
    if (cached && cachedResponse) {
      const responseTime = Date.now() - startTime;
      
      const responseLogEntry: LogEntry = {
        type: 'response',
        requestId,
        timestamp: new Date(),
        level: 'info',
        query: {
          domain: queryInfo.domain,
          type: queryInfo.type,
          querySize: query.length,
          clientIP: clientInfo?.address,
          clientPort: clientInfo?.port
        },
        provider: 'cache',
        attempt: 1,
        responseTime,
        response: {
          responseSize: cachedResponse.length
        },
        success: true,
        cached: true,
        blocked,
        whitelisted,
        source: 'client'
      };
      
      logEventEmitter.emit(responseLogEntry);
      if (this.drivers.logs) {
        await this.drivers.logs.log(responseLogEntry);
      }
      
      return cachedResponse;
    }

    // If blocked, return NXDOMAIN
    if (blocked && !whitelisted) {
      const blockedResponse = DNSParser.createBlockedResponse(query);
      const responseTime = Date.now() - startTime;
      
      const responseLogEntry: LogEntry = {
        type: 'response',
        requestId,
        timestamp: new Date(),
        level: 'info',
        query: {
          domain: queryInfo.domain,
          type: queryInfo.type,
          querySize: query.length,
          clientIP: clientInfo?.address,
          clientPort: clientInfo?.port
        },
        provider: 'blacklist',
        attempt: 1,
        responseTime,
        response: {
          responseSize: blockedResponse.length
        },
        success: true,
        cached: false,
        blocked: true,
        whitelisted,
        source: 'client'
      };
      
      logEventEmitter.emit(responseLogEntry);
      if (this.drivers.logs) {
        await this.drivers.logs.log(responseLogEntry);
      }
      
      return blockedResponse;
    }

    // Try providers in order based on usage optimization
    for (const provider of this.getOptimizedProviderOrder()) {
      try {
        const response = await provider.resolve(query);
        const responseTime = Date.now() - startTime;
        
        this.tracker.recordQuery(provider.name, queryInfo.domain);
        
        // Parse the response to extract resolved addresses
        let resolvedAddresses: string[] = [];
        try {
          const parsedResponse = DNSParser.parseDNSResponse(response);
          const cacheableRecords = DNSParser.extractCacheableRecords(parsedResponse);
          
          // Cache the records
          if (this.drivers.cache && cacheableRecords.length > 0) {
            for (const record of cacheableRecords) {
              const key = `${record.domain}:${record.type}`;
              await this.drivers.cache.set(key, record, record.ttl * 1000); // TTL in milliseconds
            }
          }
          
          // Extract addresses for logging
          resolvedAddresses = cacheableRecords.flatMap(record => record.addresses);
        } catch (parseError) {
          console.warn('Failed to parse DNS response for caching:', parseError);
        }
        
        // Log the successful response (dual-pipe: SSE + persistent driver)
        const responseLogEntry: LogEntry = {
          type: 'response',
          requestId,
          timestamp: new Date(),
          level: 'info',
          query: {
            domain: queryInfo.domain,
            type: queryInfo.type,
            querySize: query.length,
            clientIP: clientInfo?.address,
            clientPort: clientInfo?.port
          },
          provider: provider.name,
          attempt: 1,
          responseTime,
          response: {
            responseSize: response.length,
            resolvedAddresses: resolvedAddresses.length > 0 ? resolvedAddresses : undefined
          },
          success: true,
          cached: false,
          blocked,
          whitelisted,
          source: 'client'
        };
        
        // Pipe to both SSE and persistent driver
        logEventEmitter.emit(responseLogEntry);
        if (this.drivers.logs) {
          await this.drivers.logs.log(responseLogEntry);
        }
        
        return response;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // Log the failed response (dual-pipe: SSE + persistent driver)
        const errorLogEntry: LogEntry = {
          type: 'response',
          requestId,
          timestamp: new Date(),
          level: 'error',
          query: {
            domain: queryInfo.domain,
            type: queryInfo.type,
            querySize: query.length,
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
        
        // Pipe to both SSE and persistent driver
        logEventEmitter.emit(errorLogEntry);
        if (this.drivers.logs) {
          await this.drivers.logs.log(errorLogEntry);
        }
        
        console.warn(`Provider ${provider.name} failed:`, error);
        continue;
      }
    }

    throw new Error("All DNS providers failed");
  }

  private isCacheEntryExpired(record: CacheableRecord): boolean {
    return Date.now() > record.timestamp + (record.ttl * 1000);
  }

  private getOptimizedProviderOrder(): BaseProvider[] {
    // Prioritize based on usage tracking to minimize NextDNS usage
    return this.providers.sort((a, b) => {
      const aUsage = this.tracker.getProviderUsage(a.name);
      const bUsage = this.tracker.getProviderUsage(b.name);

      // If one is NextDNS, prefer the other if usage is high
      if (a.name === "nextdns" && aUsage.hourlyQueries > 100) return 1;
      if (b.name === "nextdns" && bUsage.hourlyQueries > 100) return -1;

      return aUsage.failureRate - bUsage.failureRate;
    });
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

  setDrivers(drivers: DNSServerDrivers): void {
    this.drivers = { ...this.drivers, ...drivers };
  }

  getDrivers(): DNSServerDrivers {
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

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      providers: this.providers.map((p) => p.name),
      stats: this.tracker.getStats(),
      drivers: {
        logs: !!this.drivers.logs,
        cache: !!this.drivers.cache,
        blacklist: !!this.drivers.blacklist,
        whitelist: !!this.drivers.whitelist,
      },
    };
  }
}
