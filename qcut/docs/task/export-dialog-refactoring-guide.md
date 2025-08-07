# Export Dialog Refactoring Guide

**Date:** 2025-08-07  
**Branch:** refactor/large-files  
**Target:** Split `export-dialog.tsx` (1,024 lines) into 2 files  
**Risk Level:** 🟡 MEDIUM (complex internal state)  
**Estimated Time:** 4-6 hours

## 🎯 Objective

Split the large `export-dialog.tsx` file into two manageable files without breaking any functionality:

1. **export-dialog.tsx** - Main dialog component and state management (~550 lines)
2. **export-dialog-settings.tsx** - Export settings forms and UI (~474 lines)

## 📋 Current File Analysis

**File:** `apps/web/src/components/export-dialog.tsx` (1,024 lines)

### Structure Analysis:
```
Lines 1-44:    Imports
Lines 46-100:  State declarations and setup
Lines 101-174: Helper functions and effects
Lines 175-253: Event handlers
Lines 254-400: Main export handler function
Lines 401-600: JSX render logic - Main dialog structure
Lines 601-800: JSX render logic - Settings forms (Quality, Engine, Format)
Lines 801-1024: JSX render logic - Export details, progress, history
```

### Key State Variables:
- Export progress tracking (`progress`, `isExporting`, `exportStartTime`)
- Form settings (`quality`, `format`, `filename`, `engineType`)
- UI state (`error`, `ffmpegAvailable`, `engineRecommendation`)
- Preset handling (`selectedPreset`)

## 🔄 Refactoring Strategy

### Phase 1: Separate Concerns

**Keep in export-dialog.tsx (Core Logic):**
- Main component structure and dialog wrapper
- All state management (useState hooks)
- Export engine logic and handlers
- Progress tracking and error handling
- Export history management

**Move to export-dialog-settings.tsx (UI Forms):**
- Quality selection form
- Format selection form  
- Engine type selection form
- Export preset buttons
- File information display
- Settings validation UI

## 📝 Step-by-Step Implementation

### Step 1: Create Settings Component File

Create: `apps/web/src/components/export-dialog-settings.tsx`

### Step 2: Analyze State Dependencies

**Settings Component Needs:**
- Props for all current state values
- Callback handlers for state updates
- Access to computed values (resolution, estimatedSize, etc.)

**State Values to Pass as Props:**
```typescript
interface ExportDialogSettingsProps {
  // Current settings
  quality: ExportQuality;
  format: ExportFormat;
  filename: string;
  engineType: string;
  selectedPreset: ExportPreset | null;
  
  // Computed values
  resolution: { width: number; height: number; label: string };
  estimatedSize: string;
  timelineDuration: number;
  memoryWarning: string | null;
  engineRecommendation: string | null;
  ffmpegAvailable: boolean;
  supportedFormats: ExportFormat[];
  
  // Handlers
  onQualityChange: (quality: ExportQuality) => void;
  onFormatChange: (format: ExportFormat) => void;
  onFilenameChange: (filename: string) => void;
  onEngineTypeChange: (engineType: string) => void;
  onPresetSelect: (preset: ExportPreset) => void;
  onClearPreset: () => void;
}
```

### Step 3: Extract Settings UI Components

**Move these sections to `export-dialog-settings.tsx`:**

1. **Preset Buttons Section** (lines ~620-680)
```typescript
// Quick Presets section with preset buttons
<div className="grid grid-cols-2 gap-2 mb-4">
  {EXPORT_PRESETS.map((preset) => (...))}
</div>
```

2. **Quality Selection Card** (lines ~690-750)
```typescript
<Card>
  <CardHeader>
    <CardTitle>Quality</CardTitle>
  </CardHeader>
  <CardContent>
    <RadioGroup value={quality} onValueChange={handleQualityChange}>
      {/* Quality options */}
    </RadioGroup>
  </CardContent>
</Card>
```

3. **Engine Selection Card** (lines ~760-825)
```typescript
<Card>
  <CardHeader>
    <CardTitle>Export Engine</CardTitle>
  </CardHeader>
  <CardContent>
    <RadioGroup value={engineType} onValueChange={setEngineType}>
      {/* Engine options */}
    </RadioGroup>
  </CardContent>
</Card>
```

4. **Format Selection Card** (lines ~825-855)
```typescript
<Card>
  <CardHeader>
    <CardTitle>Format</CardTitle>
  </CardHeader>
  <CardContent>
    <RadioGroup value={format} onValueChange={handleFormatChange}>
      {/* Format options */}
    </RadioGroup>
  </CardContent>
</Card>
```

5. **Export Details Card** (lines ~856-920)
```typescript
<Card>
  <CardHeader>
    <CardTitle>Export Details</CardTitle>
  </CardHeader>
  <CardContent>
    {/* File information grid */}
  </CardContent>
</Card>
```

### Step 4: Required Imports for Settings Component

```typescript
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  ExportQuality,
  ExportFormat,
  QUALITY_RESOLUTIONS,
  QUALITY_SIZE_ESTIMATES,
  FORMAT_INFO,
  EXPORT_PRESETS,
  ExportPreset,
} from "@/types/export";
import { cn } from "@/lib/utils";
import { useElectron } from "@/hooks/useElectron";
```

### Step 5: Create Settings Component Structure

```typescript
export function ExportDialogSettings({
  quality,
  format,
  filename,
  engineType,
  selectedPreset,
  resolution,
  estimatedSize,
  timelineDuration,
  memoryWarning,
  engineRecommendation,
  ffmpegAvailable,
  supportedFormats,
  onQualityChange,
  onFormatChange,
  onFilenameChange,
  onEngineTypeChange,
  onPresetSelect,
  onClearPreset,
}: ExportDialogSettingsProps) {
  const { isElectron } = useElectron();

  return (
    <div className="space-y-4">
      {/* Move all the extracted UI sections here */}
    </div>
  );
}
```

### Step 6: Update Main Dialog Component

In `export-dialog.tsx`:

1. **Add import:**
```typescript
import { ExportDialogSettings } from "./export-dialog-settings";
```

2. **Replace settings UI with component:**
```typescript
<ExportDialogSettings
  quality={quality}
  format={format}
  filename={filename}
  engineType={engineType}
  selectedPreset={selectedPreset}
  resolution={resolution}
  estimatedSize={estimatedSize}
  timelineDuration={timelineDuration}
  memoryWarning={memoryWarning}
  engineRecommendation={engineRecommendation}
  ffmpegAvailable={ffmpegAvailable}
  supportedFormats={supportedFormats}
  onQualityChange={handleQualityChange}
  onFormatChange={handleFormatChange}
  onFilenameChange={handleFilenameChange}
  onEngineTypeChange={setEngineType}
  onPresetSelect={handlePresetSelect}
  onClearPreset={clearPreset}
/>
```

## ⚠️ Critical Challenges & Risks

### 1. **Complex State Coupling** 🔴 HIGH RISK
**Problem:** Many interdependent state variables and effects
- Quality changes affect resolution and size estimates
- Format changes affect supported engines
- Engine selection affects performance recommendations

**Mitigation:** Pass all computed values as props, keep state in main component

### 2. **Handler Function Dependencies** 🟡 MEDIUM RISK
**Problem:** Event handlers reference multiple state variables and functions
- `handleQualityChange` calls `updateSettings` and `clearPreset`
- `handleFormatChange` has complex logging and state updates
- `handlePresetSelect` affects multiple state variables

**Mitigation:** Keep all handlers in main component, pass as props

### 3. **useEffect Dependencies** 🟡 MEDIUM RISK
**Problem:** Effects depend on multiple state variables
- Engine recommendation effect depends on 8+ variables
- FFmpeg availability check runs on mount

**Mitigation:** Keep all effects in main component

## 🧪 Enhanced Testing Checklist

**Critical functionality to test:**

### State Management Tests:
- [ ] Quality changes update resolution and size estimates correctly
- [ ] Format changes update supported engines appropriately
- [ ] Engine selection updates performance recommendations
- [ ] Preset selection applies all settings correctly
- [ ] Preset clearing resets selection state
- [ ] Filename validation works properly

### UI Interaction Tests:
- [ ] All radio group selections work
- [ ] Preset buttons apply settings correctly
- [ ] Memory warnings display when appropriate
- [ ] Engine recommendations show correct information
- [ ] Export details display current settings accurately

### Integration Tests:
- [ ] Settings changes trigger export engine re-evaluation
- [ ] Progress tracking continues to work during export
- [ ] Export history functionality remains intact
- [ ] Dialog open/close behavior unchanged
- [ ] Cancel functionality works during export

### Cross-Component Tests:
- [ ] Main dialog receives settings changes from child component
- [ ] Child component receives prop updates from main dialog
- [ ] No prop drilling issues or missing callbacks
- [ ] TypeScript compilation successful for both files

## 📁 Final File Structure

### export-dialog.tsx (~550 lines)
```typescript
import { ExportDialogSettings } from "./export-dialog-settings";

export function ExportDialog() {
  // All state management (~80 lines)
  // All helper functions and effects (~120 lines)  
  // All event handlers (~100 lines)
  // Export logic (~150 lines)
  // Main dialog wrapper JSX (~100 lines)
  
  return (
    <Dialog>
      <DialogContent>
        <ExportDialogSettings {...settingsProps} />
        {/* Progress, history, action buttons */}
      </DialogContent>
    </Dialog>
  );
}
```

### export-dialog-settings.tsx (~474 lines)
```typescript
export interface ExportDialogSettingsProps { ... }

export function ExportDialogSettings(props: ExportDialogSettingsProps) {
  // Settings forms UI (~400 lines)
  // File information display (~74 lines)
}
```

## 🚀 Benefits After Refactoring

1. **Improved Organization** - Clear separation between logic and UI
2. **Better Maintainability** - Settings UI isolated for easier updates
3. **Enhanced Testability** - Settings component can be tested independently
4. **Reduced Cognitive Load** - Main dialog focuses on export logic
5. **Reusability Potential** - Settings component could be reused elsewhere

## 🚨 High-Risk Areas to Monitor

1. **State synchronization** between parent and child components
2. **useEffect dependency arrays** - ensure they still trigger correctly
3. **Export engine recommendations** - complex logic depending on many variables
4. **Memory warning calculations** - ensure they update with settings changes
5. **Preset application** - multi-state updates must remain atomic

## 🔄 Rollback Plan

If refactoring causes issues:
1. Delete `export-dialog-settings.tsx`
2. Revert `export-dialog.tsx` using git:
   ```bash
   git checkout -- apps/web/src/components/export-dialog.tsx
   ```

## 🏃‍♂️ Implementation Timeline

**Phase 1 (2 hours):** Create settings component file and define interface
**Phase 2 (2 hours):** Extract UI sections and test basic rendering  
**Phase 3 (1 hour):** Update main component and integrate
**Phase 4 (1 hour):** Comprehensive testing and bug fixes

## ⚠️ Success Factors

1. **Keep all state in main component** - Don't move useState hooks
2. **Pass computed values as props** - Don't recompute in child
3. **Preserve all handler logic** - Don't simplify complex interactions
4. **Maintain prop interface consistency** - Don't change callback signatures
5. **Test export functionality thoroughly** - Core feature must work perfectly

This refactoring is more complex than the preview panel due to tightly coupled state and complex export logic. Careful attention to state management and handler preservation is critical for success.