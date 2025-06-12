import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsToggleResponse } from "@src/types/api";
import type { BunRequest } from "bun";
import { tryAsync } from "@src/utils/try";

export async function Toggle(_req: BunRequest, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const isEnabled = await dnsManager.toggle();
    const managerStatus = dnsManager.getStatus();

    const response: DnsToggleResponse = {
      message: `DNS server ${isEnabled ? "started" : "stopped"} successfully`,
      enabled: isEnabled,
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
    console.error("DNS toggle error:", error);
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
  toggle: { POST: Auth.guard(Toggle) },
};