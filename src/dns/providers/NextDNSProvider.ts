import { BaseProvider } from "./BaseProvider";

export class NextDNSProvider extends BaseProvider {
  name = "nextdns";
  private endpoint: string;
  private configId: string;

  constructor(configId?: string) {
    super();
    if (!configId) {
      throw new Error("NextDNS config ID is required");
    }
    this.configId = configId;
    this.endpoint = `https://dns.nextdns.io/${configId}/BunDNSProxyno`;
  }

  async resolve(query: Buffer): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        Accept: "application/dns-message",
      },
      body: query,
    });

    if (!response.ok) {
      throw new Error(`NextDNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
