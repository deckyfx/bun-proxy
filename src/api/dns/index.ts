import { dnsManager } from "@src/dns";
import config from "@src/config";
import type {
  DNSStatus,
  DNSActionResponse,
  DNSToggleResponse,
} from "@typed/dns";

// Helper function to check if process has sudo privileges
function checkSudoPrivileges(): boolean {
  try {
    // Check if running as root (UID 0)
    if (process.getuid && process.getuid() === 0) {
      return true;
    }
    
    // On Windows, check if process is elevated
    if (process.platform === 'win32') {
      // This is a simplified check - in production you might want more robust checking
      try {
        require('child_process').execSync('net session', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

// Helper function to build DNS config response
function buildDNSConfig(currentPort?: number) {
  const canUseLowPorts = checkSudoPrivileges();
  const port = currentPort || config.DNS_PORT;
  return {
    port,
    nextdnsConfigId: config.NEXTDNS_CONFIG_ID,
    providers: ["nextdns", "cloudflare", "google", "opendns"],
    canUseLowPorts,
    platform: process.platform,
    isPrivilegedPort: port < 1000
  };
}

export async function Status(_req: any): Promise<Response> {
  try {
    const status = dnsManager.getStatus();

    // Always include configuration data
    const response: DNSStatus = {
      ...status,
      config: buildDNSConfig(status.server?.port),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS status error:", error);
    return new Response(JSON.stringify({ error: "Failed to get DNS status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function Start(req: any): Promise<Response> {
  try {
    let port = config.DNS_PORT;
    
    // Check if request has port configuration
    try {
      const body = await req.text();
      if (body) {
        const data = JSON.parse(body);
        if (data.port && typeof data.port === 'number') {
          port = data.port;
        }
      }
    } catch {
      // If parsing fails, use default port
    }

    await dnsManager.start(port);
    const managerStatus = dnsManager.getStatus();

    const response: DNSActionResponse = {
      message: "DNS server started successfully",
      status: {
        ...managerStatus,
        config: buildDNSConfig(managerStatus.server?.port),
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DNS start error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to start DNS server",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function Stop(_req: any): Promise<Response> {
  try {
    await dnsManager.stop();
    const managerStatus = dnsManager.getStatus();

    const response: DNSActionResponse = {
      message: "DNS server stopped successfully",
      status: {
        ...managerStatus,
        config: buildDNSConfig(managerStatus.server?.port),
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

export async function Toggle(_req: any): Promise<Response> {
  try {
    const isEnabled = await dnsManager.toggle();
    const managerStatus = dnsManager.getStatus();

    const response: DNSToggleResponse = {
      message: `DNS server ${isEnabled ? "started" : "stopped"} successfully`,
      enabled: isEnabled,
      status: {
        ...managerStatus,
        config: buildDNSConfig(managerStatus.server?.port),
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
