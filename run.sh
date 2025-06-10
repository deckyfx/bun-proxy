#!/bin/bash

# Portable run script for Bun Proxy
# Works even without Bun installed (using compiled binary)

set -e

echo "🚀 Bun Proxy Launcher"
echo "===================="

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create data directory structure
create_data_dirs() {
    echo "📋 Setting up data directories..."
    
    mkdir -p ./data/dns-cache
    mkdir -p ./data/blacklist
    mkdir -p ./data/whitelist
    mkdir -p ./data/logs
    
    echo "✅ Data directories created"
}

# Function to create default DNS config
create_dns_config() {
    if [ ! -f "./data/dns-config.json" ]; then
        echo "📋 Creating default DNS configuration..."
        
        cat > ./data/dns-config.json << 'EOF'
{
  "server": {
    "port": 53,
    "nextdnsConfigId": null,
    "enableWhitelist": false,
    "secondaryDns": "cloudflare"
  },
  "drivers": {
    "logs": {
      "type": "console",
      "options": {}
    },
    "cache": {
      "type": "inmemory",
      "options": {}
    },
    "blacklist": {
      "type": "inmemory",
      "options": {}
    },
    "whitelist": {
      "type": "inmemory",
      "options": {}
    }
  },
  "lastUpdated": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
        
        echo "✅ DNS configuration created"
    else
        echo "✅ DNS configuration exists"
    fi
}

# Function to run database setup
setup_database() {
    if [ ! -f "./data/data.db" ]; then
        echo "📋 Database not found, setting up..."
        
        if command_exists bun; then
            echo "📋 Running database migrations..."
            bun run migrate
            
            echo "📋 Running database seeds..."
            bun run seed
            
            echo "✅ Database setup completed"
        else
            echo "⚠️  Bun not found - database will be created on first run"
        fi
    else
        echo "✅ Database exists"
    fi
}

# Function to run the application
run_app() {
    # Try to find and run binary first
    if [ -f "./bun-proxy" ]; then
        echo "🚀 Starting Bun Proxy binary..."
        ./bun-proxy
    elif [ -f "./bun-proxy-debug" ]; then
        echo "🚀 Starting Bun Proxy debug binary..."
        ./bun-proxy-debug
    elif command_exists bun; then
        echo "🚀 Starting Bun Proxy with Bun runtime..."
        bun run start
    else
        echo "❌ No binary found and Bun not installed!"
        echo ""
        echo "Please either:"
        echo "  1. Install Bun: curl -fsSL https://bun.sh/install | bash"
        echo "  2. Or build binary first: bun run build"
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    
    # Check system
    echo "📋 System: $(uname -s) $(uname -m)"
    if [ "$(id -u)" -eq 0 ]; then
        echo "📋 Running as root (can use port 53)"
    else
        echo "⚠️  Not running as root (may need port > 1024)"
    fi
    echo ""
    
    # Setup
    create_data_dirs
    create_dns_config
    setup_database
    
    echo ""
    echo "✅ Setup completed!"
    echo ""
    
    # Run
    run_app
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi