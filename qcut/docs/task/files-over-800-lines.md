# Files Over 800 Lines - Refactor Candidates

Per CLAUDE.md: "No code file should exceed 800 lines; if it does, split it into a new file."

**Updated**: 2026-03-13
**Total files over 800 lines**: 34
**Previous report (2026-03-07)**: 30

---

## Summary by Area

| Area | Count | Worst Offender |
|------|-------|----------------|
| Components | 5 | SessionCard.tsx (883) |
| Stores | 4 | pty-terminal-store.ts (962) |
| Lib/Utils | 4 | claude-timeline-bridge-helpers.ts (1072) |
| Electron | 10 | utility-bridge.ts (1180) |
| Tests | 11 | lifecycle-manager.test.ts (1003) |
| Skills/Scripts | 3 | qcut-slide/scripts/lib.ts (1279) |

---

## All Files (sorted by line count)

### 1000+ lines (Critical)

| Lines | File |
|-------|------|
| 1279 | `resources/default-skills/qcut-toolkit/qcut-slide/scripts/lib.ts` |
| 1180 | `electron/utility/utility-bridge.ts` |
| 1117 | `electron/claude/http/claude-http-shared-routes.ts` |
| 1072 | `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts` |
| 1024 | `electron/native-pipeline/cli/command-registry.ts` |
| 1006 | `electron/preload-integrations.ts` |
| 1003 | `packages/qagent/packages/core/src/__tests__/lifecycle-manager.test.ts` |

### 900-999 lines

| Lines | File |
|-------|------|
| 990 | `apps/web/src/test/e2e/project-folder-sync.e2e.ts` |
| 966 | `packages/qagent/packages/plugins/scm-github/test/index.test.ts` |
| 966 | `electron/native-pipeline/editor/editor-api-client.ts` |
| 962 | `apps/web/src/stores/pty-terminal-store.ts` |
| 957 | `apps/web/src/lib/remotion/__tests__/component-validator.test.ts` |
| 953 | `electron/claude/handlers/claude-command-registry.ts` |
| 926 | `electron/main.ts` |
| 922 | `apps/web/src/stores/moyin/moyin-store.ts` |
| 919 | `electron/native-pipeline/editor/editor-handlers-timeline.ts` |
| 916 | `electron/claude/__tests__/claude-http-server.test.ts` |
| 909 | `packages/qagent/packages/plugins/tracker-linear/test/index.test.ts` |
| 905 | `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-round11.test.tsx` |

### 800-899 lines

| Lines | File |
|-------|------|
| 897 | `apps/web/src/stores/__tests__/pty-terminal-store.test.ts` |
| 892 | `apps/web/src/lib/__tests__/claude-timeline-bridge.test.ts` |
| 890 | `packages/qagent/packages/web/server/__tests__/tmux-utils.test.ts` |
| 883 | `packages/qagent/packages/web/src/components/SessionCard.tsx` |
| 876 | `apps/web/src/test/e2e/auto-save-export-file-management.e2e.ts` |
| 864 | `packages/qagent/packages/web/server/__tests__/direct-terminal-ws.integration.test.ts` |
| 860 | `electron/types/claude-api.ts` |
| 852 | `apps/web/src/stores/ai/effects-store.ts` |
| 851 | `resources/default-skills/qcut-toolkit/baoyu/baoyu-url-to-markdown/scripts/html-to-markdown.ts` |
| 849 | `electron/claude/handlers/claude-export-handler/export-engine.ts` |
| 845 | `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts` |
| 827 | `apps/web/src/components/editor/timeline/use-track-drop.ts` |
| 825 | `apps/web/src/lib/moyin/utils/__tests__/utils.test.ts` |
| 813 | `apps/web/src/lib/ai-clients/image-edit-client.ts` |
| 813 | `apps/web/src/components/editor/media-panel/views/captions.tsx` |
| 809 | `resources/default-skills/qcut-toolkit/baoyu/baoyu-post-to-wechat/scripts/wechat-browser.ts` |
| 809 | `packages/qagent/packages/plugins/workspace-worktree/src/__tests__/index.test.ts` |
| 809 | `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-text-tab.tsx` |
