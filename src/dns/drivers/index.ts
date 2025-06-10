// Logs
export * as Logs from './logs';

// Caches  
export * as Caches from './caches';

// Blacklist
export * as Blacklist from './blacklist';

// Whitelist
export * as Whitelist from './whitelist';

// Driver factory function
export async function createDriverInstance(
  category: 'logs' | 'caches' | 'blacklist' | 'whitelist',
  driverType: string,
  _options: Record<string, any> = {}
): Promise<any> {
  switch (category) {
    case 'logs':
      switch (driverType.toLowerCase()) {
        case 'console':
          const { ConsoleDriver } = await import('./logs/ConsoleDriver');
          return new ConsoleDriver();
        case 'inmemory':
          const { InMemoryDriver: LogsInMemoryDriver } = await import('./logs/InMemoryDriver');
          return new LogsInMemoryDriver();
        case 'file':
          const { FileDriver: LogsFileDriver } = await import('./logs/FileDriver');
          return new LogsFileDriver();
        case 'sqlite':
          const { SQLiteDriver: LogsSQLiteDriver } = await import('./logs/SQLiteDriver');
          return new LogsSQLiteDriver();
        default:
          const { ConsoleDriver: DefaultConsoleDriver } = await import('./logs/ConsoleDriver');
          return new DefaultConsoleDriver();
      }

    case 'caches':
      switch (driverType.toLowerCase()) {
        case 'inmemory':
          const { InMemoryDriver: CachesInMemoryDriver } = await import('./caches/InMemoryDriver');
          return new CachesInMemoryDriver();
        case 'file':
          const { FileDriver: CachesFileDriver } = await import('./caches/FileDriver');
          return new CachesFileDriver();
        case 'optimized-file':
          const { OptimizedFileDriver: CachesOptimizedFileDriver } = await import('./caches/OptimizedFileDriver');
          return new CachesOptimizedFileDriver();
        case 'sqlite':
          const { SQLiteDriver: CachesSQLiteDriver } = await import('./caches/SQLiteDriver');
          return new CachesSQLiteDriver();
        default:
          const { InMemoryDriver: DefaultCachesInMemoryDriver } = await import('./caches/InMemoryDriver');
          return new DefaultCachesInMemoryDriver();
      }

    case 'blacklist':
      switch (driverType.toLowerCase()) {
        case 'inmemory':
          const { InMemoryDriver: BlacklistInMemoryDriver } = await import('./blacklist/InMemoryDriver');
          return new BlacklistInMemoryDriver();
        case 'file':
          const { FileDriver: BlacklistFileDriver } = await import('./blacklist/FileDriver');
          return new BlacklistFileDriver();
        case 'optimized-file':
          const { OptimizedFileDriver: BlacklistOptimizedFileDriver } = await import('./blacklist/OptimizedFileDriver');
          return new BlacklistOptimizedFileDriver();
        case 'sqlite':
          const { SQLiteDriver: BlacklistSQLiteDriver } = await import('./blacklist/SQLiteDriver');
          return new BlacklistSQLiteDriver();
        default:
          const { InMemoryDriver: DefaultBlacklistInMemoryDriver } = await import('./blacklist/InMemoryDriver');
          return new DefaultBlacklistInMemoryDriver();
      }

    case 'whitelist':
      switch (driverType.toLowerCase()) {
        case 'inmemory':
          const { InMemoryDriver: WhitelistInMemoryDriver } = await import('./whitelist/InMemoryDriver');
          return new WhitelistInMemoryDriver();
        case 'file':
          const { FileDriver: WhitelistFileDriver } = await import('./whitelist/FileDriver');
          return new WhitelistFileDriver();
        case 'sqlite':
          const { SQLiteDriver: WhitelistSQLiteDriver } = await import('./whitelist/SQLiteDriver');
          return new WhitelistSQLiteDriver();
        default:
          const { InMemoryDriver: DefaultWhitelistInMemoryDriver } = await import('./whitelist/InMemoryDriver');
          return new DefaultWhitelistInMemoryDriver();
      }

    default:
      throw new Error(`Unknown driver category: ${category}`);
  }
}