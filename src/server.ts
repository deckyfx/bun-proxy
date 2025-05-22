import { serve } from "bun";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { ProxyRoute, Routes } from "./types";

// In-memory routes store
let routes: Routes = {};

// Load and persist routes (example with simple JSON file persistence)
const ROUTES_FILE = "./routes.json";

function loadRoutes() {
  if (existsSync(ROUTES_FILE)) {
    routes = JSON.parse(readFileSync(ROUTES_FILE, "utf-8"));
  }
}

function saveRoutes() {
  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
}

loadRoutes();

// Middleware logging example
function logActivity(req: Request) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
}

// Find matching route by longest prefix
function findRoute(pathname: string): [string, ProxyRoute] | null {
  const matched = Object.entries(routes)
    .filter(
      ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/")
    )
    .sort((a, b) => b[0].length - a[0].length); // longest prefix first
  return matched.length > 0 ? matched[0] : null;
}

// Example of running a user script on input data
async function runScript(
  scriptName: string,
  inputData: any,
  type: "request" | "response"
): Promise<any> {
  // For demo: load the script content from file or from in-memory storage
  // Let's assume scripts are stored in ./scripts/{scriptName}.js
  import { readFileSync } from "fs";
  const scriptPath = `./scripts/${scriptName}.js`;
  if (!existsSync(scriptPath))
    throw new Error("Script file not found: " + scriptName);

  const scriptCode = readFileSync(scriptPath, "utf-8");

  // Wrap scriptCode in a function named transform(input) { ... }
  // User script must export a function like: function transform(input) { return modifiedInput; }
  // We'll use a safe sandbox here using Function constructor (limited sandbox)

  const func = new Function(
    "input",
    `"use strict"; ${scriptCode}; return transform(input);`
  );

  try {
    return await func(inputData);
  } catch (e) {
    throw new Error("Script execution error: " + (e as Error).message);
  }
}

// Handle incoming proxy requests
async function handleProxy(req: Request): Promise<Response> {
  logActivity(req);

  const url = new URL(req.url);
  const routeEntry = findRoute(url.pathname);
  if (!routeEntry) return new Response("Not Found", { status: 404 });

  const [prefix, route] = routeEntry;
  // Construct outbound URL by replacing prefix with target base
  let outboundUrl = route.target + url.pathname.substring(prefix.length);
  if (url.search) outboundUrl += url.search;

  // Build outbound request init
  const outboundInit: RequestInit = {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.body,
  };

  let modifiedRequestData = {
    url: outboundUrl,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    body: null as null | Uint8Array | string,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    modifiedRequestData.body = await req.text();
  }

  // Run request script if any
  if (route.requestScript) {
    try {
      const newReq = await runScript(
        route.requestScript,
        modifiedRequestData,
        "request"
      );
      if (newReq.url) outboundUrl = newReq.url;
      if (newReq.method) outboundInit.method = newReq.method;
      if (newReq.headers) outboundInit.headers = new Headers(newReq.headers);
      if (newReq.body) outboundInit.body = newReq.body;
    } catch (e) {
      console.error(e);
      return new Response("Request script error: " + (e as Error).message, {
        status: 500,
      });
    }
  }

  // Make outbound fetch
  let outboundResponse: Response;
  try {
    outboundResponse = await fetch(outboundUrl, outboundInit);
  } catch (e) {
    return new Response("Error fetching target: " + (e as Error).message, {
      status: 502,
    });
  }

  // Read outbound response body
  let responseBody = await outboundResponse.text();

  let modifiedResponseData = {
    status: outboundResponse.status,
    headers: Object.fromEntries(outboundResponse.headers.entries()),
    body: responseBody,
  };

  // Run response script if any
  if (route.responseScript) {
    try {
      const newRes = await runScript(
        route.responseScript,
        modifiedResponseData,
        "response"
      );
      if (newRes.status) modifiedResponseData.status = newRes.status;
      if (newRes.headers) modifiedResponseData.headers = newRes.headers;
      if (newRes.body) modifiedResponseData.body = newRes.body;
    } catch (e) {
      console.error(e);
      return new Response("Response script error: " + (e as Error).message, {
        status: 500,
      });
    }
  }

  // Return modified response
  return new Response(modifiedResponseData.body, {
    status: modifiedResponseData.status,
    headers: modifiedResponseData.headers,
  });
}

// Route management API (GET /_/routes, POST /_/routes to save)
async function handleRoutesApi(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return new Response(JSON.stringify(routes), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method === "POST") {
    try {
      const newRoutes: Routes = await req.json();
      routes = newRoutes;
      saveRoutes();
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
  }
  return new Response("Method not allowed", { status: 405 });
}

// Script list API (GET /_/scripts)
import { readdirSync } from "fs";
function listScripts(): string[] {
  try {
    return readdirSync("./scripts").filter((f) => f.endsWith(".js"));
  } catch {
    return [];
  }
}
async function handleScriptsApi(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const list = listScripts().map((f) => f.replace(/\.js$/, ""));
    return new Response(JSON.stringify(list), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("Method not allowed", { status: 405 });
}

// Script test API (POST /_/script/test)
async function handleScriptTestApi(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    const { script, inputType, inputData } = await req.json();
    if (
      typeof script !== "string" ||
      (inputType !== "request" && inputType !== "response")
    ) {
      return new Response("Invalid input", { status: 400 });
    }
    const result = await runScript(script, inputData, inputType);
    return new Response(JSON.stringify({ result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Main server
serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/_/routes") return handleRoutesApi(req);
    if (url.pathname === "/_/scripts") return handleScriptsApi(req);
    if (url.pathname === "/_/script/test") return handleScriptTestApi(req);
    if (url.pathname.startsWith("/_/"))
      return new Response("Not Found", { status: 404 });

    return handleProxy(req);
  },
  port: parseInt(process.env.PORT || "3000"),
});
