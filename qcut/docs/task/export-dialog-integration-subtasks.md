# Export Dialog Properties Panel Integration - Detailed Subtasks

## Overview
This document breaks down the export dialog integration into small, focused tasks that can each be completed in under 5 minutes without breaking existing functionality.

---

## ✅ Task 1: Add Panel View State Management (COMPLETED)
**File**: `apps/web/src/stores/export-store.ts`
**Location**: Near existing `isDialogOpen` state

### Changes Required:
```typescript
// Add new state for panel view management
interface ExportStore {
  // ... existing properties
  panelView: 'properties' | 'export';  // Add this line
  setPanelView: (view: 'properties' | 'export') => void;  // Add this line
}

// In the store implementation, add:
panelView: 'properties',  // Add this line
setPanelView: (view) => set({ panelView: view }),  // Add this line
```

**What to find**: Look for the `interface ExportStore` and the `create<ExportStore>()` function
**Risk**: Minimal - only adding new state without changing existing logic

---

## ✅ Task 2: Create Panel View Enum (COMPLETED)
**File**: `apps/web/src/types/panel.ts` (create if doesn't exist)

### Create new file with:
```typescript
export enum PanelView {
  PROPERTIES = 'properties',
  EXPORT = 'export'
}

export type PanelViewType = 'properties' | 'export';
```

**Risk**: None - new file with type definitions only

---

## ✅ Task 3: Add Tab Navigation Component (COMPLETED)
**File**: `apps/web/src/components/editor/properties-panel/panel-tabs.tsx` (create new)

### Create component:
```typescript
import React from 'react';
import { cn } from '@/lib/utils';

interface PanelTabsProps {
  activeTab: 'properties' | 'export';
  onTabChange: (tab: 'properties' | 'export') => void;
}

export function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="flex border-b border-border">
      <button
        onClick={() => onTabChange('properties')}
        className={cn(
          "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
          activeTab === 'properties' 
            ? "border-primary text-primary" 
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Properties
      </button>
      <button
        onClick={() => onTabChange('export')}
        className={cn(
          "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
          activeTab === 'export' 
            ? "border-primary text-primary" 
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Export
      </button>
    </div>
  );
}
```

**Risk**: Minimal - standalone UI component

---

## ✅ Task 4: Update Export Button to Switch Panel View (COMPLETED)
**File**: `apps/web/src/components/editor-header.tsx`
**Location**: Find `handleExport` function (around line with `setDialogOpen(true)`)

### Changes Required:
```typescript
// Replace existing import
import { useExportStore } from "@/stores/export-store";

// In the handleExport function, replace:
// setDialogOpen(true);
// with:
setPanelView('export');
```

**What to find**: Look for `const { setDialogOpen } = useExportStore();` and `setDialogOpen(true)`
**Risk**: Low - simple state change, preserves existing export functionality

---

## ✅ Task 5: Create Export Panel Content Wrapper (COMPLETED)
**File**: `apps/web/src/components/editor/properties-panel/export-panel-content.tsx` (create new)

### Create wrapper component:
```typescript
import React from 'react';
import { ExportDialog } from '@/components/export-dialog';
import { useExportStore } from '@/stores/export-store';

export function ExportPanelContent() {
  const { panelView } = useExportStore();
  
  // Only render export content when panel view is 'export'
  if (panelView !== 'export') {
    return null;
  }
  
  return (
    <div className="h-full">
      <ExportDialog />
    </div>
  );
}
```

**Risk**: Minimal - wrapper component that conditionally renders existing ExportDialog

---

## ✅ Task 6: Modify ExportDialog to Remove Overlay Behavior (COMPLETED)
**File**: `apps/web/src/components/export-dialog.tsx`
**Location**: Find the conditional rendering check and main return statement

### Changes Required:
1. **Remove conditional rendering** - Find and remove:
```typescript
// Remove this entire block:
if (!isDialogOpen) {
  return null;
}
```

2. **Update main container styling** - Find the main return div and replace:
```typescript
// Replace this:
<div
  className="h-full flex flex-col bg-background"
  style={{ borderRadius: "0.375rem", overflow: "hidden" }}
>

// With this:
<div className="h-full flex flex-col bg-background p-4">
```

**What to find**: Look for `if (!isDialogOpen)` and the main container div with `h-full flex flex-col`
**Risk**: Low - removing overlay behavior while preserving all export functionality

---

## ✅ Task 7: Integrate Tab Navigation into Properties Panel (COMPLETED)
**File**: `apps/web/src/components/editor/properties-panel/index.tsx`
**Location**: Top of the main return statement (around line 43-50)

### Changes Required:
```typescript
// Add imports at the top
import { PanelTabs } from './panel-tabs';
import { useExportStore } from '@/stores/export-store';

// Add inside component function, before the existing logic:
const { panelView, setPanelView } = useExportStore();

// Replace the existing return statement wrapper:
// Find: <div className="space-y-4 p-5">
// Replace with:
<div className="h-full flex flex-col">
  <PanelTabs activeTab={panelView} onTabChange={setPanelView} />
  <div className="flex-1 overflow-auto">
    <div className="space-y-4 p-5">
      {/* existing content goes here */}
    </div>
  </div>
</div>
```

**What to find**: Look for the main return statement and `<div className="space-y-4 p-5">`
**Risk**: Low - adding navigation wrapper around existing content

---

## ✅ Task 8: Add Export Content to Properties Panel (COMPLETED)
**File**: `apps/web/src/components/editor/properties-panel/index.tsx`
**Location**: After the properties content div, before closing the flex container

### Changes Required:
```typescript
// Add import at the top
import { ExportPanelContent } from './export-panel-content';

// Add after the properties content div:
{panelView === 'export' && <ExportPanelContent />}
```

**What to find**: Look for where you added the flex container in Task 7
**Risk**: Minimal - conditionally rendering export content

---

## ✅ Task 9: Remove Global ExportDialog from Editor Layout (COMPLETED)
**File**: `apps/web/src/routes/editor.$project_id.tsx`
**Location**: Find `<ExportDialog />` component (around line 140-150)

### Changes Required:
```typescript
// Remove the import line:
import { ExportDialog } from "@/components/export-dialog";

// Remove the component from the JSX:
<ExportDialog />
```

**What to find**: Look for `<ExportDialog />` in the JSX return statement
**Risk**: Low - removing global overlay since it's now integrated into Properties Panel

---

## ✅ Task 10: Update Export Store Hook Usage (COMPLETED)
**File**: `apps/web/src/components/export-dialog.tsx`
**Location**: Top of the component where useExportStore is called

### Changes Required:
```typescript
// Find this line:
const { isDialogOpen, setDialogOpen, error } = useExportStore();

// Replace with:
const { error } = useExportStore();

// Remove any remaining references to isDialogOpen and setDialogOpen in this file
```

**What to find**: Look for `useExportStore()` destructuring at the top of ExportDialog component
**Risk**: Low - removing unused state references

---

## ✅ Task 11: Add Close/Back Functionality (COMPLETED)
**File**: `apps/web/src/components/editor/properties-panel/panel-tabs.tsx`
**Location**: In the Export tab button

### Changes Required:
```typescript
// Add close button in export tab
import { X } from 'lucide-react';

// Update the export tab button to include close functionality:
<div className="flex items-center">
  <button
    onClick={() => onTabChange('export')}
    className={cn(
      "px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
      activeTab === 'export' 
        ? "border-primary text-primary" 
        : "border-transparent text-muted-foreground hover:text-foreground"
    )}
  >
    Export
    {activeTab === 'export' && (
      <X 
        size={14} 
        onClick={(e) => {
          e.stopPropagation();
          onTabChange('properties');
        }}
        className="hover:text-red-500 cursor-pointer"
      />
    )}
  </button>
</div>
```

**Risk**: Low - adding UX improvement without breaking existing functionality

---

## ✅ Task 12: Test and Validate Integration (COMPLETED)
**Actions**:
1. ✅ Run `bun run build` to ensure no TypeScript errors - PASSED
2. Test export button click switches to export view - Ready for testing
3. Test tab navigation between properties and export - Ready for testing
4. Verify existing properties panel functionality works - Ready for testing
5. Verify export functionality works within panel - Ready for testing

**Risk**: None - testing and validation step

### Build Results:
- ✅ Build completed successfully with no TypeScript errors
- ✅ All files compiled without issues
- ✅ Integration is ready for functional testing

---

## Implementation Order
Execute tasks in numerical order (1-12) for safest implementation. Each task is designed to be non-breaking and incrementally builds the integration.

## Rollback Plan
If any task causes issues, simply revert the specific file changes for that task. The modular approach ensures failures are isolated and don't affect the overall system.