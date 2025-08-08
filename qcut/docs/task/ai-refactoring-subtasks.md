# AI View Refactoring Subtasks

## Overview

This document tracks the specific subtasks required to safely refactor the `ai.tsx` file (1453 lines) into smaller, maintainable components. Based on comprehensive source code validation, critical issues were identified that must be addressed before implementation.

## 📋 Current Status

**Branch**: `refactor/ai-view-split`  
**Target File**: `qcut/apps/web/src/components/editor/media-panel/views/ai.tsx`  
**Original Plan**: `qcut/docs/task/ai-view-refactoring-guide.md`  
**Validation**: ✅ Completed - Critical issues found requiring plan updates

## 🚨 Critical Issues Identified

### 1. **Missing State Dependencies**
- `generatedVideo` and `generatedVideos` interdependency not addressed
- `jobId` state missing from refactoring plan
- `pollingInterval` cleanup logic spans multiple proposed boundaries

### 2. **Global State Integration Issue**
- **BREAKING**: Plan assumes local `activeTab` state, but actual code uses `useMediaPanelStore()` global state
- This would break parent component integration

### 3. **Complex Async Workflow**
- Video generation → download → thumbnail → media store workflow crosses all proposed boundaries
- Polling management and cleanup is more complex than anticipated

### 4. **Service Instance Management**
- `AIVideoOutputManager` singleton instance needs careful handling in hook structure

## 📝 Subtask Breakdown

### **Phase 1: Documentation Updates (CRITICAL)**

#### ✅ **Task 1.1**: Review and validate AI refactoring plan against actual source code
- **Status**: ✅ COMPLETED
- **Output**: Critical issues identified
- **Branch**: `refactor/ai-view-split`

#### 🔄 **Task 1.2**: Update refactoring guide with missing state dependencies and critical risks  
- **Status**: 🔄 IN PROGRESS
- **Priority**: HIGH
- **Deliverable**: Updated `ai-view-refactoring-guide.md` with comprehensive state analysis
- **Details**:
  - Add missing state variables (`jobId`, `generatedVideo`, `pollingInterval`)
  - Document state interdependencies
  - Include global state integration requirements
  - Add service instance management strategy

#### 📋 **Task 1.3**: Address polling lifecycle management in refactoring plan
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Polling management strategy in refactoring guide
- **Details**:
  - Document `pollingInterval` cleanup patterns
  - Design hook boundary for polling state
  - Include cleanup sequence diagrams

#### 📋 **Task 1.4**: Fix global state integration (aiActiveTab) in refactoring approach
- **Status**: ⏳ PENDING  
- **Priority**: HIGH
- **Deliverable**: Corrected state management approach
- **Details**:
  - Remove local `activeTab` state from plan
  - Preserve `useMediaPanelStore()` integration
  - Document global state dependencies

#### 📋 **Task 1.5**: Add comprehensive state dependency mapping to refactoring guide
- **Status**: ⏳ PENDING
- **Priority**: MEDIUM
- **Deliverable**: State dependency diagram and documentation
- **Details**:
  - Create visual state dependency map
  - Document cross-component state flows
  - Identify safe extraction boundaries

#### 📋 **Task 1.6**: Create rollback strategy for complex async workflows
- **Status**: ⏳ PENDING
- **Priority**: MEDIUM
- **Deliverable**: Rollback and testing strategy
- **Details**:
  - Document async workflow boundaries
  - Create rollback procedures
  - Define success criteria for each phase

### **Phase 2: Implementation Planning (After Documentation)**

#### 📋 **Task 2.1**: Extract constants and interfaces (SAFEST FIRST)
- **Status**: ⏳ PENDING
- **Priority**: LOW
- **Deliverable**: Separate files for types and constants
- **Files to create**:
  - `ai-types.ts` - Interfaces and types
  - `ai-constants.ts` - AI_MODELS array and constants

#### 📋 **Task 2.2**: Create comprehensive test suite for current functionality
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Full test coverage before refactoring
- **Details**:
  - Test all generation workflows
  - Test history management
  - Test global state integration
  - Test polling and cleanup

#### 📋 **Task 2.3**: Extract history management hook (LOWEST RISK)
- **Status**: ⏳ PENDING
- **Priority**: MEDIUM
- **Deliverable**: `useAIHistory` hook
- **Details**:
  - Extract localStorage operations
  - Maintain history state management
  - Preserve existing API

#### 📋 **Task 2.4**: Design enhanced hook interfaces
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Complete hook interface definitions
- **Details**:
  - Include all missing state variables
  - Design proper state coordination
  - Plan service instance management

### **Phase 3: Implementation (After Planning)**

#### 📋 **Task 3.1**: Implement useAIHistory hook
- **Status**: ⏳ PENDING
- **Priority**: MEDIUM
- **Deliverable**: Working history management hook

#### 📋 **Task 3.2**: Implement enhanced useAIGeneration hook
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Complete generation management hook
- **Details**:
  - Include all state variables
  - Manage polling lifecycle
  - Handle service instances

#### 📋 **Task 3.3**: Refactor main component to use hooks
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Refactored main ai-view.tsx

#### 📋 **Task 3.4**: Integration testing and validation
- **Status**: ⏳ PENDING
- **Priority**: HIGH
- **Deliverable**: Validated working refactored component

### **Phase 4: Optimization and Documentation**

#### 📋 **Task 4.1**: Performance validation
- **Status**: ⏳ PENDING
- **Priority**: LOW
- **Deliverable**: Performance comparison report

#### 📋 **Task 4.2**: Final documentation updates
- **Status**: ⏳ PENDING
- **Priority**: LOW
- **Deliverable**: Complete refactoring documentation

## 🎯 **Immediate Next Steps**

1. **CRITICAL**: Update refactoring guide with missing dependencies (Task 1.2)
2. **HIGH**: Address polling management strategy (Task 1.3) 
3. **HIGH**: Fix global state integration approach (Task 1.4)
4. **MEDIUM**: Create state dependency mapping (Task 1.5)

## ⚠️ **Risk Mitigation**

### **High Risk Areas Identified:**
1. **Polling cleanup logic** - Complex lifecycle management across hooks
2. **Media integration workflow** - Multi-step async process  
3. **State reset functionality** - Multiple interdependent state pieces
4. **Global store integration** - External state dependencies

### **Mitigation Strategy:**
- Start with 2-file split instead of 3-file split to reduce initial risk
- Create comprehensive test suite before any refactoring
- Implement incremental extraction with validation at each step
- Maintain rollback capability at each phase

## 📊 **Success Metrics**

- ✅ All existing functionality preserved
- ✅ No performance regression  
- ✅ Global state integration maintained
- ✅ Polling and cleanup working correctly
- ✅ Async workflows functioning properly
- ✅ File size reduced to <500 lines per file
- ✅ Improved maintainability and testability

## 🔄 **Progress Tracking**

**Phase 1 (Documentation)**: 20% complete (1/5 tasks done)  
**Phase 2 (Planning)**: 0% complete (0/4 tasks done)  
**Phase 3 (Implementation)**: 0% complete (0/4 tasks done)  
**Phase 4 (Optimization)**: 0% complete (0/2 tasks done)  

**Overall Progress**: 6.7% complete (1/15 total tasks)

---

**Last Updated**: 2025-01-08  
**Next Review**: After Task 1.2 completion  
**Estimated Completion**: 2-3 weeks with proper validation