#!/usr/bin/env bun

/**
 * Simple DNS Server Test Script
 * Tests DNS resolution for google.com using the local DNS server
 * Assumes DNS server is already running on the configured port
 */

// Get configuration from running server
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3000;
const DNS_HOST = "127.0.0.1";
let DNS_PORT = process.env.DNS_PROXY_PORT || 53;

// Fetch actual DNS configuration from the API
async function getDNSConfig() {
  try {
    const response = await fetch(
      `http://localhost:${DASHBOARD_PORT}/api/dns/config`
    );
    if (response.ok) {
      const data = await response.json();
      DNS_PORT = data.config.port;
      console.log(
        `📋 Using DNS server configuration: Port ${DNS_PORT}, NextDNS Config: ${
          data.config.nextdnsConfigId || "default"
        }`
      );
      return data.config;
    } else {
      console.warn(
        "⚠️  Could not fetch DNS config from API, using environment defaults"
      );
    }
  } catch (error) {
    console.warn(
      "⚠️  Could not connect to dashboard API, using environment defaults"
    );
  }
  return null;
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
  query.writeUInt16BE(0x0100, offset); // Standard query
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

  console.log(`🔍 Debug: Response buffer length: ${response.length}`);
  console.log(`🔍 Debug: Response hex: ${response.toString("hex")}`);

  try {
    // Parse DNS header
    const id = response.readUInt16BE(0);
    const flags = response.readUInt16BE(2);
    const qdcount = response.readUInt16BE(4); // Questions
    const ancount = response.readUInt16BE(6); // Answers
    const nscount = response.readUInt16BE(8); // Authority
    const arcount = response.readUInt16BE(10); // Additional

    console.log(
      `🔍 Debug: DNS Header - ID: 0x${id.toString(
        16
      )}, Flags: 0x${flags.toString(16)}`
    );
    console.log(
      `🔍 Debug: Questions: ${qdcount}, Answers: ${ancount}, Authority: ${nscount}, Additional: ${arcount}`
    );

    // Check response code (RCODE) in flags
    const rcode = flags & 0x000f;
    if (rcode !== 0) {
      console.log(
        `🔍 Debug: DNS error code: ${rcode} (0=NoError, 1=FormErr, 2=ServFail, 3=NXDomain, etc.)`
      );
      return ips;
    }

    if (ancount === 0) {
      console.log(`🔍 Debug: No answer records in response`);
      return ips;
    }

    // Skip header (12 bytes)
    let offset = 12;
    console.log(`🔍 Debug: Starting to parse at offset ${offset}`);

    // Skip question section
    for (let q = 0; q < qdcount; q++) {
      console.log(`🔍 Debug: Parsing question ${q + 1} at offset ${offset}`);
      while (offset < response.length && response[offset] !== 0) {
        const labelLength = response[offset];
        if (!labelLength || labelLength === 0) break;
        console.log(`🔍 Debug: Question label length: ${labelLength}`);
        offset += labelLength + 1;
      }
      offset += 5; // null terminator + type + class
      console.log(`🔍 Debug: Question section ends at offset ${offset}`);
    }

    // Parse answer section
    for (let i = 0; i < ancount; i++) {
      console.log(`🔍 Debug: Parsing answer ${i + 1} at offset ${offset}`);
      if (offset >= response.length) break;

      // Skip name (compressed format)
      if ((response[offset!]! & 0xc0) === 0xc0) {
        console.log(`🔍 Debug: Compressed name pointer at offset ${offset}`);
        offset += 2;
      } else {
        console.log(`🔍 Debug: Uncompressed name at offset ${offset}`);
        while (offset < response.length && response[offset] !== 0) {
          const len = response[offset];
          if (!len) break;
          offset += len + 1;
        }
        offset += 1;
      }

      if (offset + 10 > response.length) {
        console.log(`🔍 Debug: Not enough bytes left for record header`);
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

      console.log(
        `🔍 Debug: Record - Type: ${type}, Class: ${cls}, TTL: ${ttl}, Data Length: ${dataLength}`
      );

      if (type === 1 && cls === 1 && dataLength === 4) {
        // A record
        if (offset + 4 <= response.length) {
          const ip = `${response[offset]}.${response[offset + 1]}.${
            response[offset + 2]
          }.${response[offset + 3]}`;
          console.log(`🔍 Debug: Found A record: ${ip}`);
          ips.push(ip);
        }
      }

      offset += dataLength;
    }
  } catch (error) {
    console.warn(
      "⚠️  Error parsing DNS response:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return ips;
}

async function testDNSQuery(domain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Testing ${domain}...`);

    const query = createDNSQuery(domain);
    const startTime = Date.now();

    // Use dgram instead of Bun.udpSocket
    const dgram = require("dgram");
    const socket = dgram.createSocket("udp4");

    socket.on("message", (data: Buffer) => {
      const duration = Date.now() - startTime;
      console.log(
        `✅ Response received in ${duration}ms (${data.length} bytes)`
      );

      const ips = parseDNSResponse(data);
      if (ips.length > 0) {
        console.log(`📍 IP addresses: ${ips.join(", ")}`);
      } else {
        console.log("📍 No A records found in response");
      }

      socket.close();
      resolve();
      process.exit(0);
    });

    socket.on("error", (error: Error) => {
      console.error(`❌ Error querying ${domain}:`, error.message);
      socket.close();
      reject(error);
      process.exit(0);
    });

    console.log(`📤 Sending DNS query to ${DNS_HOST}:${DNS_PORT}`);
    socket.send(query, Number(DNS_PORT), DNS_HOST, (err: Error | null) => {
      if (err) {
        console.error("Send error:", err);
        socket.close();
        reject(err);
        process.exit(0);
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      console.log(`⏰ Timeout waiting for response from ${domain}`);
      socket.close();
      reject(new Error("Timeout"));
      process.exit(0);
    }, 5000);
  });
}

async function main() {
  console.log("🚀 DNS Server Test Suite");
  console.log("========================");

  // First, get the actual DNS configuration from the running server
  await getDNSConfig();

  console.log(`🎯 Target: ${DNS_HOST}:${DNS_PORT}`);
  console.log("");

  const testDomains = [
    "google.com",
    "example.com",
    "github.com",
    "cloudflare.com",
  ];

  for (const domain of testDomains) {
    try {
      await testDNSQuery(domain);
      console.log("");
    } catch (error) {
      console.log(`❌ Failed to test ${domain}`);
      console.log("");
      process.exit(0);
    }
  }

  console.log("🎉 DNS tests completed!");
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}
