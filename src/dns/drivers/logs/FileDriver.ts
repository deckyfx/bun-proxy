import { BaseDriver, type LogEntry, type LogOptions, type LogFilter } from './BaseDriver';
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export class FileDriver extends BaseDriver {
  private filePath: string;

  constructor(options: LogOptions = {}) {
    super(options);
    this.filePath = options.filePath || './data/dns-logs.jsonl';
  }

  async log(entry: LogEntry): Promise<void> {
    await this.ensureDirectoryExists();
    const logLine = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString()
    }) + '\n';
    
    await appendFile(this.filePath, logLine, 'utf8');
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      let logs: LogEntry[] = lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp)
        };
      });

      if (filter) {
        if (filter.level) {
          logs = logs.filter(log => log.level === filter.level);
        }
        if (filter.domain) {
          logs = logs.filter(log => log.query?.domain?.includes(filter.domain!) || false);
        }
        if (filter.provider) {
          logs = logs.filter(log => log.provider === filter.provider);
        }
        if (filter.startTime) {
          logs = logs.filter(log => log.timestamp >= filter.startTime!);
        }
        if (filter.endTime) {
          logs = logs.filter(log => log.timestamp <= filter.endTime!);
        }
        if (filter.limit) {
          logs = logs.slice(-filter.limit);
        }
      }

      return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      if ((error as any)?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    await writeFile(this.filePath, '', 'utf8');
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const logs = await this.getLogs();
    const filteredLogs = logs.filter(log => log.timestamp > cutoffDate);
    
    await this.clear();
    for (const log of filteredLogs) {
      await this.log(log);
    }
  }

  async stats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    const logs = await this.getLogs();
    if (logs.length === 0) {
      return { totalEntries: 0 };
    }

    const sorted = logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return {
      totalEntries: logs.length,
      oldestEntry: sorted[0]?.timestamp,
      newestEntry: sorted[sorted.length - 1]?.timestamp
    };
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }
}