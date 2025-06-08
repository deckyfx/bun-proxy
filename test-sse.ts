#!/usr/bin/env bun

// Simple SSE test client using fetch
console.log('🔌 Connecting to SSE endpoint...');

async function connectSSE() {
  try {
    const response = await fetch('http://localhost:5001/api/dns/events');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('✅ SSE connected');
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('No response body reader');
    }
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('📡 SSE stream ended');
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = line.substring(6);
            const message = JSON.parse(data);
            console.log('📨 SSE message:', {
              type: message.type,
              timestamp: new Date(message.timestamp).toISOString(),
              data: message.type === 'status' ? {
                enabled: message.data.enabled,
                port: message.data.server?.port
              } : message.data
            });
          } catch (error) {
            console.error('❌ Failed to parse SSE message:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ SSE connection error:', error);
  }
}

connectSSE();

// Keep the process alive
console.log('🎧 Listening for SSE events... (Press Ctrl+C to exit)');
process.on('SIGINT', () => {
  console.log('\n👋 Closing SSE connection...');
  process.exit(0);
});