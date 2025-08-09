# Project Click Infinite Loop Debug Plan

## Issue Description
When clicking on a real project, the application crashes with "Maximum update depth exceeded" error. The error occurs in the `IP` component (minified name) which appears to be related to panel resizing and state management.

## Error Analysis

### Key Error Points from Console
1. **Warning**: "The result of getSnapshot should be cached to avoid an infinite loop" (line 3)
2. **Component**: `IP` component at `index-Bf7BUDLy.js:538:29515`
3. **Error Location**: Inside ResizablePanel/PanelGroup components
4. **Trigger**: Happens when clicking/loading a real project

### Call Stack Analysis
```
useSyncExternalStore (line 49) → 
editor-GCJgjtNz.js:3 → 
IP component → 
Maximum update depth exceeded
```

## Console Logging Implementation

### Step 1: Add Debug Wrapper for Panel Store
**File**: `apps/web/src/stores/panel-store.ts`

Add this debug code at the top:
```typescript
// DEBUG: Trace infinite loop on project click
const DEBUG_MODE = true;
let updateCounter = 0;
let lastUpdateTime = Date.now();
const updateHistory: string[] = [];

const debugLog = (source: string, data?: any) => {
  if (!DEBUG_MODE) return;
  
  const now = Date.now();
  const timeDiff = now - lastUpdateTime;
  updateCounter++;
  
  const logEntry = `[${updateCounter}] ${source} +${timeDiff}ms`;
  updateHistory.push(logEntry);
  
  console.log(`🔍 [PanelStore] ${logEntry}`, data || '');
  
  // Detect rapid updates
  if (timeDiff < 10 && updateCounter > 5) {
    console.error('⚠️ RAPID UPDATES DETECTED!', {
      count: updateCounter,
      history: updateHistory.slice(-10),
      source
    });
  }
  
  // Reset counter after 1 second of inactivity
  if (timeDiff > 1000) {
    updateCounter = 0;
    updateHistory.length = 0;
  }
  
  lastUpdateTime = now;
};
```

### Step 2: Instrument Panel Size Setters
**File**: `apps/web/src/stores/panel-store.ts`

Update each setter:
```typescript
setToolsPanel: (size) => {
  debugLog('setToolsPanel:START', { 
    incoming: size, 
    current: get().toolsPanel,
    diff: Math.abs(get().toolsPanel - size)
  });
  
  const roundedSize = Math.round(size * 100) / 100;
  const currentSize = get().toolsPanel;
  
  if (Math.abs(currentSize - roundedSize) > 0.01) {
    debugLog('setToolsPanel:UPDATE', { 
      from: currentSize, 
      to: roundedSize 
    });
    set({ toolsPanel: roundedSize });
    debouncedNormalize(() => get().normalizeHorizontalPanels());
  } else {
    debugLog('setToolsPanel:SKIP', 'Size unchanged');
  }
},

// Similar for setPreviewPanel and setPropertiesPanel
```

### Step 3: Add Project Loading Debug
**File**: `apps/web/src/routes/editor.$project_id.tsx`

Add debug logging:
```typescript
function EditorPage() {
  // Add render counter
  const renderCount = useRef(0);
  renderCount.current++;
  
  console.log(`🎯 [EditorPage] Render #${renderCount.current}`);
  
  const { project_id } = Route.useParams();
  console.log(`🎯 [EditorPage] Project ID: ${project_id}`);
  
  // Log panel store subscription
  const {
    toolsPanel,
    previewPanel,
    propertiesPanel,
    normalizeHorizontalPanels,
    // ... rest
  } = usePanelStore();
  
  console.log(`🎯 [EditorPage] Panel sizes:`, {
    toolsPanel,
    previewPanel,
    propertiesPanel,
    total: toolsPanel + previewPanel + propertiesPanel
  });
  
  // Add to project loading effect
  useEffect(() => {
    console.log(`🎯 [EditorPage] Project loading effect triggered`, {
      project_id,
      activeProject: activeProject?.id,
      isInitializing: isInitializingRef.current
    });
    
    // ... existing code
  }, [project_id, /* ... */]);
}
```

### Step 4: Track ResizablePanel Events
**File**: `apps/web/src/routes/editor.$project_id.tsx`

Wrap onResize handlers:
```typescript
// Tools Panel (around line 184)
<ResizablePanel
  defaultSize={toolsPanel}
  minSize={15}
  maxSize={40}
  onResize={(size) => {
    console.log(`📐 [ResizablePanel:Tools] onResize`, {
      size,
      timestamp: Date.now(),
      stackTrace: new Error().stack?.split('\n').slice(1, 5)
    });
    setToolsPanel(size);
  }}
  className="min-w-0"
>

// Similar for Preview and Properties panels
```

### Step 5: Monitor Store Subscriptions
**File**: `apps/web/src/stores/panel-store.ts`

Add subscription tracking at the bottom:
```typescript
// DEBUG: Track subscriptions
if (typeof window !== 'undefined' && DEBUG_MODE) {
  const subscriptions = new Map();
  let subId = 0;
  
  const originalSubscribe = usePanelStore.subscribe;
  usePanelStore.subscribe = (callback) => {
    const id = ++subId;
    const stack = new Error().stack;
    
    console.log(`📊 [PanelStore] New subscription #${id}`, {
      location: stack?.split('\n')[2]
    });
    
    subscriptions.set(id, { callback, stack });
    
    return originalSubscribe((state, prevState) => {
      const changes = Object.keys(state).filter(
        key => state[key] !== prevState[key]
      );
      
      if (changes.length > 0) {
        console.log(`📊 [PanelStore] Sub #${id} triggered`, {
          changes,
          values: changes.reduce((acc, key) => ({
            ...acc,
            [key]: { old: prevState[key], new: state[key] }
          }), {})
        });
      }
      
      callback(state, prevState);
    });
  };
}
```

### Step 6: Add Circuit Breaker
**File**: `apps/web/src/stores/panel-store.ts`

Add emergency stop mechanism:
```typescript
// Circuit breaker for infinite loops
let emergencyStop = false;
const MAX_UPDATES_PER_SECOND = 20;
const updateTimes: number[] = [];

const checkCircuitBreaker = (source: string) => {
  if (emergencyStop) {
    console.error('🛑 EMERGENCY STOP ACTIVE - Blocking update');
    return true;
  }
  
  const now = Date.now();
  updateTimes.push(now);
  
  // Keep only updates from last second
  const oneSecondAgo = now - 1000;
  const recentUpdates = updateTimes.filter(t => t > oneSecondAgo);
  updateTimes.length = 0;
  updateTimes.push(...recentUpdates);
  
  if (recentUpdates.length > MAX_UPDATES_PER_SECOND) {
    emergencyStop = true;
    console.error('🛑 CIRCUIT BREAKER TRIGGERED!', {
      source,
      updateCount: recentUpdates.length,
      resetting: 'in 2 seconds'
    });
    
    // Auto-reset after 2 seconds
    setTimeout(() => {
      emergencyStop = false;
      updateTimes.length = 0;
      console.warn('⚡ Circuit breaker reset');
    }, 2000);
    
    return true;
  }
  
  return false;
};

// Use in setters:
setToolsPanel: (size) => {
  if (checkCircuitBreaker('setToolsPanel')) return;
  // ... rest of code
}
```

## Testing Procedure

### 1. Initial Setup
```bash
# Build with debug code
cd qcut && bun run build

# Package the app
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-packager . QCut --platform=win32 --arch=x64 --out=dist-packager-debug --overwrite

# Run and open DevTools
start "" "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\dist-packager-debug\QCut-win32-x64\QCut.exe"
```

### 2. Test Sequence
1. Open the app
2. Open DevTools (F12)
3. Clear console
4. Click on a project
5. Watch for console patterns

### 3. What to Look For
```
Expected Pattern (Normal):
🎯 [EditorPage] Render #1
🎯 [EditorPage] Project loading effect triggered
🔍 [PanelStore] normalizeHorizontalPanels
📐 [ResizablePanel:Tools] onResize

Problem Pattern (Infinite Loop):
🔍 [PanelStore] [1] setToolsPanel:START +2ms
🔍 [PanelStore] [2] setToolsPanel:START +3ms
🔍 [PanelStore] [3] setToolsPanel:START +2ms
⚠️ RAPID UPDATES DETECTED!
🛑 CIRCUIT BREAKER TRIGGERED!
```

## Potential Root Causes

### 1. Project Store Interaction
The project loading might trigger panel normalization multiple times.

### 2. Media Store Loading
When project loads, media store initialization might affect panel sizes.

### 3. Timeline Store Updates
Timeline initialization could trigger panel recalculations.

### 4. Storage Restoration
Panel sizes being restored from localStorage might conflict with normalization.

## Fix Strategies Based on Debug Output

### If Pattern Shows: Rapid setPanel calls
**Solution**: Add stricter change detection
```typescript
// Increase tolerance
if (Math.abs(currentSize - roundedSize) > 0.1) { // was 0.01
```

### If Pattern Shows: normalizeHorizontalPanels loop
**Solution**: Add normalization lock
```typescript
let normalizationInProgress = false;
normalizeHorizontalPanels: () => {
  if (normalizationInProgress) return;
  normalizationInProgress = true;
  try {
    // ... normalization logic
  } finally {
    normalizationInProgress = false;
  }
}
```

### If Pattern Shows: Multiple subscriptions
**Solution**: Memoize store selectors
```typescript
const panelSizes = usePanelStore(
  useCallback(state => ({
    toolsPanel: state.toolsPanel,
    previewPanel: state.previewPanel,
    propertiesPanel: state.propertiesPanel
  }), [])
);
```

## File Modifications Summary

1. `apps/web/src/stores/panel-store.ts` - Add debug logging and circuit breaker
2. `apps/web/src/routes/editor.$project_id.tsx` - Add render tracking and event logging
3. `apps/web/src/components/ui/resizable.tsx` - (Optional) Add library-level debugging

## Expected Outcome

With this debugging in place, we should see:
1. **Exact trigger point** when clicking a project
2. **Update frequency** and patterns
3. **Component causing the loop** (panel store, project store, or resizable library)
4. **Circuit breaker preventing crashes** while we debug

The console output will clearly show the cascade of events leading to the infinite loop, allowing us to implement a targeted fix.

## Emergency Fix (If All Else Fails)

```typescript
// In panel-store.ts - Disable normalization completely
normalizeHorizontalPanels: () => {
  console.warn('⚠️ Panel normalization disabled to prevent infinite loop');
  // Comment out all normalization logic
}
```

This will stop the crashes immediately while we investigate further.