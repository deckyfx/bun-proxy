export abstract class DNSProvider {
  abstract name: string;
  abstract resolve(query: Buffer): Promise<Buffer>;
}

export class NextDNSProvider extends DNSProvider {
  name = 'nextdns';
  private endpoint: string;

  constructor(configId?: string) {
    super();
    this.endpoint = configId 
      ? `https://${configId}.dns.nextdns.io/dns-query`
      : 'https://dns.nextdns.io/dns-query';
  }

  async resolve(query: Buffer): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        'Accept': 'application/dns-message'
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`NextDNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export class CloudflareProvider extends DNSProvider {
  name = 'cloudflare';
  private endpoint = 'https://cloudflare-dns.com/dns-query';

  constructor() {
    super();
  }

  async resolve(query: Buffer): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        'Accept': 'application/dns-message'
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`Cloudflare DNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export class GoogleProvider extends DNSProvider {
  name = 'google';
  private endpoint = 'https://dns.google/dns-query';

  constructor() {
    super();
  }

  async resolve(query: Buffer): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        'Accept': 'application/dns-message'
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`Google DNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export class OpenDNSProvider extends DNSProvider {
  name = 'opendns';
  private endpoint = 'https://doh.opendns.com/dns-query';

  constructor() {
    super();
  }

  async resolve(query: Buffer): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        'Accept': 'application/dns-message'
      },
      body: query
    });

    if (!response.ok) {
      throw new Error(`OpenDNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}