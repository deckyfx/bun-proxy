#!/usr/bin/env bun

/**
 * Portable run script for the compiled binary
 * 
 * This script ensures the binary is ready to run by:
 * 1. Running bootstrap to set up directories and database
 * 2. Then executing the binary
 */

import { bootstrap } from './bootstrap';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

async function main() {
  console.log('🚀 Preparing to run Bun Proxy...\n');
  
  // Run bootstrap first
  await bootstrap();
  
  console.log('Starting Bun Proxy binary...\n');
  
  // Find the binary
  const binaryPaths = ['./bun-proxy', './bun-proxy-debug'];
  let binaryPath: string | null = null;
  
  for (const path of binaryPaths) {
    if (existsSync(path)) {
      binaryPath = path;
      break;
    }
  }
  
  if (!binaryPath) {
    console.error('❌ Binary not found! Please run "bun run build" first.');
    process.exit(1);
  }
  
  // Execute the binary
  const childProcess = spawn(binaryPath, [], {
    stdio: 'inherit',
    shell: false
  });
  
  childProcess.on('close', (code: number | null) => {
    console.log(`\n📋 Bun Proxy exited with code ${code}`);
    process.exit(code || 0);
  });
  
  childProcess.on('error', (error: Error) => {
    console.error('❌ Failed to start binary:', error.message);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n📋 Shutting down gracefully...');
    childProcess.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n📋 Shutting down gracefully...');
    childProcess.kill('SIGTERM');
  });
}

if (import.meta.main) {
  main().catch(console.error);
}