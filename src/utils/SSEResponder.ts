import type { DnsLogEntry } from '@src/types/dns-unified';
import type { DNSStatusMessage, DNSContentMessage, SystemHeartbeatMessage, ErrorMessage } from './SSEClient';
import { trySync } from './try';

interface SSEClient {
  id: string;
  response: Response;
  controller: ReadableStreamDefaultController<Uint8Array>;
  channels: Set<string>;
  lastPing: number;
}

export class SSEResponder {
  private static instance: SSEResponder;
  private clients = new Map<string, SSEClient>();
  private keepAliveInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start keep-alive mechanism
    this.startKeepAlive();
  }

  static getInstance(): SSEResponder {
    if (!SSEResponder.instance) {
      SSEResponder.instance = new SSEResponder();
    }
    return SSEResponder.instance;
  }

  // Add a new SSE client connection
  addClient(clientId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    const client: SSEClient = {
      id: clientId,
      response: null as any, // Will be set by the endpoint
      controller,
      channels: new Set(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);
    console.log(`SSE client connected: ${clientId} (Total: ${this.clients.size})`);

    // Send initial connection message
    this.sendToClient(clientId, {
      type: 'connected',
      data: { clientId, timestamp: Date.now() }
    });
  }

  // Remove a client connection
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      const [, error] = trySync(() => client.controller.close());
      if (error) {
        // Client may already be disconnected
      }
      this.clients.delete(clientId);
      console.log(`SSE client disconnected: ${clientId} (Total: ${this.clients.size})`);
    }
  }

  // Subscribe a client to specific channels
  subscribeToChannels(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      channels.forEach(channel => client.channels.add(channel));
      console.log(`Client ${clientId} subscribed to channels: ${channels.join(', ')}`);
    }
  }

  // Unsubscribe a client from specific channels
  unsubscribeFromChannels(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      channels.forEach(channel => client.channels.delete(channel));
      console.log(`Client ${clientId} unsubscribed from channels: ${channels.join(', ')}`);
    }
  }

  // Emit event to a specific channel
  emit(channel: string, data: DNSStatusMessage | DNSContentMessage | DnsLogEntry | SystemHeartbeatMessage | ErrorMessage | object): void {
    const message = {
      type: channel,
      data,
      timestamp: Date.now()
    };

    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      // Send to all clients (they filter on their side)
      // Or we can implement channel filtering here if needed
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    console.log(`Emitted to channel '${channel}': ${sentCount}/${this.clients.size} clients`);
  }

  // Send message to specific client
  private sendToClient(clientId: string, message: object): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    const [, error] = trySync(() => {
      const data = `data: ${JSON.stringify(message)}\n\n`;
      const encoder = new TextEncoder();
      client.controller.enqueue(encoder.encode(data));
      client.lastPing = Date.now();
    });
    
    if (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
      // Remove disconnected client
      this.removeClient(clientId);
      return false;
    }
    
    return true;
  }

  // Start keep-alive mechanism
  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(() => {
      const now = Date.now();
      const keepAliveMessage = {
        type: 'keepalive',
        timestamp: now
      };

      // Send keepalive to all clients and remove stale ones
      const staleClients: string[] = [];
      
      for (const [clientId, client] of this.clients) {
        // Remove clients that haven't responded in 60 seconds
        if (now - client.lastPing > 60000) {
          staleClients.push(clientId);
          continue;
        }

        if (!this.sendToClient(clientId, keepAliveMessage)) {
          staleClients.push(clientId);
        }
      }

      // Clean up stale clients
      staleClients.forEach(clientId => {
        console.log(`Removing stale client: ${clientId}`);
        this.removeClient(clientId);
      });

      if (this.clients.size > 0) {
        console.log(`Keep-alive sent to ${this.clients.size} clients`);
      }
    }, 30000); // Send keepalive every 30 seconds
  }

  // Get connection stats
  getStats(): { totalClients: number; channels: string[] } {
    const allChannels = new Set<string>();
    for (const client of this.clients.values()) {
      client.channels.forEach(channel => allChannels.add(channel));
    }

    return {
      totalClients: this.clients.size,
      channels: Array.from(allChannels)
    };
  }

  // Cleanup method for graceful shutdown
  cleanup(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      const [, error] = trySync(() => {
        this.sendToClient(clientId, {
          type: 'shutdown',
          data: { message: 'Server shutting down' }
        });
        client.controller.close();
      });
      if (error) {
        // Ignore errors during cleanup
      }
    }

    this.clients.clear();
    console.log('SSEResponder cleaned up');
  }

  // Convenience methods for new channel structure
  emitDNSInfo(infoData: object): void {
    this.emit('dns/info', infoData);
  }

  emitDNSStatus(statusData: DNSStatusMessage): void {
    this.emit('dns/status', statusData);
  }

  emitDNSLogEvent(logEntry: DnsLogEntry): void {
    this.emit('dns/log/event', logEntry);
  }

  emitDNSLogContent(logData: DNSContentMessage): void {
    this.emit('dns/log/', logData);
  }

  emitDNSCacheContent(cacheData: DNSContentMessage): void {
    this.emit('dns/cache/', cacheData);
  }

  emitDNSBlacklistContent(blacklistData: DNSContentMessage): void {
    this.emit('dns/blacklist/', blacklistData);
  }

  emitDNSWhitelistContent(whitelistData: DNSContentMessage): void {
    this.emit('dns/whitelist/', whitelistData);
  }

  emitSystemHeartbeat(): void {
    this.emit('system/heartbeat', { ping: 'pong', timestamp: Date.now() });
  }

  emitError(errorData: ErrorMessage): void {
    this.emit('error', errorData);
  }
}

// Export singleton instance
export const sseResponder = SSEResponder.getInstance();