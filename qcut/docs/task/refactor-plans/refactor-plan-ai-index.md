# Refactor Plan: ai/index.tsx

**File**: `apps/web/src/components/editor/media-panel/views/ai/index.tsx`
**Current Lines**: 986
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 3-74 | Icons, React, stores, hooks, components, constants |
| Component + shared state | 76-127 | useState hooks, tab switching logic |
| Project store & effects | 129-202 | Tab state hooks, capabilities, effects |
| useAIGeneration setup | 204-328 | Massive hook with 70+ props (~125 lines) |
| UI state & helpers | 330-407 | Panel sizing, toggleModel, cost calc, loading/error |
| JSX - Header/Tabs | 409-495 | Container, header, tab triggers |
| JSX - Tab contents | 497-849 | Text, Image, Avatar, Upscale, Angles tabs |
| JSX - Model settings | 851-923 | Sora2, Veo3.1, Reve settings |
| JSX - Actions | 925-985 | Feedback, validation, generate button, history |

---

## Proposed Split

```
ai/
├── index.tsx                       (~330 lines) Main orchestrator component
├── hooks/
│   ├── use-ai-view-state.ts        (~80 lines)  Prompt, models, tab state
│   ├── use-ai-initialization.ts    (~120 lines) Hook setup consolidation
│   └── [existing hooks unchanged]
├── components/
│   ├── ai-tabs-container.tsx       (~180 lines) Tab navigation + content orchestration
│   ├── ai-model-settings.tsx       (~120 lines) Model-specific settings panels
│   ├── ai-panel-layout.tsx         (~100 lines) Responsive layout, loading/error
│   ├── ai-actions.tsx              (~60 lines)  Generate button, feedback, validation
│   └── [existing components unchanged]
└── [existing constants, types unchanged]
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `index.tsx` (refactored) | 330 | Main component, event handlers, JSX shell |
| `hooks/use-ai-view-state.ts` | 80 | Prompt, selectedModels, image, Reve state, tab switching |
| `hooks/use-ai-initialization.ts` | 120 | useAIGeneration, useAIHistory, useCostCalculation setup |
| `components/ai-tabs-container.tsx` | 180 | TabsList + TabsContent for all 5 tabs |
| `components/ai-model-settings.tsx` | 120 | Sora2, Veo3.1, Reve settings sections |
| `components/ai-panel-layout.tsx` | 100 | Panel sizing, collapsed state, loading/error states |
| `components/ai-actions.tsx` | 60 | AIGenerationFeedback, validation messages, generate button |
| **Total** | **~990** | Includes import/export overhead |

## Migration Steps

1. Extract `hooks/use-ai-view-state.ts` (local state management)
2. Extract `hooks/use-ai-initialization.ts` (hook setup consolidation)
3. Extract `components/ai-panel-layout.tsx` (responsive layout)
4. Extract `components/ai-model-settings.tsx` (model-specific settings)
5. Extract `components/ai-tabs-container.tsx` (tab orchestration)
6. Extract `components/ai-actions.tsx` (action buttons/feedback)
7. Refactor `index.tsx` to compose all new modules
8. Update barrel exports in `components/index.ts` and `hooks/index.ts`
