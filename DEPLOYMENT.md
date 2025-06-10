# 🚀 Bun Proxy Deployment Guide

This guide covers how to deploy Bun Proxy in various environments with the new portable bootstrap system.

## 📦 Quick Start (Portable Binary)

The application now includes an automatic bootstrap system that ensures it's ready to run anywhere:

### 1. Build the Binary
```bash
bun run build
```

### 2. Deploy & Run
Copy the binary and run script to your target system:

```bash
# Copy files
cp bun-proxy /target/system/
cp run.sh /target/system/

# Run (creates all necessary directories and database automatically)
./run.sh
```

**That's it!** The bootstrap system automatically:
- ✅ Creates `./data` directory structure
- ✅ Sets up database with migrations and seeds
- ✅ Creates default DNS configuration  
- ✅ Handles permissions and platform differences

## 🛠 Development Setup

### Prerequisites
- Bun runtime installed
- Git

### Setup
```bash
git clone <repository>
cd bun-proxy

# Install dependencies
bun install

# Run development server (bootstrap runs automatically)
bun run dev
```

## 📋 Available Scripts

| Script | Description | Bootstrap |
|--------|-------------|-----------|
| `bun run dev` | Development with hot reload | ✅ Auto |
| `bun run start` | Production with Bun runtime | ✅ Auto |
| `bun run build` | Build portable binary | ✅ Auto |
| `bun run bootstrap` | Manual bootstrap only | ✅ Manual |
| `bun run run-binary` | Run built binary with bootstrap | ✅ Auto |
| `./run.sh` | Shell script (works without Bun) | ✅ Auto |

## 🗂 Directory Structure

After bootstrap, the application creates:

```
./data/
├── .gitkeep              # Keeps directory in git
├── data.db              # SQLite database (auto-created)
├── dns-config.json      # DNS server configuration
├── dns-cache/           # Cache driver files
├── blacklist/           # Blacklist driver files  
├── whitelist/           # Whitelist driver files
└── logs/                # Log driver files
```

## 🔧 Configuration Options

### DNS Configuration (`./data/dns-config.json`)

The bootstrap creates a default configuration that can be modified:

```json
{
  "server": {
    "port": 53,
    "nextdnsConfigId": null,
    "enableWhitelist": false,
    "secondaryDns": "cloudflare"
  },
  "drivers": {
    "logs": { "type": "console", "options": {} },
    "cache": { "type": "inmemory", "options": {} },
    "blacklist": { "type": "inmemory", "options": {} },
    "whitelist": { "type": "inmemory", "options": {} }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DNS_PROXY_PORT` | `53` | DNS server port |
| `NEXTDNS_CONFIG_ID` | `null` | NextDNS configuration ID |
| `AUTH_SECRET` | auto-generated | JWT secret |

## 🐧 Platform-Specific Notes

### Linux
```bash
# For port 53 (requires root)
sudo ./run.sh

# For non-privileged port
sed -i 's/"port": 53/"port": 5353/' ./data/dns-config.json
./run.sh
```

### macOS
```bash
# For port 53 (requires sudo)
sudo ./run.sh

# For non-privileged port
sed -i '' 's/"port": 53/"port": 5353/' ./data/dns-config.json
./run.sh
```

### Windows
```powershell
# Use PowerShell (requires Bun installed)
bun run start

# Or with elevated privileges for port 53
```

## 🚢 Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Copy source and build
COPY . .
RUN bun install
RUN bun run build

# Run with bootstrap
EXPOSE 53/udp
EXPOSE 3000/tcp
CMD ["./run.sh"]
```

Build and run:
```bash
docker build -t bun-proxy .
docker run -p 53:53/udp -p 3000:3000 bun-proxy
```

## 🔍 Troubleshooting

### Database Issues
```bash
# Reset database
rm ./data/data.db
bun run bootstrap  # Recreates database
```

### Port Permission Issues
```bash
# Check if port 53 is available
sudo netstat -tlnup | grep :53

# Use alternative port
sed -i 's/"port": 53/"port": 5353/' ./data/dns-config.json
```

### Missing Dependencies
```bash
# Clean reinstall
rm -rf node_modules bun.lock
bun install
bun run bootstrap
```

## 📊 Performance Optimization

### File Driver Performance
For large blacklists/whitelists, use optimized file drivers:

```json
{
  "drivers": {
    "blacklist": { "type": "optimized-file", "options": {} },
    "whitelist": { "type": "optimized-file", "options": {} },
    "cache": { "type": "optimized-file", "options": {} }
  }
}
```

**Benefits:**
- 100x faster lookups for large lists
- 10x less memory usage
- Crash-resistant with WAL logging

### Production Recommendations
- Use `sqlite` drivers for persistence
- Set appropriate cache TTL values
- Monitor `./data/logs/` directory size
- Use `optimized-file` for 10K+ domain lists

## 🚀 CI/CD Integration

### GitHub Actions Example
```yaml
name: Build and Deploy

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      - run: bun run build
      
      - name: Upload binary
        uses: actions/upload-artifact@v3
        with:
          name: bun-proxy-binary
          path: |
            bun-proxy
            run.sh
```

The bootstrap system makes deployment incredibly simple - just copy the binary and run script to any system! 🎉