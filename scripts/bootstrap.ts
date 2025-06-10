#!/usr/bin/env bun

/**
 * Bootstrap script to ensure the application is portable and ready to run
 * 
 * This script:
 * 1. Creates ./data directory if it doesn't exist
 * 2. Checks if database exists, runs migrations/seeds if needed
 * 3. Creates default DNS configuration if missing
 * 4. Sets up initial directory structure
 */

import { existsSync } from 'fs';
import { mkdir, access, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step: string) {
  log(`📋 ${step}`, 'blue');
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn(command, args, { 
      stdio: 'inherit',
      shell: true 
    });
    
    process.on('close', (code) => {
      resolve(code === 0);
    });
    
    process.on('error', (error) => {
      logError(`Failed to run command: ${command} ${args.join(' ')}`);
      logError(error.message);
      resolve(false);
    });
  });
}

async function ensureDataDirectory(): Promise<void> {
  logStep('Checking data directory structure...');
  
  const dataDir = './data';
  const subdirs = [
    'dns-cache',
    'blacklist', 
    'whitelist',
    'logs'
  ];
  
  // Create main data directory
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
    logSuccess('Created ./data directory');
  } else {
    logSuccess('Data directory exists');
  }
  
  // Create subdirectories for optimized file drivers
  for (const subdir of subdirs) {
    const subdirPath = join(dataDir, subdir);
    if (!existsSync(subdirPath)) {
      await mkdir(subdirPath, { recursive: true });
      logSuccess(`Created ./data/${subdir} directory`);
    }
  }
}

async function ensureDatabase(): Promise<void> {
  logStep('Checking database...');
  
  const dbPath = './data/data.db';
  
  if (!(await fileExists(dbPath))) {
    logWarning('Database not found, running setup...');
    
    // Run database setup (migrations + seeds)
    logStep('Running database migrations...');
    const migrateSuccess = await runCommand('bun', ['run', 'migrate']);
    
    if (!migrateSuccess) {
      logError('Database migration failed!');
      process.exit(1);
    }
    
    logStep('Running database seeds...');
    const seedSuccess = await runCommand('bun', ['run', 'seed']);
    
    if (!seedSuccess) {
      logError('Database seeding failed!');
      process.exit(1);
    }
    
    logSuccess('Database setup completed');
  } else {
    logSuccess('Database exists');
  }
}

async function ensureDNSConfig(): Promise<void> {
  logStep('Checking DNS configuration...');
  
  const configPath = './data/dns-config.json';
  
  if (!(await fileExists(configPath))) {
    logWarning('DNS configuration not found, creating default...');
    
    const defaultConfig = {
      server: {
        port: 53,
        nextdnsConfigId: null,
        enableWhitelist: false,
        secondaryDns: "cloudflare"
      },
      drivers: {
        logs: {
          type: "console",
          options: {}
        },
        cache: {
          type: "inmemory", 
          options: {}
        },
        blacklist: {
          type: "inmemory",
          options: {}
        },
        whitelist: {
          type: "inmemory",
          options: {}
        }
      },
      lastUpdated: new Date().toISOString()
    };
    
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    logSuccess('Created default DNS configuration');
  } else {
    logSuccess('DNS configuration exists');
  }
}

async function createGitignoreEntries(): Promise<void> {
  logStep('Checking .gitignore for data directory...');
  
  const gitignorePath = './.gitignore';
  
  if (await fileExists(gitignorePath)) {
    const { readFile } = await import('fs/promises');
    const gitignoreContent = await readFile(gitignorePath, 'utf-8');
    
    const entries = [
      '# Data directory',
      'data/',
      '!data/.gitkeep',
      '',
      '# Log files',
      '*.log',
      'server.log',
      'client.log'
    ];
    
    let needsUpdate = false;
    const missingEntries: string[] = [];
    
    for (const entry of entries) {
      if (entry && !gitignoreContent.includes(entry)) {
        missingEntries.push(entry);
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      const { appendFile } = await import('fs/promises');
      await appendFile(gitignorePath, '\n' + missingEntries.join('\n') + '\n');
      logSuccess('Updated .gitignore with data directory entries');
    } else {
      logSuccess('Gitignore already configured');
    }
  }
}

async function createDataGitkeep(): Promise<void> {
  const gitkeepPath = './data/.gitkeep';
  
  if (!(await fileExists(gitkeepPath))) {
    await writeFile(gitkeepPath, '# Keep this directory in git\n');
    logSuccess('Created data/.gitkeep file');
  }
}

async function checkSystemRequirements(): Promise<void> {
  logStep('Checking system requirements...');
  
  // Check if running on Windows (might need different port handling)
  const platform = process.platform;
  if (platform === 'win32') {
    logWarning('Running on Windows - DNS server may require administrator privileges for port 53');
  }
  
  // Check if port 53 might be available (Unix-like systems)
  if (platform !== 'win32' && process.getuid && process.getuid() !== 0) {
    logWarning('Not running as root - DNS server will need port > 1024 or use sudo');
  }
  
  logSuccess(`System check completed (${platform})`);
}

async function main(): Promise<void> {
  console.log(`${colors.bold}${colors.blue}🚀 Bun Proxy Bootstrap${colors.reset}`);
  console.log('Ensuring application is ready to run...\n');
  
  try {
    // Run all bootstrap steps
    await ensureDataDirectory();
    await ensureDatabase();
    await ensureDNSConfig();
    await createGitignoreEntries();
    await createDataGitkeep();
    await checkSystemRequirements();
    
    console.log('');
    logSuccess('🎉 Bootstrap completed successfully!');
    console.log('');
    log('Application is ready to run:', 'bold');
    log('  bun run dev     - Start development server', 'green');
    log('  bun run build   - Build production binary', 'green');
    console.log('');
    
  } catch (error) {
    console.log('');
    logError('Bootstrap failed!');
    console.error(error);
    process.exit(1);
  }
}

// Run bootstrap if called directly
if (import.meta.main) {
  main();
}

export { main as bootstrap };