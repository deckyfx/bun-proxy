import { dnsManager } from "@src/dns/manager";
import { DRIVER_TYPES, type DriverType } from "@src/types/driver";

// Export function to trigger immediate status update
export function notifyStatusChange() {
  if (connections.size > 0) {
    const status = dnsManager.getStatus();
    sendToAllClients({
      type: "status",
      data: status,
      timestamp: Date.now(),
    });
  }
}

interface SSEMessage {
  type: "status" | "drivers" | "error" | "keepalive";
  data: any;
  timestamp: number;
}

// Track active connections
const connections = new Set<ReadableStreamDefaultController>();

let statusWatcher: Timer | null = null;
let driverWatcher: Timer | null = null;

function sendToAllClients(message: SSEMessage) {
  const data = `data: ${JSON.stringify(message)}\n\n`;

  connections.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(data));
    } catch (error) {
      connections.delete(controller);
    }
  });
}

function startWatchers() {
  if (statusWatcher) return;

  // Watch DNS status changes every 2 seconds
  statusWatcher = setInterval(async () => {
    try {
      const status = dnsManager.getStatus();
      sendToAllClients({
        type: "status",
        data: status,
        timestamp: Date.now(),
      });

      // If server is active, also send driver content
      if (status.enabled) {
        const driversData: Record<DriverType, any> = {
          [DRIVER_TYPES.LOGS]: null,
          [DRIVER_TYPES.CACHE]: null,
          [DRIVER_TYPES.BLACKLIST]: null,
          [DRIVER_TYPES.WHITELIST]: null,
        };

        // Get content for each driver type
        const lastUsedDrivers = dnsManager.getLastUsedDrivers();
        for (const driverType of Object.values(DRIVER_TYPES)) {
          try {
            const driver = lastUsedDrivers[driverType];
            if (driver) {
              let content: any;

              // Each driver type has different methods to get content
              switch (driverType) {
                case DRIVER_TYPES.LOGS:
                  content = await (driver as any).getLogs({ limit: 100 });
                  break;
                case DRIVER_TYPES.CACHE:
                  const cacheStats = await (driver as any).stats();
                  const cacheKeys = await (driver as any).keys();
                  content = { stats: cacheStats, keys: cacheKeys.slice(0, 50) };
                  break;
                case DRIVER_TYPES.BLACKLIST:
                case DRIVER_TYPES.WHITELIST:
                  const listEntries = await (driver as any).list();
                  const listStats = await (driver as any).stats();
                  content = {
                    entries: listEntries.slice(0, 100),
                    stats: listStats,
                  };
                  break;
                default:
                  content = null;
              }

              driversData[driverType] = {
                success: true,
                content,
                driver: driver.constructor.name,
                timestamp: Date.now(),
              };
            }
          } catch (error) {
            driversData[driverType] = {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: Date.now(),
            };
          }
        }

        sendToAllClients({
          type: "drivers",
          data: driversData,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      sendToAllClients({
        type: "error",
        data: {
          message:
            error instanceof Error ? error.message : "Status check failed",
        },
        timestamp: Date.now(),
      });
    }
  }, 2000);

  // Keep-alive every 30 seconds
  driverWatcher = setInterval(() => {
    sendToAllClients({
      type: "keepalive",
      data: { ping: "pong" },
      timestamp: Date.now(),
    });
  }, 30000);
}

function stopWatchers() {
  if (statusWatcher) {
    clearInterval(statusWatcher);
    statusWatcher = null;
  }
  if (driverWatcher) {
    clearInterval(driverWatcher);
    driverWatcher = null;
  }
}

export async function HandleSSEEvents() {
  const stream = new ReadableStream({
    start(controller) {
      // Add connection to active set
      connections.add(controller);

      // Start watchers if this is the first connection
      if (connections.size === 1) {
        startWatchers();
      }

      // Send initial status immediately
      const initialStatus = dnsManager.getStatus();
      const initialMessage: SSEMessage = {
        type: "status",
        data: initialStatus,
        timestamp: Date.now(),
      };

      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(initialMessage)}\n\n`)
      );
    },

    cancel() {
      // Remove this connection
      connections.delete(this as any);

      // Stop watchers if no active connections
      if (connections.size === 0) {
        stopWatchers();
      }
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

export async function GET() {
  return HandleSSEEvents();
}

export default {
  events: { GET }
};
