import auth from './auth';
import user from './user';
import system from './system';
import dns from './dns';

type RouteHandler = (req: any) => Promise<Response>;
type RouteConfig = { [K in 'GET' | 'POST' | 'PUT' | 'DELETE']?: RouteHandler };

const ScopedRoutes: Record<string, Record<string, RouteConfig>> = {
  auth,
  user,
  system,
  dns,
};

export default ScopedRoutes;