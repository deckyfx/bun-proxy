# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install dependencies**: `bun install`
- **Run development server**: `bun run dev`
- **Run with hot reload**: `bun --hot run src/index.ts`
- **Build Tailwind CSS**: `bun run build:tailwind`
- **Type checking**: `bun run tsc --noEmit` (using TypeScript compiler)
- **Test server**: `bun run test:serverhit` (starts server, tests DNS, analyzes logs)
- **Quick DNS test**: `bun run test:hit` (tests DNS server that's already running)

## Architecture

This is a Bun-based SSR (Server-Side Rendering) React application that uses Bun's built-in server capabilities with a modern UI component system.

## UI System

### Styling
- **Tailwind CSS v4.1.8** for utility-first styling
- **Self-hosted Inter font** (Tailwind's recommended typeface)
- **CSS location**: `src/app/assets/styles/`
- **Build command**: `bun run build:tailwind`
- **Developer Guidelines**: 
  - Use `@app/utils/cn` when writing Tailwind classes
  - If there are more than 1 class names, use an array for better readability

### Component Techniques
- Use double span method for button icons and button caption for out custom ripple button

## Session Journaling

When the user requests to "journal this session", always:
1. Create a journal entry in `.claude/journals/` with format: `YYYYMMDD_hh:mm:ss_descriptive_title.md`
2. Include comprehensive session overview, accomplishments, technical details, and current state
3. Update this CLAUDE.md file to reflect any new patterns or architectural changes

## SSE Event System Architecture

The application now uses a unified, event-driven SSE system:

### Unified SSE Endpoint
- **Single Connection**: `/api/sse/stream` replaces multiple legacy endpoints
- **Channel-Based Routing**: Events routed by path structure (`dns/status`, `dns/log/event`, etc.)
- **Event-Driven**: No wasteful polling - events only emitted when changes occur

### SSE Singletons
- **SSEClient** (`src/utils/SSEClient.ts`): Client-side singleton with auto-connection management
- **SSEResponder** (`src/utils/SSEResponder.ts`): Server-side singleton for broadcasting events
- **DNSEventService** (`src/dns/DNSEventService.ts`): Event orchestration service

### Channel Structure
- `dns/info` - DNS configuration changes (event-triggered)
- `dns/status` - DNS server start/stop events
- `dns/log/event` - Real-time log streaming
- `dns/log/`, `dns/cache/`, `dns/blacklist/`, `dns/whitelist/` - Driver content updates
- `system/heartbeat` - Connection health (30s intervals)

### Connection Management
- Stores connect via `connectSSE()` method calls
- DNS Store handles connection warnings (Driver Store is silent to prevent duplicates)
- Auto-initialization when first client connects, cleanup when last disconnects