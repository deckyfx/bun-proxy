import { BaseProvider } from "./BaseProvider";
import * as dns from "dns";
import type { Answer } from "dns-packet";
import { promisify } from "util";
import { tryAsync } from "@src/utils/try";

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
    const [result, error] = await tryAsync(async () => {
      // Parse the DNS query to extract domain and type
      const dnsPacket = require('dns-packet');
      const parsed = dnsPacket.decode(query);
      
      if (!parsed.questions || parsed.questions.length === 0) {
        throw new Error('No questions in DNS query');
      }

      const question = parsed.questions[0];
      const domain = question.name;
      const type = question.type;

      // Handle different DNS record types using Node.js built-in DNS resolver
      const [answers, dnsError] = await tryAsync(async () => {
        let results: Answer[] = [];
        switch (type) {
          case 'A':
            const ipv4Addresses = await this.resolveDns4(domain);
            results = ipv4Addresses.map(address => ({
              name: domain,
              type: 'A',
              class: 'IN',
              ttl: 300, // Default TTL
              data: address
            }));
            break;

          case 'AAAA':
            const ipv6Addresses = await this.resolveDns6(domain);
            results = ipv6Addresses.map(address => ({
              name: domain,
              type: 'AAAA',
              class: 'IN',
              ttl: 300,
              data: address
            }));
            break;

          case 'MX':
            const mxRecords = await this.resolveMx(domain);
            results = mxRecords.map(mx => ({
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
            results = txtRecords.map(txt => ({
              name: domain,
              type: 'TXT',
              class: 'IN',
              ttl: 300,
              data: Array.isArray(txt) ? txt : [txt]
            }));
            break;

          case 'CNAME':
            const cnameRecords = await this.resolveCname(domain);
            results = cnameRecords.map(cname => ({
              name: domain,
              type: 'CNAME',
              class: 'IN',
              ttl: 300,
              data: cname
            }));
            break;

          case 'NS':
            const nsRecords = await this.resolveNs(domain);
            results = nsRecords.map(ns => ({
              name: domain,
              type: 'NS',
              class: 'IN',
              ttl: 300,
              data: ns
            }));
            break;

          case 'PTR':
            const ptrRecords = await this.resolvePtr(domain);
            results = ptrRecords.map(ptr => ({
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
            results = Array.isArray(genericRecords) ? genericRecords.map(record => ({
              name: domain,
              type: type,
              class: 'IN',
              ttl: 300,
              data: record
            } as unknown as Answer)) : [{
              name: domain,
              type: type,
              class: 'IN',
              ttl: 300,
              data: genericRecords
            }];
            break;
        }
        return results;
      });
      
      if (dnsError) {
        // If DNS resolution fails, return NXDOMAIN response
        const errorResponse = {
          id: parsed.id,
          type: 'response',
          flags: 384, // QR=1, RD=1
          questions: parsed.questions,
          answers: [],
          rcode: (dnsError as any)?.code === 'ENOTFOUND' ? 3 : 2 // NXDOMAIN or SERVFAIL
        };
        return Buffer.from(dnsPacket.encode(errorResponse));
      }

      // Create successful DNS response
      const response = {
        id: parsed.id,
        type: 'response',
        flags: 384, // QR=1, RD=1
        questions: parsed.questions,
        answers: answers!,
        rcode: 0 // NOERROR
      };

      return Buffer.from(dnsPacket.encode(response));
    });

    if (error) {
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

    return result!;
  }
}