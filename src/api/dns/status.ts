import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsStatus } from "@src/types/api";
import type { BunRequest } from "bun";
import { trySync } from "@src/utils/try";

export async function Status(_req: BunRequest, _user: AuthUser): Promise<Response> {
  const [result, error] = trySync(() => {
    const status = dnsManager.getStatus();

    // Only return server status, no config
    const response: DnsStatus = {
      enabled: status.enabled,
      server: status.server,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  if (error) {
    console.error("DNS status error:", error);
    return new Response(JSON.stringify({ error: "Failed to get DNS status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return result;
}

export default {
  status: { GET: Auth.guard(Status) },
};