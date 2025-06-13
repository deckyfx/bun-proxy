import { promisify } from 'util';
import { dnsManager } from '@src/dns';
import Config from "@src/config";
import { Auth, type AuthUser } from "@utils/auth";
import type { DnsTestRequest, DnsTestResponse } from '@src/types/api';
import { dnsManager as DNSManagerSingleton } from '@src/dns';
import type { BunRequest } from 'bun';
import { tryParse, tryAsync, trySync } from '@src/utils/try';

export async function Test(req: BunRequest, _user: AuthUser): Promise<Response> {
  const [body, bodyError] = await tryAsync(() => req.text());
  if (bodyError) {
    return Response.json({
      success: false,
      domain: '',
      configId: '',
      error: 'Failed to read request body',
    }, { status: 400 });
  }

  const [parsedBody, parseError] = tryParse<DnsTestRequest>(body);
  if (parseError) {
    return Response.json({
      success: false,
      domain: '',
      configId: '',
      error: 'Failed to parse request',
    }, { status: 400 });
  }

  const { domain, configId } = parsedBody;

  if (!domain || !configId) {
    const response: DnsTestResponse = {
      success: false,
      domain: domain || '',
      configId: configId || '',
      error: 'Domain and configId are required',
    };
    return Response.json(response, { status: 400 });
  }

  const [testResult, testError] = await tryAsync(async () => {
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

    return {
      success: true,
      domain,
      configId,
      resolvedAddress: Array.isArray(addresses) ? addresses[0] : addresses,
    } as DnsTestResponse;
  });

  if (testError) {
    // Ensure we restore the original state even if test fails
    const [, restoreError] = await tryAsync(async () => {
      const currentStatus = dnsManager.getStatus();
      await dnsManager.stop();
      if (currentStatus.enabled) {
        await dnsManager.start();
      }
    });
    
    if (restoreError) {
      console.error("Failed to restore DNS server state:", restoreError);
    }

    const response: DnsTestResponse = {
      success: false,
      domain,
      configId,
      error: `DNS resolution failed: ${testError.message}`,
    };

    return Response.json(response);
  }

  return Response.json(testResult);
}

export async function POST(request: BunRequest, _user: AuthUser): Promise<Response> {
  const [body, bodyError] = await tryAsync(() => request.json());
  if (bodyError) {
    console.error("DNS test error:", bodyError);
    return Response.json(
      { error: "Failed to parse request body" },
      { status: 400 }
    );
  }

  // Handle two different test types:
  // 1. NextDNS config test: { domain, configId }
  // 2. UDP method test: { method: 'UDP', domain, port }
  
  if (body.configId && body.domain) {
    // NextDNS config test - handle it directly
    const { domain, configId } = body;
    return await testNextDNSConfig(domain, configId);
  }
  
  if (body.method && body.domain) {
    const { method, domain, port = 53 } = body;
    
    if (method === 'UDP') {
      // Test UDP DNS query regardless of server status
      const result = await testUDPQuery(domain, port);
      return Response.json(result);
    }
    
    return Response.json(
      { error: `Unsupported test method: ${method}` },
      { status: 400 }
    );
  }

  return Response.json(
    { error: "Invalid request format. Expected either { domain, configId } or { method, domain, port }" },
    { status: 400 }
  );
}

async function testUDPQuery(domain: string, port: number) {
  const [result, error] = await tryAsync(async () => {
    // Use DNS resolver directly, bypassing the UDP server
    const resolver = DNSManagerSingleton.getResolver();
    
    if (!resolver) {
      throw new Error("DNS resolver not available");
    }

    const startTime = Date.now();
    
    // Create DNS query
    const query = createDNSQuery(domain);
    
    // Resolve using the internal resolver
    const clientInfo = { transport: 'udp' as const };
    const result = await resolver.resolve(query, clientInfo);
    
    const duration = Date.now() - startTime;
    const ips = parseDNSResponse(result.responseBuffer);
    
    return {
      success: result.success,
      duration,
      ips,
      details: `Resolved via internal resolver (${result.responseBuffer.length} bytes, cached: ${result.cached})`
    };
  });

  if (error) {
    return {
      success: false,
      error: error.message,
      details: "Failed to resolve via internal DNS resolver"
    };
  }

  return result;
}

function createDNSQuery(domain: string): Buffer {
  const labels = domain.split('.');
  let queryLength = 12; // Header length
  
  for (const label of labels) {
    queryLength += label.length + 1;
  }
  queryLength += 1 + 4; // null terminator + type + class
  
  const query = Buffer.alloc(queryLength);
  let offset = 0;
  
  // DNS Header
  query.writeUInt16BE(0x1234, offset); // Transaction ID
  offset += 2;
  query.writeUInt16BE(0x0100, offset); // Standard query with recursion desired
  offset += 2;
  query.writeUInt16BE(0x0001, offset); // 1 question
  offset += 2;
  query.writeUInt16BE(0x0000, offset); // 0 answers
  offset += 2;
  query.writeUInt16BE(0x0000, offset); // 0 authority
  offset += 2;
  query.writeUInt16BE(0x0000, offset); // 0 additional
  offset += 2;
  
  // Question section
  for (const label of labels) {
    query.writeUInt8(label.length, offset);
    offset += 1;
    query.write(label, offset, 'ascii');
    offset += label.length;
  }
  query.writeUInt8(0, offset); // null terminator
  offset += 1;
  query.writeUInt16BE(1, offset); // Type A
  offset += 2;
  query.writeUInt16BE(1, offset); // Class IN
  
  return query;
}

function parseDNSResponse(response: Buffer): string[] {
  const ips: string[] = [];
  
  const [, error] = trySync(() => {
    if (response.length < 12) return;
    
    const ancount = response.readUInt16BE(6); // Answer count
    
    if (ancount === 0) return;
    
    // Skip header and question section
    let offset = 12;
    const qdcount = response.readUInt16BE(4);
    
    // Skip questions
    for (let q = 0; q < qdcount; q++) {
      while (offset < response.length && response[offset] !== 0) {
        const labelLength = response[offset];
        if (!labelLength) break;
        offset += labelLength + 1;
      }
      offset += 5; // null + type + class
    }
    
    // Parse answers
    for (let i = 0; i < ancount; i++) {
      if (offset >= response.length) break;
      
      // Skip name (handle compression)
      if ((response[offset]! & 0xc0) === 0xc0) {
        offset += 2;
      } else {
        while (offset < response.length && response[offset] !== 0) {
          const len = response[offset]!;
          if (!len) break;
          offset += len + 1;
        }
        offset += 1;
      }
      
      if (offset + 10 > response.length) break;
      
      const type = response.readUInt16BE(offset);
      offset += 2;
      const cls = response.readUInt16BE(offset);
      offset += 2;
      offset += 4; // TTL
      const dataLength = response.readUInt16BE(offset);
      offset += 2;
      
      if (type === 1 && cls === 1 && dataLength === 4) {
        // A record
        if (offset + 4 <= response.length) {
          const ip = `${response[offset]}.${response[offset + 1]}.${response[offset + 2]}.${response[offset + 3]}`;
          ips.push(ip);
        }
      }
      
      offset += dataLength;
    }
  });
  
  if (error) {
    console.warn('Error parsing DNS response:', error);
  }
  
  return ips;
}

async function testNextDNSConfig(domain: string, configId: string) {
  const [testResult, testError] = await tryAsync(async () => {
    // Validate config ID format first
    if (!configId || configId.length < 6) {
      throw new Error("Invalid NextDNS config ID format");
    }
    
    // Test the NextDNS config directly without server restart
    // Create a temporary NextDNS provider with the test config
    const { NextDNSProvider } = await import('@src/dns/providers');
    const testProvider = new NextDNSProvider(configId);
    
    // Strategy: Compare responses between the test config and a known invalid config
    // If they're identical, the test config is likely invalid too
    
    // Test with the provided config
    const query = createDNSQuery(domain);
    const startTime = Date.now();
    const responseBuffer = await testProvider.resolve(query);
    const duration = Date.now() - startTime;
    const ips = parseDNSResponse(responseBuffer);
    
    // Test with a definitely invalid config for comparison
    const invalidProvider = new NextDNSProvider('invalid999');
    const invalidResponse = await invalidProvider.resolve(query);
    const invalidIps = parseDNSResponse(invalidResponse);
    
    // Check if this looks like a valid DNS response
    if (responseBuffer.length < 12) {
      throw new Error("Invalid DNS response received");
    }
    
    if (ips.length === 0) {
      throw new Error("No IP addresses resolved");
    }

    // Compare responses - if they're identical, the config is likely invalid
    const testIpsSorted = [...ips].sort().join(',');
    const invalidIpsSorted = [...invalidIps].sort().join(',');
    
    if (testIpsSorted === invalidIpsSorted) {
      throw new Error(`Config ID ${configId} appears to be invalid. It returned identical results to a known invalid config (${testIpsSorted}). NextDNS may be falling back to unfiltered DNS.`);
    }

    return {
      success: true,
      domain,
      configId,
      resolvedAddress: ips[0],
      ips: ips,
      duration,
      result: `DNS resolution successful - resolved to ${ips[0]} (${ips.length} addresses found). Config validation: Passed (different from invalid config)`,
    };
  });

  if (testError) {
    return Response.json({
      success: false,
      domain,
      configId,
      error: `DNS resolution failed: ${testError.message}`,
    }, { status: 200 });
  }

  return Response.json(testResult);
}

export default {
  test: { 
    GET: Auth.guard(Test), 
    POST: Auth.guard(POST) 
  },
};