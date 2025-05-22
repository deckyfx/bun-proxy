import dashboard from "./dashboard/index.html";

const PORT = process.env.PORT || 3000;

Bun.serve({
  port: Number(PORT),
  // development can also be an object.
  development: {
    // Enable Hot Module Reloading
    hmr: true,

    // Echo console logs from the browser to the terminal
    console: true,
  },
  routes: {
    "/_": dashboard,
  },
});
