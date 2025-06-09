import { sseResponder } from '@src/utils/SSEResponder';

async function GET(): Promise<Response> {
  try {
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
      server: { port: 53, status: 'running' }
    });

    sseResponder.emitDNSLogContent({
      success: true,
      content: [
        {
          type: 'server_event',
          timestamp: new Date(),
          eventType: 'test',
          message: 'Test log entry from API'
        }
      ],
      driver: 'test',
      timestamp: Date.now()
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
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export { GET };