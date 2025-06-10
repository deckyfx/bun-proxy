import { join } from 'path';

export interface DNSPersistentConfig {
  server: {
    port: number;
    nextdnsConfigId?: string;
    enableWhitelist: boolean;
    secondaryDns: 'cloudflare' | 'google' | 'opendns';
  };
  drivers: {
    logs: { type: string; options: Record<string, any> };
    cache: { type: string; options: Record<string, any> };
    blacklist: { type: string; options: Record<string, any> };
    whitelist: { type: string; options: Record<string, any> };
  };
  lastUpdated: string | null;
}

export class DNSConfigService {
  private static instance: DNSConfigService;
  private configPath: string;

  private constructor() {
    this.configPath = join(process.cwd(), 'data', 'dns-config.json');
  }

  public static getInstance(): DNSConfigService {
    if (!DNSConfigService.instance) {
      DNSConfigService.instance = new DNSConfigService();
    }
    return DNSConfigService.instance;
  }

  public async loadConfig(): Promise<DNSPersistentConfig> {
    try {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        return this.getDefaultConfig();
      }
      
      const content = await file.text();
      const config = JSON.parse(content) as DNSPersistentConfig;
      
      // Validate and merge with defaults
      return this.validateAndMergeConfig(config);
    } catch (error) {
      console.warn('Failed to load DNS config, using defaults:', error);
      return this.getDefaultConfig();
    }
  }

  public async saveConfig(config: Partial<DNSPersistentConfig>): Promise<void> {
    try {
      const currentConfig = await this.loadConfig();
      const mergedConfig: DNSPersistentConfig = {
        ...currentConfig,
        ...config,
        server: { ...currentConfig.server, ...config.server },
        drivers: { ...currentConfig.drivers, ...config.drivers },
        lastUpdated: new Date().toISOString(),
      };

      await Bun.write(this.configPath, JSON.stringify(mergedConfig, null, 2));
    } catch (error) {
      console.error('Failed to save DNS config:', error);
      throw error;
    }
  }

  public async saveServerConfig(serverConfig: Partial<DNSPersistentConfig['server']>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const mergedServerConfig = { ...currentConfig.server, ...serverConfig };
    await this.saveConfig({ server: mergedServerConfig });
  }

  public async saveDriverConfig(driverType: keyof DNSPersistentConfig['drivers'], driverConfig: { type: string; options: Record<string, any> }): Promise<void> {
    const driversUpdate = { [driverType]: driverConfig };
    await this.saveConfig({ drivers: driversUpdate as any });
  }

  public async saveDriversConfig(driversConfig: Partial<DNSPersistentConfig['drivers']>): Promise<void> {
    await this.saveConfig({ drivers: driversConfig as any });
  }

  private getDefaultConfig(): DNSPersistentConfig {
    return {
      server: {
        port: parseInt(process.env.DNS_PROXY_PORT || '53'),
        nextdnsConfigId: process.env.NEXTDNS_CONFIG_ID || undefined,
        enableWhitelist: false,
        secondaryDns: 'cloudflare',
      },
      drivers: {
        logs: { type: 'console', options: {} },
        cache: { type: 'inmemory', options: {} },
        blacklist: { type: 'inmemory', options: {} },
        whitelist: { type: 'inmemory', options: {} },
      },
      lastUpdated: null,
    };
  }

  private validateAndMergeConfig(config: any): DNSPersistentConfig {
    const defaults = this.getDefaultConfig();
    
    return {
      server: {
        port: typeof config?.server?.port === 'number' ? config.server.port : defaults.server.port,
        nextdnsConfigId: config?.server?.nextdnsConfigId || defaults.server.nextdnsConfigId,
        enableWhitelist: typeof config?.server?.enableWhitelist === 'boolean' ? config.server.enableWhitelist : defaults.server.enableWhitelist,
        secondaryDns: ['cloudflare', 'google', 'opendns'].includes(config?.server?.secondaryDns) ? config.server.secondaryDns : defaults.server.secondaryDns,
      },
      drivers: {
        logs: config?.drivers?.logs && typeof config.drivers.logs.type === 'string' ? config.drivers.logs : defaults.drivers.logs,
        cache: config?.drivers?.cache && typeof config.drivers.cache.type === 'string' ? config.drivers.cache : defaults.drivers.cache,
        blacklist: config?.drivers?.blacklist && typeof config.drivers.blacklist.type === 'string' ? config.drivers.blacklist : defaults.drivers.blacklist,
        whitelist: config?.drivers?.whitelist && typeof config.drivers.whitelist.type === 'string' ? config.drivers.whitelist : defaults.drivers.whitelist,
      },
      lastUpdated: config?.lastUpdated || null,
    };
  }

  public async resetToDefaults(): Promise<void> {
    const defaultConfig = this.getDefaultConfig();
    await Bun.write(this.configPath, JSON.stringify(defaultConfig, null, 2));
  }
}