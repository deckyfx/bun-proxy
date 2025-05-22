# Use official Bun image
FROM oven/bun:latest

# Create app directory inside container
WORKDIR /app

# Copy source code & scripts
COPY . .

# Install dependencies if you have (React dashboard & others)
RUN bun install

# Build React dashboard (if you want to pre-build)
RUN bun run build

# Expose port, configurable via env PORT
EXPOSE 3000

# Run your Bun server
CMD ["bun", "run", "server.ts"]