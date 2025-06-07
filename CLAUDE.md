# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install dependencies**: `bun install`
- **Run development server**: `bun run index.ts`
- **Run with hot reload**: `bun --hot index.ts`
- **Type checking**: `bun run tsc --noEmit` (using TypeScript compiler)

## Architecture

This is a Bun-based SSR (Server-Side Rendering) React application that uses Bun's built-in server capabilities instead of traditional Node.js/Express setups.

### Key Components:

- **Server Entry Point** (`src/index.ts`): Uses `Bun.serve()` with route-based routing and built-in HMR
- **SSR Flow**: `src/view/index.ts` handles server-side rendering using `renderToReadableStream()`
- **Client Hydration**: `src/app/hydrate.tsx` handles client-side hydration with `hydrateRoot()`
- **App Structure**: React components in `src/app/` with server and client entry points
- **Configuration**: Environment-based config in `src/config.ts`

### Path Aliases:
- `@src/*` → `./src/*`
- `@app/*` → `./src/app/*`

## Bun-Specific Patterns

Always use Bun instead of Node.js tooling:
- Use `bun` instead of `node` or `ts-node`
- Use `bun install` instead of npm/yarn/pnpm
- Use `bun test` instead of jest/vitest
- Use `Bun.serve()` instead of Express
- Bun automatically loads .env files

The project uses Bun's native SSR capabilities with React streaming and automatic bundling/transpilation.

## Session Journaling

When the user requests to "journal this session", always:
1. Create a journal entry in `.claude/journals/` with format: `YYYYMMDD_hh:mm:ss_descriptive_title.md`
2. Include comprehensive session overview, accomplishments, technical details, and current state
3. Update this CLAUDE.md file to reflect any new patterns or architectural changes