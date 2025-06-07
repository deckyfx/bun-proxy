// Legacy types
export type ErrorableResult<T = unknown> = [T, null] | [null, Error];

export type ProxyRoute = {
  target: string;
  requestScript?: string;
  responseScript?: string;
};

export type Routes = Record<string, ProxyRoute>;

// Re-export all domain-specific types
export * from './dns';
export * from './auth';
export * from './user';
export * from './system';
export * from './api';
export * from './ui';
