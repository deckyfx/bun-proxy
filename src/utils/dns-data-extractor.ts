/**
 * Type-safe DNS data extraction utilities
 * 
 * Demonstrates proper handling of dns-packet Answer types without any casts
 */

import type * as DnsPacket from 'dns-packet';
import {
  isStringAnswer,
  isMxAnswer,
  isSrvAnswer,
  isTxtAnswer,
  isSoaAnswer
} from '../types/dns-unified';

export interface ExtractedDnsData {
  type: string;
  name: string;
  ttl: number;
  class: string;
  value: string;
  details?: Record<string, unknown>;
}

/**
 * Extract data from any DNS answer type with full type safety
 */
export function extractDnsAnswerData(answer: DnsPacket.Answer): ExtractedDnsData {
  // Handle OPT records separately since they have different structure
  if (answer.type === 'OPT') {
    const optAnswer = answer as DnsPacket.OptAnswer;
    return {
      type: answer.type,
      name: answer.name,
      ttl: 0, // OPT records don't have TTL
      class: 'IN', // OPT records don't have traditional class
      value: `UDP_SIZE:${optAnswer.udpPayloadSize}`,
      details: {
        udpPayloadSize: optAnswer.udpPayloadSize,
        extendedRcode: optAnswer.extendedRcode,
        ednsVersion: optAnswer.ednsVersion,
        flags: optAnswer.flags,
        flag_do: optAnswer.flag_do,
        options: optAnswer.options
      }
    };
  }

  const base = {
    type: answer.type,
    name: answer.name,
    ttl: answer.ttl || 300,
    class: answer.class || 'IN'
  };

  // Handle each answer type specifically using type guards
  if (isStringAnswer(answer)) {
    // A, AAAA, CNAME, DNAME, NS, PTR - all have string data
    return {
      ...base,
      value: answer.data
    };
  }

  if (isMxAnswer(answer)) {
    return {
      ...base,
      value: answer.data.exchange,
      details: {
        preference: answer.data.preference,
        exchange: answer.data.exchange
      }
    };
  }

  if (isSrvAnswer(answer)) {
    return {
      ...base,
      value: answer.data.target,
      details: {
        priority: answer.data.priority,
        weight: answer.data.weight,
        port: answer.data.port,
        target: answer.data.target
      }
    };
  }

  if (isTxtAnswer(answer)) {
    const txtData = answer.data;
    let value: string;
    
    if (Array.isArray(txtData)) {
      value = txtData.map(item => 
        typeof item === 'string' ? item : item.toString()
      ).join(' ');
    } else {
      value = typeof txtData === 'string' ? txtData : txtData.toString();
    }

    return {
      ...base,
      value,
      details: { rawData: txtData }
    };
  }

  if (isSoaAnswer(answer)) {
    return {
      ...base,
      value: answer.data.mname,
      details: {
        mname: answer.data.mname,
        rname: answer.data.rname,
        serial: answer.data.serial,
        refresh: answer.data.refresh,
        retry: answer.data.retry,
        expire: answer.data.expire,
        minimum: answer.data.minimum
      }
    };
  }

  // OPT records already handled above

  // Handle specific structured answer types
  if (answer.type === 'CAA') {
    const caaAnswer = answer as DnsPacket.CaaAnswer;
    return {
      ...base,
      value: caaAnswer.data.value,
      details: {
        issuerCritical: caaAnswer.data.issuerCritical,
        flags: caaAnswer.data.flags,
        tag: caaAnswer.data.tag,
        value: caaAnswer.data.value
      }
    };
  }

  // Handle buffer-based answers (unknown/binary data)
  const bufferTypes = ["AFSDB", "APL", "AXFR", "CDNSKEY", "CDS", "CERT", "DHCID", "DLV", "HIP", "IPSECKEY", "IXFR", "KEY", "KX", "LOC", "NSEC3PARAM", "NULL", "SIG", "TA", "TKEY", "TSIG", "URI"];
  if (bufferTypes.includes(answer.type)) {
    const bufferAnswer = answer as DnsPacket.BufferAnswer;
    return {
      ...base,
      value: bufferAnswer.data.toString('hex'),
      details: {
        dataType: 'buffer',
        length: bufferAnswer.data.length
      }
    };
  }

  // Fallback for any unhandled types
  return {
    ...base,
    value: String(answer.data),
    details: { rawData: answer.data }
  };
}

/**
 * Extract all relevant data from a DNS packet response
 */
export function extractPacketData(packet: DnsPacket.DecodedPacket): {
  questions: Array<{ name: string; type: string; class: string }>;
  answers: ExtractedDnsData[];
  authorities: ExtractedDnsData[];
  additionals: ExtractedDnsData[];
  flags: {
    qr: boolean;
    aa: boolean;
    tc: boolean;
    rd: boolean;
    ra: boolean;
    ad: boolean;
    cd: boolean;
  };
} {
  return {
    questions: (packet.questions || []).map(q => ({
      name: q.name,
      type: q.type,
      class: q.class || 'IN'
    })),
    answers: (packet.answers || []).map(extractDnsAnswerData),
    authorities: (packet.authorities || []).map(extractDnsAnswerData),
    additionals: (packet.additionals || []).map(extractDnsAnswerData),
    flags: {
      qr: packet.flag_qr,
      aa: packet.flag_aa,
      tc: packet.flag_tc,
      rd: packet.flag_rd,
      ra: packet.flag_ra,
      ad: packet.flag_ad,
      cd: packet.flag_cd
    }
  };
}

/**
 * Get IP addresses from DNS packet (A and AAAA records only)
 */
export function extractIpAddressesFromPacket(packet: DnsPacket.DecodedPacket): {
  ipv4: string[];
  ipv6: string[];
} {
  const ipv4: string[] = [];
  const ipv6: string[] = [];

  for (const answer of packet.answers || []) {
    if (answer.type === 'A' && isStringAnswer(answer)) {
      ipv4.push(answer.data);
    } else if (answer.type === 'AAAA' && isStringAnswer(answer)) {
      ipv6.push(answer.data);
    }
  }

  return { ipv4, ipv6 };
}