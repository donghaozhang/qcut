# Router Error After New Project Click

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

## Solutions

### Solution 1: Add Production-Ready Router Check (Recommended)
Update `apps/web/src/App.tsx`:
```typescript
import React, { useEffect, useState } from 'react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createMemoryHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// Create router outside component
const memoryHistory = createMemoryHistory({
  initialEntries: ['/'],
})

const router = createRouter({
  routeTree,
  history: memoryHistory,
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
  const [isRouterReady, setIsRouterReady] = useState(false)

  useEffect(() => {
    // Ensure router is fully initialized
    router.mount()
    setIsRouterReady(true)
    
    return () => {
      router.unmount()
    }
  }, [])

  if (!isRouterReady) {
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

### Solution 2: Use Programmatic Navigation
Instead of using `<Link>` component, use programmatic navigation:

Update `apps/web/src/components/editor/header.tsx`:
```typescript
import { useNavigate } from '@tanstack/react-router'

// In component:
const navigate = useNavigate()

const handleNewProject = () => {
  navigate({ to: '/editor/$project_id', params: { project_id: 'new' } })
}

// Replace Link with:
<Button
  onClick={handleNewProject}
  variant="ghost"
  size="sm"
  className="h-9 px-4"
>
  <Plus className="h-4 w-4 mr-2" />
  New Project
</Button>
```

### Solution 3: Use Hash History (Most Electron-Friendly)
Update to use hash history which is more stable in Electron:

```typescript
import { createHashHistory } from '@tanstack/react-router'

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  context: {},
})
```

## Immediate Workaround
While the error appears, the app still functions. The project is created and can be accessed by:
1. Refreshing the page
2. Navigating back to projects list
3. Clicking on the newly created project

## Recommended Fix Priority
1. **First**: Implement Solution 1 (Router initialization check)
2. **Then**: Consider Solution 3 (Hash history) for better Electron compatibility
3. **Optional**: Solution 2 for specific navigation needs

## Testing After Fix
1. Build the app: `bun run build`
2. Run Electron: `bun run electron`
3. Click "New Project" - should navigate without errors
4. Verify project is created and editable