import { DNSProxyServer } from './server';
import { NextDNSProvider, CloudflareProvider, GoogleProvider, OpenDNSProvider } from './providers';
import config from '@src/config';

class DNSManager {
  private server?: DNSProxyServer;
  private isEnabled: boolean = false;
  private currentNextDnsConfigId?: string;

  async start(port?: number, options?: { enableWhitelist?: boolean; secondaryDns?: string; nextdnsConfigId?: string }): Promise<void> {
    if (this.server) {
      throw new Error('DNS server is already running');
    }

    // Use provided config ID or fall back to environment variable
    const nextdnsConfigId = options?.nextdnsConfigId || config.NEXTDNS_CONFIG_ID;
    this.currentNextDnsConfigId = nextdnsConfigId;

    const providers = [
      new NextDNSProvider(nextdnsConfigId),
      new CloudflareProvider(),
      new GoogleProvider(),
      new OpenDNSProvider()
    ];

    this.server = new DNSProxyServer(port || config.DNS_PORT, providers);
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
      currentNextDnsConfigId: this.currentNextDnsConfigId
    };
  }

  getCurrentNextDnsConfigId(): string | undefined {
    return this.currentNextDnsConfigId;
  }
}

export const dnsManager = new DNSManager();