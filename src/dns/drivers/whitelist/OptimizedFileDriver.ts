import type {
  WhitelistEntry,
  WhitelistOptions,
  WhitelistStats,
} from "./BaseDriver";
import { BaseDriver } from "./BaseDriver";
import { readFile, writeFile, mkdir, appendFile } from "fs/promises";
import { join } from "path";
import { tryAsync, trySync, tryParse } from "@src/utils/try";

/**
 * High-performance FileDriver for whitelist using Write-Ahead Logging (WAL)
 *
 * Performance optimizations:
 * 1. Bloom filter for fast negative lookups
 * 2. Write-Ahead Log for fast writes
 * 3. Lazy loading with domain index
 * 4. Batch operations
 * 5. Periodic compaction
 */
export class OptimizedFileDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "optimized-file";

  private dataDir: string;
  private mainFile: string;
  private walFile: string;
  private indexFile: string;

  // In-memory structures for fast access
  private bloomFilter?: Set<string>; // Simple bloom filter simulation
  private domainIndex = new Map<string, boolean>(); // Domain -> exists mapping
  private walEntries = new Map<
    string,
    { action: "add" | "remove"; entry?: WhitelistEntry }
  >();

  // Performance settings
  private maxWalSize = 1000; // Compact WAL after this many operations
  private indexLoaded = false;

  // Batch operation buffers
  private pendingWrites = new Map<string, WhitelistEntry>();
  private pendingDeletes = new Set<string>();
  private writeTimeout?: NodeJS.Timeout;

  constructor(options: WhitelistOptions = {}) {
    super(options);
    this.dataDir = options.filePath || "./data/whitelist";
    this.mainFile = join(this.dataDir, "domains.json");
    this.walFile = join(this.dataDir, "wal.log");
    this.indexFile = join(this.dataDir, "index.json");
  }

  /**
   * Load minimal index for fast lookups
   */
  private async ensureIndexLoaded(): Promise<void> {
    if (this.indexLoaded) return;

    const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
    if (dirError) {
      console.warn("Failed to ensure directory exists:", dirError);
      return;
    }

    // Try to load existing index
    const [indexContent, readError] = await tryAsync(() => readFile(this.indexFile, "utf8"));
    if (readError) {
      if ((readError as any)?.code !== "ENOENT") {
        console.warn("Failed to load whitelist index:", readError);
      }
      // If index doesn't exist, we'll rebuild it
      await this.rebuildIndex();
      return;
    }

    const [indexData, parseError] = tryParse<{ domains?: string[]; bloomFilter?: number[] }>(indexContent);
    if (parseError) {
      console.warn("Failed to parse whitelist index:", parseError);
      await this.rebuildIndex();
      return;
    }

    // Load domain index (just domain names and their existence)
    for (const domain of indexData.domains || []) {
      this.domainIndex.set(domain, true);
    }

    // Load bloom filter approximation
    this.bloomFilter = new Set(indexData.domains || []);

    // Always load WAL entries to get latest changes
    await this.loadWalEntries();

    this.indexLoaded = true;
  }

  /**
   * Load WAL entries that haven't been compacted yet
   */
  private async loadWalEntries(): Promise<void> {
    const [walContent, walError] = await tryAsync(() => readFile(this.walFile, "utf8"));
    if (walError) {
      if ((walError as any)?.code !== "ENOENT") {
        console.warn("Failed to load WAL:", walError);
      }
      return;
    }

    const lines = walContent
      .trim()
      .split("\n")
      .filter((line) => line);

    for (const line of lines) {
      const [walEntry, parseError] = tryParse<{
        operation: string;
        action?: string;
        domain: string;
        entry?: WhitelistEntry;
      }>(line);
      
      if (parseError) {
        console.warn("Invalid WAL entry:", line);
        continue;
      }
      
      const domain = this.normalizeDomain(walEntry.domain);

      if ((walEntry.action || walEntry.operation) === "add") {
        this.walEntries.set(domain, {
          action: "add",
          entry: walEntry.entry,
        });
        this.domainIndex.set(domain, true);
        this.bloomFilter?.add(domain);
      } else if ((walEntry.action || walEntry.operation) === "remove") {
        this.walEntries.set(domain, { action: "remove" });
        this.domainIndex.set(domain, false);
        this.bloomFilter?.delete(domain);
      }
    }
  }

  /**
   * Ultra-fast lookup using bloom filter + index
   */
  async contains(domain: string): Promise<boolean> {
    await this.ensureIndexLoaded();

    const normalizedDomain = this.normalizeDomain(domain);

    // Bloom filter check (fast negative lookup)
    if (!this.bloomFilter?.has(normalizedDomain)) {
      return false;
    }

    // Check WAL first (most recent changes)
    const walEntry = this.walEntries.get(normalizedDomain);
    if (walEntry) {
      return walEntry.action === "add";
    }

    // Check index
    return this.domainIndex.get(normalizedDomain) === true;
  }

  /**
   * Fast blocking check with pattern matching
   */
  async isBlocked(domain: string): Promise<boolean> {
    await this.ensureIndexLoaded();

    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match first (fastest path)
    if (await this.contains(normalizedDomain)) {
      return true;
    }

    // For pattern matching, we need to check against actual entries
    // This is more expensive but only done when exact match fails
    return this.checkPatternMatches(normalizedDomain);
  }

  /**
   * Pattern matching check (slower path)
   */
  private async checkPatternMatches(domain: string): Promise<boolean> {
    // Check WAL entries first
    for (const [walDomain, walEntry] of this.walEntries.entries()) {
      if (walEntry.action === "add" && this.matchesPattern(domain, walDomain)) {
        return true;
      }
    }

    // If no pattern matches in WAL, we'd need to check main file
    // For performance, we might want to keep pattern domains in a separate index
    return false;
  }

  /**
   * Fast add operation using WAL
   */
  async add(domain: string, reason?: string, category?: string): Promise<void> {
    const normalizedDomain = this.normalizeDomain(domain);

    const entry: WhitelistEntry = {
      domain: normalizedDomain,
      reason,
      addedAt: Date.now(),
      source: "manual",
      category,
    };

    // Add to pending writes for batching
    this.pendingWrites.set(normalizedDomain, entry);
    this.pendingDeletes.delete(normalizedDomain);

    // Update in-memory structures immediately for fast reads
    this.domainIndex.set(normalizedDomain, true);
    this.bloomFilter?.add(normalizedDomain);

    // Schedule batch write
    this.scheduleBatchWrite();
  }

  /**
   * Fast remove operation
   */
  async remove(domain: string): Promise<boolean> {
    await this.ensureIndexLoaded();

    const normalizedDomain = this.normalizeDomain(domain);
    const exists = this.domainIndex.get(normalizedDomain) === true;

    if (!exists) return false;

    // Add to pending deletes
    this.pendingDeletes.add(normalizedDomain);
    this.pendingWrites.delete(normalizedDomain);

    // Update in-memory structures immediately
    this.domainIndex.set(normalizedDomain, false);
    this.bloomFilter?.delete(normalizedDomain);

    // Schedule batch write
    this.scheduleBatchWrite();

    return true;
  }

  /**
   * Batch write operations for performance
   */
  private scheduleBatchWrite(): void {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
    }

    // Batch writes every 100ms for performance
    this.writeTimeout = setTimeout(async () => {
      await this.flushPendingOperations();
    }, 100);
  }

  /**
   * Flush pending operations to WAL
   */
  private async flushPendingOperations(): Promise<void> {
    const operations: string[] = [];

    // Process pending writes
    for (const [domain, entry] of this.pendingWrites.entries()) {
      const walEntry = {
        action: "add" as const,
        domain,
        entry,
        timestamp: Date.now(),
      };
      const [jsonString, jsonError] = trySync(() => JSON.stringify(walEntry));
      if (jsonError) {
        console.error("Failed to serialize WAL entry:", jsonError);
        continue;
      }
      operations.push(jsonString);
      this.walEntries.set(domain, { action: "add", entry });
    }

    // Process pending deletes
    for (const domain of this.pendingDeletes) {
      const walEntry = {
        action: "remove" as const,
        domain,
        timestamp: Date.now(),
      };
      const [jsonString, jsonError] = trySync(() => JSON.stringify(walEntry));
      if (jsonError) {
        console.error("Failed to serialize WAL entry:", jsonError);
        continue;
      }
      operations.push(jsonString);
      this.walEntries.set(domain, { action: "remove" });
    }

    // Write to WAL if we have operations
    if (operations.length > 0) {
      const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
      if (dirError) {
        console.error("Failed to ensure directory exists:", dirError);
        return;
      }
      const [, writeError] = await tryAsync(() => appendFile(this.walFile, operations.join("\n") + "\n"));
      if (writeError) {
        console.error("Failed to write to WAL:", writeError);
        return;
      }
    }

    // Clear pending operations
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    // Check if we need to compact
    if (this.walEntries.size >= this.maxWalSize) {
      await this.compactWal();
    }
  }

  /**
   * Compact WAL by merging with main file
   */
  private async compactWal(): Promise<void> {
    // Load existing entries from main file
    const existingEntries = new Map<string, WhitelistEntry>();

    const [mainContent, mainError] = await tryAsync(() => readFile(this.mainFile, "utf8"));
    if (!mainError) {
      const [mainData, parseError] = tryParse<WhitelistEntry[]>(mainContent);
      if (!parseError) {
        for (const entry of mainData) {
          existingEntries.set(entry.domain, entry);
        }
      }
      // If parse error, main file exists but is corrupted - continue with empty entries
    }
    // If main file doesn't exist yet, that's ok - continue with empty entries

    // Apply WAL operations
    for (const [domain, walEntry] of this.walEntries.entries()) {
      if (walEntry.action === "add" && walEntry.entry) {
        existingEntries.set(domain, walEntry.entry);
      } else if (walEntry.action === "remove") {
        existingEntries.delete(domain);
      }
    }

    // Write compacted data to main file
    const compactedData = Array.from(existingEntries.values());
    const [, writeError] = await tryAsync(() => writeFile(this.mainFile, JSON.stringify(compactedData, null, 2)));
    if (writeError) {
      console.error("Failed to compact WAL:", writeError);
      return;
    }

    // Rebuild index
    await this.rebuildIndex();

    // Clear WAL
    this.walEntries.clear();
    const [, walClearError] = await tryAsync(() => writeFile(this.walFile, ""));
    if (walClearError) {
      console.error("Failed to clear WAL file:", walClearError);
      return;
    }

    console.log(`Compacted whitelist: ${compactedData.length} entries`);
  }

  /**
   * Rebuild index from main file
   */
  private async rebuildIndex(): Promise<void> {
    const [content, readError] = await tryAsync(() => readFile(this.mainFile, "utf8"));
    if (readError) {
      console.warn("Failed to rebuild index:", readError);
      return;
    }

    const [data, parseError] = tryParse<WhitelistEntry[]>(content);
    if (parseError) {
      console.warn("Failed to rebuild index:", parseError);
      return;
    }

    const domains = data.map((entry) => entry.domain);

    // Update in-memory structures
    this.domainIndex.clear();
    for (const domain of domains) {
      this.domainIndex.set(domain, true);
    }

    this.bloomFilter = new Set(domains);

    // Save index to file
    const indexData = { domains, lastCompacted: Date.now() };
    const [, writeError] = await tryAsync(() => writeFile(this.indexFile, JSON.stringify(indexData)));
    if (writeError) {
      console.warn("Failed to write index file:", writeError);
    }
  }

  /**
   * List entries (loads from main file + applies WAL)
   */
  async list(category?: string): Promise<WhitelistEntry[]> {
    await this.ensureIndexLoaded();

    // Force compaction to get accurate list
    await this.flushPendingOperations();

    const entries = new Map<string, WhitelistEntry>();

    // Load from main file
    const [content, readError] = await tryAsync(() => readFile(this.mainFile, "utf8"));
    if (!readError) {
      const [data, parseError] = tryParse<WhitelistEntry[]>(content);
      if (!parseError) {
        for (const entry of data) {
          entries.set(entry.domain, entry);
        }
      }
      // If parse error, continue with empty entries (file corrupted)
    }
    // If main file doesn't exist, that's ok - continue with empty entries

    // Apply WAL operations
    for (const [domain, walEntry] of this.walEntries.entries()) {
      if (walEntry.action === "add" && walEntry.entry) {
        entries.set(domain, walEntry.entry);
      } else if (walEntry.action === "remove") {
        entries.delete(domain);
      }
    }

    let result = Array.from(entries.values());

    if (category) {
      result = result.filter((entry) => entry.category === category);
    }

    return result.sort((a, b) => b.addedAt - a.addedAt);
  }

  async clear(): Promise<void> {
    this.domainIndex.clear();
    this.bloomFilter?.clear();
    this.walEntries.clear();
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    // Clear files
    const [, dirError] = await tryAsync(() => this.ensureDirectoryExists());
    if (dirError) {
      console.error("Failed to ensure directory exists:", dirError);
      return;
    }
    const [, mainError] = await tryAsync(() => writeFile(this.mainFile, "[]"));
    if (mainError) {
      console.error("Failed to clear main file:", mainError);
    }
    const [, walError] = await tryAsync(() => writeFile(this.walFile, ""));
    if (walError) {
      console.error("Failed to clear WAL file:", walError);
    }
    const [, indexError] = await tryAsync(() => writeFile(this.indexFile, '{"domains":[]}'));
    if (indexError) {
      console.error("Failed to clear index file:", indexError);
    }
  }

  async stats(): Promise<WhitelistStats> {
    const entries = await this.list();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const categories: Record<string, number> = {};
    const sources: Record<string, number> = {};
    let recentlyAdded = 0;

    for (const entry of entries) {
      const category = entry.category || "uncategorized";
      categories[category] = (categories[category] || 0) + 1;

      const source = entry.source || "unknown";
      sources[source] = (sources[source] || 0) + 1;

      if (entry.addedAt > oneDayAgo) {
        recentlyAdded++;
      }
    }

    return {
      totalEntries: entries.length,
      categories,
      sources,
      recentlyAdded,
    };
  }

  async cleanup(): Promise<void> {
    await this.flushPendingOperations();

    // Auto-compact if WAL is getting large
    if (this.walEntries.size >= this.maxWalSize / 2) {
      await this.compactWal();
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const [, error] = await tryAsync(() => mkdir(this.dataDir, { recursive: true }));
    if (error) {
      throw error;
    }
  }

  // Additional whitelist-specific methods from BaseDriver interface...
  async isAllowed(domain: string): Promise<boolean> {
    return this.contains(domain);
  }

  async getAllowingRule(domain: string): Promise<WhitelistEntry | null> {
    const entries = await this.list();
    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match first
    const exactMatch = entries.find(
      (entry) => entry.domain === normalizedDomain
    );
    if (exactMatch) return exactMatch;

    // Check pattern matches
    for (const entry of entries) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return entry;
      }
    }

    return null;
  }

  async import(entries: WhitelistEntry[]): Promise<number> {
    let imported = 0;

    for (const entry of entries) {
      const normalizedDomain = this.normalizeDomain(entry.domain);
      if (!this.domainIndex.has(normalizedDomain)) {
        await this.add(entry.domain, entry.reason, entry.category);
        imported++;
      }
    }

    return imported;
  }

  async export(): Promise<WhitelistEntry[]> {
    return this.list();
  }
}
