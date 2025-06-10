import Config from "@src/config";
import { dnsManager } from "@src/dns";

import IndexRoute from "./view/index";
import HydrateRoute from "./view/hydrate";
import ApiRoute from "./api/index";

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  try {
    await dnsManager.stop();
    console.log("✅ DNS server stopped gracefully");
  } catch (error) {
    console.error("❌ Error stopping DNS server:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  try {
    await dnsManager.stop();
    console.log("✅ DNS server stopped gracefully");
  } catch (error) {
    console.error("❌ Error stopping DNS server:", error);
  }
  process.exit(0);
});

export default Bun.serve({
  port: Config.DASHBOARD_PORT,
  idleTimeout: 0, // Disable timeout for SSE connections
  // development can also be an object.
  development: {
    // Enable Hot Module Reloading
    hmr: true,

    // Echo console logs from the browser to the terminal
    console: true,
  },
  routes: {
    "/": IndexRoute, // Smart route that auto-detects DoH vs Dashboard
    "/hydrate": HydrateRoute,
    "/api/:scope/:command": ApiRoute,
    "/favicon.ico": {
      GET: async () => {
        try {
          const file = Bun.file("./src/app/assets/favicon.ico");
          if (await file.exists()) {
            return new Response(file, {
              headers: {
                "Content-Type": "image/x-icon",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
        } catch (error) {
          console.error("Favicon serving error:", error);
        }
        return new Response("Favicon not found", { status: 404 });
      },
    },
    "/assets/*": {
      GET: async (req: Request) => {
        const url = new URL(req.url);
        const path = url.pathname.replace("/assets/", "");
        const filePath = `./src/app/assets/${path}`;

        try {
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(file);
          }
        } catch (error) {
          console.error("Asset serving error:", error);
        }

        return new Response("Asset not found", { status: 404 });
      },
    },
  },
});

if (Config.DEBUG_START_DNS_SERVER) {
  setTimeout(() => {
    dnsManager.start();
  }, 500);
}
