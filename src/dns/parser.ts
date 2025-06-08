import * as dnsPacket from 'dns-packet';

export interface CacheableRecord {
  domain: string;
  type: string;
  addresses: string[];
  ttl: number;
  timestamp: number;
}

export interface DetailedDNSRecord {
  domain: string;
  type: string;
  class: string;
  ttl: number;
  data: string | any;
  timestamp: number;
}

export interface CachedDNSResponse {
  id: number;
  questions: Array<{
    name: string;
    type: string;
    class: string;
  }>;
  answers: DetailedDNSRecord[];
  authorities: DetailedDNSRecord[];
  additionals: DetailedDNSRecord[];
  flags: {
    qr: boolean;
    opcode: string;
    aa: boolean;
    tc: boolean;
    rd: boolean;
    ra: boolean;
    rcode: string;
  };
  timestamp: number;
  ttl: number; // Minimum TTL of all records
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

  static parseDetailedDNSResponse(buffer: Buffer): CachedDNSResponse {
    try {
      const packet = dnsPacket.decode(buffer);
      const timestamp = Date.now();
      
      // Parse questions
      const questions = (packet.questions || []).map(q => ({
        name: q.name,
        type: q.type,
        class: q.class || 'IN'
      }));

      // Parse answers with detailed information
      const answers = this.parseDetailedRecords(packet.answers || [], timestamp);
      const authorities = this.parseDetailedRecords(packet.authorities || [], timestamp);
      const additionals = this.parseDetailedRecords(packet.additionals || [], timestamp);

      // Calculate minimum TTL
      const allRecords = [...answers, ...authorities, ...additionals];
      const minTTL = allRecords.length > 0 ? Math.min(...allRecords.map(r => r.ttl)) : 300;

      // Parse flags
      const flags = {
        qr: !!(packet.flags && (packet.flags & 0x8000)), // QR bit
        opcode: this.getOpcode(packet.flags || 0),
        aa: !!(packet.flags && (packet.flags & 0x0400)), // AA bit
        tc: !!(packet.flags && (packet.flags & 0x0200)), // TC bit
        rd: !!(packet.flags && (packet.flags & 0x0100)), // RD bit
        ra: !!(packet.flags && (packet.flags & 0x0080)), // RA bit
        rcode: this.getRcode((packet as any).rcode || 0)
      };

      return {
        id: packet.id || 0,
        questions,
        answers,
        authorities,
        additionals,
        flags,
        timestamp,
        ttl: minTTL
      };
    } catch (error) {
      throw new Error(`Failed to parse detailed DNS response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static parseDetailedRecords(records: any[], timestamp: number): DetailedDNSRecord[] {
    return records.map(record => ({
      domain: record.name,
      type: record.type,
      class: record.class || 'IN',
      ttl: record.ttl || 300,
      data: this.parseRecordData(record),
      timestamp
    }));
  }

  private static parseRecordData(record: any): string | any {
    switch (record.type) {
      case 'A':
      case 'AAAA':
        return record.data; // IP address string
      case 'CNAME':
      case 'PTR':
        return record.data; // Domain name string
      case 'MX':
        return {
          priority: record.priority || record.data?.priority,
          exchange: record.exchange || record.data?.exchange
        };
      case 'TXT':
        return Array.isArray(record.data) ? record.data : [record.data];
      case 'SRV':
        return {
          priority: record.priority || record.data?.priority,
          weight: record.weight || record.data?.weight,
          port: record.port || record.data?.port,
          target: record.target || record.data?.target
        };
      case 'SOA':
        return {
          mname: record.mname || record.data?.mname,
          rname: record.rname || record.data?.rname,
          serial: record.serial || record.data?.serial,
          refresh: record.refresh || record.data?.refresh,
          retry: record.retry || record.data?.retry,
          expire: record.expire || record.data?.expire,
          minimum: record.minimum || record.data?.minimum
        };
      default:
        return record.data || record;
    }
  }

  private static getOpcode(flags: number): string {
    const opcode = (flags >> 11) & 0x0f;
    const opcodes = ['QUERY', 'IQUERY', 'STATUS', 'RESERVED', 'NOTIFY', 'UPDATE'];
    return opcodes[opcode] || `UNKNOWN(${opcode})`;
  }

  private static getRcode(rcode: number): string {
    const rcodes = [
      'NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP',
      'REFUSED', 'YXDOMAIN', 'YXRRSET', 'NXRRSET', 'NOTAUTH',
      'NOTZONE'
    ];
    return rcodes[rcode] || `UNKNOWN(${rcode})`;
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

  static createDNSResponseFromCachedData(originalQuery: Buffer, cachedResponse: CachedDNSResponse): Buffer {
    try {
      const queryPacket = dnsPacket.decode(originalQuery);
      
      // Convert cached detailed records back to dns-packet format
      const answers = cachedResponse.answers.map(record => ({
        name: record.domain,
        type: record.type,
        class: record.class,
        ttl: Math.max(0, record.ttl - Math.floor((Date.now() - record.timestamp) / 1000)), // Adjust TTL
        data: record.data
      }));

      const authorities = cachedResponse.authorities.map(record => ({
        name: record.domain,
        type: record.type,
        class: record.class,
        ttl: Math.max(0, record.ttl - Math.floor((Date.now() - record.timestamp) / 1000)),
        data: record.data
      }));

      const additionals = cachedResponse.additionals.map(record => ({
        name: record.domain,
        type: record.type,
        class: record.class,
        ttl: Math.max(0, record.ttl - Math.floor((Date.now() - record.timestamp) / 1000)),
        data: record.data
      }));

      const responsePacket: any = {
        id: queryPacket.id,
        type: 'response' as const,
        flags: this.buildFlags(cachedResponse.flags),
        questions: queryPacket.questions,
        answers: answers as any,
        authorities: authorities as any,
        additionals: additionals as any
      };

      return dnsPacket.encode(responsePacket);
    } catch (error) {
      throw new Error(`Failed to create DNS response from cached data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static buildFlags(flags: any): number {
    let result = 0;
    if (flags.qr) result |= 0x8000; // QR bit
    if (flags.aa) result |= 0x0400; // AA bit
    if (flags.tc) result |= 0x0200; // TC bit
    if (flags.rd) result |= 0x0100; // RD bit
    if (flags.ra) result |= 0x0080; // RA bit
    return result;
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