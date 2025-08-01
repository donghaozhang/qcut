# Router Context Safety Implementation Tasks

## Overview
Fix TanStack Router "invariant expected app router to be mounted" errors by implementing safe router access patterns across the codebase.

## Task 1: Create useSafeRouter Hook (3 min)
**File**: `apps/web/src/hooks/useSafeRouter.ts` *(new file)*

Create the core hook that safely accesses router context:
```typescript
import { useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'

export function useSafeRouter() {
  let routerContext
  try {
    routerContext = useRouter({ warn: false })
  } catch (e) {
    routerContext = undefined
  }

  const [safeRouter, setSafeRouter] = useState(routerContext ?? null)

  useEffect(() => {
    if (routerContext) {
      setSafeRouter(routerContext)
    }
  }, [routerContext])

  return safeRouter
}
```

## Task 2: Export Router Instance (2 min)
**File**: `apps/web/src/App.tsx`

Export router instance for global access:
```typescript
// Add export after router creation
export { router }
```

## Task 3: Update Projects Route (3 min)
**File**: `apps/web/src/routes/projects.tsx`

Replace `useNavigate` with safe router access:
```typescript
// Replace import
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Replace useNavigate usage (around line 65)
const router = useSafeRouter()

// Replace navigate calls in handleCreateProject (around line 95)
if (!router) return
router.navigate({ to: '/editor/$project_id', params: { project_id: projectId } })
```

## Task 4: Update Editor Route (3 min)
**File**: `apps/web/src/routes/editor.$project_id.tsx`

Add safe router access to main editor route:
```typescript
// Add import
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Add at component start
const router = useSafeRouter()
if (!router) {
  return <div className="flex items-center justify-center min-h-screen">Loading router...</div>
}
```

## Task 5: Update Header Component (2 min)
**File**: `apps/web/src/components/header.tsx`

Check if header uses any router hooks and add safety:
```typescript
// Add import if using router hooks
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Add safety check if using Link or other router hooks
const router = useSafeRouter()
if (!router) return null
```

## Task 6: Update Landing Hero Component (2 min)
**File**: `apps/web/src/components/landing/hero.tsx`

Check and update any router usage:
```typescript
// Add import if using router hooks
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Add safety check before any Link or navigation
const router = useSafeRouter()
if (!router) return null
```

## Task 7: Update Footer Component (2 min)
**File**: `apps/web/src/components/footer.tsx`

Check and update any Link components:
```typescript
// Add import if using Link components
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Wrap Link usage with safety check
const router = useSafeRouter()
if (!router) return null
```

## Task 8: Update Auth Routes (2 min each)
**Files**: 
- `apps/web/src/routes/login.tsx`
- `apps/web/src/routes/signup.tsx`

Add safe router access to auth components:
```typescript
// Add import
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Add safety check if using useNavigate
const router = useSafeRouter()
// Replace navigate calls with router.navigate()
```

## Task 9: Check Timeline Component (3 min)
**File**: `apps/web/src/components/editor/timeline/index.tsx`

Verify if timeline uses router hooks and add safety:
```typescript
// Add import if needed
import { useSafeRouter } from '@/hooks/useSafeRouter'

// Add safety check if using router hooks
const router = useSafeRouter()
```

## Task 10: Update Root Route (2 min)
**File**: `apps/web/src/routes/__root.tsx`

Add better error boundary for router errors:
```typescript
// Enhance error boundary to catch router mounting errors
// Add specific handling for "invariant expected app router to be mounted"
```

## Task 11: Search All Router Hook Usage (3 min)
**Commands**: Terminal

Search for any remaining unsafe router hook usage:
```bash
# From project root
grep -r "useNavigate\|useParams\|useRouter" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Review results and apply useSafeRouter pattern to any missed files.

## Task 12: Test Router Safety (3 min)
**Commands**: Terminal

Build and test the implementation:
```bash
bun run build --force
bun run electron
```

Test clicking projects and navigation to verify no router mounting errors occur.

## Task 13: Add Loading States (2 min)
**Files**: Components using useSafeRouter

Add consistent loading UI for router initialization:
```typescript
// Standard loading pattern
if (!router) {
  return <div className="flex items-center justify-center p-4">Loading...</div>
}
```

## Task 14: Clean Up Debug Logs (1 min)
**File**: `apps/web/src/App.tsx`

Remove the debug logging added earlier:
```typescript
// Remove these lines:
console.log('[DEBUG] Router created:', router)
console.log('[DEBUG] Router state:', router.state)
console.log('[DEBUG] RouterProvider mounted')
console.log('[DEBUG] Router context available:', !!router)
```

## Success Criteria
- ✅ No "invariant expected app router to be mounted" errors
- ✅ Clicking projects navigates successfully to editor
- ✅ All navigation works without crashes
- ✅ Loading states show during router initialization
- ✅ App works in both development and production builds