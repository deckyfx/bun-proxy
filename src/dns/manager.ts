import { DNSProxyServer } from './server';
import { NextDNSProvider, CloudflareProvider, GoogleProvider, OpenDNSProvider } from './providers';
import config from '@src/config';

class DNSManager {
  private server?: DNSProxyServer;
  private isEnabled: boolean = false;

  async start(port?: number, options?: { enableWhitelist?: boolean; secondaryDns?: string }): Promise<void> {
    if (this.server) {
      throw new Error('DNS server is already running');
    }

    const providers = [
      new NextDNSProvider(config.NEXTDNS_CONFIG_ID),
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
      server: this.server?.getStatus() || null
    };
  }
}

export const dnsManager = new DNSManager();