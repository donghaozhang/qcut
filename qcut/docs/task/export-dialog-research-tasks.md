# Export Dialog Refactoring - Research Tasks

**Date:** 2025-08-07  
**Status:** Research Phase  
**Priority:** High (blocking export-dialog refactoring)  
**Related Files:** 
- `export-dialog-refactoring-guide.md` (risk analysis)
- `apps/web/src/components/export-dialog.tsx` (1,024 lines)

## 📊 Source File Analysis (Based on Reading)

**Current Structure Breakdown:**
```
Lines 1-44:    Imports (React, stores, hooks, UI components, types, utils)
Lines 46-100:  Component setup and state declarations:
               - useExportStore destructuring (11 variables)
               - useTimelineStore, useAsyncMediaItems hooks
               - Local state: quality, format, filename, engineType, etc.
               - Refs: canvasRef, currentEngineRef
Lines 101-174: Helper functions and useEffect hooks:
               - Engine recommendation effect (8+ dependencies)
               - FFmpeg availability check
Lines 175-253: Event handlers:
               - handleQualityChange, handleFormatChange
               - handlePresetSelect (5 state updates)
               - handleCancel, handleClose
Lines 254-400: Main export handler function (146 lines!)
Lines 401-600: JSX render logic - Dialog structure, progress display
Lines 601-800: Settings forms (preset buttons, quality/engine selection)  
Lines 801-950: Format selection and export details cards
Lines 951-1024: Memory warnings, timeline warnings, error display
```

**Key State Dependencies Identified:**
- **Export Store Integration:** 11 destructured variables from useExportStore
- **Local Form State:** 6 useState declarations (quality, format, filename, etc.)
- **Computed Values:** resolution, estimatedSize, memoryEstimate (derived from state)
- **Complex Handler:** handlePresetSelect does 5+ state updates in sequence
- **Async Effect:** Engine recommendation with 8+ dependencies
- **Engine Factory:** Singleton with internal state and caching

## 🚨 Context

**Original plan REJECTED** due to 🔴 **EXTREMELY HIGH RISK**:
- 5 critical breaking points identified
- Non-atomic state updates will cause UI flicker
- Race conditions in useEffect dependencies  
- Memory warning synchronization issues
- Export engine factory state inconsistencies

**Need:** Research safer architectural approaches before proceeding.

---

## 📋 Research Tasks

### Task 1: Research Alternative Refactoring Approaches
- [ ] **Status:** Pending
- [ ] **Owner:** Development Team
- [ ] **Estimated Time:** 2 hours

**Objective:** Explore the 4 recommended alternatives from risk analysis

**Research Areas:**
1. **Hook extraction pattern** - Move state logic to custom hooks
2. **Feature-based splitting** - Extract complete workflows 
3. **State machine pattern** - Use XState for complex state transitions
4. **Context-based splitting** - Use React Context to avoid prop drilling

**Deliverables:**
- Comparison matrix of approaches
- Pros/cons analysis for each method
- Risk assessment for each alternative

---

### Task 2: Analyze Hook Extraction Feasibility  
- [ ] **Status:** Pending
- [ ] **Owner:** Development Team
- [ ] **Estimated Time:** 3 hours

**Objective:** Deep dive into custom hooks approach for export-dialog

**Research Focus:**
- `useExportSettings()` - Manage quality, format, engine, filename state
- `useExportProgress()` - Handle export execution and progress tracking
- `useExportHistory()` - Manage export history and persistence
- `useExportValidation()` - Handle form validation and error states

**Analysis Points:**
- State isolation benefits
- Inter-hook communication patterns
- Testing advantages
- Migration complexity
- Performance implications

**Deliverables:**
- Hook interface designs
- State flow diagrams
- Implementation complexity assessment

**Specific Analysis Based on Source:**
- `useExportSettings()` would need to manage: quality, format, filename, engineType, selectedPreset, ffmpegAvailable, engineRecommendation
- `useExportProgress()` would handle: progress tracking, export execution, currentEngineRef, cancel logic  
- `useExportValidation()` would manage: memory estimates, timeline warnings, filename validation, error states
- **Critical Challenge:** handlePresetSelect currently does 5 sequential state updates that need to remain atomic

---

### Task 3: Investigate Feature-Based Splitting
- [ ] **Status:** Pending  
- [ ] **Owner:** Development Team
- [ ] **Estimated Time:** 2 hours

**Objective:** Explore separating export-dialog into complete feature modules

**Split Candidates:**
1. **Preset Management** (`export-preset-manager.tsx`)
   - Preset selection UI
   - Preset application logic
   - Custom preset creation
   
2. **Export Configuration** (`export-config-panel.tsx`)
   - Quality/format/engine selection
   - Settings validation
   - Memory warnings
   
3. **Export Execution** (`export-progress-panel.tsx`) 
   - Progress tracking UI
   - Export engine management
   - Cancel/retry functionality
   
4. **Export History** (`export-history-panel.tsx`)
   - Previous export list
   - Re-export functionality
   - Export management

**Analysis Points:**
- Feature boundaries and dependencies
- Shared state requirements
- Communication patterns between features
- Testing isolation benefits

**Deliverables:**
- Feature module architecture diagram
- Inter-module communication design
- Implementation roadmap

**Specific Analysis Based on Source:**
- **Preset Management**: Lines 201-226 (handlePresetSelect + clearPreset + preset buttons UI)
- **Export Configuration**: Lines 650-950 (quality/format/engine selection cards + export details)
- **Export Execution**: Lines 254-400 (146-line handleExport function + progress tracking)
- **Progress Display**: Lines 534-620 (progress UI, cancel logic, status display)
- **Validation & Warnings**: Lines 951-1017 (memory warnings, timeline warnings, error display)
- **Critical Integration Point**: All features share the same useExportStore state

---

### Task 4: Evaluate Context-Based Architecture
- [ ] **Status:** Pending
- [ ] **Owner:** Development Team  
- [ ] **Estimated Time:** 2 hours

**Objective:** Study React Context approach for export-dialog state management

**Context Design:**
- `ExportSettingsContext` - Settings state and actions
- `ExportProgressContext` - Progress tracking and control
- `ExportHistoryContext` - History management
- `ExportValidationContext` - Form validation state

**Research Areas:**
- Context performance implications
- Provider component organization
- Context boundaries and scope
- Testing strategies for context-based components

**Analysis Points:**
- Prop drilling elimination
- Component coupling reduction  
- State management complexity
- Re-render optimization needs

**Deliverables:**
- Context architecture design
- Provider component structure
- Performance impact assessment

**Specific Analysis Based on Source:**
- **Current Prop Drilling**: Component would need 17+ props if split (quality, format, filename, engineType, selectedPreset, resolution, estimatedSize, timelineDuration, memoryWarning, engineRecommendation, ffmpegAvailable, supportedFormats, + 6 handler callbacks)
- **Context Candidates**: Settings context, Progress context, Validation context, Export execution context
- **Performance Concern**: Engine recommendation effect has 8+ dependencies that could cause frequent context updates
- **Store Integration**: Must work alongside existing useExportStore without conflicts

---

### Task 5: Document Findings and Recommendations
- [ ] **Status:** Pending
- [ ] **Owner:** Development Team
- [ ] **Estimated Time:** 1 hour

**Objective:** Synthesize research into actionable refactoring plan

**Documentation Requirements:**
- **Approach Comparison Matrix**
  - Implementation effort (hours)
  - Risk level (low/medium/high)  
  - Architectural benefits
  - Testing advantages
  - Maintenance impact

- **Recommended Approach**
  - Best option based on risk/benefit analysis
  - Step-by-step implementation plan
  - Timeline and resource requirements
  - Success criteria and testing strategy

- **Implementation Guide**
  - Detailed technical specifications
  - Code structure and file organization
  - Migration strategy from current implementation
  - Rollback plan if issues arise

**Deliverables:**
- `export-dialog-refactoring-final-plan.md`
- Architecture decision record (ADR)
- Implementation timeline

---

## 🎯 Success Criteria

**Research Phase Complete When:**
- [ ] All 5 tasks completed
- [ ] Approach comparison matrix created
- [ ] Final refactoring plan documented
- [ ] Risk assessment shows acceptable risk level (🟡 medium or lower)
- [ ] Implementation timeline and resources defined

**Next Phase:** Implementation of chosen approach

---

## 📚 Reference Materials

- **Risk Analysis:** `export-dialog-refactoring-guide.md` 
- **Source File:** `apps/web/src/components/export-dialog.tsx` (1,024 lines)
- **Related Stores:** `export-store.ts`, `timeline-store.ts`
- **Export Engine:** `lib/export-engine-factory.ts`
- **Types:** `types/export.ts`

---

## 🔄 Progress Tracking

**Started:** TBD  
**Target Completion:** TBD  
**Actual Completion:** TBD  

**Last Updated:** 2025-08-07  
**Next Review:** TBD