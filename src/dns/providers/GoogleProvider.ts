import { BaseProvider } from "./BaseProvider";

export class GoogleProvider extends BaseProvider {
  name = "google";
  private endpoint = "https://dns.google/dns-query";

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
      throw new Error(`Google DNS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}