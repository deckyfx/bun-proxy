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
            // Handle individual log events (real-time)
            if (message.type === 'log_event') {
              console.log('⚡ REAL-TIME LOG EVENT:', {
                timestamp: new Date(message.data.timestamp).toISOString(),
                type: message.data.type,
                domain: message.data.type === 'server_event' ? message.data.eventType + ' - ' + message.data.message : message.data.query?.domain,
                provider: message.data.provider,
                success: message.data.success,
                responseTime: message.data.responseTime ? `${message.data.responseTime}ms` : undefined
              });
            }
            
            // Focus on driver logs specifically (bulk data)
            else if (message.type === 'drivers') {
              console.log('📊 DRIVERS EVENT:', {
                timestamp: new Date(message.timestamp).toISOString(),
                hasLogs: !!message.drivers?.logs,
                logsContent: message.drivers?.logs?.content,
                logsContentLength: Array.isArray(message.drivers?.logs?.content) ? message.drivers.logs.content.length : 'not array',
                allDrivers: Object.keys(message.drivers || {})
              });
              
              // If logs content exists, show details
              if (message.drivers?.logs?.content && Array.isArray(message.drivers.logs.content)) {
                console.log(`🔍 Found ${message.drivers.logs.content.length} log entries:`);
                message.drivers.logs.content.forEach((log: any, index: number) => {
                  console.log(`  [${index}] ${log.type}: ${log.type === 'server_event' ? log.eventType + ' - ' + log.message : log.query?.domain} (${new Date(log.timestamp).toLocaleTimeString()})`);
                });
              }
            } else {
              console.log('📨 SSE message:', {
                type: message.type,
                timestamp: new Date(message.timestamp).toISOString(),
                data: message.type === 'status' ? {
                  enabled: message.data.enabled,
                  port: message.data.server?.port,
                  stats: message.data.server?.stats
                } : message.data
              });
            }
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