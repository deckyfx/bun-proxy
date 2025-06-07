import { BaseProvider } from "./BaseProvider";

export class OpenDNSProvider extends BaseProvider {
  name = "opendns";
  private endpoint = "https://doh.opendns.com/dns-query";

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
      throw new Error(`OpenDNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}