# Router Error After New Project Click

## Implementation Tasks

### Task 1: Import Hash History (2 min)
**File**: `apps/web/src/App.tsx`
- Add import: `import { createHashHistory } from '@tanstack/react-router'`
- Remove import: `import { createMemoryHistory } from '@tanstack/react-router'`

### Task 2: Replace Router History (3 min)
**File**: `apps/web/src/App.tsx`
- Replace `createMemoryHistory` with `createHashHistory`
- Remove `initialEntries` parameter (not needed for hash history)
- Update router creation to use `history: createHashHistory()`

### Task 3: Test Development Mode (3 min)
**Commands**: Terminal
- Run: `cd apps/web && bun dev`
- Open: http://localhost:5174
- Test: Click "New Project" button
- Verify: URL changes to `http://localhost:5174/#/editor/new`

### Task 4: Build and Test Production (5 min)
**Commands**: Terminal
- Run: `bun run build`
- Run: `bun run electron`
- Test: Click "New Project" button
- Verify: No router mounting errors
- Check: URL format is `file:///path/index.html#/editor/[project-id]`

## Problem Description
When clicking the "New Project" button, the following error occurs:
```
Uncaught Error: invariant expected app router to be mounted
```

## Root Cause Analysis

### 1. **Storage Works Fine**
The logs show our Electron IPC storage implementation is working correctly:
- ✅ Projects are saved successfully
- ✅ Projects are loaded successfully
- ✅ Navigation to project editor happens

### 2. **The Real Issue: TanStack Router in Production Build**
The error happens because TanStack Router has different behavior in production builds when using memory history.

## Why This Happens

### Development vs Production
- **Development**: Router initialization is more forgiving
- **Production**: Router requires stricter initialization timing

### Current Flow
1. User clicks "New Project"
2. Project is created and saved ✅
3. Navigation attempts to `/editor/[project_id]`
4. Router component tries to access router instance
5. **ERROR**: Router instance not properly initialized in production build

## The Problem Code

In `apps/web/src/components/editor/header.tsx`:
```tsx
<Link
  className="h-9 px-4"
  to="/editor/$project_id"
  params={{ project_id: "new" }}
>
```

This Link component from TanStack Router tries to access the router instance before it's ready in production.

## Solution: Use Hash History (Most Electron-Friendly)

Hash history is the most stable routing solution for Electron applications because:
- Works reliably with `file://` protocol
- No timing issues with router mounting
- Better compatibility with Electron's navigation model

### Implementation

Update `apps/web/src/App.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createHashHistory } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create router with hash history for Electron
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  context: {},
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Small delay to ensure DOM and Electron environment is ready
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  if (!isReady) {
    return <div className="flex items-center justify-center min-h-screen">Initializing...</div>
  }

  return (
    <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <RouterProvider router={router} />
    </React.Suspense>
  )
}

export default App
```

### Benefits of Hash History
1. **Stable in Electron**: No mounting errors in production builds
2. **File Protocol Compatible**: Works perfectly with `file://` URLs
3. **Simple Navigation**: URLs like `file:///path/index.html#/editor/project-id`
4. **No Server Required**: Perfect for desktop applications

## Immediate Workaround
While the error appears, the app still functions. The project is created and can be accessed by:
1. Refreshing the page
2. Navigating back to projects list
3. Clicking on the newly created project

## Testing After Implementation
1. Update `App.tsx` with hash history
2. Build the app: `bun run build`
3. Run Electron: `bun run electron`
4. Click "New Project" - should navigate without errors
5. Verify project is created and editable
6. Check URL format: `file:///path/index.html#/editor/[project-id]`