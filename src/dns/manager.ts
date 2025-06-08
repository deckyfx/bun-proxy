import { DNSProxyServer, type DNSServerDrivers } from "./server";
import {
  NextDNSProvider,
  CloudflareProvider,
  GoogleProvider,
  OpenDNSProvider,
} from "./providers";
import config from "@src/config";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";

class DNSManager {
  private server?: DNSProxyServer;
  private isEnabled: boolean = false;
  private currentNextDnsConfigId?: string;
  private lastUsedDrivers: DNSServerDrivers;

  constructor() {
    // Initialize default drivers configuration - logs: Console, others: InMemory
    this.lastUsedDrivers = {
      logs: new ConsoleDriver(),
      cache: new CacheInMemoryDriver(),
      blacklist: new BlacklistInMemoryDriver(),
      whitelist: new WhitelistInMemoryDriver(),
    };
  }

  async start(
    port?: number,
    options?: {
      enableWhitelist?: boolean;
      secondaryDns?: string;
      nextdnsConfigId?: string;
    },
    drivers?: DNSServerDrivers
  ): Promise<void> {
    if (this.server) {
      throw new Error("DNS server is already running");
    }

    // Use provided config ID or fall back to environment variable
    const nextdnsConfigId =
      options?.nextdnsConfigId || config.NEXTDNS_CONFIG_ID;
    this.currentNextDnsConfigId = nextdnsConfigId;

    const providers = [
      new NextDNSProvider(nextdnsConfigId),
      new CloudflareProvider(),
      new GoogleProvider(),
      new OpenDNSProvider(),
    ];

    // Update last used drivers if provided
    if (drivers) {
      this.lastUsedDrivers = { ...this.lastUsedDrivers, ...drivers };
    }

    this.server = new DNSProxyServer(port || config.DNS_PORT, providers, this.lastUsedDrivers);
    await this.server.start();
    this.isEnabled = true;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = undefined;
      this.isEnabled = false;
    }
  }

  async toggle(): Promise<boolean> {
    if (this.isEnabled) {
      await this.stop();
    } else {
      await this.start();
    }
    return this.isEnabled;
  }

  getStatus() {
    return {
      enabled: this.isEnabled,
      server: this.server?.getStatus() || null,
      currentNextDnsConfigId: this.currentNextDnsConfigId,
    };
  }

  getCurrentNextDnsConfigId(): string | undefined {
    return this.currentNextDnsConfigId;
  }

  getDefaultDrivers(): DNSServerDrivers {
    // Default drivers - logs: Console, others: InMemory
    return {
      logs: new ConsoleDriver(),
      cache: new CacheInMemoryDriver(),
      blacklist: new BlacklistInMemoryDriver(),
      whitelist: new WhitelistInMemoryDriver(),
    };
  }

  getLastUsedDrivers(): DNSServerDrivers {
    return this.lastUsedDrivers;
  }

  updateDriverConfiguration(drivers: Partial<DNSServerDrivers>): void {
    this.lastUsedDrivers = { ...this.lastUsedDrivers, ...drivers };
  }
}

export const dnsManager = new DNSManager();
