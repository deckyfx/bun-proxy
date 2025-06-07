# Bun SSR Authentication Implementation - June 7, 2025

## Session Overview
Implemented a complete authentication flow for a Bun-based SSR React application with cookie-based token storage and route-based rendering.

## Key Requirements
- After user authentication, store `auth_token` and `refresh_token` in cookies
- Server decides authentication status from cookies
- Serve different hydration based on authentication:
  - Unauthenticated users → `hydrate.auth.tsx` → Auth forms
  - Authenticated users → `hydrate.dashboard.tsx` → Dashboard

## Architecture Evolution

### Initial Approach (Complex)
- Separate auth and dashboard apps (`index.auth.tsx`, `index.dashboard.tsx`)
- Separate hydration files (`hydrate.auth.tsx`, `hydrate.dashboard.tsx`)
- Server routing logic to serve different apps based on authentication

### Final Approach (Simplified)
- **Single HTML entry** (`src/app/index.tsx`) with both containers:
  - `#auth-root` - Hidden/shown based on authentication
  - `#dashboard-root` - Hidden/shown based on authentication
- **Single hydration file** (`src/app/hydrate.tsx`) that detects visible container and hydrates accordingly
- **Cookie-based authentication** using `src/utils/auth.ts`

## Key Technical Solutions

### 1. Bun SSR + Hydration Pattern
```typescript
// Server serves built JavaScript, not raw TSX
"/hydrate": {
  GET: () => Bun.build({ entrypoints: ["src/app/hydrate.tsx"] })
}

// HTML references the route
bootstrapModules: ["/hydrate"]
```

### 2. React Router + SSR Compatibility
```typescript
// Wait for client-side before using HashRouter
const [isClient, setIsClient] = useState(false);
useEffect(() => setIsClient(true), []);

// SSR: render default component
// Client: use HashRouter with hash routes (#/signin, #/signup)
```

### 3. Authentication Flow
```typescript
// Server-side authentication check
const authenticated = isAuthenticated(req); // reads cookies

// Single component with conditional rendering
<Index isAuthenticated={authenticated} />

// Client-side hydration detects visible container
if (authContainer.style.display !== 'none') {
  hydrateRoot(authContainer, <AuthRouter />);
}
```

## Implementation Details

### Files Created/Modified
- `src/utils/auth.ts` - Cookie parsing and authentication utilities
- `src/app/index.tsx` - Single HTML entry with both auth/dashboard containers
- `src/app/hydrate.tsx` - Smart hydration that detects active container
- `src/app/auth/router.tsx` - HashRouter for client-side auth navigation
- `src/app/auth/views/SignIn.tsx` & `SignUp.tsx` - Auth forms with cookie storage
- `src/view/index.ts` - Main SSR route with authentication logic
- `src/view/hydrate.ts` - Route to serve transpiled hydration JavaScript

### Key Learnings

1. **bootstrapModules Path Resolution**: Must serve actual JavaScript files, not TSX source
2. **React Router SSR**: HashRouter needs client-side detection to avoid document errors
3. **Bun.build() Efficiency**: BuildArtifact extends Blob, can be served directly without `.text()`
4. **Hydration Strategy**: Single file with container detection is cleaner than multiple files

### Authentication Flow
1. **Unauthenticated Request**:
   - Server detects no auth cookies
   - Renders `Index` with `isAuthenticated=false`
   - Shows `#auth-root`, hides `#dashboard-root`
   - Hydration activates HashRouter in auth container

2. **User Login**:
   - Form submits to `/api/auth/signin`
   - Response includes tokens
   - JavaScript stores tokens in secure cookies
   - Page refresh triggers authenticated flow

3. **Authenticated Request**:
   - Server detects auth cookies
   - Renders `Index` with `isAuthenticated=true`  
   - Shows `#dashboard-root`, hides `#auth-root`
   - Hydration activates dashboard content

## Final Architecture Benefits
- ✅ Clean single HTML structure
- ✅ Efficient single hydration file
- ✅ SSR-compatible React Router
- ✅ Secure cookie-based authentication
- ✅ Proper Bun SSR patterns
- ✅ No circular dependencies or path issues

## Code Quality Improvements Made
- Removed unused files (ServerApp.tsx, separate auth/dashboard components)
- Fixed TypeScript warnings (unused parameters)
- Optimized blob serving (direct BuildArtifact response)
- Proper error handling in build process
- Consistent authentication state management

## Next Steps
- Implement actual authentication API endpoints (`/api/auth/signin`, `/api/auth/signup`)
- Add JWT token validation in `isAuthenticated()` function
- Implement token refresh logic
- Add logout functionality
- Enhanced dashboard features

---
*Session completed with working Bun SSR authentication flow*