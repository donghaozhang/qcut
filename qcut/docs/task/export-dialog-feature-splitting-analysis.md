# Export Dialog Feature-Based Splitting Analysis

**Date:** 2025-08-07  
**Status:** Investigation Phase  
**Current Implementation:** Hook Extraction Pattern (Completed)  
**Next Approach:** Feature-Based Component Splitting

## 🎯 Analysis Objective

Investigate how to further improve the export-dialog architecture by splitting it into feature-based components, building upon our successful hook extraction refactoring.

## 📊 Current State Analysis

### Current Architecture (Post Hook Extraction)
```
export-dialog.tsx (~500 lines)
├── useExportSettings (87 lines)
├── useExportProgress (198 lines)  
├── useExportValidation (46 lines)
├── useExportPresets (47 lines)
└── Main JSX Component (remaining lines)
```

### Pain Points Still Present
1. **Monolithic JSX Structure** - 500 lines of JSX still in one component
2. **Complex Conditional Rendering** - Export states, loading states, error states
3. **Form Complexity** - Multiple form sections with different concerns
4. **Prop Threading** - Hook values passed through JSX hierarchy

## 🏗️ Feature-Based Splitting Strategy

### Identified Feature Boundaries

#### 1. Export Progress & Controls
**Responsibility:** Export execution, progress display, cancellation
```typescript
// components/export-dialog/ExportProgressSection.tsx
export function ExportProgressSection() {
  const exportProgress = useExportProgress();
  const exportValidation = useExportValidation();
  
  return (
    <div className="p-4 border-b border-border space-y-4">
      {/* Export button + Cancel button */}
      {/* Progress bar and status */}
      {/* Advanced progress metrics */}
    </div>
  );
}
```

#### 2. Export Settings Form
**Responsibility:** Quality, format, engine selection, filename input
```typescript
// components/export-dialog/ExportSettingsForm.tsx
export function ExportSettingsForm() {
  const exportSettings = useExportSettings();
  const { isElectron } = useElectron();
  
  return (
    <div className="grid grid-cols-2 gap-3">
      <FilenameInput />
      <QualitySelector />
      <EngineSelector />
      <FormatSelector />
      <ExportDetails />
    </div>
  );
}
```

#### 3. Preset Management
**Responsibility:** Quick presets, preset application, preset state
```typescript
// components/export-dialog/PresetSection.tsx
export function PresetSection() {
  const exportPresets = useExportPresets();
  
  return (
    <div className="space-y-4">
      <PresetGrid />
      {exportPresets.selectedPreset && <ActivePresetIndicator />}
    </div>
  );
}
```

#### 4. Validation & Warnings
**Responsibility:** Memory warnings, timeline warnings, error display
```typescript
// components/export-dialog/ValidationSection.tsx
export function ValidationSection() {
  const exportValidation = useExportValidation();
  const { error } = useExportStore();
  
  return (
    <div className="space-y-4">
      <MemoryWarning />
      <TimelineWarnings />
      <ErrorDisplay />
    </div>
  );
}
```

### Proposed New Architecture

```
export-dialog.tsx (~150 lines) - Main orchestration
├── ExportProgressSection (~80 lines)
├── PresetSection (~60 lines) 
├── ExportSettingsForm (~200 lines)
│   ├── FilenameInput (~40 lines)
│   ├── QualitySelector (~50 lines)
│   ├── EngineSelector (~60 lines)
│   └── FormatSelector (~50 lines)
├── ValidationSection (~100 lines)
│   ├── MemoryWarning (~40 lines)
│   ├── TimelineWarnings (~30 lines)
│   └── ErrorDisplay (~30 lines)
└── ExportCanvas (unchanged)
```

## 🚀 Implementation Plan

### Phase 1: Extract Major Sections (2 hours)

#### Step 1.1: Create Export Progress Section
```bash
apps/web/src/components/export-dialog/ExportProgressSection.tsx
```

#### Step 1.2: Create Preset Section  
```bash
apps/web/src/components/export-dialog/PresetSection.tsx
```

#### Step 1.3: Create Validation Section
```bash
apps/web/src/components/export-dialog/ValidationSection.tsx
```

#### Step 1.4: Create Settings Form Container
```bash
apps/web/src/components/export-dialog/ExportSettingsForm.tsx
```

### Phase 2: Break Down Complex Forms (2 hours)

#### Step 2.1: Extract Form Components
```bash
apps/web/src/components/export-dialog/forms/FilenameInput.tsx
apps/web/src/components/export-dialog/forms/QualitySelector.tsx
apps/web/src/components/export-dialog/forms/EngineSelector.tsx
apps/web/src/components/export-dialog/forms/FormatSelector.tsx
```

#### Step 2.2: Create Shared Form Context
```typescript
// components/export-dialog/ExportFormContext.tsx
const ExportFormContext = createContext<{
  settings: ReturnType<typeof useExportSettings>;
  validation: ReturnType<typeof useExportValidation>;
  presets: ReturnType<typeof useExportPresets>;
}>({} as any);
```

### Phase 3: Refactor Main Component (1 hour)

```typescript
// apps/web/src/components/export-dialog.tsx
export function ExportDialog() {
  const exportSettings = useExportSettings();
  const exportValidation = useExportValidation(/*...*/);
  const exportPresets = useExportPresets(/*...*/);
  
  return (
    <ExportFormProvider value={{ settings: exportSettings, validation: exportValidation, presets: exportPresets }}>
      <div className="h-full flex flex-col bg-background">
        <ExportHeader />
        <ExportProgressSection />
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <PresetSection />
          <ExportSettingsForm />
          <ValidationSection />
        </div>
        <ExportCanvas ref={canvasRef} />
      </div>
    </ExportFormProvider>
  );
}
```

## 📈 Benefits of Feature-Based Splitting

### 🟢 Advantages
1. **Single Responsibility** - Each component has one clear purpose
2. **Improved Testability** - Smaller, focused components easier to test
3. **Better Reusability** - Form components could be reused elsewhere
4. **Cleaner Code Organization** - Logical feature boundaries
5. **Reduced Cognitive Load** - Developers work on smaller pieces
6. **Context Elimination** - No more prop drilling between sections

### 🟡 Considerations
1. **File Proliferation** - More files to manage (8-10 new components)
2. **Context Complexity** - Need shared context for form state
3. **Import Management** - More import statements to manage
4. **Bundle Size** - Minimal impact, but more modules

### 🔴 Potential Issues
1. **Over-Engineering** - Might be excessive for current needs
2. **Context Performance** - Shared context could cause re-renders
3. **State Management Complexity** - More complex state flow
4. **Team Coordination** - More files means more merge conflicts

## 🎯 Recommendation

**Verdict: PROCEED WITH CAUTION** 🟡

### When to Implement
- ✅ If planning to add more export features (history, templates, etc.)
- ✅ If multiple developers work on export functionality
- ✅ If form components need reuse in other parts of app
- ❌ If current hook-based approach meets all needs
- ❌ If team prefers simpler file structure

### Hybrid Approach (Recommended)
Instead of full feature splitting, consider **selective extraction**:

1. **Keep:** Main dialog structure, progress section (tightly coupled)
2. **Extract:** Complex form components (QualitySelector, EngineSelector) 
3. **Extract:** Validation warnings (reusable across app)
4. **Keep:** Simple components inline (buttons, basic inputs)

This provides 70% of benefits with 30% of the complexity.

## 📋 Next Steps

1. **Decision Point:** Evaluate if current hook extraction is sufficient
2. **If Proceeding:** Start with ValidationSection (lowest risk, high reuse)
3. **If Not:** Move to Context-based architecture investigation
4. **Document:** Final architectural recommendations

## 🔄 Integration with Hook Architecture

Feature components would **consume** our existing hooks, not replace them:

```typescript
function QualitySelector() {
  const { settings } = useContext(ExportFormContext);
  
  return (
    <RadioGroup 
      value={settings.quality} 
      onValueChange={settings.handleQualityChange}
    >
      {/* Quality options */}
    </RadioGroup>
  );
}
```

This maintains our successful hook extraction while adding component organization benefits.