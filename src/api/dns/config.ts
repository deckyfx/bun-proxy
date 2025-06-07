import { dnsManager } from "@src/dns";
import type { DNSConfigResponse } from "@typed/dns";
import { buildDNSConfig } from "./utils";

export async function Config(_req: any): Promise<Response> {
  try {
    const status = dnsManager.getStatus();

    // Return configuration data
    const response: DNSConfigResponse = {
      config: buildDNSConfig(
        status.server?.port, 
        undefined, 
        undefined, 
        dnsManager.getCurrentNextDnsConfigId()
      ),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS config error:", error);
    return new Response(JSON.stringify({ error: "Failed to get DNS config" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  config: { GET: Config },
};