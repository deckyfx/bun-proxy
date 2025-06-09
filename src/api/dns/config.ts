import { dnsManager } from "@src/dns";
import config from "@src/config";
import { Auth, type AuthUser } from "@utils/auth";
import type { DNSConfigResponse, DNSConfig } from "@typed/dns";

export async function Config(_req: any, _user: AuthUser): Promise<Response> {
  try {
    const status = dnsManager.getStatus();

    // Build DNS configuration
    const dnsConfig: DNSConfig = {
      port: status.server?.port || config.DNS_PORT,
      nextdnsConfigId: dnsManager.getCurrentNextDnsConfigId(),
      providers: status.server?.providers || ['nextdns', 'cloudflare', 'google', 'opendns', 'system'],
      canUseLowPorts: process.getuid ? process.getuid() === 0 : false,
      platform: process.platform,
      isPrivilegedPort: (status.server?.port || config.DNS_PORT) < 1024,
      enableWhitelist: false,
      secondaryDns: 'cloudflare'
    };

    const response: DNSConfigResponse = {
      config: dnsConfig,
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
  config: { GET: Auth.guard(Config) },
};