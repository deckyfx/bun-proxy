import { DNSProxyServer, type DNSServerDrivers } from "./server";
import { tryAsync } from '@src/utils/try';
import {
  NextDNSProvider,
  CloudflareProvider,
  GoogleProvider,
  OpenDNSProvider,
  SystemProvider,
} from "./providers";
import config from "@src/config";
import { ConsoleDriver } from "./drivers/logs/ConsoleDriver";
import { InMemoryDriver as CacheInMemoryDriver } from "./drivers/caches/InMemoryDriver";
import { InMemoryDriver as BlacklistInMemoryDriver } from "./drivers/blacklist/InMemoryDriver";
import { InMemoryDriver as WhitelistInMemoryDriver } from "./drivers/whitelist/InMemoryDriver";
import { DNSConfigService, type DNSPersistentConfig } from "./config";
import { createDriverInstance } from "./drivers";

class DNSManager {
  private static instance: DNSManager;
  private server?: DNSProxyServer;
  private isEnabled: boolean = false;
  private currentNextDnsConfigId?: string;
  private lastUsedDrivers: DNSServerDrivers;
  private configService: DNSConfigService;
  private persistentConfig?: DNSPersistentConfig;

  private constructor() {
    this.configService = DNSConfigService.getInstance();
    // Initialize default drivers configuration - will be overridden by loadConfig
    this.lastUsedDrivers = {
      logs: new ConsoleDriver(),
      cache: new CacheInMemoryDriver(),
      blacklist: new BlacklistInMemoryDriver(),
      whitelist: new WhitelistInMemoryDriver(),
    };
    
    // Load persistent configuration asynchronously
    this.initializeConfig();
  }

  private async initializeConfig(): Promise<void> {
    const [configResult, configError] = await tryAsync(async () => {
      const config = await this.configService.loadConfig();
      
      // Apply server configuration
      const nextdnsConfigId = config.server.nextdnsConfigId;
      
      // Create driver instances from persistent config
      const drivers = {
        logs: await createDriverInstance('logs', config.drivers.logs.type, config.drivers.logs.options),
        cache: await createDriverInstance('caches', config.drivers.cache.type, config.drivers.cache.options),
        blacklist: await createDriverInstance('blacklist', config.drivers.blacklist.type, config.drivers.blacklist.options),
        whitelist: await createDriverInstance('whitelist', config.drivers.whitelist.type, config.drivers.whitelist.options),
      };
      
      return { config, nextdnsConfigId, drivers };
    });
    
    if (configError) {
      console.warn('Failed to load persistent DNS config, using defaults:', configError);
    } else {
      this.persistentConfig = configResult.config;
      this.currentNextDnsConfigId = configResult.nextdnsConfigId;
      this.lastUsedDrivers = configResult.drivers;
      console.log('DNS configuration loaded from persistent storage');
    }
  }

  static getInstance(): DNSManager {
    if (!DNSManager.instance) {
      DNSManager.instance = new DNSManager();
    }
    return DNSManager.instance;
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

    // Ensure configuration is loaded
    if (!this.persistentConfig) {
      await this.initializeConfig();
    }

    // Use provided config or persistent config or fall back to environment variable
    const nextdnsConfigId =
      options?.nextdnsConfigId || 
      this.persistentConfig?.server.nextdnsConfigId || 
      config.NEXTDNS_CONFIG_ID;
    this.currentNextDnsConfigId = nextdnsConfigId;

    // Use provided port or persistent config or fall back to environment/config
    const serverPort = port || this.persistentConfig?.server.port || config.DNS_PORT;

    const providers = [
      new NextDNSProvider(nextdnsConfigId),
      new CloudflareProvider(),
      new GoogleProvider(),
      new OpenDNSProvider(),
      new SystemProvider(),
    ];

    // Update last used drivers if provided
    if (drivers) {
      this.lastUsedDrivers = { ...this.lastUsedDrivers, ...drivers };
    }

    this.server = new DNSProxyServer(serverPort, providers, this.lastUsedDrivers);
    await this.server.start();
    this.isEnabled = true;

    // Save current configuration to persistent storage
    await this.saveCurrentConfiguration(serverPort, options);
    
    // Notify SSE clients of status change
    this.notifyStatusChange();
  }

  private async saveCurrentConfiguration(
    port: number,
    options?: {
      enableWhitelist?: boolean;
      secondaryDns?: string;
      nextdnsConfigId?: string;
    }
  ): Promise<void> {
    const [, saveError] = await tryAsync(async () => {
      // Save server configuration
      await this.configService.saveServerConfig({
        port,
        nextdnsConfigId: this.currentNextDnsConfigId,
        enableWhitelist: options?.enableWhitelist ?? this.persistentConfig?.server.enableWhitelist ?? false,
        secondaryDns: options?.secondaryDns as any ?? this.persistentConfig?.server.secondaryDns ?? 'cloudflare',
      });

      // Save driver configuration
      const driversConfig = {
        logs: { type: (this.lastUsedDrivers.logs?.constructor as any)?.DRIVER_NAME || 'console', options: {} },
        cache: { type: (this.lastUsedDrivers.cache?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        blacklist: { type: (this.lastUsedDrivers.blacklist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        whitelist: { type: (this.lastUsedDrivers.whitelist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
      };
      await this.configService.saveDriversConfig(driversConfig);
    });
    
    if (saveError) {
      console.warn('Failed to save DNS configuration:', saveError);
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = undefined;
      this.isEnabled = false;
      
      // Notify SSE clients of status change
      this.notifyStatusChange();
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

  getServerInstance() {
    return this.server;
  }

  getResolver() {
    return this.server?.getResolver();
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

  async updateDriverConfiguration(drivers: Partial<DNSServerDrivers>): Promise<void> {
    this.lastUsedDrivers = { ...this.lastUsedDrivers, ...drivers };
    
    // Save driver configuration changes to persistent storage
    const [, saveError] = await tryAsync(async () => {
      const driversConfig = {
        logs: { type: (this.lastUsedDrivers.logs?.constructor as any)?.DRIVER_NAME || 'console', options: {} },
        cache: { type: (this.lastUsedDrivers.cache?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        blacklist: { type: (this.lastUsedDrivers.blacklist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        whitelist: { type: (this.lastUsedDrivers.whitelist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
      };
      await this.configService.saveDriversConfig(driversConfig);
    });
    
    if (saveError) {
      console.warn('Failed to save driver configuration:', saveError);
    }
    
    this.notifyConfigChange();
  }

  async setNextDnsConfigId(configId: string): Promise<void> {
    this.currentNextDnsConfigId = configId;
    
    // Save NextDNS config ID to persistent storage
    const [, saveError] = await tryAsync(() => this.configService.saveServerConfig({ nextdnsConfigId: configId }));
    if (saveError) {
      console.warn('Failed to save NextDNS config ID:', saveError);
    }
    
    // Update resolver providers with new NextDNS config (if server is running)
    if (this.isEnabled && this.server) {
      await this.updateResolverConfig();
    }
    
    this.notifyConfigChange();
  }

  async updateResolverConfig(): Promise<void> {
    if (!this.server) {
      console.warn('Cannot update resolver config: server not running');
      return;
    }

    const [, updateError] = await tryAsync(async () => {
      // Create new providers with current configuration
      const providers = [
        new NextDNSProvider(this.currentNextDnsConfigId),
        new CloudflareProvider(),
        new GoogleProvider(),
        new OpenDNSProvider(),
        new SystemProvider(),
      ];

      // Update resolver providers dynamically
      const resolver = this.server!.getResolver();
      resolver.updateProviders(providers);
    });

    if (updateError) {
      console.error('Failed to update resolver configuration:', updateError);
      throw updateError;
    }
  }

  getPersistentConfig(): DNSPersistentConfig | undefined {
    return this.persistentConfig;
  }

  async reloadConfig(): Promise<void> {
    await this.initializeConfig();
  }

  private notifyStatusChange(): void {
    // Import here to avoid circular dependency
    import("@src/dns/DNSEventService").then(({ dnsEventService }) => {
      const status = this.getStatus();
      dnsEventService.emitStatusChange(status);
    }).catch(() => {
      // DNS Event Service not available, ignore
    });
  }

  private notifyConfigChange(): void {
    // Import here to avoid circular dependency
    import("@src/dns/DNSEventService").then(({ dnsEventService }) => {
      const config = {
        nextdnsConfigId: this.currentNextDnsConfigId,
        drivers: this.lastUsedDrivers,
        timestamp: Date.now()
      };
      dnsEventService.emitConfigChange(config);
    }).catch(() => {
      // DNS Event Service not available, ignore
    });
  }
}

export const dnsManager = DNSManager.getInstance();
