import ScopedRoutes from "./routes";
import { tryAsync } from "@src/utils/try";

async function ApiHandler(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const { scope, command } = req.params;
  const method = req.method as "GET" | "POST" | "PUT" | "DELETE";

  const routes = ScopedRoutes[scope];
  if (!routes) {
    return new Response("Scope not found", { status: 404 });
  }

  const route = routes[command];
  if (!route || !route[method]) {
    return new Response("Endpoint not found or method not allowed", {
      status: 404,
    });
  }

  const [result, error] = await tryAsync(() => route[method]!(req));

  if (error) {
    console.error(`API ${method} Error:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }

  return result;
}

const ApiRoute = {
  GET: ApiHandler,
  POST: ApiHandler,
  PUT: ApiHandler,
  DELETE: ApiHandler,
  PATCH: ApiHandler,
};

export default ApiRoute;
