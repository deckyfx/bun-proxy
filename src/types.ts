// types.ts (or wherever you define types)

export type ProxyRoute = {
  target: string;
  requestScript?: string;
  responseScript?: string;
};

export type Routes = Record<string, ProxyRoute>;
