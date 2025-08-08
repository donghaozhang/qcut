# AI View Refactoring Guide

## Overview

The `ai.tsx` file (1453 lines) is a complex component that handles AI video generation functionality. This guide outlines how to refactor it into 2-3 smaller, more maintainable files without breaking any existing features.

## Current File Analysis

### File Size & Complexity
- **Lines of Code**: 1,453 lines
- **Primary Responsibilities**: 
  - AI video generation (text-to-video & image-to-video)
  - Multi-model selection and management
  - Progress tracking and status updates
  - History management
  - Media integration
  - Responsive layout handling

### Key Features to Preserve
- ✅ Text-to-video generation
- ✅ Image-to-video generation
- ✅ Multi-model selection (8 AI models)
- ✅ Real-time progress tracking
- ✅ Generation history with localStorage
- ✅ Automatic media panel integration
- ✅ Download functionality
- ✅ Responsive layout (collapsed/compact/expanded)
- ✅ Mock generation for testing
- ✅ Error handling and validation

## Proposed Refactoring Structure

### Option 1: 3-File Split (Recommended)

#### File 1: `ai-view.tsx` (Main Component)
**Purpose**: Main UI layout, state coordination, and top-level logic
**Size**: ~400-500 lines

**Responsibilities**:
- Main component shell and layout
- Tab management (text/image)
- State coordination between sub-components  
- Responsive layout logic
- Error display and validation
- Integration with stores and hooks

**Key State**:
```typescript
const [activeTab, setActiveTab] = useState<"text" | "image">("text");
const [prompt, setPrompt] = useState("");
const [selectedImage, setSelectedImage] = useState<File | null>(null);
const [selectedModels, setSelectedModels] = useState<string[]>([]);
const [error, setError] = useState<string | null>(null);
```

#### File 2: `ai-generation-engine.tsx` (Generation Logic)
**Purpose**: All AI generation logic, progress tracking, and API integration
**Size**: ~500-600 lines

**Responsibilities**:
- Video generation functions (`handleGenerate`, `handleMockGenerate`)
- Progress tracking and status polling
- API integration and error handling
- Media download and integration
- Model management utilities

**Key Functions**:
```typescript
const handleGenerate = async () => { /* ... */ };
const handleMockGenerate = async () => { /* ... */ };
const startStatusPolling = (jobId: string) => { /* ... */ };
const downloadVideoToMemory = async (videoUrl: string) => { /* ... */ };
```

#### File 3: `ai-history-manager.tsx` (History & Results)
**Purpose**: History management, results display, and localStorage integration
**Size**: ~300-400 lines

**Responsibilities**:
- Generation history management
- localStorage operations
- Results display and download functionality
- History panel integration

**Key Functions**:
```typescript
const addToHistory = (video: GeneratedVideo) => { /* ... */ };
const removeFromHistory = (jobId: string) => { /* ... */ };
const saveGenerationHistory = (history: GeneratedVideo[]) => { /* ... */ };
```

### Option 2: 2-File Split (Alternative)

#### File 1: `ai-view.tsx` (UI Component)
**Purpose**: All UI rendering, layout, and user interactions
**Size**: ~700-800 lines

#### File 2: `ai-generation-service.tsx` (Business Logic)
**Purpose**: All generation logic, API calls, and data management
**Size**: ~650-750 lines

## Detailed Implementation Plan

### Phase 1: Extract Generation Engine

#### Step 1: Create `ai-generation-engine.tsx`

```typescript
// ai-generation-engine.tsx
import { useState, useEffect, useRef } from "react";
import { 
  generateVideo, 
  generateVideoFromImage, 
  handleApiError,
  getGenerationStatus 
} from "@/lib/ai-video-client";
import { AIVideoOutputManager } from "@/lib/ai-video-output";
import { debugLog, debugError, debugWarn } from "@/lib/debug-config";

interface UseAIGenerationProps {
  prompt: string;
  selectedModels: string[];
  selectedImage: File | null;
  activeTab: "text" | "image";
  activeProject: any;
  onProgress: (progress: number, message: string) => void;
  onError: (error: string) => void;
  onComplete: (videos: GeneratedVideoResult[]) => void;
}

export function useAIGeneration(props: UseAIGenerationProps) {
  // Move all generation-related state and logic here
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | undefined>();
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  
  // Move outputManager, polling logic, and all generation functions here
  const [outputManager] = useState(() => new AIVideoOutputManager("./ai-generated-videos"));
  
  const handleGenerate = async () => {
    // Move entire handleGenerate function here
  };
  
  const handleMockGenerate = async () => {
    // Move entire handleMockGenerate function here
  };
  
  const downloadVideoToMemory = async (videoUrl: string): Promise<Uint8Array> => {
    // Move entire downloadVideoToMemory function here
  };
  
  return {
    isGenerating,
    generationProgress,
    statusMessage,
    elapsedTime,
    estimatedTime,
    currentModelIndex,
    progressLogs,
    handleGenerate,
    handleMockGenerate,
    resetGenerationState: () => {
      // Reset all generation state
    }
  };
}
```

#### Step 2: Create `ai-history-manager.tsx`

```typescript
// ai-history-manager.tsx
import { useState, useEffect } from "react";
import { debugLogger } from "@/lib/debug-logger";

interface UseAIHistoryProps {
  // Props if needed
}

export function useAIHistory(props: UseAIHistoryProps) {
  const [generationHistory, setGenerationHistory] = useState<GeneratedVideo[]>([]);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  
  // Load generation history from localStorage on mount
  useEffect(() => {
    // Move localStorage loading logic here
  }, []);
  
  const saveGenerationHistory = (history: GeneratedVideo[]) => {
    // Move save logic here
  };
  
  const addToHistory = (video: GeneratedVideo) => {
    // Move add logic here
  };
  
  const removeFromHistory = (jobId: string) => {
    // Move remove logic here
  };
  
  return {
    generationHistory,
    isHistoryPanelOpen,
    setIsHistoryPanelOpen,
    addToHistory,
    removeFromHistory,
    saveGenerationHistory
  };
}
```

#### Step 3: Refactor Main `ai-view.tsx`

```typescript
// ai-view.tsx (refactored)
import { useState } from "react";
import { useAIGeneration } from "./ai-generation-engine";
import { useAIHistory } from "./ai-history-manager";
import { AI_MODELS } from "./ai-models-config"; // Extract constants

export function AiView() {
  // Keep only UI-related state
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideoResult[]>([]);
  
  // Use custom hooks
  const generation = useAIGeneration({
    prompt,
    selectedModels,
    selectedImage,
    activeTab,
    activeProject,
    onProgress: (progress, message) => {
      // Handle progress updates
    },
    onError: setError,
    onComplete: setGeneratedVideos
  });
  
  const history = useAIHistory({});
  
  // Keep UI rendering logic
  return (
    <div className="h-full flex flex-col">
      {/* Render UI using data from hooks */}
      {/* Move all JSX here, referencing generation.* and history.* */}
    </div>
  );
}
```

### Phase 2: Create Shared Types and Constants

#### Step 4: Create `ai-types.ts`

```typescript
// ai-types.ts
export interface AIModel {
  id: string;
  name: string;
  description: string;
  price: string;
  resolution: string;
}

export interface GeneratedVideo {
  jobId: string;
  videoUrl: string;
  videoPath?: string;
  fileSize?: number;
  duration?: number;
  prompt: string;
  model: string;
}

export interface GeneratedVideoResult {
  modelId: string;
  video: GeneratedVideo;
}

export const AI_MODELS: AIModel[] = [
  // Move AI_MODELS array here
];
```

### Phase 3: Testing and Validation

#### Step 5: Validation Checklist

**Before Refactoring**:
- [ ] Document all current features
- [ ] Create comprehensive test cases
- [ ] Screenshot all UI states
- [ ] Note all state dependencies

**During Refactoring**:
- [ ] Move one function at a time
- [ ] Test after each move
- [ ] Ensure all imports are correct
- [ ] Verify state sharing works

**After Refactoring**:
- [ ] Test text-to-video generation
- [ ] Test image-to-video generation  
- [ ] Test multi-model selection
- [ ] Test progress tracking
- [ ] Test history functionality
- [ ] Test download functionality
- [ ] Test responsive layouts
- [ ] Test error handling
- [ ] Test mock generation
- [ ] Verify localStorage persistence

## Migration Strategy

### Safe Migration Approach

1. **Create Backup**: Copy original `ai.tsx` to `ai-backup.tsx`

2. **Extract Constants First**: Move `AI_MODELS` and interfaces to separate file

3. **Extract Hooks Gradually**: 
   - Start with history management (least complex)
   - Then generation engine (most complex)
   - Finally refactor main component

4. **Maintain Same External Interface**: Ensure parent components don't need changes

5. **Test Each Step**: Run full test suite after each extraction

### Rollback Plan

If issues arise:
1. Revert to `ai-backup.tsx`
2. Fix issues in extracted components
3. Re-attempt migration

## Benefits of Refactoring

### Code Maintainability
- **Smaller Files**: Easier to read and understand
- **Single Responsibility**: Each file has clear purpose
- **Better Testing**: Isolated logic is easier to test
- **Reduced Complexity**: Lower cognitive load per file

### Development Experience
- **Faster Navigation**: Jump to specific functionality quickly
- **Parallel Development**: Multiple developers can work on different aspects
- **Easier Debugging**: Isolated concerns make issues easier to track
- **Better Code Review**: Smaller, focused changes

### Performance Benefits
- **Code Splitting**: Potential for lazy loading of generation engine
- **Reduced Bundle Size**: Only load what's needed
- **Better Tree Shaking**: Unused functions can be eliminated

## Risks and Mitigations

### Potential Risks
1. **State Sharing Issues**: Complex state dependencies between components
2. **Import Cycles**: Circular dependencies between extracted files
3. **Performance Regression**: Additional hook overhead
4. **Feature Breakage**: Missing state or function during extraction

### Mitigations
1. **Careful State Analysis**: Map all state dependencies before extraction
2. **Clear Separation**: Design interfaces before extraction
3. **Incremental Testing**: Test after each small change
4. **Rollback Plan**: Keep backup and be ready to revert

## Implementation Timeline

### Week 1: Planning and Setup
- [ ] Analyze current code dependencies
- [ ] Create detailed extraction plan
- [ ] Set up testing environment
- [ ] Create backup files

### Week 2: Extract Business Logic
- [ ] Extract generation engine hook
- [ ] Extract history management hook
- [ ] Create shared types file
- [ ] Test extracted hooks

### Week 3: Refactor Main Component
- [ ] Refactor main component to use hooks
- [ ] Update imports and dependencies
- [ ] Comprehensive testing
- [ ] Performance validation

### Week 4: Polish and Documentation
- [ ] Code review and cleanup
- [ ] Update documentation
- [ ] Add unit tests for hooks
- [ ] Final validation

## Success Metrics

1. **Code Quality**: 
   - Reduced file size (aim for <500 lines per file)
   - Improved maintainability score
   - Better test coverage

2. **Functionality**: 
   - All existing features work identically
   - No performance regression
   - Same user experience

3. **Developer Experience**:
   - Faster development iteration
   - Easier debugging
   - Better code organization

## Conclusion

This refactoring will significantly improve the maintainability and organization of the AI video generation feature while preserving all existing functionality. The proposed 3-file split provides the best balance between separation of concerns and implementation complexity.

The key to success is incremental migration with thorough testing at each step. By following this guide, the refactoring can be completed safely without breaking any existing features.