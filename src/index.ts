import Config from "@src/config";
import { dnsManager } from "@src/dns";
import { tryAsync } from "@src/utils/try";

import IndexRoute from "./view/index";
import HydrateRoute from "./view/hydrate";
import ApiRoute from "./api/index";

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  const [, error] = await tryAsync(() => dnsManager.stop());
  if (error) {
    console.error("❌ Error stopping DNS server:", error);
  } else {
    console.log("✅ DNS server stopped gracefully");
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  const [, error] = await tryAsync(() => dnsManager.stop());
  if (error) {
    console.error("❌ Error stopping DNS server:", error);
  } else {
    console.log("✅ DNS server stopped gracefully");
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
        const [response, error] = await tryAsync(async () => {
          const file = Bun.file("./src/app/assets/favicon.ico");
          if (await file.exists()) {
            return new Response(file, {
              headers: {
                "Content-Type": "image/x-icon",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
          return null;
        });
        
        if (error) {
          console.error("Favicon serving error:", error);
        }
        
        if (response) {
          return response;
        }
        
        return new Response("Favicon not found", { status: 404 });
      },
    },
    "/assets/*": {
      GET: async (req: Request) => {
        const url = new URL(req.url);
        const path = url.pathname.replace("/assets/", "");
        const filePath = `./src/app/assets/${path}`;

        const [response, error] = await tryAsync(async () => {
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(file);
          }
          return null;
        });

        if (error) {
          console.error("Asset serving error:", error);
        }
        
        if (response) {
          return response;
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
