import { BaseProvider } from "./providers";
import { tryAsync, trySync } from '@src/utils/try';
import type { BaseDriver as LogsBaseDriver } from "./drivers/logs/BaseDriver";
import type { BaseDriver as CachesBaseDriver } from "./drivers/caches/BaseDriver";
import type { BaseDriver as BlacklistBaseDriver } from "./drivers/blacklist/BaseDriver";
import type { BaseDriver as WhitelistBaseDriver } from "./drivers/whitelist/BaseDriver";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";
import { logEventEmitter } from "./server";
import { v4 as uuidv4 } from "uuid";
import type {
  DecodedPacket,
  RecordType,
  CachedDnsResponse,
  DnsLogEntry,
} from "../types/dns-unified";
import {
  bufferToPacket,
  createCachedResponse,
  isCachedResponseExpired,
  createResponseFromCached,
  createBlockedResponse,
  createErrorResponse,
  extractQuestion,
  extractIpAddresses,
  createCacheKeyFromDomain,
} from "../utils/dns-bridge";
// dnsPacket import removed - using bridge utilities instead

export interface DNSResolverDrivers {
  logs?: LogsBaseDriver;
  cache?: CachesBaseDriver;
  blacklist?: BlacklistBaseDriver;
  whitelist?: WhitelistBaseDriver;
}

export interface DNSQuery {
  domain: string;
  type: RecordType;
  typeCode: number;
  querySize: number;
}

export interface ClientInfo {
  address?: string;
  port?: number;
  transport: "udp" | "tcp" | "doh";
}

export interface DNSResolutionResult {
  responseBuffer: Buffer;
  logEntries: DnsLogEntry[];
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

  async initialize(
    providers: BaseProvider[],
    drivers?: DNSResolverDrivers
  ): Promise<void> {
    this.providers = providers;

    if (drivers) {
      this.drivers = { ...this.drivers, ...drivers };
    }

    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async resolve(
    queryBuffer: Buffer,
    clientInfo: ClientInfo
  ): Promise<DNSResolutionResult> {
    const startTime = Date.now();
    const requestId = uuidv4();
    const logEntries: DnsLogEntry[] = [];

    // Parse DNS query
    let parsedQuery: DecodedPacket;
    let queryInfo: DNSQuery;

    const [parseResult, parseError] = trySync(() => {
      const parsed = bufferToPacket(queryBuffer);
      const question = extractQuestion(parsed);
      if (!question) {
        throw new Error("No question in DNS request");
      }
      return {
        parsedQuery: parsed,
        queryInfo: {
          domain: question.name,
          type: question.type,
          typeCode: this.getTypeCode(question.type),
          querySize: queryBuffer.length,
        }
      };
    });

    if (parseError) {
      return this.createErrorResponseWrapper(
        queryBuffer,
        requestId,
        startTime,
        clientInfo,
        parseError.message,
        logEntries
      );
    }

    parsedQuery = parseResult.parsedQuery;
    queryInfo = parseResult.queryInfo;

    // Check blacklist/whitelist first (before cache)
    let blocked = false;
    let whitelisted = false;
    let whitelistEmpty = true;

    if (this.drivers.blacklist) {
      const [blacklistResult, blacklistError] = await tryAsync(() => this.drivers.blacklist!.contains(queryInfo.domain));
      if (blacklistError) {
        console.warn("Blacklist check failed:", blacklistError);
      } else {
        blocked = blacklistResult;
      }
    }

    if (this.drivers.whitelist) {
      const [whitelistResult, whitelistError] = await tryAsync(async () => {
        // Check if whitelist has entries
        const whitelistStats = await this.drivers.whitelist!.stats();
        const isEmpty = whitelistStats.totalEntries === 0;

        if (!isEmpty) {
          const isWhitelisted = await this.drivers.whitelist!.contains(queryInfo.domain);
          return { isEmpty, isWhitelisted };
        }
        return { isEmpty, isWhitelisted: false };
      });
      
      if (whitelistError) {
        console.warn("Whitelist check failed:", whitelistError);
      } else {
        whitelistEmpty = whitelistResult.isEmpty;
        whitelisted = whitelistResult.isWhitelisted;
      }
    }

    // Determine if request should be blocked:
    // 1. If blacklisted and not whitelisted -> block
    // 2. If whitelist is not empty and domain not in whitelist -> block
    const shouldBlock =
      (blocked && !whitelisted) || (!whitelistEmpty && !whitelisted);

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
    const cacheKey = createCacheKeyFromDomain(queryInfo.domain, queryInfo.type);
    let cached = false;

    if (this.drivers.cache) {
      const [cacheResult, cacheError] = await tryAsync(async () => {
        const cachedData = (await this.drivers.cache!.get(
          cacheKey
        )) as CachedDnsResponse | null;
        if (cachedData && !isCachedResponseExpired(cachedData)) {
          // Create DNS response from cached data
          const responseBuffer = createResponseFromCached(
            queryBuffer,
            cachedData
          );

          // Extract IP addresses from cached data for logging
          const resolvedAddresses = extractIpAddresses(cachedData.packet);

          const responseTime = Date.now() - startTime;

          const responseLogEntry: DnsLogEntry = {
            id: requestId,
            timestamp: Date.now(),
            type: "response",
            level: "info",
            query: {
              name: queryInfo.domain,
              type: queryInfo.type,
              class: "IN",
            },
            packet: cachedData.packet,
            client: {
              address: clientInfo?.address,
              port: clientInfo?.port,
              transport: clientInfo.transport,
            },
            processing: {
              provider: "cache",
              responseTime,
              cached: true,
              blocked: false,
              whitelisted: false,
              success: true,
            },
          };

          return {
            responseBuffer,
            logEntries: [responseLogEntry],
            responseTime,
            cached: true,
            blocked: false,
            whitelisted: false,
            provider: "cache",
            success: true,
            logEntry: responseLogEntry
          };
        }
        return null;
      });
      
      if (cacheError) {
        console.warn("Cache lookup failed:", cacheError);
      } else if (cacheResult) {
        cached = true;
        logEntries.push(cacheResult.logEntry);
        this.emitLogEntry(cacheResult.logEntry);
        return {
          responseBuffer: cacheResult.responseBuffer,
          logEntries,
          responseTime: cacheResult.responseTime,
          cached: true,
          blocked: false,
          whitelisted: false,
          provider: "cache",
          success: true,
        };
      }
    }

    // Log the incoming request
    const requestLogEntry: DnsLogEntry = {
      id: requestId,
      timestamp: Date.now(),
      type: "request",
      level: "info",
      query: {
        name: queryInfo.domain,
        type: queryInfo.type,
        class: "IN",
      },
      client: {
        address: clientInfo?.address,
        port: clientInfo?.port,
        transport: clientInfo.transport,
      },
      processing: {
        cached,
        blocked,
        whitelisted,
        success: false, // Will be updated in response
      },
    };

    logEntries.push(requestLogEntry);
    this.emitLogEntry(requestLogEntry);

    // Try providers in order
    for (const provider of this.getOptimizedProviderOrder()) {
      const [providerResult, providerError] = await tryAsync(async () => {
        const responseBuffer = await provider.resolve(queryBuffer);
        const responseTime = Date.now() - startTime;

        // Parse the response and cache it
        let resolvedAddresses: string[] = [];
        let cached = false;

        const [parseResult, parseError] = trySync(() => bufferToPacket(responseBuffer));
        if (parseError) {
          console.warn("Failed to parse DNS response:", parseError);
        } else {
          // Cache the response using unified types
          if (this.drivers.cache) {
            const [cacheResult, cacheError] = await tryAsync(async () => {
              const cachedResponse = createCachedResponse(parseResult);
              const cacheKey = createCacheKeyFromDomain(
                queryInfo.domain,
                queryInfo.type
              );
              const cacheTTL = cachedResponse.cache.ttl * 1000; // Convert to milliseconds
              await this.drivers.cache!.set(cacheKey, cachedResponse, cacheTTL);
              return true;
            });
            
            if (cacheError) {
              console.warn("Failed to cache DNS response:", cacheError);
            } else {
              cached = cacheResult;
            }
          }

          // Extract addresses for logging
          resolvedAddresses = extractIpAddresses(parseResult);
        }

        // Log the successful response - parse again for logging (safe since it worked before)
        const parsedResponse = bufferToPacket(responseBuffer);
        const responseLogEntry: DnsLogEntry = {
          id: requestId,
          timestamp: Date.now(),
          type: "response",
          level: "info",
          query: {
            name: queryInfo.domain,
            type: queryInfo.type,
            class: "IN",
          },
          packet: parsedResponse,
          client: {
            address: clientInfo?.address,
            port: clientInfo?.port,
            transport: clientInfo.transport,
          },
          processing: {
            provider: provider.name,
            responseTime,
            cached: false,
            blocked,
            whitelisted,
            success: true,
          },
        };

        return {
          responseBuffer,
          responseTime,
          responseLogEntry,
        };
      });

      if (providerError) {
        const responseTime = Date.now() - startTime;

        const errorLogEntry: DnsLogEntry = {
          id: requestId,
          timestamp: Date.now(),
          type: "error",
          level: "error",
          query: {
            name: queryInfo.domain,
            type: queryInfo.type,
            class: "IN",
          },
          client: {
            address: clientInfo?.address,
            port: clientInfo?.port,
            transport: clientInfo.transport,
          },
          processing: {
            provider: provider.name,
            responseTime,
            cached: false,
            blocked,
            whitelisted,
            success: false,
            error: providerError.message,
          },
        };

        logEntries.push(errorLogEntry);
        this.emitLogEntry(errorLogEntry);

        console.warn(`Provider ${provider.name} failed:`, providerError);
        continue;
      }

      // Success
      logEntries.push(providerResult.responseLogEntry);
      this.emitLogEntry(providerResult.responseLogEntry);

      return {
        responseBuffer: providerResult.responseBuffer,
        logEntries,
        responseTime: providerResult.responseTime,
        cached: false,
        blocked,
        whitelisted,
        provider: provider.name,
        success: true,
      };
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

  private createErrorResponseWrapper(
    queryBuffer: Buffer,
    requestId: string,
    startTime: number,
    clientInfo: ClientInfo,
    error: string,
    logEntries: DnsLogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;

    const errorLogEntry: DnsLogEntry = {
      id: requestId,
      timestamp: Date.now(),
      type: "error",
      level: "error",
      query: {
        name: "unknown",
        type: "A",
        class: "IN",
      },
      client: {
        address: clientInfo?.address,
        port: clientInfo?.port,
        transport: clientInfo.transport,
      },
      processing: {
        provider: "dns_resolver",
        responseTime,
        cached: false,
        blocked: false,
        whitelisted: false,
        success: false,
        error,
      },
    };

    logEntries.push(errorLogEntry);
    this.emitLogEntry(errorLogEntry);

    // Send SERVFAIL response using bridge utility
    const errorBuffer = createErrorResponse(queryBuffer);

    return {
      responseBuffer: errorBuffer,
      logEntries,
      responseTime,
      cached: false,
      blocked: false,
      whitelisted: false,
      success: false,
      error,
    };
  }

  private createBlockedResponse(
    queryBuffer: Buffer,
    parsedQuery: DecodedPacket,
    requestId: string,
    startTime: number,
    queryInfo: DNSQuery,
    clientInfo: ClientInfo,
    blocked: boolean,
    whitelisted: boolean,
    logEntries: DnsLogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;

    const blockedResponseBuffer = createBlockedResponse(queryBuffer);

    const requestLogEntry: DnsLogEntry = {
      id: requestId,
      timestamp: Date.now(),
      type: "request",
      level: "info",
      query: {
        name: queryInfo.domain,
        type: queryInfo.type,
        class: "IN",
      },
      client: {
        address: clientInfo?.address,
        port: clientInfo?.port,
        transport: clientInfo.transport,
      },
      processing: {
        cached: false,
        blocked: true,
        whitelisted,
        success: true,
      },
    };

    const responseLogEntry: DnsLogEntry = {
      id: requestId,
      timestamp: Date.now(),
      type: "response",
      level: "info",
      query: {
        name: queryInfo.domain,
        type: queryInfo.type,
        class: "IN",
      },
      client: {
        address: clientInfo?.address,
        port: clientInfo?.port,
        transport: clientInfo.transport,
      },
      processing: {
        provider: blocked ? "blacklist" : "whitelist",
        responseTime,
        cached: false,
        blocked: true,
        whitelisted,
        success: true,
      },
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
      provider: blocked ? "blacklist" : "whitelist",
      success: true,
    };
  }

  private createServFailResponse(
    queryBuffer: Buffer,
    parsedQuery: DecodedPacket,
    requestId: string,
    startTime: number,
    queryInfo: DNSQuery,
    clientInfo: ClientInfo,
    blocked: boolean,
    whitelisted: boolean,
    logEntries: DnsLogEntry[]
  ): DNSResolutionResult {
    const responseTime = Date.now() - startTime;

    const failResponseBuffer = createErrorResponse(queryBuffer);

    return {
      responseBuffer: failResponseBuffer,
      logEntries,
      responseTime,
      cached: false,
      blocked,
      whitelisted,
      success: false,
      error: "All providers failed",
    };
  }

  // Note: This method is now replaced by the bridge utility function

  private getOptimizedProviderOrder(): BaseProvider[] {
    // Return providers in original order (no optimization for now)
    return this.providers;
  }

  private getTypeCode(type: RecordType): number {
    const typeMap: Record<RecordType, number> = {
      A: 1,
      AAAA: 28,
      MX: 15,
      CNAME: 5,
      NS: 2,
      PTR: 12,
      TXT: 16,
      SOA: 6,
      SRV: 33,
      CAA: 257,
      AFSDB: 18,
      APL: 42,
      AXFR: 252,
      CDNSKEY: 60,
      CDS: 59,
      CERT: 37,
      DNAME: 39,
      DHCID: 49,
      DLV: 32769,
      DNSKEY: 48,
      DS: 43,
      HINFO: 13,
      HIP: 55,
      IXFR: 251,
      IPSECKEY: 45,
      KEY: 25,
      KX: 36,
      LOC: 29,
      NAPTR: 35,
      NSEC: 47,
      NSEC3: 50,
      NSEC3PARAM: 51,
      NULL: 10,
      OPT: 41,
      RRSIG: 46,
      RP: 17,
      SIG: 24,
      SSHFP: 44,
      TA: 32768,
      TKEY: 249,
      TLSA: 52,
      TSIG: 250,
      URI: 256,
    };
    return typeMap[type] || 1;
  }

  private emitLogEntry(logEntry: DnsLogEntry): void {
    // Emit to SSE
    logEventEmitter.emit(logEntry);

    // Save to persistent driver
    if (this.drivers.logs) {
      this.drivers.logs.log(logEntry).catch((error) => {
        console.warn("Failed to save log entry:", error);
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
