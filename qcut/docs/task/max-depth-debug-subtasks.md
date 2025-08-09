# React Maximum Update Depth - Advanced Debugging Plan

## Executive Summary

Based on analysis of the existing fix documentation and codebase, the infinite re-render loop issue may still be occurring despite the implemented fixes. This debugging plan provides comprehensive steps to trace the exact trigger point and implement additional safeguards.

## Current Issue Analysis

### Existing Fixes (from max-depth.md)
1. ✅ Size change detection with 0.01 tolerance
2. ✅ Recursive call prevention with `isNormalizing` flag
3. ✅ Debouncing with 50ms timeout
4. ✅ Rounding to prevent precision errors

### Potential Remaining Issues
1. **useEffect dependency loop**: `normalizeHorizontalPanels` in dependency array at line 58 of editor.$project_id.tsx
2. **React-resizable-panels internal updates**: Library may trigger additional onResize calls
3. **Zustand subscription patterns**: Multiple components may be subscribing to panel store
4. **Conflicting store interactions**: AI panel width calculations might interfere

## Debugging Plan

### Phase 1: Trace the Re-render Cycle (Highest Priority)

#### 1.1 Add Comprehensive Console Logging

**File: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\stores\panel-store.ts`**

Add these debugging statements:

```typescript
// At the top of the file, after imports
let renderCallCount = 0;
const debugLog = (location: string, data: any) => {
  console.log(`[PanelStore-${renderCallCount++}] ${location}:`, data);
};

// In setToolsPanel (line 60-70)
setToolsPanel: (size) => {
  debugLog('setToolsPanel-START', { 
    incomingSize: size, 
    currentSize: get().toolsPanel,
    isNormalizing,
    renderCallCount
  });
  
  const roundedSize = Math.round(size * 100) / 100;
  const currentSize = get().toolsPanel;
  const sizeDiff = Math.abs(currentSize - roundedSize);

  debugLog('setToolsPanel-CALCULATION', { 
    roundedSize, 
    currentSize, 
    sizeDiff, 
    threshold: 0.01,
    willUpdate: sizeDiff > 0.01 
  });

  if (sizeDiff > 0.01) {
    debugLog('setToolsPanel-UPDATE', { from: currentSize, to: roundedSize });
    set({ toolsPanel: roundedSize });
    debouncedNormalize(() => get().normalizeHorizontalPanels());
  } else {
    debugLog('setToolsPanel-SKIP', 'Size change too small');
  }
},

// Similar logging for setPreviewPanel and setPropertiesPanel

// In normalizeHorizontalPanels (line 98)
normalizeHorizontalPanels: () => {
  const state = get();
  const total = state.toolsPanel + state.previewPanel + state.propertiesPanel;
  
  debugLog('normalizeHorizontalPanels-START', {
    toolsPanel: state.toolsPanel,
    previewPanel: state.previewPanel,
    propertiesPanel: state.propertiesPanel,
    total,
    isNormalizing
  });

  // ... rest of function with debug logs at each major step
},
```

#### 1.2 Add React Component Render Tracking

**File: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\routes\editor.$project_id.tsx`**

Add logging in the component:

```typescript
// At the top of EditorPage function (line 25)
function EditorPage() {
  const renderRef = useRef(0);
  renderRef.current++;
  
  console.log(`[EditorPage-RENDER-${renderRef.current}] Component rendering`);
  
  const {
    toolsPanel,
    previewPanel,
    propertiesPanel,
    // ... rest of destructuring
  } = usePanelStore();
  
  console.log(`[EditorPage-RENDER-${renderRef.current}] Panel sizes:`, {
    toolsPanel,
    previewPanel, 
    propertiesPanel
  });

  // Add logging to useEffect
  useEffect(() => {
    console.log(`[EditorPage-EFFECT] normalizeHorizontalPanels called on mount`);
    normalizeHorizontalPanels();
  }, [normalizeHorizontalPanels]);
```

#### 1.3 Add ResizablePanel onResize Logging

**In the same file, add logging to each ResizablePanel onResize handler:**

```typescript
// Tools Panel (line 184-192)
<ResizablePanel
  defaultSize={toolsPanel}
  minSize={15}
  maxSize={40}
  onResize={(size) => {
    console.log(`[ResizablePanel-TOOLS] onResize called with size:`, size);
    setToolsPanel(size);
  }}
  className="min-w-0"
>

// Preview Panel and Properties Panel similarly
```

### Phase 2: Identify Root Cause

#### 2.1 Monitor for Circular Dependencies

**Create a new debugging utility file: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\lib\debug-panel-cycles.ts`**

```typescript
let callStack: string[] = [];
let maxStackDepth = 0;

export const trackPanelCall = (functionName: string) => {
  callStack.push(functionName);
  maxStackDepth = Math.max(maxStackDepth, callStack.length);
  
  console.log(`[CALL-STACK-${callStack.length}] ${functionName}`, {
    stack: [...callStack],
    maxDepth: maxStackDepth
  });
  
  if (callStack.length > 10) {
    console.error('POTENTIAL INFINITE LOOP DETECTED:', callStack);
    throw new Error(`Infinite loop detected in panel system. Call stack: ${callStack.join(' -> ')}`);
  }
  
  return () => {
    callStack.pop();
  };
};
```

#### 2.2 Check for Zustand Subscription Issues

**Add subscription monitoring to panel store:**

```typescript
// In panel-store.ts, add this at the bottom
if (typeof window !== 'undefined') {
  let subscriptionCount = 0;
  const originalSubscribe = usePanelStore.subscribe;
  
  usePanelStore.subscribe = (callback) => {
    subscriptionCount++;
    console.log(`[ZUSTAND-SUB] New subscription #${subscriptionCount}`);
    
    return originalSubscribe((state, prevState) => {
      console.log(`[ZUSTAND-SUB] State change detected:`, {
        subscription: subscriptionCount,
        changes: Object.keys(state).filter(key => state[key] !== prevState[key])
      });
      callback(state, prevState);
    });
  };
}
```

### Phase 3: Advanced Debugging Scenarios

#### 3.1 Test for React-Resizable-Panels Library Issues

**Create isolated test component to verify library behavior:**

```typescript
// Create test file: apps/web/src/components/debug/panel-test.tsx
export function PanelDebugTest() {
  const [size, setSize] = useState(50);
  let callCount = 0;

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel
        defaultSize={50}
        onResize={(newSize) => {
          callCount++;
          console.log(`[PANEL-TEST] Resize call #${callCount}:`, newSize);
          if (callCount > 5) {
            console.error('Too many resize calls detected!');
          }
          setSize(newSize);
        }}
      >
        <div>Panel content</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

#### 3.2 Check for AI Panel Interference

**File: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\components\editor\media-panel\views\ai.tsx`**

The AI component reads panel sizes (lines 85-94). Add logging:

```typescript
// Around line 85
const { aiPanelWidth, aiPanelMinWidth } = usePanelStore();

useEffect(() => {
  console.log('[AI-PANEL] Panel sizes changed:', { 
    aiPanelWidth, 
    aiPanelMinWidth,
    isCollapsed: aiPanelWidth <= aiPanelMinWidth + 2 
  });
}, [aiPanelWidth, aiPanelMinWidth]);
```

### Phase 4: Alternative Solutions

#### 4.1 useCallback Optimization

**Fix the problematic useEffect dependency:**

```typescript
// In editor.$project_id.tsx, replace lines 55-58 with:
const normalizeHorizontalPanelsCallback = useCallback(() => {
  normalizeHorizontalPanels();
}, []); // Empty dependency array

useEffect(() => {
  normalizeHorizontalPanelsCallback();
}, []); // Remove normalizeHorizontalPanels from dependencies
```

#### 4.2 Add Circuit Breaker Pattern

**Enhanced version of the existing fix:**

```typescript
// In panel-store.ts, add circuit breaker
let consecutiveUpdates = 0;
let lastUpdateTime = 0;
const MAX_UPDATES_PER_SECOND = 10;

const setToolsPanel: (size) => {
  const now = Date.now();
  if (now - lastUpdateTime < 1000) {
    consecutiveUpdates++;
  } else {
    consecutiveUpdates = 1;
  }
  lastUpdateTime = now;

  if (consecutiveUpdates > MAX_UPDATES_PER_SECOND) {
    console.error('[CIRCUIT-BREAKER] Too many rapid updates, blocking for 1 second');
    return;
  }

  // ... rest of existing logic
};
```

#### 4.3 Store Refactoring

**If all else fails, separate normalization from setters:**

```typescript
// Create separate actions that don't trigger normalization
setToolsPanelDirect: (size) => set({ toolsPanel: size }),
setPreviewPanelDirect: (size) => set({ previewPanel: size }),
setPropertiesPanelDirect: (size) => set({ propertiesPanel: size }),

// Manual normalization trigger
triggerNormalization: () => {
  if (!isNormalizing) {
    debouncedNormalize(() => get().normalizeHorizontalPanels());
  }
},
```

## Implementation Steps

### Step 1: Add Basic Logging (15 minutes)
1. Add console.log statements to setToolsPanel, setPreviewPanel, setPropertiesPanel
2. Add render logging to EditorPage component
3. Test in both development and production builds

### Step 2: Monitor Call Patterns (30 minutes)
1. Implement call stack tracking
2. Add Zustand subscription monitoring
3. Run application and resize panels rapidly

### Step 3: Analyze Results (30 minutes)
1. Look for patterns in console output
2. Identify if the loop is coming from:
   - React useEffect dependency
   - Library internal calls
   - Store subscription loops
   - Multiple component subscriptions

### Step 4: Implement Targeted Fix (30 minutes)
1. Based on Step 3 results, implement the most appropriate solution
2. Remove debugging code
3. Test thoroughly in packaged application

## Testing Protocol

### Development Testing
1. `cd qcut && bun dev`
2. Open editor page
3. Resize panels rapidly and erratically
4. Monitor console for patterns

### Production Testing
1. `cd qcut && bun run build`
2. `cd qcut && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-packager . QCut --platform=win32 --arch=x64 --out=dist-packager-debug --overwrite`
3. Run packaged app and repeat test

### Success Criteria
1. No "Maximum update depth exceeded" errors
2. Console shows minimal, predictable update patterns
3. Panel resize behavior is smooth and responsive
4. No performance degradation

## Emergency Rollback

If debugging reveals fundamental architectural issues:

1. **Disable normalization entirely** as a temporary fix:
   ```typescript
   normalizeHorizontalPanels: () => {
     console.warn('Panel normalization disabled due to infinite loop bug');
     return;
   },
   ```

2. **Use fixed panel sizes** until issue is resolved
3. **File GitHub issue** with collected debug information

## Key Files Modified

1. `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\stores\panel-store.ts`
2. `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\routes\editor.$project_id.tsx`
3. `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\components\editor\media-panel\views\ai.tsx`

## Expected Outcome

This debugging plan should identify the exact source of the infinite re-render loop and provide multiple solution paths. The most likely culprits are:

1. **useEffect dependency issue** (highest probability)
2. **React-resizable-panels internal behavior** (medium probability)  
3. **Zustand store subscription conflicts** (lower probability)

The systematic approach ensures we can isolate and fix the root cause rather than adding more band-aid solutions.