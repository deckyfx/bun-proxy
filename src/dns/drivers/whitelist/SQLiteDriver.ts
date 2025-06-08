import { BaseDriver, type WhitelistEntry, type WhitelistOptions, type WhitelistStats } from './BaseDriver';
import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class SQLiteDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'sqlite';
  
  private db!: Database;
  private dbPath: string;

  constructor(options: WhitelistOptions = {}) {
    super(options);
    this.dbPath = options.dbPath || './data/whitelist.db';
  }

  async init(): Promise<void> {
    await this.ensureDirectoryExists();
    this.db = new Database(this.dbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whitelist (
        domain TEXT PRIMARY KEY,
        reason TEXT,
        added_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        category TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_category ON whitelist(category);
      CREATE INDEX IF NOT EXISTS idx_source ON whitelist(source);
      CREATE INDEX IF NOT EXISTS idx_added_at ON whitelist(added_at);
    `);
  }

  async add(domain: string, reason?: string, category?: string): Promise<void> {
    if (!this.db) await this.init();
    
    const normalizedDomain = this.normalizeDomain(domain);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO whitelist (domain, reason, added_at, source, category)
      VALUES (?, ?, ?, 'manual', ?)
    `);
    
    stmt.run(normalizedDomain, reason || null, Date.now(), category || null);
  }

  async remove(domain: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    const normalizedDomain = this.normalizeDomain(domain);
    const stmt = this.db.prepare('DELETE FROM whitelist WHERE domain = ?');
    const result = stmt.run(normalizedDomain);
    return result.changes > 0;
  }

  async contains(domain: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    const normalizedDomain = this.normalizeDomain(domain);
    const stmt = this.db.prepare('SELECT 1 FROM whitelist WHERE domain = ?');
    const result = stmt.get(normalizedDomain);
    return !!result;
  }

  async list(category?: string): Promise<WhitelistEntry[]> {
    if (!this.db) await this.init();
    
    let query = 'SELECT * FROM whitelist';
    const params: any[] = [];
    
    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY added_at DESC';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      domain: row.domain,
      reason: row.reason,
      addedAt: new Date(row.added_at),
      source: row.source,
      category: row.category
    }));
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    this.db.exec('DELETE FROM whitelist');
  }

  async isAllowed(domain: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactStmt = this.db.prepare('SELECT 1 FROM whitelist WHERE domain = ?');
    if (exactStmt.get(normalizedDomain)) {
      return true;
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const patternStmt = this.db.prepare('SELECT domain FROM whitelist');
      const patterns = patternStmt.all() as any[];
      
      for (const pattern of patterns) {
        if (this.matchesPattern(normalizedDomain, pattern.domain)) {
          return true;
        }
      }
    }

    return false;
  }

  async getAllowingRule(domain: string): Promise<WhitelistEntry | null> {
    if (!this.db) await this.init();
    
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactStmt = this.db.prepare('SELECT * FROM whitelist WHERE domain = ?');
    const exactMatch = exactStmt.get(normalizedDomain) as any;
    
    if (exactMatch) {
      return {
        domain: exactMatch.domain,
        reason: exactMatch.reason,
        addedAt: new Date(exactMatch.added_at),
        source: exactMatch.source,
        category: exactMatch.category
      };
    }

    // Check pattern matches if wildcards are enabled
    if (this.options.enableWildcards) {
      const patternStmt = this.db.prepare('SELECT * FROM whitelist');
      const patterns = patternStmt.all() as any[];
      
      for (const pattern of patterns) {
        if (this.matchesPattern(normalizedDomain, pattern.domain)) {
          return {
            domain: pattern.domain,
            reason: pattern.reason,
            addedAt: new Date(pattern.added_at),
            source: pattern.source,
            category: pattern.category
          };
        }
      }
    }

    return null;
  }

  async import(entries: WhitelistEntry[]): Promise<number> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO whitelist (domain, reason, added_at, source, category)
      VALUES (?, ?, ?, 'import', ?)
    `);
    
    let imported = 0;
    
    for (const entry of entries) {
      const normalizedDomain = this.normalizeDomain(entry.domain);
      const result = stmt.run(
        normalizedDomain,
        entry.reason || null,
        entry.addedAt.getTime(),
        entry.category || null
      );
      
      if (result.changes > 0) {
        imported++;
      }
    }
    
    return imported;
  }

  async export(): Promise<WhitelistEntry[]> {
    if (!this.db) await this.init();
    
    const stmt = this.db.prepare('SELECT * FROM whitelist ORDER BY added_at DESC');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      domain: row.domain,
      reason: row.reason,
      addedAt: new Date(row.added_at),
      source: row.source,
      category: row.category
    }));
  }

  async stats(): Promise<WhitelistStats> {
    if (!this.db) await this.init();
    
    // Total entries
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM whitelist');
    const countResult = countStmt.get() as any;
    
    // Categories
    const categoriesStmt = this.db.prepare(`
      SELECT COALESCE(category, 'uncategorized') as category, COUNT(*) as count 
      FROM whitelist 
      GROUP BY category
    `);
    const categoriesResult = categoriesStmt.all() as any[];
    const categories: Record<string, number> = {};
    for (const row of categoriesResult) {
      categories[row.category] = row.count;
    }
    
    // Sources
    const sourcesStmt = this.db.prepare('SELECT source, COUNT(*) as count FROM whitelist GROUP BY source');
    const sourcesResult = sourcesStmt.all() as any[];
    const sources: Record<string, number> = {};
    for (const row of sourcesResult) {
      sources[row.source] = row.count;
    }
    
    // Recently added (last 24h)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentStmt = this.db.prepare('SELECT COUNT(*) as count FROM whitelist WHERE added_at > ?');
    const recentResult = recentStmt.get(oneDayAgo) as any;

    return {
      totalEntries: countResult.count,
      categories,
      sources,
      recentlyAdded: recentResult.count
    };
  }

  async cleanup(): Promise<void> {
    if (!this.db) await this.init();
    // Could implement cleanup logic like removing duplicates
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.dbPath);
    await mkdir(dir, { recursive: true });
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}