import auth from './auth';
import user from './user';
import system from './system';
import dns from './dns';
import sse from './sse';
import type { BunRequest } from 'bun';

type RouteHandler = (req: BunRequest) => Promise<Response>;
type RouteConfig = { [K in 'GET' | 'POST' | 'PUT' | 'DELETE']?: RouteHandler };

const ScopedRoutes: Record<string, Record<string, RouteConfig>> = {
  auth,
  user,
  system,
  dns,
  sse,
};

export default ScopedRoutes;