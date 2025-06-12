import { tryParse } from './try';

// SSE Message Types
export interface SSEMessage<T = unknown> {
  type: string;
  data: T;
  timestamp?: number;
}

export interface DNSStatusMessage {
  enabled: boolean;
  server?: {
    isRunning: boolean;
    port: number;
    providers?: string[];
  } | null;
  currentNextDnsConfigId?: string;
}

export interface DNSLogEventMessage {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'error' | 'server_event';
  level: 'info' | 'warn' | 'error';
  message?: string;
}

export interface DNSContentMessage {
  driver: string;
  count: number;
  lastUpdated: number;
  entries?: any[];
}

export interface SystemHeartbeatMessage {
  timestamp: number;
  status: 'alive';
}

export interface ErrorMessage {
  error: string;
  details?: string | object;
}

// Union type for all possible SSE message data types
export type SSEMessageData = 
  | DNSStatusMessage 
  | DNSLogEventMessage 
  | DNSContentMessage 
  | SystemHeartbeatMessage 
  | ErrorMessage;

class EventEmitter {
  private listeners = new Map<string, Set<(data: SSEMessageData) => void>>();

  subscribe(channel: string, callback: (data: SSEMessageData) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);
    
    // Return unsubscribe function
    return () => this.unsubscribe(channel, callback);
  }

  unsubscribe(channel: string, callback: (data: SSEMessageData) => void): void {
    this.listeners.get(channel)?.delete(callback);
  }

  emit(channel: string, data: SSEMessageData): void {
    this.listeners.get(channel)?.forEach(callback => callback(data));
  }

  clear(channel?: string): void {
    if (channel) {
      this.listeners.delete(channel);
    } else {
      this.listeners.clear();
    }
  }

  hasListeners(channel: string): boolean {
    return (this.listeners.get(channel)?.size ?? 0) > 0;
  }
}

export class SSEClient {
  private static instance: SSEClient;
  private eventSource: EventSource | null = null;
  private eventEmitter = new EventEmitter();
  private connected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connectionListeners = new Set<(connected: boolean) => void>();

  private constructor() {}

  static getInstance(): SSEClient {
    if (!SSEClient.instance) {
      SSEClient.instance = new SSEClient();
    }
    return SSEClient.instance;
  }

  subscribe(channel: string, callback: (data: SSEMessageData) => void): () => void {
    const unsubscribe = this.eventEmitter.subscribe(channel, callback);
    
    // Auto-connect if this is the first subscription
    if (!this.connected && this.hasAnySubscriptions()) {
      this.connect();
    }

    return () => {
      unsubscribe();
      // Auto-disconnect if no more subscriptions
      if (!this.hasAnySubscriptions() && this.connected) {
        this.disconnect();
      }
    };
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    // Immediately call with current state
    callback(this.connected);
    
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  private hasAnySubscriptions(): boolean {
    // Check if any channel has listeners
    return [
      'dns/info', 'dns/status', 'dns/log/event', 
      'dns/log/', 'dns/cache/', 'dns/blacklist/', 'dns/whitelist/',
      'system/heartbeat'
    ].some(channel => this.eventEmitter.hasListeners(channel));
  }

  private connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/sse/stream');
    
    this.eventSource.onopen = () => {
      this.connected = true;
      this.notifyConnectionChange();
      console.log('SSE Client connected to /api/sse/stream');
    };

    this.eventSource.onmessage = (event) => {
      if (!event.data || event.data.trim() === '') {
        return;
      }

      const [message, error] = tryParse<SSEMessage<SSEMessageData>>(event.data);
      
      if (error) {
        console.error('Failed to parse SSE message:', error, 'Raw data:', event.data);
        return;
      }
      
      if (!message || typeof message !== 'object' || !message.type) {
        return;
      }
      
      // Route message to appropriate handler based on path structure
      this.routeMessage(message.type, message.data);
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.connected = false;
      this.notifyConnectionChange();
      
      // Auto-reconnect after 5 seconds if we still have subscriptions
      if (this.hasAnySubscriptions()) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      if (!this.connected && this.hasAnySubscriptions()) {
        console.log('Attempting to reconnect SSE...');
        this.connect();
      }
    }, 5000);
  }

  private disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.connected = false;
    this.notifyConnectionChange();
    console.log('SSE disconnected');
  }

  private notifyConnectionChange(): void {
    this.connectionListeners.forEach(callback => callback(this.connected));
  }

  private routeMessage(type: string, data: SSEMessageData): void {
    if (!type) return;

    console.log('SSE Client received message:', type, data);

    // Handle special cases first
    if (type === 'system/heartbeat') {
      // Keep connection alive - no action needed
      return;
    }

    if (type === 'error') {
      console.error('SSE error message:', data);
      this.eventEmitter.emit('error', data);
      return;
    }

    // Route based on path structure
    const pathParts = type.split('/');
    
    if (pathParts.length >= 1) {
      const module = pathParts[0]; // dns, system, etc.
      
      switch (module) {
        case 'dns':
          this.handleDNSEvent(pathParts, data);
          break;
        case 'system':
          this.handleSystemEvent(pathParts, data);
          break;
        default:
          console.log('Unknown module:', module, type);
          break;
      }
    }

    // Always emit the full channel for specific subscriptions
    this.eventEmitter.emit(type, data);
  }

  private handleDNSEvent(pathParts: string[], data: SSEMessageData): void {
    if (pathParts.length < 2) return;

    const subModule = pathParts[1]; // info, status, log, cache, etc.
    
    switch (subModule) {
      case 'info':
        // DNS configuration changes
        console.log('DNS info updated:', data);
        break;
      case 'status':
        // DNS server start/stop
        console.log('DNS status changed:', data as DNSStatusMessage);
        break;
      case 'log':
        if (pathParts[2] === 'event') {
          // Real-time log events
          console.log('DNS log event:', data as DNSLogEventMessage);
        } else {
          // Log content updates
          console.log('DNS log content:', data as DNSContentMessage);
        }
        break;
      case 'cache':
        // Cache content updates
        console.log('DNS cache updated:', data as DNSContentMessage);
        break;
      case 'blacklist':
        // Blacklist content updates
        console.log('DNS blacklist updated:', data as DNSContentMessage);
        break;
      case 'whitelist':
        // Whitelist content updates
        console.log('DNS whitelist updated:', data as DNSContentMessage);
        break;
      default:
        console.log('Unknown DNS sub-module:', subModule);
        break;
    }
  }

  private handleSystemEvent(pathParts: string[], data: SSEMessageData): void {
    if (pathParts.length < 2) return;

    const subModule = pathParts[1]; // heartbeat, health, etc.
    
    switch (subModule) {
      case 'heartbeat':
        // Keep connection alive - no action needed
        console.log('System heartbeat:', data as SystemHeartbeatMessage);
        break;
      case 'health':
        // System health updates
        console.log('System health:', data);
        break;
      default:
        console.log('Unknown system sub-module:', subModule);
        break;
    }
  }

  // Public method to force disconnect (for cleanup)
  forceDisconnect(): void {
    this.eventEmitter.clear();
    this.disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Export singleton instance
export const sseClient = SSEClient.getInstance();