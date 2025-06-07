import { BaseDriver, type CacheEntry, type CacheOptions } from './BaseDriver';
import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class SQLiteDriver<T = any> extends BaseDriver<T> {
  private db!: Database;
  private dbPath: string;
  private cleanupTimer?: Timer;

  constructor(options: CacheOptions = {}) {
    super(options);
    this.dbPath = options.dbPath || './data/dns-cache.db';
  }

  async init(): Promise<void> {
    await this.ensureDirectoryExists();
    this.db = new Database(this.dbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        ttl INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_created_at ON cache_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_last_accessed ON cache_entries(last_accessed);
      CREATE INDEX IF NOT EXISTS idx_ttl_created ON cache_entries(ttl, created_at);
    `);

    this.startCleanupTimer();
  }

  async get(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare('SELECT * FROM cache_entries WHERE key = ?');
    const row = stmt.get(key) as any;
    
    if (!row) {
      this.recordMiss();
      return null;
    }

    const entry: CacheEntry<T> = {
      value: JSON.parse(row.value),
      ttl: row.ttl,
      createdAt: row.created_at,
      accessCount: row.access_count,
      lastAccessed: row.last_accessed
    };

    if (this.isExpired(entry)) {
      const deleteStmt = this.db.prepare('DELETE FROM cache_entries WHERE key = ?');
      deleteStmt.run(key);
      this.recordMiss();
      return null;
    }

    // Update access tracking
    const updateStmt = this.db.prepare(`
      UPDATE cache_entries 
      SET access_count = access_count + 1, last_accessed = ? 
      WHERE key = ?
    `);
    updateStmt.run(Date.now(), key);
    
    this.recordHit();
    return entry.value;
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.db) await this.init();

    const effectiveTtl = ttl || this.options.defaultTtl!;
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_entries 
      (key, value, ttl, created_at, access_count, last_accessed)
      VALUES (?, ?, ?, ?, 0, ?)
    `);
    
    stmt.run(key, JSON.stringify(value), effectiveTtl, now, now);

    // Check if we need to evict entries
    const sizeResult = await this.size();
    if (sizeResult > this.options.maxSize!) {
      await this.evictLRU(sizeResult - this.options.maxSize!);
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare('DELETE FROM cache_entries WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    this.db.exec('DELETE FROM cache_entries');
  }

  async has(key: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare(`
      SELECT 1 FROM cache_entries 
      WHERE key = ? AND (created_at + ttl) > ?
    `);
    const result = stmt.get(key, Date.now());
    return !!result;
  }

  async keys(): Promise<string[]> {
    if (!this.db) await this.init();
    
    await this.evictExpired();
    const stmt = this.db.prepare('SELECT key FROM cache_entries');
    const rows = stmt.all() as any[];
    return rows.map(row => row.key);
  }

  async size(): Promise<number> {
    if (!this.db) await this.init();
    
    await this.evictExpired();
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries');
    const result = stmt.get() as any;
    return result.count;
  }

  async cleanup(): Promise<void> {
    await this.evictExpired();
  }

  async evictExpired(): Promise<number> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare('DELETE FROM cache_entries WHERE (created_at + ttl) <= ?');
    const result = stmt.run(Date.now());
    
    const evicted = result.changes;
    for (let i = 0; i < evicted; i++) {
      this.recordEviction();
    }
    
    return evicted;
  }

  async evictLRU(count: number = 1): Promise<number> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare(`
      DELETE FROM cache_entries 
      WHERE key IN (
        SELECT key FROM cache_entries 
        ORDER BY last_accessed ASC 
        LIMIT ?
      )
    `);
    const result = stmt.run(count);
    
    const evicted = result.changes;
    for (let i = 0; i < evicted; i++) {
      this.recordEviction();
    }
    
    return evicted;
  }

  private startCleanupTimer(): void {
    if (this.options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired().catch(console.error);
      }, this.options.cleanupInterval);
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.dbPath);
    await mkdir(dir, { recursive: true });
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.db) {
      this.db.close();
    }
  }

  destroy(): void {
    this.close();
  }
}