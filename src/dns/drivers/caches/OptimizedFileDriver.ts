import { BaseDriver, type CacheOptions } from './BaseDriver';
import type { CachedDnsResponse } from '@src/types/dns-unified';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';
import { tryAsync, trySync, tryParse } from '@src/utils/try';

interface LogOperation {
  type: 'set' | 'delete' | 'clear';
  key?: string;
  entry?: CachedDnsResponse;
  timestamp: number;
}

interface NodeError extends Error {
  code?: string;
}

/**
 * High-performance Cache FileDriver using append-only log
 * 
 * Performance optimizations:
 * 1. In-memory cache with disk persistence
 * 2. Append-only log for crash recovery
 * 3. Lazy loading on startup
 * 4. Periodic compaction
 * 5. LRU eviction
 */
export class OptimizedFileDriver extends BaseDriver {
  static override readonly DRIVER_NAME = 'optimized-file';
  
  private dataDir: string;
  private cacheFile: string;
  private logFile: string;
  
  // In-memory cache for fast access
  private cache = new Map<string, CachedDnsResponse>();
  private maxMemoryEntries: number;
  
  // Persistence tracking
  private dirty = false;
  private logEntries = 0;
  private maxLogEntries = 1000;
  
  // Timers
  private saveTimer?: NodeJS.Timeout;
  private evictionTimer?: NodeJS.Timeout;
  
  constructor(options: CacheOptions = {}) {
    super(options);
    this.dataDir = options.filePath || './data/dns-cache';
    this.cacheFile = join(this.dataDir, 'cache.json');
    this.logFile = join(this.dataDir, 'operations.log');
    
    // Memory limits
    this.maxMemoryEntries = options.maxSize || 10000;
    
    this.startBackgroundTasks();
  }

  /**
   * Initialize cache from disk (lazy loading)
   */
  private async ensureLoaded(): Promise<void> {
    if (this.cache.size > 0) return; // Already loaded
    
    const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
    if (dirError) {
      console.warn('Failed to ensure directory exists:', dirError);
      return;
    }
    
    // Load main cache file
    await this.loadMainCache();
    
    // Apply any operations from log
    await this.replayLog();
    
    // Clean up expired entries
    await this.evictExpired();
  }

  /**
   * Load main cache file
   */
  private async loadMainCache(): Promise<void> {
    const [content, readError] = await tryAsync(() => readFile(this.cacheFile, 'utf8'));
    if (readError) {
      if ((readError as NodeError)?.code !== 'ENOENT') {
        console.warn('Failed to load main cache file:', readError);
      }
      return;
    }

    const [data, parseError] = tryParse<Record<string, CachedDnsResponse>>(content);
    if (parseError) {
      console.warn('Failed to parse main cache file:', parseError);
      return;
    }
    
    for (const [key, entry] of Object.entries(data)) {
      this.cache.set(key, entry);
    }
    
    console.log(`Loaded ${this.cache.size} cache entries from disk`);
  }

  /**
   * Replay operations log for crash recovery
   */
  private async replayLog(): Promise<void> {
    const [content, readError] = await tryAsync(() => readFile(this.logFile, 'utf8'));
    if (readError) {
      if ((readError as NodeError)?.code !== 'ENOENT') {
        console.warn('Failed to replay operations log:', readError);
      }
      return;
    }

    const lines = content.trim().split('\n').filter(line => line);
    
    for (const line of lines) {
      const [operation, parseError] = tryParse<LogOperation>(line);
      if (parseError) {
        console.warn('Invalid log entry:', line);
        continue;
      }
      
      await this.applyLogOperation(operation);
    }
    
    if (lines.length > 0) {
      console.log(`Replayed ${lines.length} cache operations from log`);
    }
  }

  /**
   * Apply a single log operation
   */
  private async applyLogOperation(operation: LogOperation): Promise<void> {
    switch (operation.type) {
      case 'set':
        if (operation.key && operation.entry) {
          this.cache.set(operation.key, operation.entry);
        }
        break;
      case 'delete':
        if (operation.key) {
          this.cache.delete(operation.key);
        }
        break;
      case 'clear':
        this.cache.clear();
        break;
    }
  }

  /**
   * Log an operation for crash recovery
   */
  private async logOperation(operation: LogOperation): Promise<void> {
    const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
    if (dirError) {
      console.error('Failed to ensure directory exists:', dirError);
      return;
    }

    const [jsonString, jsonError] = trySync(() => JSON.stringify(operation));
    if (jsonError) {
      console.error('Failed to serialize operation:', jsonError);
      return;
    }

    const [, writeError] = await tryAsync(() => appendFile(this.logFile, jsonString + '\n'));
    if (writeError) {
      console.error('Failed to log operation:', writeError);
      return;
    }

    this.logEntries++;
    
    // Compact log if it gets too large
    if (this.logEntries >= this.maxLogEntries) {
      await this.compactLog();
    }
  }

  /**
   * Ultra-fast get operation
   */
  async get(key: string): Promise<CachedDnsResponse | null> {
    await this.ensureLoaded();

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.recordMiss();
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.markDirty();
      this.recordMiss();
      
      // Log deletion for persistence
      await this.logOperation({ type: 'delete', key, timestamp: Date.now() });
      
      return null;
    }
    
    this.recordHit();
    return entry;
  }

  /**
   * Fast set operation with async persistence
   */
  async set(key: string, value: CachedDnsResponse, ttl?: number): Promise<void> {
    await this.ensureLoaded();

    // Use the TTL from the CachedDnsResponse or override with provided TTL
    if (ttl !== undefined) {
      // Override the cache TTL if specified
      const now = Date.now();
      value.cache.ttl = ttl;
      value.cache.expiresAt = now + ttl;
    }

    this.cache.set(key, value);
    this.markDirty();

    // Log operation for persistence (async)
    await this.logOperation({ type: 'set', key, entry: value, timestamp: Date.now() });

    // Check if we need to evict entries
    if (this.cache.size > this.maxMemoryEntries) {
      await this.evictLRU(this.cache.size - this.maxMemoryEntries);
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureLoaded();
    
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.markDirty();
      // Log deletion (async)
      await this.logOperation({ type: 'delete', key, timestamp: Date.now() });
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.markDirty();
    
    // Log clear operation
    await this.logOperation({ type: 'clear', timestamp: Date.now() });
  }

  async has(key: string): Promise<boolean> {
    await this.ensureLoaded();

    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.markDirty();
      // Log deletion (async)
      await this.logOperation({ type: 'delete', key, timestamp: Date.now() });
      return false;
    }
    
    return true;
  }

  async keys(): Promise<string[]> {
    await this.ensureLoaded();
    await this.evictExpired();
    return Array.from(this.cache.keys());
  }

  async size(): Promise<number> {
    await this.ensureLoaded();
    await this.evictExpired();
    return this.cache.size;
  }

  async cleanup(): Promise<void> {
    await this.evictExpired();
    await this.save();
  }

  async evictExpired(): Promise<number> {
    let evicted = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        evicted++;
        this.recordEviction();
        
        // Log deletion
        await this.logOperation({ type: 'delete', key, timestamp: now });
      }
    }
    
    if (evicted > 0) {
      this.markDirty();
    }
    
    return evicted;
  }

  async evictLRU(count: number = 1): Promise<number> {
    if (this.cache.size === 0) return 0;
    
    // Sort by timestamp (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.cache.timestamp - b.cache.timestamp);
    
    let evicted = 0;
    const now = Date.now();
    
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key] = entries[i]!;
      this.cache.delete(key);
      evicted++;
      this.recordEviction();
      
      // Log deletion
      await this.logOperation({ type: 'delete', key, timestamp: now });
    }
    
    if (evicted > 0) {
      this.markDirty();
    }
    
    return evicted;
  }

  /**
   * Persist cache to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
    if (dirError) {
      console.error('Failed to ensure directory exists:', dirError);
      return;
    }

    const data = Object.fromEntries(this.cache.entries());
    const [jsonString, jsonError] = trySync(() => JSON.stringify(data, null, 2));
    if (jsonError) {
      console.error('Failed to serialize cache data:', jsonError);
      return;
    }
    const [, writeError] = await tryAsync(() => writeFile(this.cacheFile, jsonString, 'utf8'));
    if (writeError) {
      console.error('Failed to save cache:', writeError);
      return;
    }

    this.dirty = false;
    
    // Clear the operations log since we've persisted everything
    const [, logClearError] = await tryAsync(() => writeFile(this.logFile, ''));
    if (logClearError) {
      console.error('Failed to clear log file:', logClearError);
      return;
    }

    this.logEntries = 0;
  }

  /**
   * Compact the operations log
   */
  private async compactLog(): Promise<void> {
    console.log('Compacting cache log...');
    
    // Save current state to main file
    await this.save();
    
    // Log is already cleared in save()
    console.log('Cache log compacted');
  }

  private markDirty(): void {
    this.dirty = true;
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Auto-save every 30 seconds
    this.saveTimer = setInterval(() => {
      this.save().catch(console.error);
    }, 30000);
    
    // Evict expired entries every 5 minutes
    this.evictionTimer = setInterval(() => {
      this.evictExpired().catch(console.error);
    }, 300000);
  }

  private async ensureDirectoryExists(): Promise<void> {
    const [, error] = await tryAsync(() => mkdir(this.dataDir, { recursive: true }));
    if (error) {
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  destroy(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
    }
    
    // Final save
    this.save().catch(console.error);
  }

  // Additional cache-specific methods
  async getAll(): Promise<Record<string, CachedDnsResponse>> {
    await this.ensureLoaded();
    await this.evictExpired();
    
    const result: Record<string, CachedDnsResponse> = {};
    for (const [key, entry] of this.cache.entries()) {
      result[key] = entry;
    }
    return result;
  }

  async getStats() {
    const baseStats = await super.stats();
    return {
      ...baseStats,
      memoryEntries: this.cache.size,
      maxMemoryEntries: this.maxMemoryEntries,
      logEntries: this.logEntries,
      dirty: this.dirty
    };
  }
}