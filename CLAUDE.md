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

### Key Components:

- **Server Entry Point** (`src/index.ts`): Uses `Bun.serve()` with route-based routing and built-in HMR
- **SSR Flow**: `src/view/index.ts` handles server-side rendering using `renderToReadableStream()`
- **Client Hydration**: `src/app/hydrate.tsx` handles client-side hydration with `hydrateRoot()`
- **App Structure**: React components in `src/app/` with server and client entry points
- **Component Library**: Reusable UI components in `src/app/components/`
- **State Management**: Zustand stores in `src/app/stores/`
- **Configuration**: Environment-based config in `src/config.ts`

### Path Aliases:
- `@src/*` → `./src/*`
- `@app/*` → `./src/app/*`
- `@db/*` → `./src/db/*`

## UI System

### Styling
- **Tailwind CSS v4.1.8** for utility-first styling
- **Self-hosted Inter font** (Tailwind's recommended typeface)
- **CSS location**: `src/app/assets/styles/`
- **Build command**: `bun run build:tailwind`

### Component Library
- **Button**: Reusable button with variants, sizes, loading states, and icons
- **FloatingLabelInput**: Modern input with animated floating labels and validation
- **Icon**: Material Icons integration with size customization

### Validation System
- **Centralized validation**: `src/app/stores/validationStore.ts` using Zustand
- **Email validation**: Real-time email format checking
- **Password confirmation**: Cross-field validation for signup forms
- **Error display**: Integrated with FloatingLabelInput component

## Bun-Specific Patterns

Always use Bun instead of Node.js tooling:
- Use `bun` instead of `node` or `ts-node`
- Use `bun install` instead of npm/yarn/pnpm
- Use `bun test` instead of jest/vitest
- Use `Bun.serve()` instead of Express
- Bun automatically loads .env files

The project uses Bun's native SSR capabilities with React streaming and automatic bundling/transpilation.

## Development Patterns

### Component Creation
- Place reusable components in `src/app/components/`
- Export from `src/app/components/index.ts`
- Use TypeScript interfaces for props
- Implement proper error and loading states

### Form Validation
- Use `useValidationStore()` for validation logic
- Implement real-time validation with onChange handlers
- Use FloatingLabelInput for consistent form styling
- Handle error states with proper visual feedback

### Styling Guidelines
- Use Tailwind utility classes for styling
- Avoid inline styles except for dynamic values
- Use the Button component for all interactive buttons
- Implement proper focus and disabled states

## Developer Guidelines

### Code Quality Standards
After modifying any TypeScript files, ALWAYS run:
1. **Type checking**: `bun run tsc --noEmit` to ensure no TypeScript errors
2. **Code formatting**: Run prettier/formatter to maintain consistent code style

These checks are mandatory before considering any task complete. Fix all TypeScript errors and formatting issues immediately after making changes.

### Testing
- **`bun run test:serverhit`**: Comprehensive server test that starts the dev server, runs DNS tests, and generates `./server.log` and `./client.log` for analysis
- **`bun run test:hit`**: Quick DNS test for already running server
- **Log analysis**: After running `test:serverhit`, analyze `./server.log` and `./client.log`, then remove them
- **"try hit" command**: When user says "try hit", run `test:serverhit`, analyze logs, then clean up

## DNS Driver System

### Driver API Endpoints
- **GET /api/dns/driver**: Returns current driver configuration and available drivers
- **POST /api/dns/driver**: Handles driver operations with method field:
  - `method: "SET"` - Update driver configuration (scope, driver, options)
  - `method: "GET"` - Retrieve driver content with filtering

### Driver Architecture
- **Driver Types**: logs, cache, blacklist, whitelist
- **Default Configuration**: 
  - Logs: Console driver
  - Cache/Blacklist/Whitelist: InMemory drivers
- **Static Constants**: Each driver class has `static readonly DRIVER_NAME` property
- **State Persistence**: DNS Manager stores last used driver configuration

### Component Structure
DNS page split into specialized components:
- `DNSControl.tsx` - Server start/stop, port management
- `DNSConfig.tsx` - NextDNS settings, whitelist configuration
- `DNSDriver.tsx` - Driver selection and content management

### State Management
- **DNS Store**: Server settings, configuration, status polling
- **Driver Store**: Driver configuration, content polling, error handling
- **Auto-polling**: Driver content refreshes every 10 seconds when server active

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