import { dnsManager } from "@src/dns";
import { Auth, type AuthUser } from "@utils/auth";
import type { DNSToggleResponse } from "@typed/dns";

export async function Toggle(_req: any, _user: AuthUser): Promise<Response> {
  try {
    const isEnabled = await dnsManager.toggle();
    const managerStatus = dnsManager.getStatus();

    const response: DNSToggleResponse = {
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
  } catch (error) {
    console.error("DNS toggle error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to toggle DNS server",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export default {
  toggle: { POST: Auth.guard(Toggle) },
};