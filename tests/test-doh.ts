#!/usr/bin/env bun

/**
 * DNS-over-HTTPS (DoH) Test Script
 * Tests DoH resolution using the smart root endpoint (/)
 * The server auto-detects DoH requests and routes them appropriately
 * Follows RFC 8484 standard for DNS-over-HTTPS
 */

// Get configuration from running server
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3000;
const DOH_HOST = "localhost";
const DOH_PORT = DASHBOARD_PORT;
const DOH_PATH = "/";

async function waitForHealth(
  url: string,
  timeoutMs = 10000,
  intervalMs = 1000
) {
  const start = Date.now();
  while (true) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✅ Health check passed`);
        return;
      } else {
        console.log(
          `⚠️ Health check returned status ${res.status}, retrying...`
        );
      }
    } catch (e) {
      console.log(
        `⚠️ Health check fetch failed: ${(e as Error).message}, retrying...`
      );
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for health check at ${url}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function checkHealth() {
  const healthUrl = `http://localhost:${DASHBOARD_PORT}/api/system/health`;

  try {
    await waitForHealth(healthUrl);
  } catch (e) {
    console.error("❌ Server health check failed:", e);
    process.exit(1);
  }
}

function createDNSQuery(domain: string): Buffer {
  // Create DNS query packet for A record
  const labels = domain.split(".");
  let queryLength = 12; // Header length

  // Calculate question section length
  for (const label of labels) {
    queryLength += label.length + 1; // +1 for length byte
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
    query.write(label, offset, "ascii");
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

  try {
    // Parse DNS header
    const id = response.readUInt16BE(0);
    const flags = response.readUInt16BE(2);
    const qdcount = response.readUInt16BE(4); // Questions
    const ancount = response.readUInt16BE(6); // Answers
    const nscount = response.readUInt16BE(8); // Authority
    const arcount = response.readUInt16BE(10); // Additional

    console.log(
      `📊 DNS Header - ID: 0x${id.toString(16)}, Flags: 0x${flags.toString(16)}`
    );
    console.log(
      `📊 Questions: ${qdcount}, Answers: ${ancount}, Authority: ${nscount}, Additional: ${arcount}`
    );

    // Check response code (RCODE) in flags
    const rcode = flags & 0x000f;
    if (rcode !== 0) {
      const rcodeNames = {
        1: "FormErr",
        2: "ServFail", 
        3: "NXDomain",
        4: "NotImp",
        5: "Refused"
      };
      console.log(
        `❌ DNS error code: ${rcode} (${rcodeNames[rcode as keyof typeof rcodeNames] || "Unknown"})`
      );
      return ips;
    }

    if (ancount === 0) {
      console.log(`📊 No answer records in response`);
      return ips;
    }

    // Skip header (12 bytes)
    let offset = 12;

    // Skip question section
    for (let q = 0; q < qdcount; q++) {
      while (offset < response.length && response[offset] !== 0) {
        const labelLength = response[offset];
        if (!labelLength || labelLength === 0) break;
        offset += labelLength + 1;
      }
      offset += 5; // null terminator + type + class
    }

    // Parse answer section
    for (let i = 0; i < ancount; i++) {
      if (offset >= response.length) break;

      // Skip name (compressed format)
      if ((response[offset]! & 0xc0) === 0xc0) {
        offset += 2;
      } else {
        while (offset < response.length && response[offset] !== 0) {
          const len = response[offset];
          if (!len) break;
          offset += len + 1;
        }
        offset += 1;
      }

      if (offset + 10 > response.length) {
        break;
      }

      const type = response.readUInt16BE(offset);
      offset += 2;
      const cls = response.readUInt16BE(offset);
      offset += 2;
      const ttl = response.readUInt32BE(offset);
      offset += 4;
      const dataLength = response.readUInt16BE(offset);
      offset += 2;

      if (type === 1 && cls === 1 && dataLength === 4) {
        // A record
        if (offset + 4 <= response.length) {
          const ip = `${response[offset]}.${response[offset + 1]}.${
            response[offset + 2]
          }.${response[offset + 3]}`;
          console.log(`🌐 Found A record: ${ip} (TTL: ${ttl})`);
          ips.push(ip);
        }
      }

      offset += dataLength;
    }
  } catch (error) {
    console.warn(
      "⚠️ Error parsing DNS response:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return ips;
}

// Test DoH using POST method with application/dns-message
async function testDoHPOST(domain: string): Promise<void> {
  console.log(`🔍 Testing ${domain} via DoH POST...`);

  const query = createDNSQuery(domain);
  const dohUrl = `http://${DOH_HOST}:${DOH_PORT}${DOH_PATH}`;
  const startTime = Date.now();

  try {
    console.log(`📤 Sending DoH POST request to ${dohUrl}`);
    console.log(`📦 DNS query size: ${query.length} bytes`);

    const response = await fetch(dohUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        "Accept": "application/dns-message",
      },
      body: query,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/dns-message")) {
      console.warn(`⚠️ Unexpected content-type: ${contentType}`);
    }

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    console.log(
      `✅ DoH response received in ${duration}ms (${responseBuffer.length} bytes)`
    );

    const ips = parseDNSResponse(responseBuffer);
    if (ips.length > 0) {
      console.log(`📍 Resolved IP addresses: ${ips.join(", ")}`);
    } else {
      console.log("📍 No A records found in response");
    }
  } catch (error) {
    console.error(`❌ DoH POST error for ${domain}:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Test DoH using GET method with base64url-encoded query
async function testDoHGET(domain: string): Promise<void> {
  console.log(`🔍 Testing ${domain} via DoH GET...`);

  const query = createDNSQuery(domain);
  
  // Convert to base64url (RFC 4648 Section 5)
  const base64 = query.toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  
  const dohUrl = `http://${DOH_HOST}:${DOH_PORT}${DOH_PATH}?dns=${base64url}`;
  const startTime = Date.now();

  try {
    console.log(`📤 Sending DoH GET request to ${dohUrl}`);
    console.log(`📦 DNS query size: ${query.length} bytes (base64url: ${base64url.length} chars)`);

    const response = await fetch(dohUrl, {
      method: "GET",
      headers: {
        "Accept": "application/dns-message",
      },
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/dns-message")) {
      console.warn(`⚠️ Unexpected content-type: ${contentType}`);
    }

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    console.log(
      `✅ DoH response received in ${duration}ms (${responseBuffer.length} bytes)`
    );

    const ips = parseDNSResponse(responseBuffer);
    if (ips.length > 0) {
      console.log(`📍 Resolved IP addresses: ${ips.join(", ")}`);
    } else {
      console.log("📍 No A records found in response");
    }
  } catch (error) {
    console.error(`❌ DoH GET error for ${domain}:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function testDoHMethods(domain: string): Promise<void> {
  console.log(`\n🚀 Testing ${domain}:`);
  console.log("=" .repeat(50));

  try {
    console.log("\n🌐 Method: POST (RFC 8484 preferred)");
    console.log("-".repeat(30));
    await testDoHPOST(domain);
    
    console.log("\n🌐 Method: GET (RFC 8484 alternative)");
    console.log("-".repeat(30));
    await testDoHGET(domain);
    
    console.log(`\n✅ ${domain} - Both methods succeeded!`);
  } catch (error) {
    console.log(`\n❌ ${domain} - Test failed`);
    throw error;
  }
}

async function main() {
  console.log("🚀 DNS-over-HTTPS (DoH) Test Suite");
  console.log("====================================");
  console.log(`🎯 Target: http://${DOH_HOST}:${DOH_PORT}${DOH_PATH}`);
  console.log(`📋 RFC 8484 compliant testing (smart root endpoint)`);
  console.log(`📋 Server auto-detects DoH vs Dashboard requests\n`);

  await checkHealth();

  const testDomains = [
    "google.com",
    "example.com", 
    "github.com",
    "cloudflare.com",
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const domain of testDomains) {
    try {
      await testDoHMethods(domain);
      successCount++;
    } catch (error) {
      failureCount++;
      console.log(`❌ Failed to test ${domain}\n`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 DoH Test Results:");
  console.log(`✅ Successful: ${successCount}/${testDomains.length}`);
  console.log(`❌ Failed: ${failureCount}/${testDomains.length}`);
  
  if (failureCount === 0) {
    console.log("🎉 All DoH tests passed!");
  } else {
    console.log("⚠️ Some DoH tests failed");
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}