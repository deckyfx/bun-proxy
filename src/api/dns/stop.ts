import { dnsManager } from "@src/dns";
import type { DNSActionResponse } from "@typed/dns";

export async function Stop(_req: any): Promise<Response> {
  try {
    await dnsManager.stop();
    const managerStatus = dnsManager.getStatus();

    const response: DNSActionResponse = {
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
  } catch (error) {
    console.error("DNS stop error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to stop DNS server",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export default {
  stop: { POST: Stop },
};