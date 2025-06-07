import config from "@src/config";

// Helper function to check if process has sudo privileges
export function checkSudoPrivileges(): boolean {
  try {
    // Check if running as root (UID 0)
    if (process.getuid && process.getuid() === 0) {
      return true;
    }

    // On Windows, check if process is elevated
    if (process.platform === "win32") {
      // This is a simplified check - in production you might want more robust checking
      try {
        require("child_process").execSync("net session", { stdio: "ignore" });
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
export function buildDNSConfig(
  currentPort?: number,
  enableWhitelist?: boolean,
  secondaryDns?: "cloudflare" | "google" | "opendns",
  currentNextDnsConfigId?: string
) {
  const canUseLowPorts = checkSudoPrivileges();
  const port = currentPort || config.DNS_PORT;
  return {
    port,
    nextdnsConfigId: currentNextDnsConfigId || config.NEXTDNS_CONFIG_ID,
    providers: ["nextdns", "cloudflare", "google", "opendns"],
    canUseLowPorts,
    platform: process.platform,
    isPrivilegedPort: port < 1000,
    enableWhitelist: enableWhitelist ?? false,
    secondaryDns: secondaryDns ?? ("cloudflare" as const),
  };
}
