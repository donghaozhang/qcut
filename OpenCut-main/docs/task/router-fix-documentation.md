# Router Fix Documentation

## Issue Description
The TanStack Router is failing to mount properly in the Electron environment, specifically when navigating to the editor route (when clicking "new project" button). The error occurs:

```
Uncaught Error: invariant expected app router to be mounted
```

## Root Cause Analysis
1. **Hash History Issues**: The hash history router may not be properly initialized in Electron's `file://` protocol environment
2. **Route Navigation**: The editor route with dynamic parameters (`/editor/$project_id`) is causing mounting issues
3. **Component Lifecycle**: The router may be trying to mount before the DOM is fully ready

## Current Fix Attempts

### 1. Lazy Router Initialization
- Implemented lazy loading of router instance
- Added DOM readiness checks before router initialization
- Used `useState` and `useEffect` to ensure proper timing

### 2. Error Boundary Implementation
- Added error boundary to root route for better error handling
- Provides fallback UI when router fails

### 3. Suspense Wrapper
- Wrapped RouterProvider in React.Suspense for better loading states

## Solution: Memory History Implementation

Memory history is the most reliable approach for Electron applications as it eliminates file:// protocol conflicts and provides better stability for desktop apps.

### Implementation
```typescript
import { createMemoryHistory } from '@tanstack/react-router'

const router = createRouter({
  routeTree,
  history: createMemoryHistory({
    initialEntries: ['/'],
  }),
  defaultPreload: 'intent',
  context: {},
})
```

### Advantages
- Most reliable for Electron apps - no dependency on URL fragments or browser history
- Navigation state stored in memory, isolated from file:// protocol issues
- No URL changes visible to user (cleaner for desktop app)
- Eliminates hash/browser history conflicts in Electron environment
- Better performance - no DOM manipulation for URL updates

### Files That Need Modification
- `apps/web/src/App.tsx` - Replace hash history with memory history
- `apps/web/src/routes/__root.tsx` - Error boundary implementation (already done)
- `apps/web/src/components/header.tsx` - Fixed nested button warnings (already done)

## Files Modified
- `src/App.tsx` - Router initialization and lazy loading
- `src/routes/__root.tsx` - Error boundary implementation
- `src/components/header.tsx` - Fixed nested button warnings

## Testing Notes
- The router works for basic navigation (home, blog, contributors)
- Issue specifically occurs when clicking "New Project" button
- Error suggests the router is trying to navigate before being fully mounted

## Priority
This is a HIGH priority issue as it blocks the core functionality of creating new projects and accessing the video editor.