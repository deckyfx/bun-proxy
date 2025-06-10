import * as dgram from "dgram";
import DNS2 from "dns2";
import { BaseProvider } from "./providers";
import type { BaseDriver as LogsBaseDriver, LogEntry } from "./drivers/logs/BaseDriver";
import type { BaseDriver as CachesBaseDriver } from "./drivers/caches/BaseDriver";
import type { BaseDriver as BlacklistBaseDriver } from "./drivers/blacklist/BaseDriver";
import type { BaseDriver as WhitelistBaseDriver } from "./drivers/whitelist/BaseDriver";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";
import { DNSParser, type CacheableRecord, type CachedDNSResponse } from "./parser";

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
  private server?: ReturnType<typeof DNS2.createServer>;
  private isRunning: boolean = false;
  private port: number;
  private providers: BaseProvider[];
  private drivers: DNSServerDrivers = {};

  constructor(port: number = 53, providers: BaseProvider[], drivers?: DNSServerDrivers) {
    this.port = port;
    this.providers = providers;
    
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

    this.server = DNS2.createServer({
      udp: true,
      tcp: false,
      handle: async (request, send, rinfo) => {
        try {
          const responseBuffer = await this.handleDNSRequest(request, rinfo);
          send(responseBuffer as unknown as DNS2.DnsResponse);
        } catch (error) {
          console.error("DNS query handling error:", error);
          
          // Emit DNS handling error event to SSE and persistent logs
          const { v4: uuidv4 } = require('uuid');
          const errorLogEntry: LogEntry = {
            type: 'response',
            requestId: uuidv4(),
            timestamp: new Date(),
            level: 'error',
            query: {
              domain: 'unknown',
              type: 'UNKNOWN',
              querySize: 0,
              clientIP: rinfo?.address || 'unknown',
              clientPort: rinfo?.port || 0
            },
            provider: 'dns_handler',
            attempt: 1,
            responseTime: 0,
            success: false,
            cached: false,
            blocked: false,
            whitelisted: false,
            source: 'client',
            error: error instanceof Error ? error.message : String(error)
          };
          
          // Pipe to both SSE and persistent driver
          logEventEmitter.emit(errorLogEntry);
          if (this.drivers.logs) {
            this.drivers.logs.log(errorLogEntry);
          }
          
          // Send SERVFAIL response as buffer
          const errorBuffer = require('dns-packet').encode({
            id: (request as any).header?.id || 0,
            type: 'response',
            flags: 384, // QR=1, RD=1
            questions: (request as any).questions || [],
            answers: [],
            rcode: 2 // SERVFAIL
          });
          send(errorBuffer as unknown as DNS2.DnsResponse);
        }
      }
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.listen({ udp: this.port })
        .then(() => {
          this.isRunning = true;
          console.log(`DNS proxy server started on port ${this.port}`);
          
          // Emit server start event to SSE and persistent logs
          const startLogEntry: LogEntry = {
            type: 'server_event',
            requestId: 'server-start',
            timestamp: new Date(),
            level: 'info',
            eventType: 'started',
            message: `DNS proxy server started on port ${this.port}`,
            port: this.port,
            configChanges: {
              providers: this.providers.map(p => p.name),
              driversEnabled: Object.keys(this.drivers).length
            }
          };
          
          // Pipe to both SSE and persistent driver
          logEventEmitter.emit(startLogEntry);
          if (this.drivers.logs) {
            this.drivers.logs.log(startLogEntry);
          }
          
          resolve();
        })
        .catch((error) => {
          console.error("DNS server error:", error);
          
          // Emit server start error event to SSE and persistent logs
          const errorLogEntry: LogEntry = {
            type: 'server_event',
            requestId: 'server-start-error',
            timestamp: new Date(),
            level: 'error',
            eventType: 'crashed',
            message: `Failed to start DNS proxy server on port ${this.port}`,
            port: this.port,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            configChanges: {
              providers: this.providers.map(p => p.name),
              driversEnabled: Object.keys(this.drivers).length
            }
          };
          
          // Pipe to both SSE and persistent driver
          logEventEmitter.emit(errorLogEntry);
          if (this.drivers.logs) {
            this.drivers.logs.log(errorLogEntry);
          }
          
          reject(error);
        });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      console.log("DNS proxy server stopped");
      
      // Emit server stop event to SSE and persistent logs
      const stopLogEntry: LogEntry = {
        type: 'server_event',
        requestId: 'server-stop',
        timestamp: new Date(),
        level: 'info',
        eventType: 'stopped',
        message: `DNS proxy server stopped on port ${this.port}`,
        port: this.port
      };
      
      // Pipe to both SSE and persistent driver
      logEventEmitter.emit(stopLogEntry);
      if (this.drivers.logs) {
        this.drivers.logs.log(stopLogEntry);
      }
    } catch (error) {
      console.error("Error stopping DNS server:", error);
      
      // Emit server stop error event to SSE and persistent logs
      const errorLogEntry: LogEntry = {
        type: 'server_event',
        requestId: 'server-stop-error',
        timestamp: new Date(),
        level: 'error',
        eventType: 'crashed',
        message: `Failed to stop DNS proxy server on port ${this.port}`,
        port: this.port,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      };
      
      // Pipe to both SSE and persistent driver
      logEventEmitter.emit(errorLogEntry);
      if (this.drivers.logs) {
        this.drivers.logs.log(errorLogEntry);
      }
      
      throw error;
    }
  }

  private async handleDNSRequest(request: any, rinfo: any): Promise<Buffer> {
    const startTime = Date.now();
    const { v4: uuidv4 } = require('uuid');
    const requestId = uuidv4();
    
    // Extract query info from DNS2 packet
    const question = request.questions[0];
    if (!question) {
      throw new Error('No question in DNS request');
    }
    
    const queryInfo = {
      domain: question.name,
      type: this.getTypeString(question.type),
      typeCode: question.type
    };
    
    const clientInfo = { address: rinfo?.address, port: rinfo?.port };
    
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
      const queryBuffer = this.packetToBuffer(request);
      
      // Safely extract questions data - ensure type and class are strings not numbers
      const questions = request.questions?.map((q: any) => ({
        name: q.name || queryInfo.domain,
        type: typeof q.type === 'string' ? q.type : this.getTypeString(q.type) || 'A',
        class: typeof q.class === 'string' ? q.class : 'IN'
      })) || [{
        name: queryInfo.domain,
        type: queryInfo.type,
        class: 'IN'
      }];
      
      const blockedResponseBuffer = require('dns-packet').encode({
        id: (request as any).header?.id || 0,
        type: 'response',
        flags: 384, // QR=1, RD=1
        questions,
        answers: [],
        rcode: 3 // NXDOMAIN
      });
      const responseTime = Date.now() - startTime;
      
      const requestLogEntry: LogEntry = {
        type: 'request',
        requestId,
        timestamp: new Date(),
        level: 'info',
        query: {
          domain: queryInfo.domain,
          type: queryInfo.type,
          querySize: queryBuffer.length,
          clientIP: clientInfo?.address,
          clientPort: clientInfo?.port
        },
        source: 'client',
        cached: false,
        blocked: shouldBlock,
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
          querySize: queryBuffer.length,
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
        blocked: shouldBlock,
        whitelisted,
        source: 'client'
      };
      
      // Log both request and response
      logEventEmitter.emit(requestLogEntry);
      logEventEmitter.emit(responseLogEntry);
      if (this.drivers.logs) {
        await this.drivers.logs.log(requestLogEntry);
        await this.drivers.logs.log(responseLogEntry);
      }
      
      return blockedResponseBuffer;
    }
    
    // Check cache after blacklist/whitelist checks
    const cacheKey = `${queryInfo.domain}:${queryInfo.type}`;
    let cached = false;
    
    if (this.drivers.cache) {
      try {
        const cachedData = await this.drivers.cache.get(cacheKey) as CachedDNSResponse | null;
        if (cachedData && !this.isCachedResponseExpired(cachedData)) {
          // Create DNS response from cached detailed JSON data
          const queryBuffer = this.packetToBuffer(request);
          const responseBuffer = DNSParser.createDNSResponseFromCachedData(queryBuffer, cachedData);
          
          cached = true;
          
          // Extract IP addresses from cached data for logging
          const resolvedAddresses = cachedData.answers
            .filter(record => record.type === 'A' || record.type === 'AAAA')
            .map(record => record.data as string);
          
          // Log cache hit and return immediately
          const responseTime = Date.now() - startTime;
          
          const responseLogEntry: LogEntry = {
            type: 'response',
            requestId,
            timestamp: new Date(),
            level: 'info',
            query: {
              domain: queryInfo.domain,
              type: queryInfo.type,
              querySize: queryBuffer.length,
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
          
          logEventEmitter.emit(responseLogEntry);
          if (this.drivers.logs) {
            await this.drivers.logs.log(responseLogEntry);
          }
          
          return responseBuffer;
        }
      } catch (error) {
        console.warn('Cache lookup failed:', error);
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
        querySize: request.toBuffer().length,
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

    // Cache response was already returned above if found
    // Blocked responses were already handled above if blocked

    // Try providers in order based on usage optimization
    for (const provider of this.getOptimizedProviderOrder()) {
      try {
        // Convert DNS2 request to buffer for provider
        const queryBuffer = this.packetToBuffer(request);
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
            querySize: queryBuffer.length,
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
        
        logEventEmitter.emit(responseLogEntry);
        if (this.drivers.logs) {
          await this.drivers.logs.log(responseLogEntry);
        }
        
        return responseBuffer;
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
            querySize: this.packetToBuffer(request).length,
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
        
        logEventEmitter.emit(errorLogEntry);
        if (this.drivers.logs) {
          await this.drivers.logs.log(errorLogEntry);
        }
        
        console.warn(`Provider ${provider.name} failed:`, error);
        continue;
      }
    }

    // If all providers fail, return SERVFAIL
    const queryBuffer = this.packetToBuffer(request);
    const failResponseBuffer = require('dns-packet').encode({
      id: (request as any).header?.id || 0,
      type: 'response',
      flags: 384, // QR=1, RD=1
      questions: (request as any).questions || [],
      answers: [],
      rcode: 2 // SERVFAIL
    });
    return failResponseBuffer;
  }

  private isCacheEntryExpired(record: CacheableRecord): boolean {
    return Date.now() > record.timestamp + (record.ttl * 1000);
  }

  private isCachedResponseExpired(response: CachedDNSResponse): boolean {
    return Date.now() > response.timestamp + (response.ttl * 1000);
  }

  private getOptimizedProviderOrder(): BaseProvider[] {
    // Return providers in original order (no optimization)
    return this.providers;
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
      drivers: {
        logs: !!this.drivers.logs,
        cache: !!this.drivers.cache,
        blacklist: !!this.drivers.blacklist,
        whitelist: !!this.drivers.whitelist,
      },
    };
  }

  // Helper methods for DNS2 packet conversion
  private packetToBuffer(packet: any): Buffer {
    // If it's already a Buffer, return it
    if (Buffer.isBuffer(packet)) {
      return packet;
    }
    
    // Use DNS2's toBuffer method if available
    if (packet.toBuffer && typeof packet.toBuffer === 'function') {
      try {
        const result = packet.toBuffer();
        if (Buffer.isBuffer(result)) {
          return result;
        }
      } catch (error) {
        console.warn('Failed to use packet.toBuffer():', error);
      }
    }
    
    // Fallback: use dns-packet to encode the response
    try {
      return require('dns-packet').encode({
        id: packet.header?.id || 0,
        type: 'response',
        flags: packet.header?.qr ? 384 : 0, // QR=1, RD=1
        questions: packet.questions || [],
        answers: packet.answers || [],
        rcode: packet.header?.rcode || 0
      });
    } catch (error) {
      console.warn('Failed to encode DNS packet:', error);
      // Return a minimal valid DNS response
      return require('dns-packet').encode({
        id: 0,
        type: 'response',
        flags: 384,
        questions: [],
        answers: [],
        rcode: 2 // SERVFAIL
      });
    }
  }

  private bufferToPacket(buffer: Buffer): any {
    // Parse buffer using dns-packet and convert to DNS2 format
    try {
      const parsed = DNSParser.parseDNSResponse(buffer);
      // Return a simplified packet-like object that DNS2 can work with
      return {
        header: parsed.id ? { id: parsed.id } : {},
        questions: parsed.questions || [],
        answers: parsed.answers || [],
        toBuffer: () => buffer
      };
    } catch (error) {
      console.warn('Failed to parse DNS buffer:', error);
      // Return a basic structure
      return {
        header: {},
        questions: [],
        answers: [],
        toBuffer: () => buffer
      };
    }
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
}
