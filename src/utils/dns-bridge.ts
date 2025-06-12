/**
 * DNS Bridge Utilities
 *
 * Converts between dns2 and dns-packet formats, ensuring type safety
 * and consistent data flow throughout the application.
 */

import * as dnsPacket from "dns-packet";
import type * as Dns2 from "dns2";
import type {
  DecodedPacket,
  Question,
  Answer,
  RecordType,
  RecordClass,
  EnhancedDnsPacket,
  CachedDnsResponse,
  StringAnswer,
  MxAnswer,
  SrvAnswer,
  TxtAnswer,
  SoaAnswer,
} from "../types/dns-unified";
import {
  isStringAnswer,
  isMxAnswer,
  isSrvAnswer,
  isTxtAnswer,
  isSoaAnswer
} from "../types/dns-unified";

import type * as DnsPacket from 'dns-packet';
import { trySync } from './try';

/**
 * Comprehensive type for DNS Answer data from dns-packet
 * 
 * This type represents all possible data types that can be found in the
 * data field of a DNS Answer record, based on the dns-packet library.
 * 
 * @example
 * ```typescript
 * const answerData: AnswerData = getAnswerData(answer);
 * 
 * // Type-safe handling
 * if (isStringAnswer(answer)) {
 *   const ip: string = answer.data; // Guaranteed to be string for A/AAAA records
 * }
 * 
 * if (isMxAnswer(answer)) {
 *   const mx: DnsPacket.MxData = answer.data; // Has .exchange and .preference
 * }
 * 
 * // Generic handling with type guards
 * const dataType = getAnswerDataType(answer); // Returns 'string', 'MxData', etc.
 * ```
 */
export type AnswerData = 
  | string  // For StringAnswer types (A, AAAA, CNAME, DNAME, NS, PTR)
  | Buffer  // For BufferAnswer types (AFSDB, APL, etc.)
  | DnsPacket.CaaData      // CAA records
  | DnsPacket.DnskeyData   // DNSKEY records
  | DnsPacket.DsData       // DS records
  | DnsPacket.HInfoData    // HINFO records
  | DnsPacket.MxData       // MX records
  | DnsPacket.NaptrData    // NAPTR records
  | DnsPacket.Nsec3Data    // NSEC3 records
  | DnsPacket.NsecData     // NSEC records
  | DnsPacket.RpData       // RP records
  | DnsPacket.RrsigData    // RRSIG records
  | DnsPacket.SoaData      // SOA records
  | DnsPacket.SrvData      // SRV records
  | DnsPacket.SshfpData    // SSHFP records
  | DnsPacket.TlsaData     // TLSA records
  | DnsPacket.TxtData      // TXT records (string | Buffer | Array<string | Buffer>)
  | undefined;             // For OPT records

/**
 * Convert dns2 DnsRequest to dns-packet Question
 */
export function dns2RequestToQuestion(request: Dns2.DnsRequest): Question {
  if (!request.questions || request.questions.length === 0) {
    throw new Error("DNS request has no questions");
  }

  const question = request.questions[0];
  if (!question) {
    throw new Error("DNS request question is invalid");
  }

  // dns2 doesn't provide type/class info in the question directly
  // We need to infer or use defaults
  return {
    name: question.name,
    type: "A" as RecordType, // Default, should be overridden by caller
    class: "IN" as RecordClass,
  };
}

/**
 * Convert dns-packet DecodedPacket to dns2 DnsResponse
 */
export function packetToDns2Response(packet: DecodedPacket): Dns2.DnsResponse {
  const answers: Dns2.DnsAnswer[] = (packet.answers || []).map((answer) => {
    const dns2Answer: Dns2.DnsAnswer = {
      name: answer.name,
      type: getTypeCode(answer.type),
      class: getClassCode(getAnswerClass(answer)),
      ttl: getTtl(answer),
      data: extractAnswerData(answer),
    };

    // Add type-specific fields for dns2 compatibility
    if (answer.type === "A" || answer.type === "AAAA") {
      if (isStringAnswer(answer)) {
        dns2Answer.address = answer.data;
      }
    } else if (
      answer.type === "CNAME" ||
      answer.type === "PTR" ||
      answer.type === "NS"
    ) {
      if (isStringAnswer(answer)) {
        dns2Answer.domain = answer.data;
      }
    }

    return dns2Answer;
  });

  return { answers };
}

/**
 * Convert Buffer to dns-packet DecodedPacket
 */
export function bufferToPacket(buffer: Buffer): DecodedPacket {
  const [result, error] = trySync(() => dnsPacket.decode(buffer));
  if (error) {
    throw new Error(`Failed to decode DNS packet: ${error.message}`);
  }
  return result;
}

/**
 * Convert dns-packet Packet to Buffer
 */
export function packetToBuffer(packet: dnsPacket.Packet): Buffer {
  const [result, error] = trySync(() => dnsPacket.encode(packet));
  if (error) {
    throw new Error(`Failed to encode DNS packet: ${error.message}`);
  }
  return result;
}

/**
 * Enhance a DecodedPacket with metadata
 */
export function enhancePacket(
  packet: DecodedPacket,
  metadata: EnhancedDnsPacket["metadata"] = {}
): EnhancedDnsPacket {
  return {
    ...packet,
    timestamp: Date.now(),
    metadata,
  };
}

/**
 * Create a cached response from a DecodedPacket
 */
export function createCachedResponse(packet: DecodedPacket): CachedDnsResponse {
  const timestamp = Date.now();
  const ttl = calculateMinimumTtl(packet);

  return {
    packet,
    cache: {
      timestamp,
      ttl,
      expiresAt: timestamp + ttl * 1000,
    },
  };
}

/**
 * Check if a cached response is expired
 */
export function isCachedResponseExpired(cached: CachedDnsResponse): boolean {
  return Date.now() > cached.cache.expiresAt;
}

/**
 * Create a DNS response from cached data
 */
export function createResponseFromCached(
  originalQuery: Buffer,
  cached: CachedDnsResponse
): Buffer {
  const [result, error] = trySync(() => {
    const queryPacket = bufferToPacket(originalQuery);

    // Adjust TTLs based on remaining cache time
    const remainingTtl = Math.max(
      0,
      Math.floor((cached.cache.expiresAt - Date.now()) / 1000)
    );

    const adjustedAnswers = (cached.packet.answers || []).map((answer) => ({
      ...answer,
      ttl: remainingTtl,
    }));

    const responsePacket: dnsPacket.Packet = {
      id: queryPacket.id,
      type: "response",
      flags: cached.packet.flags,
      questions: queryPacket.questions,
      answers: adjustedAnswers,
      authorities: cached.packet.authorities,
      additionals: cached.packet.additionals,
    };

    return packetToBuffer(responsePacket);
  });
  
  if (error) {
    throw new Error(`Failed to create response from cached data: ${error.message}`);
  }
  return result;
}

/**
 * Create a blocked/NXDOMAIN response
 */
export function createBlockedResponse(originalQuery: Buffer): Buffer {
  const [result, error] = trySync(() => {
    const queryPacket = bufferToPacket(originalQuery);

    const responsePacket: dnsPacket.Packet = {
      id: queryPacket.id,
      type: "response",
      flags: dnsPacket.RECURSION_AVAILABLE | dnsPacket.RECURSION_DESIRED,
      questions: queryPacket.questions,
      answers: [],
    };

    // Add rcode for NXDOMAIN - need to use any cast due to dns-packet type limitations
    return dnsPacket.encode({
      ...responsePacket,
      rcode: 3, // NXDOMAIN
    } as any);
  });
  
  if (error) {
    throw new Error(`Failed to create blocked response: ${error.message}`);
  }
  return result;
}

/**
 * Create a SERVFAIL response
 */
export function createErrorResponse(originalQuery: Buffer): Buffer {
  const [result, error] = trySync(() => {
    const queryPacket = bufferToPacket(originalQuery);

    const responsePacket: dnsPacket.Packet = {
      id: queryPacket.id,
      type: "response",
      flags: dnsPacket.RECURSION_AVAILABLE | dnsPacket.RECURSION_DESIRED,
      questions: queryPacket.questions,
      answers: [],
    };

    // Add rcode for SERVFAIL
    return dnsPacket.encode({
      ...responsePacket,
      rcode: 2, // SERVFAIL
    } as any);
  });
  
  if (error) {
    throw new Error(`Failed to create error response: ${error.message}`);
  }
  return result;
}

/**
 * Extract the primary question from a packet
 */
export function extractQuestion(packet: DecodedPacket): Question | null {
  if (!packet.questions || packet.questions.length === 0) {
    return null;
  }
  return packet.questions[0] || null;
}

/**
 * Extract IP addresses from packet answers
 */
export function extractIpAddresses(packet: DecodedPacket): string[] {
  if (!packet.answers) {
    return [];
  }

  return packet.answers
    .filter((answer) => answer.type === "A" || answer.type === "AAAA")
    .map((answer) => {
      if (isStringAnswer(answer)) {
        return answer.data; // This is guaranteed to be a string for A/AAAA records
      }
      return null;
    })
    .filter((ip): ip is string => ip !== null);
}

/**
 * Create a cache key from a question
 */
export function createCacheKey(question: Question): string {
  return `${question.name}:${question.type}:${question.class || "IN"}`;
}

/**
 * Create a cache key from domain and type
 */
export function createCacheKeyFromDomain(
  domain: string,
  type: RecordType,
  cls: RecordClass = "IN"
): string {
  return `${domain}:${type}:${cls}`;
}

// Helper functions

function getAnswerClass(answer: Answer): string {
  if (answer.type === "OPT") {
    return "IN"; // OPT records don't have a traditional class
  }
  return answer.class || "IN";
}

/**
 * Type-safe getter for Answer data with proper typing
 */
export function getAnswerData(answer: Answer): AnswerData {
  if (answer.type === "OPT") {
    return undefined; // OPT records don't have traditional data
  }
  return answer.data;
}

/**
 * Type-safe helper to extract string data from string-type answers
 */
export function getStringAnswerData(answer: Answer): string | null {
  if (isStringAnswer(answer)) {
    return answer.data;
  }
  return null;
}

/**
 * Type-safe helper to extract MX record data
 */
export function getMxAnswerData(answer: Answer): DnsPacket.MxData | null {
  if (isMxAnswer(answer)) {
    return answer.data;
  }
  return null;
}

/**
 * Type-safe helper to extract SRV record data
 */
export function getSrvAnswerData(answer: Answer): DnsPacket.SrvData | null {
  if (isSrvAnswer(answer)) {
    return answer.data;
  }
  return null;
}

/**
 * Type-safe helper to extract TXT record data
 */
export function getTxtAnswerData(answer: Answer): DnsPacket.TxtData | null {
  if (isTxtAnswer(answer)) {
    return answer.data;
  }
  return null;
}

/**
 * Type-safe helper to extract SOA record data
 */
export function getSoaAnswerData(answer: Answer): DnsPacket.SoaData | null {
  if (isSoaAnswer(answer)) {
    return answer.data;
  }
  return null;
}

/**
 * Type-safe helper to determine answer data type
 */
export function getAnswerDataType(answer: Answer): string {
  if (answer.type === "OPT") {
    return 'undefined';
  }
  
  // String types
  if (isStringAnswer(answer)) {
    return 'string';
  }
  
  // Structured data types
  if (isMxAnswer(answer)) return 'MxData';
  if (isSrvAnswer(answer)) return 'SrvData';
  if (isTxtAnswer(answer)) return 'TxtData';
  if (isSoaAnswer(answer)) return 'SoaData';
  
  // Check for specific types
  switch (answer.type) {
    case 'CAA': return 'CaaData';
    case 'DNSKEY': return 'DnskeyData';
    case 'DS': return 'DsData';
    case 'HINFO': return 'HInfoData';
    case 'NAPTR': return 'NaptrData';
    case 'NSEC': return 'NsecData';
    case 'NSEC3': return 'Nsec3Data';
    case 'RP': return 'RpData';
    case 'RRSIG': return 'RrsigData';
    case 'SSHFP': return 'SshfpData';
    case 'TLSA': return 'TlsaData';
    default: return 'Buffer';
  }
}

function calculateMinimumTtl(packet: DecodedPacket): number {
  const allRecords = [
    ...(packet.answers || []),
    ...(packet.authorities || []),
    ...(packet.additionals || []),
  ];

  if (allRecords.length === 0) {
    return 300; // Default 5 minutes
  }

  const ttls = allRecords
    .map((record) => getTtl(record))
    .filter((ttl) => ttl > 0);

  return ttls.length > 0 ? Math.min(...ttls) : 300;
}

function getTtl(answer: Answer): number {
  if (answer.type === "OPT") {
    return 300; // OPT records don't have TTL
  }
  return answer.ttl || 300; // Default 5 minutes
}

function extractAnswerData(answer: Answer): string {
  // Use type guards to handle each answer type properly
  if (isStringAnswer(answer)) {
    return answer.data; // string
  }
  
  if (isMxAnswer(answer)) {
    return answer.data.exchange;
  }
  
  if (isSrvAnswer(answer)) {
    return answer.data.target;
  }
  
  if (isTxtAnswer(answer)) {
    const txtData = answer.data;
    if (Array.isArray(txtData)) {
      return txtData.map(item => 
        typeof item === 'string' ? item : item.toString()
      ).join(' ');
    }
    return typeof txtData === 'string' ? txtData : txtData.toString();
  }
  
  if (isSoaAnswer(answer)) {
    return answer.data.mname;
  }
  
  if (answer.type === "OPT") {
    return ""; // OPT records don't have meaningful string data
  }
  
  // For Buffer answers and other types, convert to string
  const bufferTypes = ["AFSDB", "APL", "AXFR", "CDNSKEY", "CDS", "CERT", "DHCID", "DLV", "HIP", "IPSECKEY", "IXFR", "KEY", "KX", "LOC", "NSEC3PARAM", "NULL", "SIG", "TA", "TKEY", "TSIG", "URI"];
  if (bufferTypes.includes(answer.type)) {
    const bufferAnswer = answer as DnsPacket.BufferAnswer;
    return bufferAnswer.data.toString('hex');
  }
  
  // Fallback for any remaining types
  return String(answer.data);
}

function getTypeCode(type: string): number {
  const typeMap: Record<string, number> = {
    A: 1,
    NS: 2,
    CNAME: 5,
    SOA: 6,
    PTR: 12,
    MX: 15,
    TXT: 16,
    AAAA: 28,
    SRV: 33,
    CAA: 257,
  };
  return typeMap[type] || 1;
}

function getClassCode(cls: string): number {
  const classMap: Record<string, number> = {
    IN: 1,
    CS: 2,
    CH: 3,
    HS: 4,
    ANY: 255,
  };
  return classMap[cls] || 1;
}
