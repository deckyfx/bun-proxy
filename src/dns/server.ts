import DNS2 from "dns2";
import { dnsResolver, type DNSResolverDrivers } from "./resolver";
import { BaseProvider } from "./providers";
import type { LogEntry } from "./drivers/logs/BaseDriver";

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
      try {
        callback(logEntry);
      } catch (error) {
        console.error('Error in log event listener:', error);
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
        try {
          const queryBuffer = this.packetToBuffer(request);
          const clientInfo = {
            address: rinfo?.address,
            port: rinfo?.port,
            transport: 'udp' as const
          };
          
          const result = await dnsResolver.resolve(queryBuffer, clientInfo);
          send(result.responseBuffer as unknown as DNS2.DnsResponse);
        } catch (error) {
          console.error("DNS query handling error:", error);
          
          // Send SERVFAIL response as buffer
          const errorBuffer = require('dns-packet').encode({
            id: (request as any).header?.id || 0,
            type: 'response',
            flags: 384, // QR=1, RD=1
            questions: (request as any).questions || [],
            answers: [],
            rcode: 2 // SERVFAIL
          });
          send(errorBuffer as unknown as DNS2.DnsResponse);
        }
      }
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.listen({ udp: this.port })
        .then(() => {
          this.isRunning = true;
          console.log(`DNS proxy server started on port ${this.port}`);
          
          // Emit server start event to SSE and persistent logs
          const startLogEntry: LogEntry = {
            type: 'server_event',
            requestId: 'server-start',
            timestamp: new Date(),
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
          const errorLogEntry: LogEntry = {
            type: 'server_event',
            requestId: 'server-start-error',
            timestamp: new Date(),
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

    try {
      await this.server.close();
      this.isRunning = false;
      console.log("DNS proxy server stopped");
      
      // Emit server stop event to SSE and persistent logs
      const stopLogEntry: LogEntry = {
        type: 'server_event',
        requestId: 'server-stop',
        timestamp: new Date(),
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
    } catch (error) {
      console.error("Error stopping DNS server:", error);
      
      // Emit server stop error event to SSE and persistent logs
      const errorLogEntry: LogEntry = {
        type: 'server_event',
        requestId: 'server-stop-error',
        timestamp: new Date(),
        level: 'error',
        eventType: 'crashed',
        message: `Failed to stop DNS proxy server on port ${this.port}`,
        port: this.port,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      };
      
      // Pipe to both SSE and persistent driver
      logEventEmitter.emit(errorLogEntry);
      if (dnsResolver.hasLogDriver()) {
        dnsResolver.getLogDriver().log(errorLogEntry);
      }
      
      throw error;
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
  private packetToBuffer(packet: any): Buffer {
    // If it's already a Buffer, return it
    if (Buffer.isBuffer(packet)) {
      return packet;
    }
    
    // Use DNS2's toBuffer method if available
    if (packet.toBuffer && typeof packet.toBuffer === 'function') {
      try {
        const result = packet.toBuffer();
        if (Buffer.isBuffer(result)) {
          return result;
        }
      } catch (error) {
        console.warn('Failed to use packet.toBuffer():', error);
      }
    }
    
    // Fallback: use dns-packet to encode the response
    try {
      return require('dns-packet').encode({
        id: packet.header?.id || 0,
        type: 'response',
        flags: packet.header?.qr ? 384 : 0, // QR=1, RD=1
        questions: packet.questions || [],
        answers: packet.answers || [],
        rcode: packet.header?.rcode || 0
      });
    } catch (error) {
      console.warn('Failed to encode DNS packet:', error);
      // Return a minimal valid DNS response
      return require('dns-packet').encode({
        id: 0,
        type: 'response',
        flags: 384,
        questions: [],
        answers: [],
        rcode: 2 // SERVFAIL
      });
    }
  }

}
