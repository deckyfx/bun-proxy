import { Signin, Signup, Logout, Refresh } from "./auth";
import { Me } from "./user";
import { Health } from "./system";

type RouteHandler = (req: any) => Promise<Response>;
type RouteConfig = { [K in 'GET' | 'POST' | 'PUT' | 'DELETE']?: RouteHandler };

const scopedRoutes: Record<string, Record<string, RouteConfig>> = {
  auth: {
    signin: { POST: Signin },
    signup: { POST: Signup },
    logout: { POST: Logout },
    refresh: { POST: Refresh },
  },
  user: {
    me: { GET: Me, POST: Me },
  },
  system: {
    health: { GET: Health },
  },
};

async function ApiGET(req: Bun.BunRequest<"/api/:scope/:command">): Promise<Response> {
  const { scope, command } = req.params;
  
  const scopeRoutes = scopedRoutes[scope];
  if (!scopeRoutes) {
    return new Response("Scope not found", { status: 404 });
  }

  const route = scopeRoutes[command];
  if (!route || !route.GET) {
    return new Response("Endpoint not found or method not allowed", { status: 404 });
  }

  try {
    return await route.GET(req);
  } catch (error) {
    console.error("API GET Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function ApiPOST(req: Bun.BunRequest<"/api/:scope/:command">): Promise<Response> {
  const { scope, command } = req.params;
  
  const scopeRoutes = scopedRoutes[scope];
  if (!scopeRoutes) {
    return new Response("Scope not found", { status: 404 });
  }

  const route = scopeRoutes[command];
  if (!route || !route.POST) {
    return new Response("Endpoint not found or method not allowed", { status: 404 });
  }

  try {
    return await route.POST(req);
  } catch (error) {
    console.error("API POST Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

const ApiRoute = {
  GET: ApiGET,
  POST: ApiPOST,
};

export default ApiRoute;