import type { BlacklistEntry, BlacklistOptions, BlacklistStats } from './BaseDriver';
import { BaseDriver } from './BaseDriver';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';

/**
 * High-performance FileDriver for blacklist using Write-Ahead Logging (WAL)
 * 
 * Performance optimizations:
 * 1. Bloom filter for fast negative lookups
 * 2. Write-Ahead Log for fast writes
 * 3. Lazy loading with domain index
 * 4. Batch operations
 * 5. Periodic compaction
 */
export class OptimizedFileDriver extends BaseDriver {
  static readonly DRIVER_NAME = 'optimized-file';
  
  private dataDir: string;
  private mainFile: string;
  private walFile: string;
  private indexFile: string;
  
  // In-memory structures for fast access
  private bloomFilter?: Set<string>; // Simple bloom filter simulation
  private domainIndex = new Map<string, boolean>(); // Domain -> exists mapping
  private walEntries = new Map<string, { action: 'add' | 'remove', entry?: BlacklistEntry }>();
  
  // Performance settings
  private maxWalSize = 1000; // Compact WAL after this many operations
  private indexLoaded = false;
  
  // Batch operation buffers
  private pendingWrites = new Map<string, BlacklistEntry>();
  private pendingDeletes = new Set<string>();
  private writeTimeout?: NodeJS.Timeout;
  
  constructor(options: BlacklistOptions = {}) {
    super(options);
    this.dataDir = options.filePath || './data/blacklist';
    this.mainFile = join(this.dataDir, 'domains.json');
    this.walFile = join(this.dataDir, 'wal.log');
    this.indexFile = join(this.dataDir, 'index.json');
  }

  /**
   * Load minimal index for fast lookups
   */
  private async ensureIndexLoaded(): Promise<void> {
    if (this.indexLoaded) return;
    
    try {
      await this.ensureDirectoryExists();
      
      // Try to load existing index
      const indexContent = await readFile(this.indexFile, 'utf8');
      const indexData = JSON.parse(indexContent);
      
      // Load domain index (just domain names and their existence)
      for (const domain of indexData.domains || []) {
        this.domainIndex.set(domain, true);
      }
      
      // Load bloom filter approximation
      this.bloomFilter = new Set(indexData.domains || []);
      
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        console.warn('Failed to load blacklist index:', error);
      }
      // If index doesn't exist, we'll rebuild it
      await this.rebuildIndex();
    }
    
    // Always load WAL entries to get latest changes
    await this.loadWalEntries();
    
    this.indexLoaded = true;
  }

  /**
   * Load WAL entries that haven't been compacted yet
   */
  private async loadWalEntries(): Promise<void> {
    try {
      const walContent = await readFile(this.walFile, 'utf8');
      const lines = walContent.trim().split('\n').filter(line => line);
      
      for (const line of lines) {
        try {
          const walEntry = JSON.parse(line);
          const domain = this.normalizeDomain(walEntry.domain);
          
          if (walEntry.action === 'add') {
            this.walEntries.set(domain, { action: 'add', entry: walEntry.entry });
            this.domainIndex.set(domain, true);
            this.bloomFilter?.add(domain);
          } else if (walEntry.action === 'remove') {
            this.walEntries.set(domain, { action: 'remove' });
            this.domainIndex.set(domain, false);
            this.bloomFilter?.delete(domain);
          }
        } catch (e) {
          console.warn('Invalid WAL entry:', line);
        }
      }
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        console.warn('Failed to load WAL:', error);
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
      return walEntry.action === 'add';
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
      if (walEntry.action === 'add' && this.matchesPattern(domain, walDomain)) {
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
    
    const entry: BlacklistEntry = {
      domain: normalizedDomain,
      reason,
      addedAt: new Date(),
      source: 'manual',
      category
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
        action: 'add' as const,
        domain,
        entry,
        timestamp: Date.now()
      };
      operations.push(JSON.stringify(walEntry));
      this.walEntries.set(domain, { action: 'add', entry });
    }
    
    // Process pending deletes
    for (const domain of this.pendingDeletes) {
      const walEntry = {
        action: 'remove' as const,
        domain,
        timestamp: Date.now()
      };
      operations.push(JSON.stringify(walEntry));
      this.walEntries.set(domain, { action: 'remove' });
    }
    
    // Write to WAL if we have operations
    if (operations.length > 0) {
      await this.ensureDirectoryExists();
      await appendFile(this.walFile, operations.join('\n') + '\n');
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
    try {
      // Load existing entries from main file
      const existingEntries = new Map<string, BlacklistEntry>();
      
      try {
        const mainContent = await readFile(this.mainFile, 'utf8');
        const mainData = JSON.parse(mainContent) as BlacklistEntry[];
        
        for (const entry of mainData) {
          existingEntries.set(entry.domain, entry);
        }
      } catch (error) {
        // Main file doesn't exist yet, that's ok
      }
      
      // Apply WAL operations
      for (const [domain, walEntry] of this.walEntries.entries()) {
        if (walEntry.action === 'add' && walEntry.entry) {
          existingEntries.set(domain, walEntry.entry);
        } else if (walEntry.action === 'remove') {
          existingEntries.delete(domain);
        }
      }
      
      // Write compacted data to main file
      const compactedData = Array.from(existingEntries.values());
      await writeFile(this.mainFile, JSON.stringify(compactedData, null, 2));
      
      // Rebuild index
      await this.rebuildIndex();
      
      // Clear WAL
      this.walEntries.clear();
      await writeFile(this.walFile, '');
      
      console.log(`Compacted blacklist: ${compactedData.length} entries`);
      
    } catch (error) {
      console.error('Failed to compact WAL:', error);
    }
  }

  /**
   * Rebuild index from main file
   */
  private async rebuildIndex(): Promise<void> {
    try {
      const content = await readFile(this.mainFile, 'utf8');
      const data = JSON.parse(content) as BlacklistEntry[];
      
      const domains = data.map(entry => entry.domain);
      
      // Update in-memory structures
      this.domainIndex.clear();
      for (const domain of domains) {
        this.domainIndex.set(domain, true);
      }
      
      this.bloomFilter = new Set(domains);
      
      // Save index to file
      const indexData = { domains, lastCompacted: Date.now() };
      await writeFile(this.indexFile, JSON.stringify(indexData));
      
    } catch (error) {
      console.warn('Failed to rebuild index:', error);
    }
  }

  /**
   * List entries (loads from main file + applies WAL)
   */
  async list(category?: string): Promise<BlacklistEntry[]> {
    await this.ensureIndexLoaded();
    
    // Force compaction to get accurate list
    await this.flushPendingOperations();
    
    const entries = new Map<string, BlacklistEntry>();
    
    // Load from main file
    try {
      const content = await readFile(this.mainFile, 'utf8');
      const data = JSON.parse(content) as BlacklistEntry[];
      
      for (const entry of data) {
        entries.set(entry.domain, entry);
      }
    } catch (error) {
      // Main file doesn't exist, that's ok
    }
    
    // Apply WAL operations
    for (const [domain, walEntry] of this.walEntries.entries()) {
      if (walEntry.action === 'add' && walEntry.entry) {
        entries.set(domain, walEntry.entry);
      } else if (walEntry.action === 'remove') {
        entries.delete(domain);
      }
    }
    
    let result = Array.from(entries.values());
    
    if (category) {
      result = result.filter(entry => entry.category === category);
    }
    
    return result.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  }

  async clear(): Promise<void> {
    this.domainIndex.clear();
    this.bloomFilter?.clear();
    this.walEntries.clear();
    this.pendingWrites.clear();
    this.pendingDeletes.clear();
    
    // Clear files
    await this.ensureDirectoryExists();
    await writeFile(this.mainFile, '[]');
    await writeFile(this.walFile, '');
    await writeFile(this.indexFile, '{"domains":[]}');
  }

  async stats(): Promise<BlacklistStats> {
    const entries = await this.list();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const categories: Record<string, number> = {};
    const sources: Record<string, number> = {};
    let recentlyAdded = 0;

    for (const entry of entries) {
      const category = entry.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
      
      sources[entry.source] = (sources[entry.source] || 0) + 1;
      
      if (entry.addedAt.getTime() > oneDayAgo) {
        recentlyAdded++;
      }
    }

    return {
      totalEntries: entries.length,
      categories,
      sources,
      recentlyAdded
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
    await mkdir(this.dataDir, { recursive: true });
  }

  // Additional methods from BaseDriver interface...
  async getBlockingRule(domain: string): Promise<BlacklistEntry | null> {
    const entries = await this.list();
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check exact match first
    const exactMatch = entries.find(entry => entry.domain === normalizedDomain);
    if (exactMatch) return exactMatch;
    
    // Check pattern matches
    for (const entry of entries) {
      if (this.matchesPattern(normalizedDomain, entry.domain)) {
        return entry;
      }
    }
    
    return null;
  }

  async import(entries: BlacklistEntry[]): Promise<number> {
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

  async export(): Promise<BlacklistEntry[]> {
    return this.list();
  }
}