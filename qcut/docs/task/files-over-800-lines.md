# Files Over 800 Lines - Refactor Candidates

Per CLAUDE.md: "No code file should exceed 800 lines; if it does, split it into a new file."

**Updated**: 2026-03-07
**Total files over 800 lines**: 30
**Previous report (2026-03-06)**: 27

---

## Snapshot Changes Since 2026-03-06

- 3 files dropped below 800 or removed:
  - `packages/qagent/packages/core/src/lifecycle-manager.ts`: 1137 -> 591
  - `apps/web/src/test/e2e/helpers/electron-helpers.ts`: 1221 -> 651
  - `electron/native-pipeline/editor/editor-handlers-timeline.ts`: 919 -> removed from list (check if split)
- 2 files still over 800 (unchanged):
  - `electron/main.ts`: 918 (kept, needs refactor)
  - `electron/types/claude-api.ts`: 858 (kept, needs refactor)
- New entries:
  - `electron/claude/http/claude-http-shared-routes.ts`: 1055 (new)
  - `apps/web/src/stores/pty-terminal-store.ts`: 973 (new)
  - `apps/web/src/stores/__tests__/pty-terminal-store.test.ts`: 893 (new)
  - `packages/qagent/packages/web/src/components/SessionCard.tsx`: 883 (new)
  - `electron/native-pipeline/cli/command-registry.ts`: 808 (new)

---

## Summary by Area

| Area | Count | Worst Offender |
|------|-------|----------------|
| Components | 3 | SessionCard.tsx (883) |
| Stores | 4 | pty-terminal-store.ts (973) |
| Lib/Utils | 4 | claude-timeline-bridge-helpers.ts (861) |
| Electron | 8 | claude-http-shared-routes.ts (1055) |
| Tests | 11 | lifecycle-manager.test.ts (1002) |

---

## All Files (sorted by line count)

### 1000+ lines (Critical)

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 1055 | `electron/claude/http/claude-http-shared-routes.ts` | Split by route domain |
| 1041 | `electron/utility/utility-bridge.ts` | Split by bridge category |
| 1002 | `packages/qagent/packages/core/src/__tests__/lifecycle-manager.test.ts` | Split test suites |

### 900-999 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 990 | `apps/web/src/test/e2e/project-folder-sync.e2e.ts` | Split test scenarios |
| 973 | `apps/web/src/stores/pty-terminal-store.ts` | Extract terminal session management |
| 970 | `electron/preload-integrations.ts` | Split by integration domain |
| 966 | `packages/qagent/packages/plugins/scm-github/test/index.test.ts` | Split test suites |
| 957 | `apps/web/src/lib/remotion/__tests__/component-validator.test.ts` | Split test suites |
| 938 | `electron/claude/handlers/claude-command-registry.ts` | Extract command groups into separate files |
| 919 | `electron/native-pipeline/editor/editor-handlers-timeline.ts` | Extract handler groups (check if already split) |
| 918 | `electron/main.ts` | Extract window management or handler registration |
| 909 | `packages/qagent/packages/plugins/tracker-linear/test/index.test.ts` | Split test suites |
| 905 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-round11.test.tsx` | Merge into main test or split |

### 800-899 lines

| Lines | File | Suggested Action |
|-------|------|-----------------|
| 893 | `apps/web/src/stores/__tests__/pty-terminal-store.test.ts` | Split test suites |
| 890 | `packages/qagent/packages/web/server/__tests__/tmux-utils.test.ts` | Split test suites |
| 884 | `apps/web/src/lib/__tests__/claude-timeline-bridge.test.ts` | Split test suites |
| 883 | `packages/qagent/packages/web/src/components/SessionCard.tsx` | Extract sub-components |
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
| 808 | `electron/native-pipeline/cli/command-registry.ts` | Extract command groups |
| 804 | `apps/web/src/components/editor/media-panel/views/captions.tsx` | Extract caption editor, style panel |

---

## Priority Refactors

Start with the highest-impact files:

1. **claude-http-shared-routes.ts** (1055 lines) - New entry, split by route domain
2. **utility-bridge.ts** (1041 lines) - Split by bridge category
3. **lifecycle-manager.test.ts** (1002 lines) - Split test suites
4. **pty-terminal-store.ts** (973 lines) - New entry, extract terminal session management
5. **preload-integrations.ts** (970 lines) - Growing integration layer, split by domain

## Progress

- **Previous report (2026-03-06)**: 27 files over 800 lines
- **Current total**: 30 files over 800 lines
- **Net change since previous report**: +3
