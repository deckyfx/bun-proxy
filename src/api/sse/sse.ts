import { sseResponder } from "@src/utils/SSEResponder";
import { dnsEventService } from "@src/dns/DNSEventService";
import { Auth, type AuthUser } from "@utils/auth";

async function HandleSSEStream(_req: Request, _user: AuthUser): Promise<Response> {
  // Generate unique client ID
  const clientId = `client_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;

  // Create readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add client to SSE responder
      sseResponder.addClient(clientId, controller);

      // Get stats after adding the client
      const stats = sseResponder.getStats();
      
      // Initialize DNS event service if this is the first client
      if (stats.totalClients === 1) {
        console.log('First SSE client connected, initializing DNS event service');
        dnsEventService.initialize();
        // Send initial data
        dnsEventService.refreshAllDriverContent();
      } else {
        console.log(`SSE client connected (${stats.totalClients} total clients)`);
      }

      // Send initial SSE format
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "connected",
            clientId,
            timestamp: Date.now(),
          })}\n\n`
        )
      );
    },

    cancel() {
      // Clean up when client disconnects
      sseResponder.removeClient(clientId);
      
      // Cleanup DNS event service if this was the last client
      const stats = sseResponder.getStats();
      if (stats.totalClients === 0) {
        dnsEventService.cleanup();
      }
      
      console.log(`SSE client ${clientId} disconnected`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    },
  });
}

export default {
  stream: {
    GET: Auth.guard(HandleSSEStream),
  },
};
