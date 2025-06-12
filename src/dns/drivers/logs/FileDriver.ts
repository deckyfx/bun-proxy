import { BaseDriver, type LogOptions, type LogFilter } from "./BaseDriver";
import type { LogEntry } from "@src/types/dns-unified";
import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { tryAsync, trySync } from "@src/utils/try";

export class FileDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "file";

  private filePath: string;

  constructor(options: LogOptions = {}) {
    super(options);
    this.filePath = options.filePath || "./data/dns-logs.json";
  }

  async log(entry: LogEntry): Promise<void> {
    await this.ensureDirectoryExists();
    const logLine = JSON.stringify(entry) + "\n";

    await appendFile(this.filePath, logLine, "utf8");
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    const [content, readError] = await tryAsync(() => readFile(this.filePath, "utf8"));
    
    if (readError) {
      if ((readError as any)?.code === "ENOENT") {
        return [];
      }
      throw readError;
    }
    
    const lines = content
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    let logs: LogEntry[] = lines.map((line) => {
      const [parsed, parseError] = trySync(() => JSON.parse(line) as LogEntry);
      if (parseError) {
        console.warn('Failed to parse log line:', parseError);
        return null;
      }
      return parsed;
    }).filter(Boolean) as LogEntry[];

      if (filter) {
        if (filter.type) {
          logs = logs.filter((log) => log.type === filter.type);
        }
        if (filter.level) {
          logs = logs.filter((log) => log.level === filter.level);
        }
        if (filter.domain) {
          logs = logs.filter((log) => {
            if (log.type === "server_event") return false;
            return log.query?.name?.includes(filter.domain!) || false;
          });
        }
        if (filter.provider) {
          logs = logs.filter((log) => {
            if (log.type === "server_event") return false;
            return "provider" in log && log.provider === filter.provider;
          });
        }
        if (filter.startTime) {
          logs = logs.filter((log) => log.timestamp >= filter.startTime!);
        }
        if (filter.endTime) {
          logs = logs.filter((log) => log.timestamp <= filter.endTime!);
        }
        if (filter.limit) {
          logs = logs.slice(-filter.limit);
        }
      }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  async clear(): Promise<void> {
    await writeFile(this.filePath, "", "utf8");
  }

  async cleanup(): Promise<void> {
    const retentionDays = this.options.retention || 7;
    const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const logs = await this.getLogs();
    const filteredLogs = logs.filter((log) => log.timestamp > cutoffTimestamp);

    await this.clear();
    for (const log of filteredLogs) {
      await this.log(log);
    }
  }

  async stats(): Promise<{
    totalEntries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    const logs = await this.getLogs();
    if (logs.length === 0) {
      return { totalEntries: 0 };
    }

    const sorted = logs.sort((a, b) => a.timestamp - b.timestamp);
    return {
      totalEntries: logs.length,
      oldestEntry: sorted[0]?.timestamp,
      newestEntry: sorted[sorted.length - 1]?.timestamp,
    };
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }
}
