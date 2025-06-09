import { BaseProvider } from "./BaseProvider";
import * as dns from "dns";
import { promisify } from "util";

export class SystemProvider extends BaseProvider {
  name = "system";
  private resolveDns = promisify(dns.resolve);
  private resolveDns4 = promisify(dns.resolve4);
  private resolveDns6 = promisify(dns.resolve6);
  private resolveMx = promisify(dns.resolveMx);
  private resolveTxt = promisify(dns.resolveTxt);
  private resolveCname = promisify(dns.resolveCname);
  private resolveNs = promisify(dns.resolveNs);
  private resolvePtr = promisify(dns.resolvePtr);

  constructor() {
    super();
  }

  async resolve(query: Buffer): Promise<Buffer> {
    try {
      // Parse the DNS query to extract domain and type
      const dnsPacket = require('dns-packet');
      const parsed = dnsPacket.decode(query);
      
      if (!parsed.questions || parsed.questions.length === 0) {
        throw new Error('No questions in DNS query');
      }

      const question = parsed.questions[0];
      const domain = question.name;
      const type = question.type;

      let answers: any[] = [];

      // Handle different DNS record types using Node.js built-in DNS resolver
      try {
        switch (type) {
          case 'A':
            const ipv4Addresses = await this.resolveDns4(domain);
            answers = ipv4Addresses.map(address => ({
              name: domain,
              type: 'A',
              class: 'IN',
              ttl: 300, // Default TTL
              data: address
            }));
            break;

          case 'AAAA':
            const ipv6Addresses = await this.resolveDns6(domain);
            answers = ipv6Addresses.map(address => ({
              name: domain,
              type: 'AAAA',
              class: 'IN',
              ttl: 300,
              data: address
            }));
            break;

          case 'MX':
            const mxRecords = await this.resolveMx(domain);
            answers = mxRecords.map(mx => ({
              name: domain,
              type: 'MX',
              class: 'IN',
              ttl: 300,
              data: {
                preference: mx.priority,
                exchange: mx.exchange
              }
            }));
            break;

          case 'TXT':
            const txtRecords = await this.resolveTxt(domain);
            answers = txtRecords.map(txt => ({
              name: domain,
              type: 'TXT',
              class: 'IN',
              ttl: 300,
              data: Array.isArray(txt) ? txt : [txt]
            }));
            break;

          case 'CNAME':
            const cnameRecords = await this.resolveCname(domain);
            answers = cnameRecords.map(cname => ({
              name: domain,
              type: 'CNAME',
              class: 'IN',
              ttl: 300,
              data: cname
            }));
            break;

          case 'NS':
            const nsRecords = await this.resolveNs(domain);
            answers = nsRecords.map(ns => ({
              name: domain,
              type: 'NS',
              class: 'IN',
              ttl: 300,
              data: ns
            }));
            break;

          case 'PTR':
            const ptrRecords = await this.resolvePtr(domain);
            answers = ptrRecords.map(ptr => ({
              name: domain,
              type: 'PTR',
              class: 'IN',
              ttl: 300,
              data: ptr
            }));
            break;

          default:
            // For unsupported types, try generic resolve
            const genericRecords = await this.resolveDns(domain, type);
            answers = Array.isArray(genericRecords) ? genericRecords.map(record => ({
              name: domain,
              type: type,
              class: 'IN',
              ttl: 300,
              data: record
            })) : [{
              name: domain,
              type: type,
              class: 'IN',
              ttl: 300,
              data: genericRecords
            }];
            break;
        }
      } catch (dnsError: any) {
        // If DNS resolution fails, return NXDOMAIN response
        const errorResponse = {
          id: parsed.id,
          type: 'response',
          flags: 384, // QR=1, RD=1
          questions: parsed.questions,
          answers: [],
          rcode: dnsError.code === 'ENOTFOUND' ? 3 : 2 // NXDOMAIN or SERVFAIL
        };
        return Buffer.from(dnsPacket.encode(errorResponse));
      }

      // Create successful DNS response
      const response = {
        id: parsed.id,
        type: 'response',
        flags: 384, // QR=1, RD=1
        questions: parsed.questions,
        answers: answers,
        rcode: 0 // NOERROR
      };

      return Buffer.from(dnsPacket.encode(response));

    } catch (error) {
      // If parsing fails, return SERVFAIL
      const errorResponse = {
        id: 0,
        type: 'response',
        flags: 384,
        questions: [],
        answers: [],
        rcode: 2 // SERVFAIL
      };
      return Buffer.from(require('dns-packet').encode(errorResponse));
    }
  }
}