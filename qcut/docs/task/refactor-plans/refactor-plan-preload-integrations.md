# Refactor Plan: preload-integrations.ts

**File**: `electron/preload-integrations.ts`
**Current Lines**: 967
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Header & imports | 1-33 | Electron IPC, type imports |
| createPtyAPI | 35-62 | PTY terminal (~28 lines) |
| createMcpAPI | 64-79 | MCP app bridge (~16 lines) |
| createSkillsAPI | 81-101 | Skills management (~21 lines) |
| createAIPipelineAPI | 103-136 | AI pipeline (~34 lines) |
| createMediaImportAPI | 138-166 | Media import (~29 lines) |
| createProjectFolderAPI | 168-186 | Project folder (~19 lines) |
| **createClaudeAPI** | **188-845** | **Claude integration (~658 lines)** |
| → media | 195-209 | Claude media ops (~15 lines) |
| → timeline | 210-467 | Claude timeline ops (~258 lines) |
| → transaction | 468-543 | Claude transaction ops (~76 lines) |
| → project | 544-575 | Claude project ops (~32 lines) |
| → export/diagnostics/analyze | 576-597 | Small domains (~22 lines) |
| → events/notifications | 590-605 | Event listeners (~16 lines) |
| → navigator | 606-635 | Navigation (~30 lines) |
| → screenRecordingBridge | 636-667 | Screen recording (~32 lines) |
| → ui | 668-699 | UI panels (~32 lines) |
| → state | 700-733 | State snapshots (~34 lines) |
| → projectCrud | 734-843 | Project CRUD (~110 lines) |
| createRemotionFolderAPI | 847-869 | Remotion folder (~23 lines) |
| createMoyinAPI | 871-925 | Moyin storyboard (~55 lines) |
| createUpdatesAPI | 927-966 | Updates & release notes (~40 lines) |

---

## Proposed Split

The main issue is `createClaudeAPI` at 658 lines. Split the Claude API into 3 focused functions:

```text
electron/
├── preload-integrations.ts             (~50 lines)  Barrel re-export
├── integrations/
│   ├── basic-integrations.ts           (~170 lines) PTY, MCP, Skills, AI Pipeline, Media Import, Project Folder
│   ├── claude-timeline-integration.ts  (~290 lines) Claude media + timeline operations
│   ├── claude-project-integration.ts   (~320 lines) Claude transactions, project, export, CRUD
│   ├── claude-ui-integration.ts        (~150 lines) Claude navigator, UI, state, notifications
│   ├── remotion-integration.ts         (~35 lines)  Remotion folder operations
│   ├── moyin-integration.ts            (~70 lines)  Script-to-storyboard
│   └── updates-integration.ts          (~55 lines)  Updates & release notes
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `preload-integrations.ts` (refactored) | 50 | Import + compose createClaudeAPI + re-export all |
| `basic-integrations.ts` | 170 | createPtyAPI, createMcpAPI, createSkillsAPI, createAIPipelineAPI, createMediaImportAPI, createProjectFolderAPI |
| `claude-timeline-integration.ts` | 290 | Claude media + timeline (30+ IPC handlers) |
| `claude-project-integration.ts` | 320 | Claude transactions, project, export, diagnostics, CRUD |
| `claude-ui-integration.ts` | 150 | Claude navigator, UI panels, state snapshots, events, notifications |
| `remotion-integration.ts` | 35 | createRemotionFolderAPI |
| `moyin-integration.ts` | 70 | createMoyinAPI |
| `updates-integration.ts` | 55 | createUpdatesAPI |
| **Total** | **~1,140** | Includes import/export overhead |

## Key Design Decision

The `createClaudeAPI` function returns a single object. The split creates 3 sub-functions that each return a portion of the Claude API, composed together:

```typescript
// preload-integrations.ts
export function createClaudeAPI() {
  return {
    ...createClaudeTimelineAPI(),
    ...createClaudeProjectAPI(),
    ...createClaudeUIAPI(),
  };
}
```

## Migration Steps

1. Create `integrations/` directory
2. Extract `basic-integrations.ts` (6 small, independent API creators)
3. Extract `claude-timeline-integration.ts` (media + timeline IPC wrappers)
4. Extract `claude-project-integration.ts` (transaction + project + CRUD)
5. Extract `claude-ui-integration.ts` (navigator + UI + state + events)
6. Extract `remotion-integration.ts`, `moyin-integration.ts`, `updates-integration.ts`
7. Refactor `preload-integrations.ts` to compose and re-export
8. Verify preload script still bundles correctly (Electron preload constraint)
