import { DNSProxyServer, type DNSServerDrivers } from "./server";
import { tryAsync } from '@src/utils/try';
import { dnsResolver } from "./resolver";
import {
  NextDNSProvider,
  CloudflareProvider,
  GoogleProvider,
  OpenDNSProvider,
  SystemProvider,
} from "./providers";
import config from "@src/config";
import { DNSConfigService, type DNSPersistentConfig } from "./config";
import { createDriverInstance } from "./drivers";

class UDPServerManager {
  private static instance: UDPServerManager;
  private server?: DNSProxyServer;
  private isEnabled: boolean = false;
  private currentNextDnsConfigId?: string;
  private configService: DNSConfigService;
  private persistentConfig?: DNSPersistentConfig;

  private constructor() {
    this.configService = DNSConfigService.getInstance();
    
    // Load persistent configuration and initialize resolver asynchronously
    this.initializeConfig();
  }

  private async initializeConfig(): Promise<void> {
    const [configResult, configError] = await tryAsync(async () => {
      const persistentConfig = await this.configService.loadConfig();
      
      // Apply server configuration
      const nextdnsConfigId = persistentConfig.server.nextdnsConfigId;
      
      // Create driver instances from persistent config
      const drivers = {
        logs: await createDriverInstance('logs', persistentConfig.drivers.logs.type, persistentConfig.drivers.logs.options),
        cache: await createDriverInstance('caches', persistentConfig.drivers.cache.type, persistentConfig.drivers.cache.options),
        blacklist: await createDriverInstance('blacklist', persistentConfig.drivers.blacklist.type, persistentConfig.drivers.blacklist.options),
        whitelist: await createDriverInstance('whitelist', persistentConfig.drivers.whitelist.type, persistentConfig.drivers.whitelist.options),
      };

      // Initialize providers
      const providers = [
        new NextDNSProvider(nextdnsConfigId || config.NEXTDNS_CONFIG_ID),
        new CloudflareProvider(),
        new GoogleProvider(),
        new OpenDNSProvider(),
        new SystemProvider(),
      ];

      // Initialize the singleton DNS resolver
      await dnsResolver.initialize(providers, drivers);
      
      return { persistentConfig, nextdnsConfigId };
    });
    
    if (configError) {
      console.warn('Failed to load persistent DNS config, using defaults:', configError);
      
      // Initialize with defaults
      const providers = [
        new NextDNSProvider(config.NEXTDNS_CONFIG_ID),
        new CloudflareProvider(),
        new GoogleProvider(),
        new OpenDNSProvider(),
        new SystemProvider(),
      ];

      await dnsResolver.initialize(providers);
    } else {
      this.persistentConfig = configResult.persistentConfig;
      this.currentNextDnsConfigId = configResult.nextdnsConfigId;
      console.log('DNS configuration loaded from persistent storage');
    }
  }

  static getInstance(): UDPServerManager {
    if (!UDPServerManager.instance) {
      UDPServerManager.instance = new UDPServerManager();
    }
    return UDPServerManager.instance;
  }

  async start(
    port?: number,
    options?: {
      enableWhitelist?: boolean;
      secondaryDns?: string;
      nextdnsConfigId?: string;
    }
  ): Promise<void> {
    if (this.server) {
      throw new Error("UDP DNS server is already running");
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

    // Update resolver providers if NextDNS config changed
    if (options?.nextdnsConfigId && options.nextdnsConfigId !== this.currentNextDnsConfigId) {
      const providers = [
        new NextDNSProvider(nextdnsConfigId),
        new CloudflareProvider(),
        new GoogleProvider(),
        new OpenDNSProvider(),
        new SystemProvider(),
      ];
      dnsResolver.updateProviders(providers);
    }

    // Create and start the UDP server
    this.server = new DNSProxyServer(serverPort, [], {}); // Providers and drivers are handled by resolver
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
    const [, saveError] = await tryAsync(() => {
      // Save server configuration
      return this.configService.saveServerConfig({
        port,
        nextdnsConfigId: this.currentNextDnsConfigId,
        enableWhitelist: options?.enableWhitelist ?? this.persistentConfig?.server.enableWhitelist ?? false,
        secondaryDns: options?.secondaryDns as any ?? this.persistentConfig?.server.secondaryDns ?? 'cloudflare',
      });
    });
    
    if (saveError) {
      console.warn('Failed to save UDP server configuration:', saveError);
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
    const serverStatus = this.server?.getStatus();
    return {
      enabled: this.isEnabled,
      server: serverStatus ? {
        ...serverStatus,
        providers: dnsResolver.getProviders().map(p => p.name)
      } : null,
      currentNextDnsConfigId: this.currentNextDnsConfigId,
    };
  }

  getServerInstance() {
    return this.server;
  }

  // Delegate resolver access to the singleton
  getResolver() {
    return dnsResolver;
  }

  getCurrentNextDnsConfigId(): string | undefined {
    return this.currentNextDnsConfigId;
  }

  async setNextDnsConfigId(configId: string): Promise<void> {
    this.currentNextDnsConfigId = configId;
    
    // Update resolver providers
    const providers = [
      new NextDNSProvider(configId),
      new CloudflareProvider(),
      new GoogleProvider(),
      new OpenDNSProvider(),
      new SystemProvider(),
    ];
    dnsResolver.updateProviders(providers);
    
    // Save NextDNS config ID to persistent storage
    const [, saveError] = await tryAsync(() => this.configService.saveServerConfig({ nextdnsConfigId: configId }));
    if (saveError) {
      console.warn('Failed to save NextDNS config ID:', saveError);
    }
    
    this.notifyConfigChange();
  }

  getPersistentConfig(): DNSPersistentConfig | undefined {
    return this.persistentConfig;
  }

  async reloadConfig(): Promise<void> {
    await this.initializeConfig();
  }

  async updateDriverConfiguration(drivers: Partial<DNSServerDrivers>): Promise<void> {
    // Update the resolver directly
    dnsResolver.setDrivers(drivers);
    
    // Save driver configuration changes to persistent storage
    const [, saveError] = await tryAsync(async () => {
      const currentDrivers = dnsResolver.getDrivers();
      const driversConfig = {
        logs: { type: (currentDrivers.logs?.constructor as any)?.DRIVER_NAME || 'console', options: {} },
        cache: { type: (currentDrivers.cache?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        blacklist: { type: (currentDrivers.blacklist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
        whitelist: { type: (currentDrivers.whitelist?.constructor as any)?.DRIVER_NAME || 'inmemory', options: {} },
      };
      await this.configService.saveDriversConfig(driversConfig);
    });
    
    if (saveError) {
      console.warn('Failed to save driver configuration:', saveError);
    }
    
    this.notifyConfigChange();
  }

  getLastUsedDrivers() {
    return dnsResolver.getDrivers();
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
        drivers: dnsResolver.getDrivers(),
        timestamp: Date.now()
      };
      dnsEventService.emitConfigChange(config);
    }).catch(() => {
      // DNS Event Service not available, ignore
    });
  }
}

export const udpServerManager = UDPServerManager.getInstance();