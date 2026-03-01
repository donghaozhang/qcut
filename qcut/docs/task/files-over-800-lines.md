# Files Over 800 Lines - Refactor Candidates

Per CLAUDE.md: "No code file should exceed 800 lines; if it does, split it into a new file."

**Updated**: 2026-03-01
**Total files over 800 lines**: 43
**Previous report (2026-02-28)**: 43

---

## Snapshot Changes Since 2026-02-28

- 2 files refactored below 800:
  - `packages/qagent/packages/core/src/session-manager.ts`: 1249 -> 215
  - `electron/__tests__/cli-pipeline.test.ts`: 1031 -> 567
- 2 new files crossed the 800-line threshold:
  - `electron/main.ts`: 882 (NEW)
  - `electron/native-pipeline/cli/cli.ts`: 847 (NEW)
- Line-count changes in existing entries:
  - `electron/utility/utility-bridge.ts`: 895 -> 958 (+63)
  - `electron/claude/__tests__/claude-http-server.test.ts`: 1002 -> 1058 (+56)
  - `electron/preload-types/electron-api.ts`: 1149 -> 1170 (+21)
  - `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-view.test.tsx`: 1185 -> 1204 (+19)
  - `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-round11.test.tsx`: 886 -> 905 (+19)
  - `electron/preload-integrations.ts`: 958 -> 970 (+12)
  - `packages/qagent/packages/web/src/components/SessionDetail.tsx`: 985 -> 993 (+8)
  - `electron/claude/handlers/claude-command-registry.ts`: 937 -> 939 (+2)
  - `apps/web/src/test/e2e/helpers/electron-helpers.ts`: 1182 -> 1184 (+2)
  - `apps/web/src/stores/moyin/moyin-store.ts`: 901 -> 880 (-21)

---

## Historical Refactors (below 800)

These 13 files were refactored below the 800-line limit in prior passes:

| Was | Now | File |
|-----|-----|------|
| 1559 | 760 | `apps/web/src/lib/claude-bridge/claude-timeline-bridge.ts` |
| 1431 | 51 | `apps/web/src/stores/timeline/timeline-store-operations.ts` |
| 1327 | 596 | `apps/web/src/components/editor/timeline/timeline-track.tsx` |
| 1296 | 733 | `apps/web/src/components/editor/preview-panel.tsx` |
| 1249 | 215 | `packages/qagent/packages/core/src/session-manager.ts` |
| 1219 | 414 | `electron/ffmpeg-export-handler.ts` |
| 1166 | 653 | `apps/web/src/components/editor/media-panel/views/word-timeline-view.tsx` |
| 1159 | 675 | `apps/web/src/stores/media/media-store.ts` |
| 1145 | 380 | `electron/claude/handlers/claude-timeline-handler.ts` |
| 1128 | 589 | `apps/web/src/lib/export/export-engine-cli.ts` |
| 1091 | 209 | `apps/web/src/stores/timeline/timeline-store.ts` |
| 1085 | 206 | `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation.ts` |
| 1031 | 567 | `electron/__tests__/cli-pipeline.test.ts` |

---

## Summary by Area

| Area | Count | Worst Offender |
|------|-------|----------------|
| Components | 5 | drawing-canvas.tsx (1136) |
| Stores | 3 | remotion-store.ts (918) |
| Lib/Utils | 4 | electron-helpers.ts (1184) |
| Electron | 8 | electron-api.ts (1170) |
| Tests | 19 | session-manager.test.ts (1515) |
| QAgent packages | 4 | types.ts (1126) |

---

## All Files (sorted by line count)

### 1200+ lines (Critical)

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 1515 | `packages/qagent/packages/core/src/__tests__/session-manager.test.ts` | Split test suites into separate files |

### 1000-1199 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 1204 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-view.test.tsx` | Split test suites |
| 1187 | `electron/__tests__/editor-cli-integration.test.ts` | Split by feature area |
| 1184 | `apps/web/src/test/e2e/helpers/electron-helpers.ts` | Extract helper categories |
| 1170 | `electron/preload-types/electron-api.ts` | Split by API domain |
| 1136 | `apps/web/src/components/editor/draw/canvas/drawing-canvas.tsx` | Extract tool handlers, rendering |
| 1130 | `electron/__tests__/remaining-gaps.test.ts` | Split by feature |
| 1126 | `packages/qagent/packages/core/src/types.ts` | Split into domain-specific type files |
| 1058 | `electron/claude/__tests__/claude-http-server.test.ts` | Split test suites |
| 1018 | `packages/qagent/packages/web/src/lib/__tests__/serialize.test.ts` | Split test suites |

### 800-999 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 993 | `packages/qagent/packages/web/src/components/SessionDetail.tsx` | Extract sub-components |
| 985 | `apps/web/src/components/editor/media-panel/views/ai/index.tsx` | Extract form sections |
| 984 | `packages/qagent/packages/core/src/lifecycle-manager.ts` | Extract cleanup, health check |
| 974 | `apps/web/src/test/e2e/project-folder-sync.e2e.ts` | Split test scenarios |
| 970 | `packages/qagent/packages/plugins/agent-codex/src/index.test.ts` | Split test suites |
| 970 | `electron/preload-integrations.ts` | Split by integration domain |
| 966 | `packages/qagent/packages/plugins/scm-github/test/index.test.ts` | Split test suites |
| 958 | `electron/utility/utility-bridge.ts` | Split by bridge category |
| 957 | `apps/web/src/lib/remotion/__tests__/component-validator.test.ts` | Split test suites |
| 952 | `apps/web/src/components/editor/timeline/index.tsx` | Extract toolbar, scroll logic |
| 939 | `electron/claude/handlers/claude-command-registry.ts` | Extract command groups into separate files |
| 918 | `apps/web/src/stores/ai/remotion-store.ts` | Extract template logic |
| 909 | `packages/qagent/packages/plugins/tracker-linear/test/index.test.ts` | Split test suites |
| 905 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-round11.test.tsx` | Merge into main test or split |
| 903 | `apps/web/src/lib/ffmpeg/ffmpeg-utils.ts` | Extract codec utils, filter builders |
| 890 | `packages/qagent/packages/web/server/__tests__/tmux-utils.test.ts` | Split test suites |
| 884 | `apps/web/src/lib/__tests__/claude-timeline-bridge.test.ts` | Split test suites |
| 882 | `electron/main.ts` | Extract window management or handler registration |
| 880 | `apps/web/src/stores/moyin/moyin-store.ts` | Split upload vs pipeline state |
| 870 | `packages/qagent/packages/core/src/__tests__/lifecycle-manager.test.ts` | Split test suites |
| 864 | `packages/qagent/packages/web/server/__tests__/direct-terminal-ws.integration.test.ts` | Split by scenario |
| 861 | `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts` | Extract by helper category |
| 852 | `apps/web/src/stores/ai/effects-store.ts` | Extract effect presets |
| 847 | `electron/native-pipeline/cli/cli.ts` | Extract command handlers into separate files |
| 846 | `apps/web/src/test/e2e/auto-save-export-file-management.e2e.ts` | Split test scenarios |
| 841 | `packages/qagent/packages/plugins/agent-claude-code/src/index.ts` | Extract tool definitions |
| 829 | `apps/web/src/components/editor/draw/hooks/use-canvas-objects.ts` | Extract object type handlers |
| 828 | `electron/types/claude-api.ts` | Split by API domain |
| 825 | `apps/web/src/lib/moyin/utils/__tests__/utils.test.ts` | Split test suites |
| 813 | `apps/web/src/lib/ai-clients/image-edit-client.ts` | Extract provider-specific logic |
| 809 | `packages/qagent/packages/plugins/workspace-worktree/src/__tests__/index.test.ts` | Split test suites |
| 804 | `electron/native-pipeline/editor/editor-handlers-timeline.ts` | Extract handler groups |
| 804 | `apps/web/src/components/editor/media-panel/views/captions.tsx` | Extract caption editor, style panel |

---

## Priority Refactors

Start with the highest-impact files:

1. **drawing-canvas.tsx** (1136 lines) - Complex UI component, extract tool handlers and rendering
2. **electron-api.ts** (1170 lines) - Growing type file, split by API domain
3. **types.ts** (1126 lines) - QAgent types, split into domain-specific type files
4. **SessionDetail.tsx** (993 lines) - Steady growth, extract view sections and state helpers
5. **preload-integrations.ts** (970 lines) - Growing integration layer, split by domain

## Progress

- **Baseline total (first tracked)**: 49 files over 800 lines
- **Previous report (2026-02-28)**: 43 files over 800 lines
- **Current total**: 43 files over 800 lines
- **Total historically refactored below 800**: 13 files
- **Net change since previous report**: 0 (2 refactored, 2 new)
- **Net change from baseline**: -6
