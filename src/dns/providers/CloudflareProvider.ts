import { BaseProvider } from "./BaseProvider";

export class CloudflareProvider extends BaseProvider {
  name = "cloudflare";
  private endpoint = "https://cloudflare-dns.com/dns-query";

  constructor() {
    super();
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
      throw new Error(`Cloudflare DNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}