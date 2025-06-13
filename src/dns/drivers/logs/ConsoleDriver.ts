import { BaseDriver, type LogOptions, type LogFilter } from "./BaseDriver";
import type { LogEntry } from "@src/types/dns-unified";

export class ConsoleDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "console";

  private logCount = 0;
  private firstLogTime?: number;
  private lastLogTime?: number;

  constructor(options: LogOptions = {}) {
    super(options);
  }

  async log(entry: LogEntry): Promise<void> {
    this.logCount++;
    this.lastLogTime = entry.timestamp;
    if (!this.firstLogTime) {
      this.firstLogTime = entry.timestamp;
    }

    // Format log entry for console output
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const requestId = entry.id.substring(0, 8); // Short ID for display

    let logMessage: string;

    if (entry.type === "request") {
      // Request log format
      const domain = entry.query?.name || "unknown";
      const queryType = entry.query?.type || "unknown";

      const indicators = [];
      if (entry.processing.cached) indicators.push("🔄");
      if (entry.processing.blocked) indicators.push("🚫");
      if (entry.processing.whitelisted) indicators.push("✅");
      const statusStr = indicators.length > 0 ? ` ${indicators.join("")}` : "";

      const providerStr = entry.processing.provider
        ? ` → ${entry.processing.provider}`
        : " → selecting...";
      const transportStr = entry.client.transport
        ? ` [${entry.client.transport.toUpperCase()}]`
        : "";

      logMessage = `[${timestamp}] ${level} ➤ REQ ${domain} (${queryType})${providerStr}${statusStr}${transportStr} [${requestId}]`;
    } else if (entry.type === "response") {
      // Response log format
      const domain = entry.query?.name || "unknown";
      const queryType = entry.query?.type || "unknown";
      const success = entry.processing.success ? "✓" : "✗";
      const responseTime = entry.processing.responseTime
        ? `${entry.processing.responseTime}ms`
        : "N/A";

      const indicators = [];
      if (entry.processing.cached) indicators.push("🔄");
      if (entry.processing.blocked) indicators.push("🚫");
      if (entry.processing.whitelisted) indicators.push("✅");
      const statusStr = indicators.length > 0 ? ` ${indicators.join("")}` : "";

      const provider = entry.processing.provider || "unknown";
      const transportStr = entry.client.transport
        ? ` [${entry.client.transport.toUpperCase()}]`
        : "";

      logMessage = `[${timestamp}] ${level} ➤ RES ${success} ${domain} (${queryType}) via ${provider} (${responseTime})${statusStr}${transportStr} [${requestId}]`;

      // Try to extract resolved addresses from packet answers
      if (entry.packet?.answers?.length) {
        const addresses = entry.packet.answers
          .filter((answer) => answer.type === "A" || answer.type === "AAAA")
          .map((answer) => (answer as any).data)
          .filter(Boolean)
          .slice(0, 2);

        if (addresses.length > 0) {
          logMessage += ` → ${addresses.join(", ")}${
            entry.packet.answers.length > 2 ? "..." : ""
          }`;
        }
      }

      if (entry.processing.error) {
        logMessage += ` - Error: ${entry.processing.error}`;
      }
    } else if (entry.type === "error") {
      // Error log format
      const domain = entry.query?.name || "unknown";
      const queryType = entry.query?.type || "unknown";

      logMessage = `[${timestamp}] ${level} ➤ ERR ${domain} (${queryType}) - ${
        entry.processing.error || "Unknown error"
      } [${requestId}]`;
    } else if (entry.type === "server_event") {
      // Error log format
      const message = entry.message;
      logMessage = ` - Server Event: ${message}`;
    } else {
      // Fallback for unknown log types
      logMessage = `[${timestamp}] ${level} ➤ UNKNOWN ${
        (entry as any).type
      }: ${JSON.stringify(entry)} [${requestId}]`;
    }

    // Use appropriate console method based on log level
    switch (entry.level) {
      case "error":
        console.error(logMessage);
        break;
      case "warn":
        console.warn(logMessage);
        break;
      case "info":
      default:
        console.log(logMessage);
        break;
    }
  }

  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    // Console driver doesn't persist logs, so return empty array
    console.warn(
      "ConsoleDriver: getLogs() called but no logs are persisted. Consider using FileDriver or SQLiteDriver for log retrieval."
    );
    return [];
  }

  async clear(): Promise<void> {
    // Reset internal counters
    this.logCount = 0;
    this.firstLogTime = undefined;
    this.lastLogTime = undefined;
    console.log("ConsoleDriver: Log counters reset");
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for console output
    console.log("ConsoleDriver: No cleanup required for console output");
  }

  async stats(): Promise<{
    totalEntries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    return {
      totalEntries: this.logCount,
      oldestEntry: this.firstLogTime,
      newestEntry: this.lastLogTime,
    };
  }
}
