import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsActionResponse } from "@src/types/api";
import type { BunRequest } from "bun";
import { tryAsync } from '@src/utils/try';

export async function Apply(_req: BunRequest, _user: AuthUser): Promise<Response> {
  const [, applyError] = await tryAsync(async () => {
    const currentStatus = dnsManager.getStatus();
    
    if (!currentStatus.enabled) {
      throw new Error("DNS server is not running. Start the server first.");
    }

    // Update resolver configuration dynamically (no server restart needed)
    await dnsManager.updateResolverConfig();
  });
  
  if (applyError) {
    console.error("DNS apply config error:", applyError);
    return new Response(
      JSON.stringify({
        error: applyError.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const managerStatus = dnsManager.getStatus();

  const response: DnsActionResponse = {
    message: "DNS configuration applied successfully. Resolver updated with new settings.",
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
  apply: { POST: Auth.guard(Apply) },
};