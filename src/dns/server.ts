import DNS2 from "dns2";
import { tryAsync, trySync } from '@src/utils/try';
import { dnsResolver, type DNSResolverDrivers } from "./resolver";
import { BaseProvider } from "./providers";
import type { LogEntry, ServerEventLogEntry } from "../types/dns-unified";
import { createErrorResponse } from "../utils/dns-bridge";
import { v4 as uuidv4 } from 'uuid';

// Global log event emitter for SSE
class LogEventEmitter {
  private static instance: LogEventEmitter;
  private listeners: Set<(logEntry: LogEntry) => void> = new Set();

  static getInstance(): LogEventEmitter {
    if (!LogEventEmitter.instance) {
      LogEventEmitter.instance = new LogEventEmitter();
    }
    return LogEventEmitter.instance;
  }

  addListener(callback: (logEntry: LogEntry) => void): void {
    this.listeners.add(callback);
  }

  removeListener(callback: (logEntry: LogEntry) => void): void {
    this.listeners.delete(callback);
  }

  emit(logEntry: LogEntry): void {
    this.listeners.forEach(callback => {
      const [, callbackError] = trySync(() => callback(logEntry));
      if (callbackError) {
        console.error('Error in log event listener:', callbackError);
      }
    });
  }
}

export const logEventEmitter = LogEventEmitter.getInstance();

// Re-export for backward compatibility
export type DNSServerDrivers = DNSResolverDrivers;

export class DNSProxyServer {
  private server?: ReturnType<typeof DNS2.createServer>;
  private isRunning: boolean = false;
  private port: number;

  constructor(port: number = 53, providers: BaseProvider[], drivers?: DNSResolverDrivers) {
    this.port = port;
    // Initialize the singleton resolver with provided configuration
    dnsResolver.initialize(providers, drivers);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("DNS server is already running");
    }

    this.server = DNS2.createServer({
      udp: true,
      tcp: false,
      handle: async (request, send, rinfo) => {
        const [, queryError] = await tryAsync(async () => {
          const queryBuffer = this.packetToBuffer(request);
          const clientInfo = {
            address: rinfo?.address,
            port: rinfo?.port,
            transport: 'udp' as const
          };
          
          const result = await dnsResolver.resolve(queryBuffer, clientInfo);
          send(result.responseBuffer as unknown as DNS2.DnsResponse);
        });
        
        if (queryError) {
          console.error("DNS query handling error:", queryError);
          
          // Send SERVFAIL response using bridge utility
          const [, fallbackError] = trySync(() => {
            const queryBuffer = this.packetToBuffer(request);
            const errorBuffer = createErrorResponse(queryBuffer);
            send(errorBuffer as unknown as DNS2.DnsResponse);
          });
          
          if (fallbackError) {
            console.error("Failed to create error response:", fallbackError);
            // Send minimal SERVFAIL as last resort
            const minimalError = require('dns-packet').encode({
              id: 0,
              type: 'response',
              flags: 384,
              questions: [],
              answers: [],
              rcode: 2
            });
            send(minimalError as unknown as DNS2.DnsResponse);
          }
        }
      }
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.listen({ udp: this.port })
        .then(() => {
          this.isRunning = true;
          console.log(`DNS proxy server started on port ${this.port}`);
          
          // Emit server start event to SSE and persistent logs
          const startLogEntry: ServerEventLogEntry = {
            type: 'server_event',
            id: uuidv4(),
            timestamp: Date.now(),
            level: 'info',
            eventType: 'started',
            message: `DNS proxy server started on port ${this.port}`,
            port: this.port,
            configChanges: {
              providers: dnsResolver.getProviders().map(p => p.name),
              driversEnabled: Object.keys(dnsResolver.getDrivers()).length
            }
          };
          
          // Pipe to both SSE and persistent driver
          logEventEmitter.emit(startLogEntry);
          if (dnsResolver.hasLogDriver()) {
            dnsResolver.getLogDriver().log(startLogEntry);
          }
          
          resolve();
        })
        .catch((error) => {
          console.error("DNS server error:", error);
          
          // Emit server start error event to SSE and persistent logs
          const errorLogEntry: ServerEventLogEntry = {
            type: 'server_event',
            id: uuidv4(),
            timestamp: Date.now(),
            level: 'error',
            eventType: 'crashed',
            message: `Failed to start DNS proxy server on port ${this.port}`,
            port: this.port,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            configChanges: {
              providers: dnsResolver.getProviders().map(p => p.name),
              driversEnabled: Object.keys(dnsResolver.getDrivers()).length
            }
          };
          
          // Pipe to both SSE and persistent driver
          logEventEmitter.emit(errorLogEntry);
          if (dnsResolver.hasLogDriver()) {
            dnsResolver.getLogDriver().log(errorLogEntry);
          }
          
          reject(error);
        });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    const [, stopError] = await tryAsync(async () => {
      await this.server!.close();
      this.isRunning = false;
      console.log("DNS proxy server stopped");
      
      // Emit server stop event to SSE and persistent logs
      const stopLogEntry: ServerEventLogEntry = {
        type: 'server_event',
        id: uuidv4(),
        timestamp: Date.now(),
        level: 'info',
        eventType: 'stopped',
        message: `DNS proxy server stopped on port ${this.port}`,
        port: this.port
      };
      
      // Pipe to both SSE and persistent driver
      logEventEmitter.emit(stopLogEntry);
      if (dnsResolver.hasLogDriver()) {
        dnsResolver.getLogDriver().log(stopLogEntry);
      }
    });
    
    if (stopError) {
      console.error("Error stopping DNS server:", stopError);
      
      // Emit server stop error event to SSE and persistent logs
      const errorLogEntry: LogEntry = {
        type: 'server_event',
        id: uuidv4(),
        timestamp: Date.now(),
        level: 'error',
        eventType: 'crashed',
        message: `Failed to stop DNS proxy server on port ${this.port}`,
        port: this.port,
        error: stopError.message,
        errorStack: stopError.stack
      };
      
      // Pipe to both SSE and persistent driver
      logEventEmitter.emit(errorLogEntry);
      if (dnsResolver.hasLogDriver()) {
        dnsResolver.getLogDriver().log(errorLogEntry);
      }
      
      throw stopError;
    }
  }

  // Expose resolver for DoH handler and other uses
  getResolver() {
    return dnsResolver;
  }


  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
    };
  }

  // Helper methods for DNS2 packet conversion
  private packetToBuffer(packet: unknown): Buffer {
    // If it's already a Buffer, return it
    if (Buffer.isBuffer(packet)) {
      return packet;
    }
    
    // Type guard for packet with toBuffer method
    if (this.hasToBufferMethod(packet)) {
      const [bufferResult, bufferError] = trySync(() => packet.toBuffer());
      if (bufferError) {
        console.warn('Failed to use packet.toBuffer():', bufferError);
      } else if (Buffer.isBuffer(bufferResult)) {
        return bufferResult;
      }
    }
    
    // Fallback: use dns-packet to encode if packet has expected structure
    if (this.isDnsPacketLike(packet)) {
      const [encodedResult, encodeError] = trySync(() => require('dns-packet').encode({
        id: packet.header?.id || 0,
        type: 'response',
        flags: packet.header?.qr ? 384 : 0, // QR=1, RD=1
        questions: packet.questions || [],
        answers: packet.answers || [],
        rcode: packet.header?.rcode || 0
      }));
      
      if (encodeError) {
        console.warn('Failed to encode DNS packet:', encodeError);
      } else {
        return encodedResult;
      }
    }
    
    // Return a minimal valid DNS response as last resort
    console.warn('Unable to convert packet to buffer, returning minimal SERVFAIL response');
    return require('dns-packet').encode({
      id: 0,
      type: 'response',
      flags: 384,
      questions: [],
      answers: [],
      rcode: 2 // SERVFAIL
    });
  }
  
  private hasToBufferMethod(obj: unknown): obj is { toBuffer(): unknown } {
    return typeof obj === 'object' && obj !== null && 'toBuffer' in obj && typeof (obj as any).toBuffer === 'function';
  }
  
  private isDnsPacketLike(obj: unknown): obj is { header?: { id?: number; qr?: boolean; rcode?: number }; questions?: unknown[]; answers?: unknown[] } {
    return typeof obj === 'object' && obj !== null;
  }

}
