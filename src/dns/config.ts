import { join } from 'path';
import { tryAsync, tryParse } from '@src/utils/try';

// Type-safe driver options interface
interface DriverOptions {
  [key: string]: string | number | boolean | null | undefined;
}

interface DriverConfig {
  type: string;
  options: DriverOptions;
}

// Raw JSON data from file before validation
type RawConfigData = Record<string, unknown>;

export interface DNSPersistentConfig {
  server: {
    port: number;
    nextdnsConfigId?: string;
    enableWhitelist: boolean;
    secondaryDns: 'cloudflare' | 'google' | 'opendns';
  };
  drivers: {
    logs: DriverConfig;
    cache: DriverConfig;
    blacklist: DriverConfig;
    whitelist: DriverConfig;
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
    const [configResult, configError] = await tryAsync(async () => {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        return this.getDefaultConfig();
      }
      
      const content = await file.text();
      const [parsedConfig, parseError] = tryParse<RawConfigData>(content);
      
      if (parseError) {
        throw parseError;
      }
      
      // Validate and merge with defaults
      return this.validateAndMergeConfig(parsedConfig);
    });
    
    if (configError) {
      console.warn('Failed to load DNS config, using defaults:', configError);
      return this.getDefaultConfig();
    }
    
    return configResult;
  }

  public async saveConfig(config: Partial<DNSPersistentConfig>): Promise<void> {
    const [, saveError] = await tryAsync(async () => {
      const currentConfig = await this.loadConfig();
      const mergedConfig: DNSPersistentConfig = {
        ...currentConfig,
        ...config,
        server: { ...currentConfig.server, ...config.server },
        drivers: { ...currentConfig.drivers, ...config.drivers },
        lastUpdated: new Date().toISOString(),
      };

      await Bun.write(this.configPath, JSON.stringify(mergedConfig, null, 2));
    });
    
    if (saveError) {
      console.error('Failed to save DNS config:', saveError);
      throw saveError;
    }
  }

  public async saveServerConfig(serverConfig: Partial<DNSPersistentConfig['server']>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const mergedServerConfig = { ...currentConfig.server, ...serverConfig };
    await this.saveConfig({ server: mergedServerConfig });
  }

  public async saveDriverConfig(driverType: keyof DNSPersistentConfig['drivers'], driverConfig: DriverConfig): Promise<void> {
    const currentConfig = await this.loadConfig();
    const driversUpdate = { ...currentConfig.drivers, [driverType]: driverConfig };
    await this.saveConfig({ drivers: driversUpdate });
  }

  public async saveDriversConfig(driversConfig: Partial<DNSPersistentConfig['drivers']>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const mergedDrivers = { ...currentConfig.drivers, ...driversConfig };
    await this.saveConfig({ drivers: mergedDrivers });
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

  private validateAndMergeConfig(config: RawConfigData): DNSPersistentConfig {
    const defaults = this.getDefaultConfig();
    
    const serverObj = this.getObjectProperty(config, 'server');
    const driversObj = this.getObjectProperty(config, 'drivers');
    
    return {
      server: {
        port: this.getNumberProperty(serverObj, 'port') ?? defaults.server.port,
        nextdnsConfigId: this.validateStringOrUndefined(this.getProperty(serverObj, 'nextdnsConfigId')) || defaults.server.nextdnsConfigId,
        enableWhitelist: this.getBooleanProperty(serverObj, 'enableWhitelist') ?? defaults.server.enableWhitelist,
        secondaryDns: this.validateSecondaryDns(this.getProperty(serverObj, 'secondaryDns')) || defaults.server.secondaryDns,
      },
      drivers: {
        logs: this.validateDriverConfig(this.getObjectProperty(driversObj, 'logs'), defaults.drivers.logs),
        cache: this.validateDriverConfig(this.getObjectProperty(driversObj, 'cache'), defaults.drivers.cache),
        blacklist: this.validateDriverConfig(this.getObjectProperty(driversObj, 'blacklist'), defaults.drivers.blacklist),
        whitelist: this.validateDriverConfig(this.getObjectProperty(driversObj, 'whitelist'), defaults.drivers.whitelist),
      },
      lastUpdated: this.validateStringOrNull(this.getProperty(config, 'lastUpdated')) || null,
    };
  }

  public async resetToDefaults(): Promise<void> {
    const defaultConfig = this.getDefaultConfig();
    await Bun.write(this.configPath, JSON.stringify(defaultConfig, null, 2));
  }

  private validateDriverConfig(driverConfig: Record<string, unknown> | null, defaultConfig: DriverConfig): DriverConfig {
    if (!driverConfig) {
      return defaultConfig;
    }
    
    const type = this.getStringProperty(driverConfig, 'type');
    if (!type) {
      return defaultConfig;
    }
    
    const options = this.getObjectProperty(driverConfig, 'options') || {};
    
    return {
      type,
      options: options as DriverOptions
    };
  }

  private validateStringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private validateStringOrNull(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value === null) return null;
    return null;
  }

  private validateSecondaryDns(value: unknown): 'cloudflare' | 'google' | 'opendns' | undefined {
    if (typeof value === 'string' && ['cloudflare', 'google', 'opendns'].includes(value)) {
      return value as 'cloudflare' | 'google' | 'opendns';
    }
    return undefined;
  }

  // Type-safe property access helpers
  private getProperty(obj: Record<string, unknown> | null, key: string): unknown {
    return obj?.[key];
  }

  private getStringProperty(obj: Record<string, unknown> | null, key: string): string | null {
    const value = this.getProperty(obj, key);
    return typeof value === 'string' ? value : null;
  }

  private getNumberProperty(obj: Record<string, unknown> | null, key: string): number | null {
    const value = this.getProperty(obj, key);
    return typeof value === 'number' ? value : null;
  }

  private getBooleanProperty(obj: Record<string, unknown> | null, key: string): boolean | null {
    const value = this.getProperty(obj, key);
    return typeof value === 'boolean' ? value : null;
  }

  private getObjectProperty(obj: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
    const value = this.getProperty(obj, key);
    return value && typeof value === 'object' && !Array.isArray(value) && value !== null
      ? value as Record<string, unknown>
      : null;
  }
}