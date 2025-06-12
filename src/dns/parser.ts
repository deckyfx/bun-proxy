/**
 * DNS Parser - Clean implementation using unified types
 * 
 * This module provides DNS parsing utilities using the unified type system.
 * All functionality is based on dns-packet types and bridge utilities.
 */

import {
  bufferToPacket,
  createCachedResponse,
  createResponseFromCached,
  createBlockedResponse,
  createErrorResponse,
  extractQuestion,
  extractIpAddresses,
  createCacheKey,
  createCacheKeyFromDomain
} from '../utils/dns-bridge';

import type {
  DecodedPacket,
  Question,
  Answer,
  CachedDnsResponse,
  RecordType,
  RecordClass
} from '../types/dns-unified';

export class DNSParser {
  /**
   * Parse a DNS query buffer and extract the question
   */
  static parseQuery(buffer: Buffer): Question {
    const packet = bufferToPacket(buffer);
    const question = extractQuestion(packet);
    
    if (!question) {
      throw new Error('No question found in DNS query');
    }
    
    return question;
  }

  /**
   * Parse a DNS response buffer
   */
  static parseResponse(buffer: Buffer): DecodedPacket {
    return bufferToPacket(buffer);
  }

  /**
   * Create a cached response from a DNS response buffer
   */
  static createCachedFromResponse(responseBuffer: Buffer): CachedDnsResponse {
    const packet = bufferToPacket(responseBuffer);
    return createCachedResponse(packet);
  }

  /**
   * Create a DNS response buffer from cached data
   */
  static createResponseFromCache(
    originalQuery: Buffer,
    cachedResponse: CachedDnsResponse
  ): Buffer {
    return createResponseFromCached(originalQuery, cachedResponse);
  }

  /**
   * Create a blocked/NXDOMAIN response
   */
  static createBlockedResponse(originalQuery: Buffer): Buffer {
    return createBlockedResponse(originalQuery);
  }

  /**
   * Create a SERVFAIL error response
   */
  static createErrorResponse(originalQuery: Buffer): Buffer {
    return createErrorResponse(originalQuery);
  }

  /**
   * Extract IP addresses from a DNS packet
   */
  static extractAddresses(packet: DecodedPacket): string[] {
    return extractIpAddresses(packet);
  }

  /**
   * Create a cache key for a question
   */
  static createCacheKey(question: Question): string {
    return createCacheKey(question);
  }

  /**
   * Create a cache key from domain and type
   */
  static createCacheKeyFromDomain(
    domain: string,
    type: RecordType,
    cls: RecordClass = 'IN'
  ): string {
    return createCacheKeyFromDomain(domain, type, cls);
  }

  /**
   * Get all A and AAAA record addresses from packet answers
   */
  static getAddressRecords(packet: DecodedPacket): Array<{
    domain: string;
    type: 'A' | 'AAAA';
    address: string;
    ttl: number;
  }> {
    const records: Array<{
      domain: string;
      type: 'A' | 'AAAA';
      address: string;
      ttl: number;
    }> = [];

    if (!packet.answers) {
      return records;
    }

    for (const answer of packet.answers) {
      if (answer.type === 'A' || answer.type === 'AAAA') {
        records.push({
          domain: answer.name,
          type: answer.type,
          address: answer.data as string,
          ttl: answer.ttl || 300
        });
      }
    }

    return records;
  }

  /**
   * Check if a packet has the specified record type
   */
  static hasRecordType(packet: DecodedPacket, type: RecordType): boolean {
    return !!(packet.answers?.some(answer => answer.type === type));
  }

  /**
   * Get the minimum TTL from all records in a packet
   */
  static getMinimumTtl(packet: DecodedPacket): number {
    const allRecords = [
      ...(packet.answers || []),
      ...(packet.authorities || []),
      ...(packet.additionals || [])
    ];

    if (allRecords.length === 0) {
      return 300; // Default 5 minutes
    }

    const ttls = allRecords
      .map(record => ('ttl' in record ? record.ttl : undefined) || 300)
      .filter(ttl => ttl > 0);

    return ttls.length > 0 ? Math.min(...ttls) : 300;
  }

  /**
   * Check if a packet represents a successful response
   */
  static isSuccessfulResponse(packet: DecodedPacket): boolean {
    // Check if it's a response and has NOERROR rcode
    return packet.type === 'response' && 
           (!('rcode' in packet) || packet.rcode === 'NOERROR' || packet.rcode === 0);
  }

  /**
   * Get response code from packet
   */
  static getResponseCode(packet: DecodedPacket): string | number {
    if ('rcode' in packet && packet.rcode !== undefined && packet.rcode !== null) {
      const rcode = packet.rcode;
      if (typeof rcode === 'string' || typeof rcode === 'number') {
        return rcode;
      }
    }
    return 'NOERROR';
  }

  /**
   * Convert a dns-packet Answer to a simple object for logging/debugging
   */
  static answerToSimpleObject(answer: Answer): {
    name: string;
    type: string;
    class: string;
    ttl: number;
    data: unknown;
  } {
    return {
      name: answer.name,
      type: answer.type,
      class: ('class' in answer ? answer.class : undefined) || 'IN',
      ttl: ('ttl' in answer ? answer.ttl : undefined) || 300,
      data: ('data' in answer ? answer.data : undefined)
    };
  }

  /**
   * Convert packet to a simple object for logging/debugging
   */
  static packetToSimpleObject(packet: DecodedPacket): {
    id: number;
    type: string;
    questions: Array<{ name: string; type: string; class: string }>;
    answers: Array<{ name: string; type: string; data: unknown; ttl: number }>;
    answerCount: number;
    rcode: string | number;
  } {
    return {
      id: packet.id || 0,
      type: packet.type || 'query',
      questions: (packet.questions || []).map(q => ({
        name: q.name,
        type: q.type,
        class: q.class || 'IN'
      })),
      answers: (packet.answers || []).map(this.answerToSimpleObject),
      answerCount: packet.answers?.length || 0,
      rcode: this.getResponseCode(packet)
    };
  }
}