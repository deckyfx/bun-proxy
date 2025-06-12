import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsActionResponse } from "@src/types/api";
import type { BunRequest } from "bun";
import { tryAsync } from "@src/utils/try";

export async function Stop(_req: BunRequest, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    await dnsManager.stop();
    const managerStatus = dnsManager.getStatus();

    const response: DnsActionResponse = {
      message: "DNS server stopped successfully",
      status: {
        enabled: managerStatus.enabled,
        server: managerStatus.server,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  if (error) {
    console.error("DNS stop error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return result;
}

export default {
  stop: { POST: Auth.guard(Stop) },
};