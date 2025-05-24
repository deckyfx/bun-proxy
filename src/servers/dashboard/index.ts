import frontend from "@src/dashboard/index.html";

import Config from "@src/config";

import { Health, LoginRoute, Refresh, Logout } from "./api";

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
    "/": frontend,
    "/api/health": Health,
    "/api/login": LoginRoute,
    "/api/refresh": Refresh,
    "/api/logout": Logout,
  },
});
