import {
  BaseDriver,
  type WhitelistEntry,
  type WhitelistOptions,
  type WhitelistStats,
} from "./BaseDriver";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { tryAsync, trySync } from "@src/utils/try";

export class FileDriver extends BaseDriver {
  static override readonly DRIVER_NAME = "file";

  private filePath: string;
  private entries = new Map<string, WhitelistEntry>();
  private loaded = false;

  constructor(options: WhitelistOptions = {}) {
    super(options);
    this.filePath = options.filePath || "./data/whitelist.json";
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    const [, error] = await tryAsync(async () => {
      await this.ensureDirectoryExists();
      const content = await readFile(this.filePath, "utf8");
      const [data, parseError] = trySync(() => JSON.parse(content) as WhitelistEntry[]);
      
      if (parseError) {
        throw parseError;
      }

      for (const entry of data) {
        this.entries.set(entry.domain, {
          ...entry,
          addedAt:
            typeof entry.addedAt === "number"
              ? entry.addedAt
              : new Date(entry.addedAt).getTime(),
        });
      }
    });
    
    if (error && (error as any)?.code !== "ENOENT") {
      console.warn("Failed to load whitelist from file:", error);
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    await this.ensureDirectoryExists();
    const data = Array.from(this.entries.values());
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async add(domain: string, reason?: string, category?: string): Promise<void> {
    await this.ensureLoaded();

    const normalizedDomain = this.normalizeDomain(domain);

    const entry: WhitelistEntry = {
      domain: normalizedDomain,
      reason,
      addedAt: Date.now(),
      source: "manual",
      category,
    };

    this.entries.set(normalizedDomain, entry);
    await this.save();
  }

  async remove(domain: string): Promise<boolean> {
    await this.ensureLoaded();

    const normalizedDomain = this.normalizeDomain(domain);
    const deleted = this.entries.delete(normalizedDomain);

    if (deleted) {
      await this.save();
    }

    return deleted;
  }

  async contains(domain: string): Promise<boolean> {
    await this.ensureLoaded();

    const normalizedDomain = this.normalizeDomain(domain);
    return this.entries.has(normalizedDomain);
  }

  async list(category?: string): Promise<WhitelistEntry[]> {
    await this.ensureLoaded();

    const allEntries = Array.from(this.entries.values());

    if (category) {
      return allEntries.filter((entry) => entry.category === category);
    }

    return allEntries.sort((a, b) => b.addedAt - a.addedAt);
  }

  async clear(): Promise<void> {
    this.entries.clear();
    await this.save();
  }

  async isAllowed(domain: string): Promise<boolean> {
    await this.ensureLoaded();

    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match first
    if (this.entries.has(normalizedDomain)) {
      return true;
    }

    // Check pattern matches
    for (const entry of this.entries.values()) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return true;
      }
    }

    return false;
  }

  async getAllowingRule(domain: string): Promise<WhitelistEntry | null> {
    await this.ensureLoaded();

    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match first
    const exactMatch = this.entries.get(normalizedDomain);
    if (exactMatch) {
      return exactMatch;
    }

    // Check pattern matches
    for (const entry of this.entries.values()) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return entry;
      }
    }

    return null;
  }

  async import(entries: WhitelistEntry[]): Promise<number> {
    await this.ensureLoaded();

    let imported = 0;

    for (const entry of entries) {
      const normalizedDomain = this.normalizeDomain(entry.domain);
      if (!this.entries.has(normalizedDomain)) {
        this.entries.set(normalizedDomain, {
          ...entry,
          domain: normalizedDomain,
          source: "import",
          addedAt:
            typeof entry.addedAt === "number"
              ? entry.addedAt
              : new Date(entry.addedAt).getTime(),
        });
        imported++;
      }
    }

    if (imported > 0) {
      await this.save();
    }

    return imported;
  }

  async export(): Promise<WhitelistEntry[]> {
    await this.ensureLoaded();
    return Array.from(this.entries.values());
  }

  async stats(): Promise<WhitelistStats> {
    await this.ensureLoaded();

    const entries = Array.from(this.entries.values());
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const categories: Record<string, number> = {};
    const sources: Record<string, number> = {};
    let recentlyAdded = 0;

    for (const entry of entries) {
      // Count categories
      const category = entry.category || "uncategorized";
      categories[category] = (categories[category] || 0) + 1;

      // Count sources
      const source = entry.source || "unknown";
      sources[source] = (sources[source] || 0) + 1;

      // Count recent additions
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
    await this.ensureLoaded();
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }
}
