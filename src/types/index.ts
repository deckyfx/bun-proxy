export type ErrorableResult<T = unknown> = [T, null] | [null, Error];

export type ProxyRoute = {
  target: string;
  requestScript?: string;
  responseScript?: string;
};

export type Routes = Record<string, ProxyRoute>;
