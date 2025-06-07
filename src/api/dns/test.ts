import { promisify } from 'util';
import { dnsManager } from '@src/dns';
import Config from "@src/config";
import type { DNSTestRequest, DNSTestResponse } from '@typed/dns';

export async function Test(req: any): Promise<Response> {
  try {
    const body = await req.text();
    const { domain, configId }: DNSTestRequest = JSON.parse(body);

    if (!domain || !configId) {
      const response: DNSTestResponse = {
        success: false,
        domain: domain || '',
        configId: configId || '',
        error: 'Domain and configId are required',
      };
      return Response.json(response, { status: 400 });
    }

    try {
      const currentStatus = dnsManager.getStatus();
      let wasRunning = currentStatus.enabled;
      let originalPort = currentStatus.server?.port;

      // If server is running, restart it with the test config
      if (wasRunning) {
        await dnsManager.stop();
      }

      // Start server with the test configId
      await dnsManager.start(originalPort || Config.DNS_PORT, {
        nextdnsConfigId: configId,
      });

      // Test DNS resolution using our DNS server
      const { Resolver } = await import('dns');
      const resolver = new Resolver();
      resolver.setServers([`127.0.0.1:${originalPort || Config.DNS_PORT}`]);
      
      const resolveA = promisify(resolver.resolve4.bind(resolver));
      
      // Wait a moment for server to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const addresses = await resolveA(domain);
      
      // Restore original server state
      await dnsManager.stop();
      if (wasRunning) {
        await dnsManager.start(originalPort, {
          nextdnsConfigId: dnsManager.getCurrentNextDnsConfigId(),
        });
      }

      const response: DNSTestResponse = {
        success: true,
        domain,
        configId,
        resolvedAddress: Array.isArray(addresses) ? addresses[0] : addresses,
      };

      return Response.json(response);
    } catch (dnsError) {
      // Ensure we restore the original state even if test fails
      try {
        const currentStatus = dnsManager.getStatus();
        await dnsManager.stop();
        if (currentStatus.enabled) {
          await dnsManager.start();
        }
      } catch (restoreError) {
        console.error("Failed to restore DNS server state:", restoreError);
      }

      const response: DNSTestResponse = {
        success: false,
        domain,
        configId,
        error: `DNS resolution failed: ${dnsError instanceof Error ? dnsError.message : 'Unknown error'}`,
      };

      return Response.json(response);
    }
  } catch (error) {
    console.error("DNS test error:", error);
    return Response.json({
      success: false,
      domain: '',
      configId: '',
      error: error instanceof Error ? error.message : 'Failed to parse request',
    }, { status: 500 });
  }
}

export default {
  test: { GET: Test },
};