# React Maximum Update Depth Error - Fix Documentation

## Issue Date
2025-01-09

## Error Summary
The packaged Electron application was crashing with a React "Maximum update depth exceeded" error, causing an infinite re-render loop in the ResizablePanel components.

## Original Error Log
```javascript
vendor-CvAI8bIM.js:47 Warning: The result of getSnapshot should be cached to avoid an infinite loop
    at IP (file:///C:/Users/zdhpe/Desktop/vite_opencut/OpenCut-main/qcut/dist-packager-new/QCut-win32-x64/resources/app/apps/web/dist/assets/index--vFgq493.js:538:29515)
    at div
    at kN (react-resizable-panels Panel component)
    at forwardRef(Panel)
    at div
    at $N (react-resizable-panels PanelGroup component)
    at forwardRef(PanelGroup)
    at lh (ResizablePanelGroup)
    ...

vendor-CvAI8bIM.js:138 Uncaught Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.
```

## Root Cause Analysis

The infinite loop was caused by a circular update pattern in the panel resize handling:

1. User resizes a panel → triggers `onResize` callback
2. `onResize` calls panel setter (e.g., `setToolsPanel`)
3. Panel setter calls `debouncedNormalize(() => get().normalizeHorizontalPanels())`
4. `normalizeHorizontalPanels()` recalculates and updates panel sizes
5. Panel size updates trigger React re-render
6. Re-render triggers `onResize` again → **INFINITE LOOP**

## Affected Files

### Primary Files Modified
- `apps/web/src/stores/panel-store.ts` - Main fix location (lines 35-92)

### Related Files (Context)
- `apps/web/src/routes/editor.$project_id.tsx` - Uses ResizablePanel components with onResize handlers (lines 171-237)
- `apps/web/src/components/ui/resizable.tsx` - Wrapper components for react-resizable-panels
- `apps/web/package.json` - Contains react-resizable-panels dependency

## Solution Implemented

### 1. Size Change Detection (panel-store.ts lines 60-92)
Added comparison checks to only update state when size actually changes:

```typescript
setToolsPanel: (size) => {
  const roundedSize = Math.round(size * 100) / 100;
  const currentSize = get().toolsPanel;
  
  // Only update if the size actually changed (prevents infinite loops)
  if (Math.abs(currentSize - roundedSize) > 0.01) {
    set({ toolsPanel: roundedSize });
    debouncedNormalize(() => get().normalizeHorizontalPanels());
  }
}
```

### 2. Recursive Call Prevention (panel-store.ts lines 35-51)
Added an `isNormalizing` flag to prevent recursive normalization:

```typescript
let isNormalizing = false;
const debouncedNormalize = (normalizeFunc: () => void) => {
  if (isNormalizing) return; // Prevent recursive calls
  
  if (normalizationTimeout) {
    clearTimeout(normalizationTimeout);
  }
  normalizationTimeout = setTimeout(() => {
    isNormalizing = true;
    try {
      normalizeFunc();
    } finally {
      isNormalizing = false;
    }
  }, 50);
};
```

## Debug Information

### Environment
- Platform: Windows (win32)
- Electron Version: 37.2.5
- React Version: 19
- react-resizable-panels: Used for panel layout
- Build Tool: Vite 7.0.6
- Package Manager: Bun 1.2.18

### Build Commands Used
```bash
# Development testing
cd qcut && bun dev

# Production build
cd qcut && bun run build

# Electron packaging
cd qcut && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-packager . QCut --platform=win32 --arch=x64 --out=dist-packager-new --overwrite --ignore="dist-packager.*" --ignore="dist-electron.*"

# Run packaged app
start "" "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\dist-packager-new\QCut-win32-x64\QCut.exe"
```

### Testing Process
1. **Identified Issue**: Error occurred in packaged application, not in development
2. **Root Cause Discovery**: Traced error to panel resize handlers creating circular updates
3. **Fix Implementation**: Added size comparison and recursive call prevention
4. **Development Test**: Verified fix works in development mode (`bun dev`)
5. **Production Test**: Built and packaged application, confirmed error resolved
6. **Code Formatting**: Applied Biome formatter to maintain code standards

## Key Insights

### Why It Only Happened in Production
- Development mode may have different React reconciliation timing
- Production build minification made debugging harder (IP/RP component names were minified)
- The issue was a race condition that manifested more reliably in production
- Production optimizations may batch updates differently than development

### Prevention Strategies
1. Always check if state actually changed before updating
2. Use debouncing carefully with state updates
3. Implement guards against recursive calls
4. Test both development and production builds
5. Consider using React.memo or useMemo for expensive computations

## Verification Steps
1. Open the packaged application
2. Resize panels multiple times rapidly
3. Check console for any React warnings or errors
4. Verify panels resize smoothly without freezing
5. Test panel normalization still works correctly (panels should sum to 100%)

## Related Issues
- React useSyncExternalStore warning (getSnapshot caching)
- Performance implications of frequent panel size normalization
- Potential memory leaks from uncleaned timeouts (addressed with proper cleanup)

## File Paths Reference
```
C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\
├── apps\web\src\
│   ├── stores\
│   │   └── panel-store.ts (FIXED)
│   ├── routes\
│   │   └── editor.$project_id.tsx
│   └── components\ui\
│       └── resizable.tsx
├── dist-packager-new\
│   └── QCut-win32-x64\
│       └── QCut.exe (Packaged app)
└── docs\task\
    └── max-depth.md (This file)
```

## Status
✅ **FIXED** - The application no longer crashes with maximum update depth error

## Commit Information
- Branch: refactor/ai-view-split
- Files Changed: 1 (panel-store.ts)
- Lines Changed: +15, -3
- Fix Type: Bug fix - Infinite re-render loop prevention