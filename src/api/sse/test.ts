import { sseResponder } from '@src/utils/SSEResponder';
import { trySync } from '@src/utils/try';

async function GET(): Promise<Response> {
  const [result, error] = trySync(() => {
    // Send a test message to all connected clients
    sseResponder.emit('dns/log/event', {
      type: 'request',
      timestamp: new Date(),
      query: {
        domain: 'test.example.com',
        type: 'A',
        clientIP: '127.0.0.1'
      }
    });

    // Send test messages for different channels
    sseResponder.emitDNSStatus({
      enabled: true,
      server: {
        isRunning: true,
        port: 53,
        providers: ['cloudflare']
      }
    });

    sseResponder.emitDNSLogContent({
      driver: 'console',
      count: 1,
      lastUpdated: Date.now(),
      entries: [
        {
          type: 'server_event',
          timestamp: new Date(),
          eventType: 'test',
          message: 'Test log entry from API'
        }
      ]
    });

    const stats = sseResponder.getStats();
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Test messages sent to all SSE clients',
      stats
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return result;
}

export { GET };