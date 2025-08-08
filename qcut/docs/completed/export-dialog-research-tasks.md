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

**Need:** Research safer architectural approaches that preserve ALL existing functionality.

## 🛡️ **NON-BREAKING REQUIREMENTS**

**ALL research tasks MUST ensure these features continue working:**

### Core Export Functionality
- [ ] **Export execution works** - handleExport function (254-400) must remain functional
- [ ] **Progress tracking works** - Real-time progress updates, frame counting, speed display
- [ ] **Cancel functionality works** - Export cancellation and cleanup
- [ ] **Engine selection works** - Standard/FFmpeg/CLI engine switching
- [ ] **Format selection works** - MP4/WebM/AVI format options
- [ ] **Quality selection works** - 480p/720p/1080p/4K resolution settings

### State Management Features  
- [ ] **Preset application works** - handlePresetSelect's 5 atomic state updates preserved
- [ ] **Settings persistence works** - useExportStore integration maintained
- [ ] **Memory warnings work** - calculateMemoryUsage and warning display
- [ ] **Engine recommendations work** - Async factory recommendations with 8+ dependencies
- [ ] **Timeline validation works** - Empty timeline detection and warnings
- [ ] **Filename validation works** - isValidFilename checks and error display

### UI/UX Features
- [ ] **Dialog open/close works** - Modal behavior and escape handling
- [ ] **Form interactions work** - Radio groups, buttons, input fields
- [ ] **Progress display works** - Progress bar, status text, advanced metrics
- [ ] **Error display works** - Error alerts and user feedback
- [ ] **Toast notifications work** - Success/error/info toast messages
- [ ] **Electron integration works** - Native FFmpeg CLI detection and usage

### Integration Features
- [ ] **Timeline integration works** - getTotalDuration, tracks data access
- [ ] **Media integration works** - useAsyncMediaItems hook integration
- [ ] **Canvas integration works** - ExportCanvas ref and dimension updates
- [ ] **Store synchronization works** - Local state ↔ export store sync
- [ ] **Export history works** - Previous export tracking and replay

### Performance Features
- [ ] **Memory optimization works** - Memory usage calculations and warnings
- [ ] **Engine optimization works** - Auto-selection of best export engine
- [ ] **Progress optimization works** - Efficient progress updates without UI lag
- [ ] **Render optimization works** - No unnecessary re-renders during export

## ⚠️ **CRITICAL PRESERVATION POINTS**

### 1. **Atomic State Updates**
```typescript
// THIS SEQUENCE MUST REMAIN ATOMIC:
setQuality(preset.quality);        // Update 1
setFormat(preset.format);          // Update 2  
setSelectedPreset(preset);         // Update 3
setFilename(presetFilename);       // Update 4
updateSettings({ quality, format, filename }); // Update 5
```
**Requirement:** Any refactoring approach MUST preserve this atomicity or provide equivalent guarantee.

### 2. **useEffect Dependencies** 
```typescript
// THIS EFFECT MUST CONTINUE WORKING:
useEffect(() => {
  // Complex async logic
}, [isDialogOpen, quality, format, timelineDuration, resolution.width, resolution.height, settings]);
```
**Requirement:** Engine recommendation calculations must trigger correctly with proper dependencies.

### 3. **Export Engine Factory Integration**
```typescript
// THIS SINGLETON PATTERN MUST BE PRESERVED:
const factory = ExportEngineFactory.getInstance();
const recommendation = await factory.getEngineRecommendation(settings, duration);
```
**Requirement:** Factory state consistency must be maintained across any architectural changes.

### 4. **Store Integration Pattern**
```typescript
// THIS INTEGRATION MUST REMAIN FUNCTIONAL:
const {
  isDialogOpen, setDialogOpen, settings, updateSettings,
  progress, updateProgress, error, setError, resetExport,
  exportHistory, addToHistory, replayExport
} = useExportStore();
```
**Requirement:** All 11 store variables must remain accessible and functional.

### 5. **Canvas Reference Management**
```typescript
// THIS REF PATTERN MUST BE PRESERVED:
const canvasRef = useRef<ExportCanvasRef>(null);
const canvas = canvasRef.current?.getCanvas();
canvasRef.current?.updateDimensions();
```
**Requirement:** Canvas access and lifecycle management must remain intact.

---

## 📋 Research Tasks

### Task 1: Research Alternative Refactoring Approaches
- [x] **Status:** Complete
- [x] **Owner:** Development Team
- [x] **Estimated Time:** 2 hours (Actual: 2 hours)

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

## 📊 **RESEARCH FINDINGS - TASK 1 COMPLETE**

### Approach Comparison Matrix

| Approach | Risk Level | Implementation Effort | Architectural Benefits | Non-Breaking Score |
|----------|-----------|----------------------|----------------------|-------------------|
| **Hook Extraction** | 🟡 **MEDIUM** | 4-6 hours | ⭐⭐⭐ High | 8/10 |
| **Feature-Based Splitting** | 🔴 **HIGH** | 8-12 hours | ⭐⭐⭐⭐ Very High | 6/10 |
| **State Machine (XState)** | 🔴 **VERY HIGH** | 12-16 hours | ⭐⭐⭐⭐⭐ Maximum | 4/10 |
| **Context-Based Architecture** | 🟡 **MEDIUM** | 6-8 hours | ⭐⭐⭐ High | 7/10 |

### Detailed Analysis

#### 1. **Hook Extraction Pattern** - 🟡 RECOMMENDED
**Risk Level:** 🟡 **MEDIUM** (Acceptable)
**Why it works:** 
- ✅ Preserves atomic state updates within custom hooks
- ✅ Maintains existing useExportStore integration
- ✅ Keeps all 5 critical preservation points intact
- ✅ No component API changes required

**Pros:**
- State logic isolation without breaking existing patterns
- Easy to test individual hooks in isolation
- Gradual migration possible (hook by hook)
- Maintains all existing functionality
- Reduces component complexity while preserving behavior

**Cons:**
- Still requires careful coordination between hooks
- Inter-hook dependencies need management
- Custom hook complexity could grow over time

**Non-Breaking Assessment:** ✅ **SAFE** - All 25+ features preserved

#### 2. **Feature-Based Splitting** - 🔴 NOT RECOMMENDED  
**Risk Level:** 🔴 **HIGH** (Dangerous)
**Why it's risky:**
- ❌ Requires complex inter-module communication
- ❌ Shared useExportStore state creates tight coupling
- ❌ Atomic state updates become difficult to coordinate
- ❌ Engine factory integration becomes fragmented

**Pros:**
- Clear feature boundaries
- Independent testing possible
- Better code organization

**Cons:**
- Complex state synchronization required
- High risk of breaking atomic operations
- Difficult to maintain store integration consistency
- Inter-module dependencies create coupling

**Non-Breaking Assessment:** ❌ **DANGEROUS** - High risk of breaking critical features

#### 3. **State Machine Pattern (XState)** - 🔴 NOT RECOMMENDED
**Risk Level:** 🔴 **VERY HIGH** (Extremely Dangerous) 
**Why it's too risky:**
- ❌ Complete architectural overhaul required
- ❌ All existing state patterns need rewriting
- ❌ Export store integration needs complete redesign
- ❌ Massive migration effort with high breaking potential

**Pros:**
- Eliminates state complexity and race conditions
- Provides predictable state transitions
- Excellent debugging and visualization tools
- Future-proof architecture

**Cons:**
- Requires complete rewrite of state logic
- Team learning curve for XState
- High implementation risk
- Difficult to preserve existing patterns

**Non-Breaking Assessment:** ❌ **EXTREMELY DANGEROUS** - Guaranteed breaking changes

#### 4. **Context-Based Architecture** - 🟡 POSSIBLE ALTERNATIVE
**Risk Level:** 🟡 **MEDIUM** (Moderate Risk)
**Why it could work:**
- ✅ Eliminates prop drilling (17+ props → 0 props)
- ✅ Can preserve existing useExportStore patterns
- ✅ Allows gradual migration with context providers
- ⚠️ Requires careful performance optimization

**Pros:**
- Clean component interfaces
- No prop drilling
- Can coexist with existing stores
- Easier component testing

**Cons:**
- Performance implications with frequent updates
- Context boundaries need careful design
- Re-render optimization required
- Provider hierarchy complexity

**Non-Breaking Assessment:** ⚠️ **MODERATE RISK** - Requires careful performance handling

### 🎯 **TASK 1 RECOMMENDATION**

**RECOMMENDED APPROACH: Hook Extraction Pattern**

**Rationale:**
1. **Lowest Risk** - 🟡 Medium risk with clear mitigation strategies
2. **Highest Non-Breaking Score** - 8/10 feature preservation
3. **Reasonable Effort** - 4-6 hours implementation time
4. **Incremental Migration** - Can be done hook by hook
5. **Preserves All Critical Points** - No breaking changes to atomic operations

**Next Steps:** Proceed to Task 2 for detailed hook extraction analysis

---

### Task 2: Analyze Hook Extraction Feasibility  
- [x] **Status:** Complete - Implementation Plan Created
- [x] **Owner:** Development Team
- [x] **Estimated Time:** 3 hours (Actual: 1 hour planning + implementation plan)

**✅ DELIVERABLE:** Created comprehensive implementation plan: `export-dialog-hook-extraction-implementation.md`

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

**Non-Breaking Requirements:**
- [ ] **Atomic state updates preserved** - handlePresetSelect's 5 updates must remain atomic
- [ ] **useEffect dependencies maintained** - Engine recommendation effect must trigger correctly
- [ ] **Store integration preserved** - All 11 useExportStore variables remain functional
- [ ] **Canvas ref management intact** - ExportCanvas access patterns unchanged
- [ ] **Export execution unchanged** - 146-line handleExport function behavior preserved

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

**Non-Breaking Requirements:**
- [ ] **Complete feature isolation** - Each feature module must be fully self-contained
- [ ] **Store integration preserved** - All features maintain useExportStore access
- [ ] **Inter-feature communication** - Preset changes must trigger validation updates
- [ ] **Progress tracking intact** - Export execution and progress display coordination
- [ ] **Engine factory integration** - All features can access ExportEngineFactory singleton

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

**Non-Breaking Requirements:**
- [ ] **Store compatibility** - Contexts must work alongside useExportStore without conflicts
- [ ] **Performance preservation** - No degradation in export performance or UI responsiveness
- [ ] **Effect dependencies intact** - Engine recommendation effect with 8+ dependencies preserved
- [ ] **Atomic updates guaranteed** - Context updates must maintain preset application atomicity
- [ ] **Provider hierarchy safe** - Context nesting doesn't break existing component patterns

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
- [ ] All 5 tasks completed with non-breaking requirements verified
- [ ] Approach comparison matrix created with risk assessments
- [ ] Final refactoring plan documented with preservation guarantees
- [ ] Risk assessment shows acceptable risk level (🟡 medium or lower)
- [ ] Implementation timeline and resources defined
- [ ] **ALL 25+ existing features verified as preserved**
- [ ] **ALL 5 critical preservation points addressed**
- [ ] **Comprehensive testing strategy defined** for each approach

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