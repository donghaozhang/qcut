# Files Over 800 Lines - Refactor Candidates

Per CLAUDE.md: "No code file should exceed 800 lines; if it does, split it into a new file."

**Updated**: 2026-03-06
**Total files over 800 lines**: 27
**Previous report (2026-03-02)**: 32

---

## Snapshot Changes Since 2026-03-02

- 5 files dropped below 800 or removed:
  - `packages/qagent/packages/web/src/components/SessionDetail.tsx`: 993 -> 657
  - `packages/qagent/packages/core/src/types.ts`: 1126 -> 11
  - `electron/__tests__/remaining-gaps.test.ts`: 1130 -> removed
  - `packages/qagent/packages/plugins/agent-codex/src/index.test.ts`: 970 -> removed
- Line-count changes in existing entries:
  - `packages/qagent/packages/core/src/lifecycle-manager.ts`: 984 -> 1137 (+153)
  - `electron/utility/utility-bridge.ts`: 958 -> 1041 (+83)
  - `packages/qagent/packages/core/src/__tests__/lifecycle-manager.test.ts`: 870 -> 1002 (+132)
  - `electron/native-pipeline/editor/editor-handlers-timeline.ts`: 804 -> 919 (+115)
  - `electron/main.ts`: 882 -> 918 (+36)
  - `electron/types/claude-api.ts`: 828 -> 858 (+30)
  - `apps/web/src/test/e2e/helpers/electron-helpers.ts`: 1211 -> 1221 (+10)
  - `apps/web/src/test/e2e/project-folder-sync.e2e.ts`: 985 -> 990 (+5)

---

## Historical Refactors (below 800)

These 28 files were refactored below the 800-line limit in prior passes:

| Was | Now | File |
|-----|-----|------|
| 1559 | 760 | `apps/web/src/lib/claude-bridge/claude-timeline-bridge.ts` |
| 1515 | split | `packages/qagent/packages/core/src/__tests__/session-manager.test.ts` |
| 1431 | 51 | `apps/web/src/stores/timeline/timeline-store-operations.ts` |
| 1327 | 596 | `apps/web/src/components/editor/timeline/timeline-track.tsx` |
| 1296 | 733 | `apps/web/src/components/editor/preview-panel.tsx` |
| 1249 | 215 | `packages/qagent/packages/core/src/session-manager.ts` |
| 1219 | 414 | `electron/ffmpeg-export-handler.ts` |
| 1204 | 299 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-view.test.tsx` |
| 1187 | removed | `electron/__tests__/editor-cli-integration.test.ts` |
| 1170 | 115 | `electron/preload-types/electron-api.ts` |
| 1166 | 653 | `apps/web/src/components/editor/media-panel/views/word-timeline-view.tsx` |
| 1159 | 675 | `apps/web/src/stores/media/media-store.ts` |
| 1145 | 380 | `electron/claude/handlers/claude-timeline-handler.ts` |
| 1136 | 255 | `apps/web/src/components/editor/draw/canvas/drawing-canvas.tsx` |
| 1130 | removed | `electron/__tests__/remaining-gaps.test.ts` |
| 1128 | 589 | `apps/web/src/lib/export/export-engine-cli.ts` |
| 1126 | 11 | `packages/qagent/packages/core/src/types.ts` |
| 1091 | 209 | `apps/web/src/stores/timeline/timeline-store.ts` |
| 1085 | 206 | `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation.ts` |
| 1058 | 670 | `electron/claude/__tests__/claude-http-server.test.ts` |
| 1031 | 567 | `electron/__tests__/cli-pipeline.test.ts` |
| 1018 | split | `packages/qagent/packages/web/src/lib/__tests__/serialize.test.ts` |
| 993 | 657 | `packages/qagent/packages/web/src/components/SessionDetail.tsx` |
| 985 | 525 | `apps/web/src/components/editor/media-panel/views/ai/index.tsx` |
| 970 | removed | `packages/qagent/packages/plugins/agent-codex/src/index.test.ts` |
| 952 | 293 | `apps/web/src/components/editor/timeline/index.tsx` |
| 918 | 26 | `apps/web/src/stores/ai/remotion-store.ts` |
| 903 | 39 | `apps/web/src/lib/ffmpeg/ffmpeg-utils.ts` |

---

## Summary by Area

| Area | Count | Worst Offender |
|------|-------|----------------|
| Components | 1 | captions.tsx (804) |
| Stores | 2 | moyin-store.ts (880) |
| Lib/Utils | 4 | electron-helpers.ts (1221) |
| Electron | 7 | utility-bridge.ts (1041) |
| Tests | 10 | lifecycle-manager.test.ts (1002) |
| QAgent packages | 3 | lifecycle-manager.ts (1137) |

---

## All Files (sorted by line count)

### 1200+ lines (Critical)

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 1221 | `apps/web/src/test/e2e/helpers/electron-helpers.ts` | Extract helper categories |

### 1000-1199 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 1137 | `packages/qagent/packages/core/src/lifecycle-manager.ts` | Extract cleanup, health check |
| 1041 | `electron/utility/utility-bridge.ts` | Split by bridge category |
| 1002 | `packages/qagent/packages/core/src/__tests__/lifecycle-manager.test.ts` | Split test suites |

### 800-999 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 990 | `apps/web/src/test/e2e/project-folder-sync.e2e.ts` | Split test scenarios |
| 970 | `electron/preload-integrations.ts` | Split by integration domain |
| 966 | `packages/qagent/packages/plugins/scm-github/test/index.test.ts` | Split test suites |
| 957 | `apps/web/src/lib/remotion/__tests__/component-validator.test.ts` | Split test suites |
| 938 | `electron/claude/handlers/claude-command-registry.ts` | Extract command groups into separate files |
| 919 | `electron/native-pipeline/editor/editor-handlers-timeline.ts` | Extract handler groups |
| 918 | `electron/main.ts` | Extract window management or handler registration |
| 909 | `packages/qagent/packages/plugins/tracker-linear/test/index.test.ts` | Split test suites |
| 905 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-round11.test.tsx` | Merge into main test or split |
| 890 | `packages/qagent/packages/web/server/__tests__/tmux-utils.test.ts` | Split test suites |
| 884 | `apps/web/src/lib/__tests__/claude-timeline-bridge.test.ts` | Split test suites |
| 880 | `apps/web/src/stores/moyin/moyin-store.ts` | Split upload vs pipeline state |
| 864 | `packages/qagent/packages/web/server/__tests__/direct-terminal-ws.integration.test.ts` | Split by scenario |
| 861 | `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts` | Extract by helper category |
| 858 | `electron/types/claude-api.ts` | Split by API domain |
| 852 | `apps/web/src/stores/ai/effects-store.ts` | Extract effect presets |
| 846 | `apps/web/src/test/e2e/auto-save-export-file-management.e2e.ts` | Split test scenarios |
| 841 | `packages/qagent/packages/plugins/agent-claude-code/src/index.ts` | Extract tool definitions |
| 825 | `apps/web/src/lib/moyin/utils/__tests__/utils.test.ts` | Split test suites |
| 813 | `apps/web/src/lib/ai-clients/image-edit-client.ts` | Extract provider-specific logic |
| 809 | `packages/qagent/packages/plugins/workspace-worktree/src/__tests__/index.test.ts` | Split test suites |
| 809 | `electron/native-pipeline/cli/cli.ts` | Extract command handlers into separate files |
| 804 | `apps/web/src/components/editor/media-panel/views/captions.tsx` | Extract caption editor, style panel |

---

## Priority Refactors

Start with the highest-impact files:

1. **electron-helpers.ts** (1221 lines) - Growing E2E helper, extract helper categories
2. **lifecycle-manager.ts** (1137 lines) - Extract cleanup and health check logic
3. **utility-bridge.ts** (1041 lines) - Split by bridge category
4. **lifecycle-manager.test.ts** (1002 lines) - Split test suites
5. **preload-integrations.ts** (970 lines) - Growing integration layer, split by domain

## Progress

- **Baseline total (first tracked)**: 49 files over 800 lines
- **Previous report (2026-03-02)**: 32 files over 800 lines
- **Current total**: 27 files over 800 lines
- **Total historically refactored below 800**: 28 files
- **Net change since previous report**: -5
- **Net change from baseline**: -22
