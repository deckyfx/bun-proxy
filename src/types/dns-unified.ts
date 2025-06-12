/**
 * Unified DNS Type System
 * 
 * This module defines a consistent type system based on dns-packet types,
 * with bridge utilities for dns2 integration and database storage.
 * 
 * Design principles:
 * 1. dns-packet types are the source of truth
 * 2. All caching/logging uses these types
 * 3. Bridge functions handle dns2 <-> dns-packet conversion
 * 4. Database stores JSON for schema flexibility
 */

import type * as DnsPacket from 'dns-packet';
import type * as Dns2 from 'dns2';

// Re-export dns-packet types as our base types
export type RecordType = DnsPacket.RecordType;
export type RecordClass = DnsPacket.RecordClass;
export type Question = DnsPacket.Question;
export type Answer = DnsPacket.Answer;
export type Packet = DnsPacket.Packet;
export type DecodedPacket = DnsPacket.DecodedPacket;

// Specific answer types for type safety
export type StringAnswer = DnsPacket.StringAnswer;
export type MxAnswer = DnsPacket.MxAnswer;
export type SrvAnswer = DnsPacket.SrvAnswer;
export type TxtAnswer = DnsPacket.TxtAnswer;
export type SoaAnswer = DnsPacket.SoaAnswer;

// Enhanced types for our application
export interface EnhancedDnsPacket extends DecodedPacket {
  /** Timestamp when packet was processed */
  timestamp: number;
  /** Processing metadata */
  metadata?: {
    provider?: string;
    responseTime?: number;
    cached?: boolean;
    blocked?: boolean;
    whitelisted?: boolean;
  };
}

export interface CachedDnsResponse {
  /** Original dns-packet DecodedPacket */
  packet: DecodedPacket;
  /** Cache metadata */
  cache: {
    timestamp: number;
    ttl: number; // Minimum TTL from all records
    expiresAt: number; // timestamp + (ttl * 1000)
  };
}

export interface DnsLogEntry {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'error';
  level: 'info' | 'warn' | 'error';
  
  // Request/Response data as dns-packet format
  query?: Question;
  packet?: DecodedPacket;
  
  // Client information
  client: {
    address?: string;
    port?: number;
    transport: 'udp' | 'tcp' | 'doh';
  };
  
  // Processing metadata
  processing: {
    provider?: string;
    responseTime?: number;
    cached: boolean;
    blocked: boolean;
    whitelisted: boolean;
    success: boolean;
    error?: string;
  };
}

export interface ServerEventLogEntry {
  id: string;
  timestamp: number;
  type: 'server_event';
  level: 'info' | 'warn' | 'error';
  
  // Server event details
  eventType: 'started' | 'stopped' | 'crashed';
  message: string;
  port?: number;
  error?: string;
  errorStack?: string;
  configChanges?: {
    providers?: string[];
    driversEnabled?: number;
  };
}

// Union type for all log entries
export type LogEntry = DnsLogEntry | ServerEventLogEntry;

// Driver interfaces using dns-packet types
export interface DnsCacheEntry {
  key: string; // domain:type format
  response: CachedDnsResponse;
}

export interface DnsBlacklistEntry {
  domain: string;
  addedAt: number;
  source?: string;
  reason?: string;
  category?: string;
}

export interface DnsWhitelistEntry {
  domain: string;
  addedAt: number;
  source?: string;  
  reason?: string;
  category?: string;
}

// Bridge types for dns2 integration
export interface Dns2Bridge {
  request: Dns2.DnsRequest;
  response: Dns2.DnsResponse;
}

// API types for frontend-backend communication
export interface DnsQueryRequest {
  domain: string;
  type: RecordType;
  class?: RecordClass;
}

export interface DnsQueryResponse {
  success: boolean;
  query: DnsQueryRequest;
  packet?: DecodedPacket;
  cached: boolean;
  blocked: boolean;
  responseTime: number;
  error?: string;
}

export interface DnsServerStatus {
  running: boolean;
  port: number;
  uptime?: number;
  providers: string[];
  stats: {
    totalQueries: number;
    cachedQueries: number;
    blockedQueries: number;
    errorQueries: number;
  };
}

export interface DnsDriverConfig {
  scope: 'logs' | 'cache' | 'blacklist' | 'whitelist';
  driver: string;
  options?: Record<string, unknown>;
}

export interface DnsDriverStatus {
  scope: 'logs' | 'cache' | 'blacklist' | 'whitelist';
  driver: string;
  stats: {
    totalEntries: number;
    memoryUsage?: number;
    lastUpdate?: number;
  };
}

// Utility types for type guards
export type DnsRecordData = 
  | string // A, AAAA, CNAME, NS, PTR
  | DnsPacket.MxData
  | DnsPacket.SrvData
  | DnsPacket.TxtData
  | DnsPacket.SoaData
  | Buffer; // Raw data for unknown types

// Type guards for runtime type checking
export function isStringAnswer(answer: Answer): answer is StringAnswer {
  return ['A', 'AAAA', 'CNAME', 'DNAME', 'NS', 'PTR'].includes(answer.type);
}

export function isMxAnswer(answer: Answer): answer is MxAnswer {
  return answer.type === 'MX';
}

export function isSrvAnswer(answer: Answer): answer is SrvAnswer {
  return answer.type === 'SRV';
}

export function isTxtAnswer(answer: Answer): answer is TxtAnswer {
  return answer.type === 'TXT';
}

export function isSoaAnswer(answer: Answer): answer is SoaAnswer {
  return answer.type === 'SOA';
}

// Validation functions
export function isValidRecordType(type: string): type is RecordType {
  const validTypes: RecordType[] = [
    'A', 'AAAA', 'AFSDB', 'APL', 'AXFR', 'CAA', 'CDNSKEY', 'CDS', 'CERT',
    'CNAME', 'DNAME', 'DHCID', 'DLV', 'DNSKEY', 'DS', 'HINFO', 'HIP', 'IXFR',
    'IPSECKEY', 'KEY', 'KX', 'LOC', 'MX', 'NAPTR', 'NS', 'NSEC', 'NSEC3',
    'NSEC3PARAM', 'NULL', 'OPT', 'PTR', 'RRSIG', 'RP', 'SIG', 'SOA', 'SRV',
    'SSHFP', 'TA', 'TKEY', 'TLSA', 'TSIG', 'TXT', 'URI'
  ];
  return validTypes.includes(type as RecordType);
}

export function isValidRecordClass(cls: string): cls is RecordClass {
  const validClasses: RecordClass[] = ['IN', 'CS', 'CH', 'HS', 'ANY'];
  return validClasses.includes(cls as RecordClass);
}