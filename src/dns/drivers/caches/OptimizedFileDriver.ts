import { BaseDriver, type CacheEntry, type CacheOptions } from './BaseDriver';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';

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
export class OptimizedFileDriver<T = any> extends BaseDriver<T> {
  static readonly DRIVER_NAME = 'optimized-file';
  
  private dataDir: string;
  private cacheFile: string;
  private logFile: string;
  
  // In-memory cache for fast access
  private cache = new Map<string, CacheEntry<T>>();
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
    
    try {
      await this.ensureDirectoryExists();
      
      // Load main cache file
      await this.loadMainCache();
      
      // Apply any operations from log
      await this.replayLog();
      
      // Clean up expired entries
      await this.evictExpired();
      
    } catch (error) {
      console.warn('Failed to load cache:', error);
    }
  }

  /**
   * Load main cache file
   */
  private async loadMainCache(): Promise<void> {
    try {
      const content = await readFile(this.cacheFile, 'utf8');
      const data = JSON.parse(content);
      
      for (const [key, entry] of Object.entries(data)) {
        this.cache.set(key, entry as CacheEntry<T>);
      }
      
      console.log(`Loaded ${this.cache.size} cache entries from disk`);
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        console.warn('Failed to load main cache file:', error);
      }
    }
  }

  /**
   * Replay operations log for crash recovery
   */
  private async replayLog(): Promise<void> {
    try {
      const content = await readFile(this.logFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      for (const line of lines) {
        try {
          const operation = JSON.parse(line);
          await this.applyLogOperation(operation);
        } catch (e) {
          console.warn('Invalid log entry:', line);
        }
      }
      
      if (lines.length > 0) {
        console.log(`Replayed ${lines.length} cache operations from log`);
      }
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        console.warn('Failed to replay operations log:', error);
      }
    }
  }

  /**
   * Apply a single log operation
   */
  private async applyLogOperation(operation: any): Promise<void> {
    switch (operation.type) {
      case 'set':
        this.cache.set(operation.key, operation.entry);
        break;
      case 'delete':
        this.cache.delete(operation.key);
        break;
      case 'clear':
        this.cache.clear();
        break;
    }
  }

  /**
   * Log an operation for crash recovery
   */
  private async logOperation(operation: any): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      await appendFile(this.logFile, JSON.stringify(operation) + '\n');
      this.logEntries++;
      
      // Compact log if it gets too large
      if (this.logEntries >= this.maxLogEntries) {
        await this.compactLog();
      }
    } catch (error) {
      console.error('Failed to log operation:', error);
    }
  }

  /**
   * Ultra-fast get operation
   */
  async get(key: string): Promise<T | null> {
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

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);
    this.markDirty();
    
    this.recordHit();
    return entry.value;
  }

  /**
   * Fast set operation with async persistence
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    await this.ensureLoaded();

    const effectiveTtl = ttl || this.options.defaultTtl!;
    const now = Date.now();
    
    const entry: CacheEntry<T> = {
      value,
      ttl: effectiveTtl,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now
    };

    this.cache.set(key, entry);
    this.markDirty();

    // Log operation for persistence (async)
    this.logOperation({ type: 'set', key, entry, timestamp: now });

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
      this.logOperation({ type: 'delete', key, timestamp: Date.now() });
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
      this.logOperation({ type: 'delete', key, timestamp: Date.now() });
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
        this.logOperation({ type: 'delete', key, timestamp: now });
      }
    }
    
    if (evicted > 0) {
      this.markDirty();
    }
    
    return evicted;
  }

  async evictLRU(count: number = 1): Promise<number> {
    if (this.cache.size === 0) return 0;
    
    // Sort by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    let evicted = 0;
    const now = Date.now();
    
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key] = entries[i]!;
      this.cache.delete(key);
      evicted++;
      this.recordEviction();
      
      // Log deletion
      this.logOperation({ type: 'delete', key, timestamp: now });
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
    
    try {
      await this.ensureDirectoryExists();
      const data = Object.fromEntries(this.cache.entries());
      await writeFile(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');
      this.dirty = false;
      
      // Clear the operations log since we've persisted everything
      await writeFile(this.logFile, '');
      this.logEntries = 0;
      
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
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
    await mkdir(this.dataDir, { recursive: true });
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
  async getAll(): Promise<Record<string, T>> {
    await this.ensureLoaded();
    await this.evictExpired();
    
    const result: Record<string, T> = {};
    for (const [key, entry] of this.cache.entries()) {
      result[key] = entry.value;
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