import * as dnsPacket from 'dns-packet';

export interface CacheableRecord {
  domain: string;
  type: string;
  addresses: string[];
  ttl: number;
  timestamp: number;
}

export class DNSParser {
  static parseDNSQuery(buffer: Buffer) {
    try {
      const packet = dnsPacket.decode(buffer);
      
      if (!packet.questions || packet.questions.length === 0) {
        throw new Error('No questions in DNS query');
      }
      
      const question = packet.questions[0];
      if (!question) {
        throw new Error('No question found in DNS query');
      }
      
      return {
        domain: question.name,
        type: question.type,
        typeCode: this.getTypeCode(question.type),
        class: question.class
      };
    } catch (error) {
      throw new Error(`Failed to parse DNS query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static parseDNSResponse(buffer: Buffer) {
    try {
      const packet = dnsPacket.decode(buffer);
      return packet;
    } catch (error) {
      throw new Error(`Failed to parse DNS response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static extractCacheableRecords(packet: any): CacheableRecord[] {
    const records: CacheableRecord[] = [];
    const timestamp = Date.now();

    if (!packet.answers) {
      return records;
    }

    // Group addresses by domain and type
    const recordMap = new Map<string, { addresses: string[], ttl: number }>();

    for (const answer of packet.answers) {
      if (answer.type === 'A' || answer.type === 'AAAA') {
        const key = `${answer.name}:${answer.type}`;
        const existing = recordMap.get(key);
        
        if (existing) {
          existing.addresses.push(answer.data);
          existing.ttl = Math.min(existing.ttl, answer.ttl); // Use minimum TTL
        } else {
          recordMap.set(key, {
            addresses: [answer.data],
            ttl: answer.ttl
          });
        }
      }
    }

    // Convert to CacheableRecord array
    for (const [key, data] of recordMap) {
      const [domain, type] = key.split(':');
      records.push({
        domain: domain!,
        type: type!,
        addresses: data.addresses,
        ttl: data.ttl,
        timestamp
      });
    }

    return records;
  }

  static createDNSResponse(originalQuery: Buffer, records: CacheableRecord[]): Buffer {
    try {
      const queryPacket = dnsPacket.decode(originalQuery);
      
      if (!queryPacket.questions || queryPacket.questions.length === 0) {
        throw new Error('No questions in original query');
      }

      const question = queryPacket.questions[0];
      if (!question) {
        throw new Error('No question found in original query');
      }
      
      const answers: any[] = [];

      // Find matching records
      for (const record of records) {
        if (record.domain === question.name && record.type === question.type) {
          for (const address of record.addresses) {
            answers.push({
              name: record.domain,
              type: record.type,
              class: 'IN',
              ttl: record.ttl,
              data: address
            });
          }
        }
      }

      const responsePacket = {
        id: queryPacket.id,
        type: 'response' as const,
        flags: dnsPacket.RECURSION_AVAILABLE | dnsPacket.RECURSION_DESIRED,
        questions: queryPacket.questions,
        answers
      };

      return dnsPacket.encode(responsePacket);
    } catch (error) {
      throw new Error(`Failed to create DNS response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static createBlockedResponse(originalQuery: Buffer): Buffer {
    try {
      const queryPacket = dnsPacket.decode(originalQuery);
      
      const responsePacket = {
        id: queryPacket.id,
        type: 'response' as const,
        flags: dnsPacket.RECURSION_AVAILABLE | dnsPacket.RECURSION_DESIRED,
        questions: queryPacket.questions,
        answers: [],
        rcode: 'NXDOMAIN' as const
      };

      return dnsPacket.encode(responsePacket);
    } catch (error) {
      throw new Error(`Failed to create blocked response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static getTypeCode(type: string): number {
    const typeMap: Record<string, number> = {
      'A': 1,
      'AAAA': 28,
      'MX': 15,
      'CNAME': 5,
      'NS': 2,
      'PTR': 12,
      'TXT': 16
    };
    return typeMap[type] || 1;
  }
}