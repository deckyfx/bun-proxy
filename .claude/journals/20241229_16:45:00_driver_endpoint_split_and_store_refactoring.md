# Driver Endpoint Split and Store Refactoring

**Date:** 2024-12-29 16:45:00  
**Session Type:** Major Architecture Refactoring  
**Focus:** API Endpoint Split + React Store Restructuring

## Session Overview

This session involved a comprehensive refactoring of the driver system, splitting the monolithic `/api/dns/driver` endpoint into specialized endpoints and creating corresponding React stores for better maintainability and organization.

## Accomplishments

### 🔄 **API Endpoint Split**

**Before:**
- Single `/api/dns/driver` endpoint handling all driver operations (logs, cache, blacklist, whitelist)
- POST operations with `scope` parameter to determine driver type
- Monolithic handler functions

**After:**
- **`/api/dns/driver`** - General driver info only (GET)
- **`/api/dns/log`** - Logs driver operations (GET/POST)
- **`/api/dns/cache`** - Cache driver operations (GET/POST)
- **`/api/dns/blacklist`** - Blacklist driver operations (GET/POST)
- **`/api/dns/whitelist`** - Whitelist driver operations (GET/POST)

### 🏗️ **Backend Architecture Improvements**

**Created Shared Utilities:**
- `src/api/dns/utils.ts` - Common driver instance creation functions
- Helper functions for server availability checks
- Response creation utilities
- Eliminated code duplication across endpoints

**Endpoint Structure:**
```typescript
// Each driver endpoint supports:
GET  /api/dns/{driver}     // Get driver info and available options
POST /api/dns/{driver}     // Operations: SET/GET/CLEAR
```

**Operation Patterns:**
```json
// SET operation
{ "method": "SET", "driver": "file", "options": {} }

// GET operation (content retrieval)
{ "method": "GET", "filter": {} }

// CLEAR operation
{ "method": "CLEAR" }
```

### 📱 **React Store Architecture Overhaul**

**Before:**
- Single `driverStore.ts` handling all driver types
- Complex state management with driver scope parameters
- SSE subscriptions mixed with operational logic

**After - Specialized Stores:**

1. **`dnsLogStore.ts`**
   - Dedicated to logs driver operations
   - Real-time log streaming via SSE
   - Methods: `fetchDriverInfo()`, `getContent()`, `setDriver()`, `clearContent()`

2. **`dnsCacheStore.ts`**
   - Cache-specific operations
   - Cache content management
   - SSE updates for cache changes

3. **`dnsBlacklistStore.ts`**
   - Blacklist domain management
   - Domain filtering capabilities
   - Real-time blacklist updates

4. **`dnsWhitelistStore.ts`**
   - Whitelist domain management
   - Exception handling for blocked domains
   - Whitelist content synchronization

5. **`dnsDriverStore.ts`** (renamed from `driverStore.ts`)
   - General driver information only
   - Available drivers and current implementations
   - Simplified to info-only operations

### 🔌 **SSE Integration Per Store**

Each specialized store manages its own SSE subscriptions:

```typescript
// Individual SSE channels per driver type
'dns/log/'       → dnsLogStore
'dns/cache/'     → dnsCacheStore  
'dns/blacklist/' → dnsBlacklistStore
'dns/whitelist/' → dnsWhitelistStore
'dns/log/event'  → Real-time log streaming
```

### 🎯 **Component Updates**

**Updated Components:**
- `LogsDriver.tsx` → Uses `useDnsLogStore`
- `CacheDriver.tsx` → Uses `useDnsCacheStore`
- `BlacklistDriver.tsx` → Uses `useDnsBlacklistStore` (partial)
- `WhitelistDriver.tsx` → Uses `useDnsWhitelistStore` (partial)
- `DNSDriver.tsx` → Uses `useDnsDriverStore`
- `DNS.tsx` → Updated imports and SSE connections

**Interface Simplification:**
```typescript
// Before
interface LogsDriverProps {
  drivers: any;
  loading: boolean;
  onSetDriver: (scope: string, driver: string) => Promise<void>;
}

// After  
interface LogsDriverProps {
  drivers: any;
  loading: boolean;
  // onSetDriver removed - store handles operations
}
```

### 📊 **Type Safety Improvements**

**Driver Config Updates:**
- Changed from `DriverConfig` to `Partial<DriverConfig>` 
- Eliminated mandatory `scope` parameter since endpoints are scope-specific
- Proper TypeScript integration across all stores

### 🛠️ **File Structure Changes**

**New Store Files:**
```
src/app/stores/
├── dnsLogStore.ts         # NEW
├── dnsCacheStore.ts       # NEW  
├── dnsBlacklistStore.ts   # NEW
├── dnsWhitelistStore.ts   # NEW
└── dnsDriverStore.ts      # RENAMED from driverStore.ts
```

**New API Files:**
```
src/api/dns/
├── utils.ts     # NEW - Shared utilities
├── log.ts       # NEW - Logs endpoint
├── cache.ts     # NEW - Cache endpoint
├── blacklist.ts # NEW - Blacklist endpoint
├── whitelist.ts # NEW - Whitelist endpoint
└── driver.ts    # UPDATED - Info only
```

## Technical Highlights

### 🔧 **Shared Utilities Pattern**

Created reusable functions for driver instance creation:
```typescript
export function createLogsDriverInstance(driverName: string, options?: Record<string, any>)
export function createCacheDriverInstance(driverName: string, options?: Record<string, any>)
// ... etc for each driver type
```

### 📡 **Individual SSE Management**

Each store manages its own SSE lifecycle:
```typescript
connectSSE() {
  const contentUnsubscriber = sseClient.subscribe('dns/cache/', (data) => {
    if (data) set({ content: data });
  });
  // Store unsubscribers for cleanup
}
```

### 🎯 **Simplified API Calls**

Direct endpoint usage without scope parameters:
```typescript
// Before
await fetch('/api/dns/driver', { 
  method: 'POST', 
  body: JSON.stringify({ method: 'GET', scope: 'logs' })
});

// After
await fetch('/api/dns/log', { 
  method: 'POST', 
  body: JSON.stringify({ method: 'GET' })
});
```

## Current System State

### ✅ **Completed:**
- All 4 specialized driver stores created and functional
- API endpoints split and tested
- TypeScript compilation passes
- Basic component integration complete
- SSE architecture updated

### 🚧 **Pending:**
- Complete UI component updates for BlacklistDriver and WhitelistDriver
- Add content viewing and management features to cache/blacklist/whitelist components
- Implement filtering and search capabilities in specialized stores
- Add real-time content updates via SSE in all driver components

## Documentation Updates

**Updated `apiroute.txt`:**
- Added all new driver-specific endpoints
- Documented operation patterns and available drivers
- Updated total endpoint count to 18

## Architecture Benefits

1. **Better Separation of Concerns** - Each driver type has dedicated store and endpoint
2. **Improved Maintainability** - Smaller, focused files instead of monolithic structures
3. **Enhanced Type Safety** - Scope-specific types and interfaces
4. **Cleaner SSE Management** - Individual subscriptions per driver type
5. **Simplified API** - Direct endpoint calls without scope routing
6. **Code Reusability** - Shared utilities across all driver endpoints

## Next Steps

1. Complete BlacklistDriver and WhitelistDriver component updates
2. Add comprehensive content management UI for all driver types
3. Implement driver content export/import functionality
4. Add real-time notifications for driver content changes
5. Optimize SSE connection management for better performance

---

This refactoring significantly improves the codebase organization and sets up a scalable foundation for future driver-related features.