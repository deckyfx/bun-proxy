import { createSocket } from 'dgram';
import { DNSProvider } from './providers';
import { DNSQueryTracker } from './tracker';

export class DNSProxyServer {
  private server?: ReturnType<typeof createSocket>;
  private isRunning: boolean = false;
  private port: number;
  private providers: DNSProvider[];
  private tracker: DNSQueryTracker;

  constructor(port: number = 53, providers: DNSProvider[]) {
    this.port = port;
    this.providers = providers;
    this.tracker = new DNSQueryTracker();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('DNS server is already running');
    }

    this.server = createSocket('udp4');
    
    this.server.on('message', async (msg, rinfo) => {
      try {
        const response = await this.handleDNSQuery(msg);
        this.server?.send(response, rinfo.port, rinfo.address);
      } catch (error) {
        console.error('DNS query handling error:', error);
      }
    });

    this.server.on('error', (error) => {
      console.error('DNS server error:', error);
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.on('listening', () => {
        this.isRunning = true;
        console.log(`DNS proxy server started on port ${this.port}`);
        resolve();
      });

      this.server?.on('error', (error) => {
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
        console.log('DNS proxy server stopped');
        resolve();
      });
    });
  }

  private async handleDNSQuery(query: Buffer): Promise<Buffer> {
    const queryInfo = this.parseDNSQuery(query);
    
    // Try providers in order based on usage optimization
    for (const provider of this.getOptimizedProviderOrder()) {
      try {
        const response = await provider.resolve(query);
        this.tracker.recordQuery(provider.name, queryInfo.domain);
        return response;
      } catch (error) {
        console.warn(`Provider ${provider.name} failed:`, error);
        continue;
      }
    }

    throw new Error('All DNS providers failed');
  }

  private parseDNSQuery(query: Buffer): { domain: string; type: string } {
    // Basic DNS query parsing
    let offset = 12; // Skip header
    let domain = '';
    
    if (!query || typeof query.length !== 'number') {
      return { domain: '', type: 'UNKNOWN' };
    }
    
    const queryLength = query.length;
    while (offset < queryLength) {
      const length = query[offset];
      if (length === 0) break;
      
      if (domain) domain += '.';
      const endOffset = offset + 1 + length!;
      if (endOffset <= queryLength) {
        domain += query.subarray(offset + 1, endOffset).toString();
      }
      offset += length! + 1;
    }

    if (offset + 1 < queryLength) {
      const type = query.readUInt16BE(offset + 1);
      const typeMap: Record<number, string> = { 1: 'A', 28: 'AAAA', 15: 'MX', 5: 'CNAME' };
      return { domain, type: typeMap[type] || 'UNKNOWN' };
    }
    
    return { domain, type: 'UNKNOWN' };
  }

  private getOptimizedProviderOrder(): DNSProvider[] {
    // Prioritize based on usage tracking to minimize NextDNS usage
    return this.providers.sort((a, b) => {
      const aUsage = this.tracker.getProviderUsage(a.name);
      const bUsage = this.tracker.getProviderUsage(b.name);
      
      // If one is NextDNS, prefer the other if usage is high
      if (a.name === 'nextdns' && aUsage.hourlyQueries > 100) return 1;
      if (b.name === 'nextdns' && bUsage.hourlyQueries > 100) return -1;
      
      return aUsage.failureRate - bUsage.failureRate;
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      providers: this.providers.map(p => p.name),
      stats: this.tracker.getStats()
    };
  }
}