import { dnsManager } from "@src/dns";
import config from "@src/config";
import { Auth, type AuthUser } from "@utils/auth";
import type { DNSActionResponse } from "@typed/dns";

export async function Start(req: any, _user: AuthUser): Promise<Response> {
  try {
    let port = config.DNS_PORT;
    let enableWhitelist = false;
    let secondaryDns: 'cloudflare' | 'google' | 'opendns' = 'cloudflare';
    let nextdnsConfigId: string | undefined;
    
    // Check if request has configuration
    try {
      const body = await req.text();
      if (body) {
        const data = JSON.parse(body);
        if (data.port && typeof data.port === 'number') {
          port = data.port;
        }
        if (typeof data.enableWhitelist === 'boolean') {
          enableWhitelist = data.enableWhitelist;
        }
        if (data.secondaryDns && ['cloudflare', 'google', 'opendns'].includes(data.secondaryDns)) {
          secondaryDns = data.secondaryDns;
        }
        if (data.nextdnsConfigId && typeof data.nextdnsConfigId === 'string') {
          nextdnsConfigId = data.nextdnsConfigId;
        }
      }
    } catch {
      // If parsing fails, use default values
    }

    await dnsManager.start(port, { enableWhitelist, secondaryDns, nextdnsConfigId });
    const managerStatus = dnsManager.getStatus();

    const response: DNSActionResponse = {
      message: "DNS server started successfully",
      status: {
        enabled: managerStatus.enabled,
        server: managerStatus.server,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS start error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to start DNS server",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export default {
  start: { POST: Auth.guard(Start) },
};