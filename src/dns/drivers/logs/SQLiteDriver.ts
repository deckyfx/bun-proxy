import { BaseDriver, type LogEntry, type LogOptions, type LogFilter, type RequestLogEntry, type ResponseLogEntry, type ServerEventLogEntry } from './BaseDriver';
import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class SQLiteDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'sqlite';
  
  private db!: Database;
  private dbPath: string;

  constructor(options: LogOptions = {}) {
    super(options);
    this.dbPath = options.dbPath || './data/dns-logs.db';
  }

  async init(): Promise<void> {
    await this.ensureDirectoryExists();
    this.db = new Database(this.dbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dns_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('request', 'response')),
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        domain TEXT NOT NULL,
        query_type TEXT DEFAULT 'A',
        provider TEXT,
        response_time INTEGER,
        success INTEGER,
        error TEXT,
        error_code TEXT,
        attempt INTEGER DEFAULT 1,
        cached INTEGER DEFAULT 0,
        blocked INTEGER DEFAULT 0,
        whitelisted INTEGER DEFAULT 0,
        source TEXT DEFAULT 'client',
        query_size INTEGER,
        response_size INTEGER,
        client_ip TEXT,
        client_port INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_request_id ON dns_logs(request_id);
      CREATE INDEX IF NOT EXISTS idx_entry_type ON dns_logs(entry_type);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON dns_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_domain ON dns_logs(domain);
      CREATE INDEX IF NOT EXISTS idx_provider ON dns_logs(provider);
      CREATE INDEX IF NOT EXISTS idx_level ON dns_logs(level);
      CREATE INDEX IF NOT EXISTS idx_query_type ON dns_logs(query_type);
      CREATE INDEX IF NOT EXISTS idx_success ON dns_logs(success);
      CREATE INDEX IF NOT EXISTS idx_cached ON dns_logs(cached);
      CREATE INDEX IF NOT EXISTS idx_blocked ON dns_logs(blocked);
    `);
  }

  async log(entry: LogEntry): Promise<void> {
    if (!this.db) await this.init();
    
    if (entry.type === 'request') {
      // Log request entry
      const stmt = this.db.prepare(`
        INSERT INTO dns_logs (
          request_id, entry_type, timestamp, level, domain, query_type, provider, 
          attempt, cached, blocked, whitelisted, source, query_size, client_ip, client_port
        ) VALUES (?, 'request', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        entry.requestId,
        entry.timestamp.getTime(),
        entry.level,
        entry.query.domain,
        entry.query.type,
        entry.provider || null,
        entry.attempt,
        entry.cached ? 1 : 0,
        entry.blocked ? 1 : 0,
        entry.whitelisted ? 1 : 0,
        entry.source,
        entry.query.querySize,
        entry.query.clientIP || null,
        entry.query.clientPort || null
      );
    } else if (entry.type === 'response') {
      // Log response entry
      const stmt = this.db.prepare(`
        INSERT INTO dns_logs (
          request_id, entry_type, timestamp, level, domain, query_type, provider, response_time, 
          success, error, error_code, attempt, cached, blocked, whitelisted, source, 
          query_size, response_size, client_ip, client_port
        ) VALUES (?, 'response', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        entry.requestId,
        entry.timestamp.getTime(),
        entry.level,
        entry.query.domain,
        entry.query.type,
        entry.provider,
        entry.responseTime,
        entry.success ? 1 : 0,
        entry.error || null,
        entry.errorCode || null,
        entry.attempt,
        entry.cached ? 1 : 0,
        entry.blocked ? 1 : 0,
        entry.whitelisted ? 1 : 0,
        entry.source,
        entry.query.querySize,
        entry.response?.responseSize || null,
        entry.query.clientIP || null,
        entry.query.clientPort || null
      );
    } else {
      // Log server event entry - for now, we skip these as the current schema doesn't support them
      // TODO: Extend schema to support server events or use a separate table
      console.warn('SQLiteDriver: Server event logging not yet implemented, skipping entry:', entry.type);
    }
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    if (!this.db) await this.init();
    
    let query = 'SELECT * FROM dns_logs WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.level) {
        query += ' AND level = ?';
        params.push(filter.level);
      }
      if (filter.domain) {
        query += ' AND domain LIKE ?';
        params.push(`%${filter.domain}%`);
      }
      if (filter.provider) {
        query += ' AND provider = ?';
        params.push(filter.provider);
      }
      if (filter.startTime) {
        query += ' AND timestamp >= ?';
        params.push(filter.startTime.getTime());
      }
      if (filter.endTime) {
        query += ' AND timestamp <= ?';
        params.push(filter.endTime.getTime());
      }
    }

    query += ' ORDER BY timestamp DESC';
    
    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => {
      const baseEntry = {
        requestId: row.request_id,
        timestamp: new Date(row.timestamp),
        level: row.level,
        query: {
          domain: row.domain,
          type: row.query_type || 'A',
          querySize: row.query_size || 0,
          clientIP: row.client_ip,
          clientPort: row.client_port
        },
        source: row.source || 'client',
        cached: row.cached === 1,
        blocked: row.blocked === 1,
        whitelisted: row.whitelisted === 1,
        attempt: row.attempt || 1
      };

      if (row.entry_type === 'request') {
        return {
          ...baseEntry,
          type: 'request',
          provider: row.provider
        } as RequestLogEntry;
      } else {
        return {
          ...baseEntry,
          type: 'response',
          provider: row.provider,
          responseTime: row.response_time,
          success: row.success === 1,
          error: row.error,
          errorCode: row.error_code,
          response: row.response_size ? {
            responseSize: row.response_size
          } : undefined
        } as ResponseLogEntry;
      }
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    this.db.exec('DELETE FROM dns_logs');
  }

  async cleanup(): Promise<void> {
    if (!this.db) await this.init();
    
    const retentionDays = this.options.retention || 7;
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    
    const stmt = this.db.prepare('DELETE FROM dns_logs WHERE timestamp < ?');
    stmt.run(cutoffTime);
  }

  async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    if (!this.db) await this.init();
    
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM dns_logs');
    const countResult = countStmt.get() as any;
    
    if (countResult.count === 0) {
      return { totalEntries: 0 };
    }

    const rangeStmt = this.db.prepare('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM dns_logs');
    const rangeResult = rangeStmt.get() as any;

    return {
      totalEntries: countResult.count,
      oldestEntry: new Date(rangeResult.oldest),
      newestEntry: new Date(rangeResult.newest)
    };
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