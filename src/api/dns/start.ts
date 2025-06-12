import { dnsManager } from "@src/dns";
import config from "@src/config";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsActionResponse } from "@src/types/api";
import type { BunRequest } from "bun";
import { tryParse, tryAsync } from '@src/utils/try';

interface DnsStartRequest {
  port?: number;
  enableWhitelist?: boolean;
  secondaryDns?: 'cloudflare' | 'google' | 'opendns';
  nextdnsConfigId?: string;
}

export async function Start(_req: BunRequest, _user: AuthUser): Promise<Response> {
  let port = config.DNS_PORT;
  let enableWhitelist = false;
  let secondaryDns: 'cloudflare' | 'google' | 'opendns' = 'cloudflare';
  let nextdnsConfigId: string | undefined;
  
  // Check if request has configuration
  const [body, bodyError] = await tryAsync(() => _req.text());
  if (!bodyError && body) {
    const [data, parseError] = tryParse<DnsStartRequest>(body);
    if (!parseError) {
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
  }

  const [, startError] = await tryAsync(() => 
    dnsManager.start(port, { enableWhitelist, secondaryDns, nextdnsConfigId })
  );
  
  if (startError) {
    console.error("DNS start error:", startError);
    return new Response(
      JSON.stringify({
        error: startError.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const managerStatus = dnsManager.getStatus();

  const response: DnsActionResponse = {
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
}

export default {
  start: { POST: Auth.guard(Start) },
};