import { dnsManager } from "@src/dns";
import config from "@src/config";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsServerStatus } from "@src/types/dns-unified";
import type { BunRequest } from "bun";
import { trySync, tryAsync, tryParse } from "@src/utils/try";

interface DNSConfig {
  port: number;
  nextdnsConfigId?: string;
  providers: string[];
  canUseLowPorts: boolean;
  platform: string;
  isPrivilegedPort: boolean;
  enableWhitelist: boolean;
  secondaryDns: 'cloudflare' | 'google' | 'opendns';
}

interface DNSConfigResponse {
  config: DNSConfig;
}

export async function Config(_req: BunRequest, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
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
  });

  if (error) {
    console.error("DNS config error:", error);
    return new Response(JSON.stringify({ error: "Failed to get DNS config" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return result;
}

export async function UpdateConfig(req: BunRequest, _user: AuthUser): Promise<Response> {
  const [body, bodyError] = await tryAsync(() => req.text());
  if (bodyError) {
    return Response.json({
      error: 'Failed to read request body',
    }, { status: 400 });
  }

  const [updates, parseError] = tryParse<Partial<DNSConfig>>(body);
  if (parseError) {
    return Response.json({
      error: 'Failed to parse request',
    }, { status: 400 });
  }

  const [, updateError] = await tryAsync(async () => {
    // Update persistent configuration
    if (updates.nextdnsConfigId !== undefined) {
      await dnsManager.setNextDnsConfigId(updates.nextdnsConfigId);
    }
    
    // Update other server config if provided
    const serverUpdates: any = {};
    if (updates.port !== undefined) serverUpdates.port = updates.port;
    if (updates.enableWhitelist !== undefined) serverUpdates.enableWhitelist = updates.enableWhitelist;
    if (updates.secondaryDns !== undefined) serverUpdates.secondaryDns = updates.secondaryDns;
    
    if (Object.keys(serverUpdates).length > 0) {
      const configService = (await import('@src/dns/config')).DNSConfigService.getInstance();
      await configService.saveServerConfig(serverUpdates);
    }
  });

  if (updateError) {
    console.error("DNS config update error:", updateError);
    return Response.json({
      error: updateError.message || 'Failed to update DNS config',
    }, { status: 500 });
  }

  return Response.json({
    message: 'DNS configuration updated successfully',
  });
}

export default {
  config: { 
    GET: Auth.guard(Config),
    PUT: Auth.guard(UpdateConfig),
  },
};