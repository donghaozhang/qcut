# Project Click Navigation Error

## Problem Description

When clicking on an existing project to open it, the app encounters router mounting errors that prevent proper navigation to the editor page.

## Deep Root Cause Analysis

### The Real Issue: Router Context Timing
The error `invariant expected app router to be mounted` occurs because **editor components are trying to access TanStack Router context before the router is fully initialized**. This is a **React context timing issue**, not a routing configuration problem.

### Why Hash History Didn't Fix It
Our hash history implementation in `App.tsx` fixed the history type, but the underlying problem is that some components mount and try to use router hooks (`useNavigate`, `useParams`, `Link`) before the RouterProvider context is available.

### Critical Timing Sequence:
1. User clicks project → Navigation starts
2. React begins mounting editor route components
3. **Some component tries to access router context** 
4. **Router context not yet available** → Error thrown
5. React Error Boundary catches error → Navigation appears to fail

## Error Analysis

### What Happens When You Click a Project:

1. ✅ **Project ID Retrieved**: The project ID is correctly identified (`1c24d4bb-f926-4804-8b73-f42256edcbe4`)
2. ✅ **Route Parameters Work**: `useParams()` successfully gets the project_id 
3. ✅ **Navigation Initiated**: App attempts to navigate to `/editor/[project_id]`
4. ✅ **Project Loading**: Project data is successfully loaded from storage
5. ❌ **Router Mounting Error**: Router fails with "invariant expected app router to be mounted"

### The Core Error:
```
Uncaught Error: invariant expected app router to be mounted
    at Object.b (index-C_ln-beA.js:705:7131)
    at JCe (index-C_ln-beA.js:705:8437)
```

## Root Cause Analysis

### Why This Happens:
1. **Hash History Not Applied**: Despite implementing hash history, the error persists
2. **Component Mounting Order**: Some components try to access router context before it's ready
3. **React Error Boundary**: The error triggers React's error boundary, causing component tree recreation
4. **Production Build Issue**: The error occurs in the minified production build, making debugging difficult

### Timing Issue:
- Project navigation works initially (route params are retrieved)
- Error occurs when specific components in the editor try to access router hooks
- The component `JCe` (minified name) is failing to access router context

## Impact on User Experience

### What Users See:
- Clicking a project appears to "not work"
- No visual feedback that navigation occurred
- App may appear frozen or unresponsive
- Error boundary may show a white screen or fallback UI

### What Actually Happens:
- Navigation does occur (project ID is passed correctly)
- Project data loads successfully
- Router context becomes unavailable mid-navigation causing the error

## Technical Details

### Affected Components:
- Editor page components (specifically the minified `JCe` component)
- Components that use TanStack Router hooks (`useNavigate`, `useParams`, `Link`)
- React Suspense boundaries in the editor

### Storage System Status:
- ✅ IndexedDB works correctly in this case
- ✅ Project data loads without issues
- ✅ Media and timeline databases initialize properly

## Immediate Workaround

### For Users:
1. **Refresh the page** after clicking a project
2. **Direct URL navigation** works: manually type `file:///path/index.html#/editor/[project-id]`
3. **Browser reload** clears the router state and allows proper mounting

### For Developers:
1. Check if build includes latest hash history changes
2. Ensure all router-dependent components are wrapped in proper error boundaries
3. Consider adding router readiness checks before rendering components

## Files to Investigate

### Primary Suspects (Most Likely Causes):

#### 1. **Router Provider Setup**
**File**: `apps/web/src/App.tsx` (lines 25-46)
- **Issue**: Router context may not be properly available to child components
- **Check**: RouterProvider wrapper, router registration timing
- **Current Code**: Router created outside component but context timing issues persist

#### 2. **Editor Route Component**  
**File**: `apps/web/src/routes/editor.$project_id.tsx`
- **Issue**: Main editor component likely contains the failing component (`JCe` in minified code)
- **Check**: All router hook usage (`useNavigate`, `useParams`, `Link` components)
- **Suspected Lines**: Any component using router hooks without guards

#### 3. **Root Route Configuration**
**File**: `apps/web/src/routes/__root.tsx` 
- **Issue**: Root route error boundaries or context setup issues
- **Check**: Error boundary implementation, context providers

#### 4. **Editor Sub-Components**
**Files to check**:
- `apps/web/src/components/editor/header.tsx`
- `apps/web/src/components/editor/timeline/index.tsx`  
- `apps/web/src/components/editor/properties-panel/index.tsx`
- `apps/web/src/components/editor/media-panel/views/media.tsx`

**Issue**: Any of these components using router hooks without proper context guards

## Debugging Strategy

### Immediate Debug Steps:

#### Step 1: Add Router Context Logging
**File**: `apps/web/src/App.tsx`
```typescript
// Add after router creation
console.log('[DEBUG] Router created:', router)
console.log('[DEBUG] Router state:', router.state)

// Add in component
useEffect(() => {
  console.log('[DEBUG] RouterProvider mounted')
  console.log('[DEBUG] Router context available:', !!router)
}, [])
```

#### Step 2: Identify Failing Component  
**Files**: All editor components
```typescript
// Add to suspected components
import { useRouter } from '@tanstack/react-router'

const MyComponent = () => {
  try {
    const router = useRouter()
    console.log('[DEBUG] Router context OK in MyComponent')
  } catch (error) {
    console.error('[DEBUG] Router context FAILED in MyComponent:', error)
  }
}
```

#### Step 3: Add Router Guards
**Files**: Components using router hooks
```typescript
// Guard pattern for router hooks
const MyComponent = () => {
  const [routerReady, setRouterReady] = useState(false)
  
  useEffect(() => {
    // Check if router is available
    try {
      const router = useRouter()
      if (router) setRouterReady(true)
    } catch {
      console.warn('Router not ready yet')
    }
  }, [])
  
  if (!routerReady) return <div>Loading...</div>
  
  // Safe to use router hooks here
}
```

#### Step 4: Investigate Error Boundary
**File**: `apps/web/src/routes/__root.tsx`
- **Check**: Error boundary catching and handling
- **Add**: Better error logging to identify exact component
- **Debug**: Error boundary props and fallback UI

### Advanced Debugging:

#### Component Mount Order Analysis
Add console logs to identify mounting sequence:
```typescript
// In each suspected component
console.log('[MOUNT] ComponentName mounting')
```

#### Router State Monitoring
```typescript
// In App.tsx
router.subscribe(() => {
  console.log('[DEBUG] Router state changed:', router.state)
})
```

## Solution Approaches (Ranked by Effectiveness)

### Approach 1: Router Context Guards (Recommended)
**Files**: All editor components using router hooks
- Add router availability checks before using hooks
- Render loading state while router initializes
- Prevent hooks from being called before context is ready

### Approach 2: Component Lazy Loading
**File**: `apps/web/src/routes/editor.$project_id.tsx`
- Use React.lazy() for editor components
- Ensure router is mounted before loading heavy components
- Add Suspense boundaries with proper fallbacks

### Approach 3: Router Provider Restructure
**File**: `apps/web/src/App.tsx`
- Move router creation inside component with proper lifecycle
- Add router ready state management
- Ensure provider is fully mounted before rendering children

### Approach 4: Error Boundary Enhancement
**Files**: Route components and `__root.tsx`  
- Add specific router error handling
- Implement retry mechanisms for router mounting failures
- Better error messages for debugging

## Critical Files That Need Changes

1. **`apps/web/src/App.tsx`** - Router provider and context setup
2. **`apps/web/src/routes/editor.$project_id.tsx`** - Main editor route
3. **All editor components** - Add router hook guards
4. **`apps/web/src/routes/__root.tsx`** - Error boundary improvements

The fix likely requires **multiple files** to be updated with router context guards and better error handling.