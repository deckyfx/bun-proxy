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
  // development can also be an object.
  development: {
    // Enable Hot Module Reloading
    hmr: true,

    // Echo console logs from the browser to the terminal
    console: true,
  },
  routes: {
    "/": IndexRoute,
    "/hydrate": HydrateRoute,
    "/api/:scope/:command": ApiRoute,
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
  }, 1000);
}
