import { dnsManager } from "@src/dns";
import type { DNSStatus } from "@typed/dns";

export async function Status(_req: any): Promise<Response> {
  try {
    const status = dnsManager.getStatus();

    // Only return server status, no config
    const response: DNSStatus = {
      enabled: status.enabled,
      server: status.server,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS status error:", error);
    return new Response(JSON.stringify({ error: "Failed to get DNS status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  status: { GET: Status },
};