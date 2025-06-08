import * as dgram from "dgram";
import { BaseProvider } from "./providers";
import { DNSQueryTracker } from "./tracker";
import type { BaseDriver as LogsBaseDriver } from "./drivers/logs/BaseDriver";
import type { BaseDriver as CachesBaseDriver } from "./drivers/caches/BaseDriver";
import type { BaseDriver as BlacklistBaseDriver } from "./drivers/blacklist/BaseDriver";
import type { BaseDriver as WhitelistBaseDriver } from "./drivers/whitelist/BaseDriver";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";

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
    const queryInfo = this.parseDNSQuery(query);
    const { v4: uuidv4 } = require('uuid');
    const requestId = uuidv4();
    
    // Log the incoming request
    if (this.drivers.logs) {
      await this.drivers.logs.log({
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
        cached: false, // TODO: check cache
        blocked: false, // TODO: check blacklist
        whitelisted: false, // TODO: check whitelist
        attempt: 1
      });
    }

    // Try providers in order based on usage optimization
    for (const provider of this.getOptimizedProviderOrder()) {
      try {
        const response = await provider.resolve(query);
        const responseTime = Date.now() - startTime;
        
        this.tracker.recordQuery(provider.name, queryInfo.domain);
        
        // Log the successful response
        if (this.drivers.logs) {
          await this.drivers.logs.log({
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
              responseSize: response.length
            },
            success: true,
            cached: false,
            blocked: false,
            whitelisted: false,
            source: 'client'
          });
        }
        
        return response;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // Log the failed response
        if (this.drivers.logs) {
          await this.drivers.logs.log({
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
            blocked: false,
            whitelisted: false,
            source: 'client'
          });
        }
        
        console.warn(`Provider ${provider.name} failed:`, error);
        continue;
      }
    }

    throw new Error("All DNS providers failed");
  }

  private parseDNSQuery(query: Buffer): { domain: string; type: string } {
    // Basic DNS query parsing
    let offset = 12; // Skip header
    let domain = "";

    if (!query || typeof query.length !== "number") {
      return { domain: "", type: "UNKNOWN" };
    }

    const queryLength = query.length;
    while (offset < queryLength) {
      const length = query[offset];
      if (length === 0) break;

      if (domain) domain += ".";
      const endOffset = offset + 1 + length!;
      if (endOffset <= queryLength) {
        domain += query.subarray(offset + 1, endOffset).toString();
      }
      offset += length! + 1;
    }

    if (offset + 1 < queryLength) {
      const type = query.readUInt16BE(offset + 1);
      const typeMap: Record<number, string> = {
        1: "A",
        28: "AAAA",
        15: "MX",
        5: "CNAME",
      };
      return { domain, type: typeMap[type] || "UNKNOWN" };
    }

    return { domain, type: "UNKNOWN" };
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
