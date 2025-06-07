import Config from "@src/config";

import IndexRoute from "./view/index";
import HydrateRoute from "./view/hydrate";
import ApiRoute from "./api/index";

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
