import { create } from 'zustand';

export interface TestResult {
  id: string;
  timestamp: Date;
  domain: string;
  method: 'UDP' | 'DoH-GET' | 'DoH-POST';
  status: 'success' | 'error' | 'pending';
  duration?: number;
  ips?: string[];
  error?: string;
  details?: string;
}

interface DNSTestStore {
  // State
  results: TestResult[];
  isRunning: boolean;
  
  // Actions
  addResult: (result: Omit<TestResult, 'id' | 'timestamp'>) => string;
  updateResult: (id: string, updates: Partial<TestResult>) => void;
  clearResults: () => void;
  setRunning: (running: boolean) => void;
  
  // Test methods
  testUDP: (domain: string, port?: number) => Promise<void>;
  testDoH: (domain: string, method: 'GET' | 'POST') => Promise<void>;
  runAllTests: (domain: string) => Promise<void>;
}

// DNS utility functions
export function createDNSQuery(domain: string): Uint8Array {
  const labels = domain.split('.');
  let queryLength = 12; // Header length
  
  for (const label of labels) {
    queryLength += label.length + 1;
  }
  queryLength += 1 + 4; // null terminator + type + class
  
  const query = new Uint8Array(queryLength);
  let offset = 0;
  
  // DNS Header
  const view = new DataView(query.buffer);
  view.setUint16(offset, 0x1234); // Transaction ID
  offset += 2;
  view.setUint16(offset, 0x0100); // Standard query with recursion desired
  offset += 2;
  view.setUint16(offset, 0x0001); // 1 question
  offset += 2;
  view.setUint16(offset, 0x0000); // 0 answers
  offset += 2;
  view.setUint16(offset, 0x0000); // 0 authority
  offset += 2;
  view.setUint16(offset, 0x0000); // 0 additional
  offset += 2;
  
  // Question section
  for (const label of labels) {
    query[offset] = label.length;
    offset += 1;
    for (let i = 0; i < label.length; i++) {
      query[offset + i] = label.charCodeAt(i);
    }
    offset += label.length;
  }
  query[offset] = 0; // null terminator
  offset += 1;
  view.setUint16(offset, 1); // Type A
  offset += 2;
  view.setUint16(offset, 1); // Class IN
  
  return query;
}

export function parseDNSResponse(response: ArrayBuffer | Buffer): string[] {
  const ips: string[] = [];
  
  try {
    // Handle both ArrayBuffer and Buffer
    let buffer: ArrayBuffer;
    let uint8Array: Uint8Array;
    
    if (response instanceof ArrayBuffer) {
      buffer = response;
      uint8Array = new Uint8Array(buffer);
    } else {
      // Node.js Buffer
      buffer = response.buffer.slice(response.byteOffset, response.byteOffset + response.byteLength) as ArrayBuffer;
      uint8Array = new Uint8Array(buffer);
    }
    
    if (uint8Array.length < 12) return ips;
    
    const view = new DataView(buffer);
    const ancount = view.getUint16(6); // Answer count
    
    if (ancount === 0) return ips;
    
    // Skip header and question section
    let offset = 12;
    const qdcount = view.getUint16(4);
    
    // Skip questions
    for (let q = 0; q < qdcount; q++) {
      while (offset < uint8Array.length && uint8Array[offset] !== 0) {
        const labelLength = uint8Array[offset];
        if (!labelLength) break;
        offset += labelLength + 1;
      }
      offset += 5; // null + type + class
    }
    
    // Parse answers
    for (let i = 0; i < ancount; i++) {
      if (offset >= uint8Array.length) break;
      
      // Skip name (handle compression)
      if ((uint8Array[offset]! & 0xc0) === 0xc0) {
        offset += 2;
      } else {
        while (offset < uint8Array.length && uint8Array[offset] !== 0) {
          const len = uint8Array[offset]!;
          if (!len) break;
          offset += len + 1;
        }
        offset += 1;
      }
      
      if (offset + 10 > uint8Array.length) break;
      
      const type = view.getUint16(offset);
      offset += 2;
      const cls = view.getUint16(offset);
      offset += 2;
      offset += 4; // TTL
      const dataLength = view.getUint16(offset);
      offset += 2;
      
      if (type === 1 && cls === 1 && dataLength === 4) {
        // A record
        if (offset + 4 <= uint8Array.length) {
          const ip = `${uint8Array[offset]}.${uint8Array[offset + 1]}.${uint8Array[offset + 2]}.${uint8Array[offset + 3]}`;
          ips.push(ip);
        }
      }
      
      offset += dataLength;
    }
  } catch (error) {
    console.warn('Error parsing DNS response:', error);
  }
  
  return ips;
}

export const useDNSTestStore = create<DNSTestStore>((set, get) => ({
  // Initial state
  results: [],
  isRunning: false,
  
  // State actions
  addResult: (result) => {
    const newResult: TestResult = {
      ...result,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    set(state => ({
      results: [newResult, ...state.results].slice(0, 20) // Keep last 20 results
    }));
    return newResult.id;
  },
  
  updateResult: (id, updates) => {
    set(state => ({
      results: state.results.map(r => r.id === id ? { ...r, ...updates } : r)
    }));
  },
  
  clearResults: () => {
    set({ results: [] });
  },
  
  setRunning: (running) => {
    set({ isRunning: running });
  },
  
  // Test methods
  testUDP: async (domain, port = 53) => {
    const { addResult, updateResult } = get();
    const resultId = addResult({
      domain,
      method: 'UDP',
      status: 'pending'
    });

    try {
      const startTime = Date.now();
      
      // Send UDP request to DNS server via API
      const response = await fetch('/api/dns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'UDP',
          domain,
          port
        })
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        updateResult(resultId, {
          status: 'success',
          duration,
          ips: data.ips || [],
          details: data.details
        });
      } else {
        updateResult(resultId, {
          status: 'error',
          duration,
          error: data.error,
          details: data.details
        });
      }
    } catch (error) {
      updateResult(resultId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },
  
  testDoH: async (domain, method) => {
    const { addResult, updateResult } = get();
    const testMethod = method === 'GET' ? 'DoH-GET' : 'DoH-POST';
    
    const resultId = addResult({
      domain,
      method: testMethod,
      status: 'pending'
    });

    try {
      const startTime = Date.now();
      
      if (method === 'POST') {
        // DoH POST with binary DNS query
        const query = createDNSQuery(domain);
        const response = await fetch('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/dns-message',
            'Accept': 'application/dns-message'
          },
          body: query
        });

        const duration = Date.now() - startTime;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseBuffer = await response.arrayBuffer();
        const ips = parseDNSResponse(responseBuffer);
        
        updateResult(resultId, {
          status: 'success',
          duration,
          ips,
          details: `Response size: ${responseBuffer.byteLength} bytes`
        });
      } else {
        // DoH GET with base64url query
        const query = createDNSQuery(domain);
        // Convert Uint8Array to base64 in browser
        const base64 = btoa(String.fromCharCode(...query));
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        
        const response = await fetch(`/?dns=${base64url}`, {
          method: 'GET',
          headers: { 'Accept': 'application/dns-message' }
        });

        const duration = Date.now() - startTime;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseBuffer = await response.arrayBuffer();
        const ips = parseDNSResponse(responseBuffer);
        
        updateResult(resultId, {
          status: 'success',
          duration,
          ips,
          details: `Query length: ${base64url.length} chars, Response: ${responseBuffer.byteLength} bytes`
        });
      }
    } catch (error) {
      updateResult(resultId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },
  
  runAllTests: async (domain) => {
    const { testUDP, testDoH, setRunning } = get();
    
    setRunning(true);
    
    try {
      await Promise.all([
        testUDP(domain),
        testDoH(domain, 'GET'),
        testDoH(domain, 'POST')
      ]);
    } finally {
      setRunning(false);
    }
  }
}));