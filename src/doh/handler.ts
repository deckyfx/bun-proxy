import { dnsResolver } from "@src/dns/resolver";
import { udpServerManager } from "@src/dns/udpServerManager";

export async function handleDoHRequest(req: Request): Promise<Response> {
  // Ensure resolver is initialized (this will happen when the app starts)
  // DoH doesn't need the UDP server to be running, just the resolver to be initialized
  if (!dnsResolver.isInitialized()) {
    // Try to trigger initialization through the server manager
    await udpServerManager.reloadConfig();
    
    if (!dnsResolver.isInitialized()) {
      return new Response("DNS resolver not initialized", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  try {
    let dnsQuery: Buffer;
    const method = req.method;

    if (method === "GET") {
      const url = new URL(req.url);
      const dnsParam = url.searchParams.get("dns");

      if (!dnsParam) {
        return new Response("Missing dns parameter", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Decode base64url DNS query
      dnsQuery = Buffer.from(
        dnsParam.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
    } else if (method === "POST") {
      const contentType = req.headers.get("content-type");

      if (!contentType?.includes("application/dns-message")) {
        return new Response(
          "Invalid content-type. Expected: application/dns-message",
          {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }

      const body = await req.arrayBuffer();
      dnsQuery = Buffer.from(body);
    } else {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          "Content-Type": "text/plain",
          Allow: "GET, POST",
        },
      });
    }

    // Parse the DNS query
    const dnsPacket = require("dns-packet");
    let parsedQuery;
    try {
      parsedQuery = dnsPacket.decode(dnsQuery);
    } catch (error) {
      return new Response("Invalid DNS query", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Create client info for DoH requests
    const clientInfo = {
      address:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "unknown",
      port: 443,
      transport: 'doh' as const,
    };

    // Use DNS resolver directly
    const result = await dnsResolver.resolve(dnsQuery, clientInfo);

    return new Response(result.responseBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/dns-message",
        "Cache-Control": "max-age=300",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("DoH request error:", error);
    return new Response("Internal server error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export default {
  GET: handleDoHRequest,
  POST: handleDoHRequest,
};
