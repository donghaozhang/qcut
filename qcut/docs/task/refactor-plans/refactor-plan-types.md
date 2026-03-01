# Refactor Plan: types.ts

**File**: `packages/qagent/packages/core/src/types.ts`
**Current size**: 1126 lines
**Goal**: Split into domain-specific type files, each under 800 lines

## Current Structure Analysis

The file defines ALL interfaces for the agent orchestrator system. Sections delineated by comment banners:

| Lines | Section | Types Defined |
|-------|---------|--------------|
| 19-193 | SESSION | `SessionId`, `SessionStatus`, `ActivityState`, `ACTIVITY_STATE`, `ActivityDetection`, `DEFAULT_READY_THRESHOLD_MS`, `SESSION_STATUS`, `TERMINAL_STATUSES`, `TERMINAL_ACTIVITIES`, `NON_RESTORABLE_STATUSES`, `isTerminalSession()`, `isRestorable()`, `Session`, `SessionSpawnConfig`, `OrchestratorSpawnConfig` |
| 196-258 | RUNTIME — Plugin Slot 1 | `Runtime`, `RuntimeCreateConfig`, `RuntimeHandle`, `RuntimeMetrics`, `AttachInfo` |
| 261-386 | AGENT — Plugin Slot 2 | `Agent`, `AgentLaunchConfig`, `WorkspaceHooksConfig`, `AgentSessionInfo`, `CostEstimate` |
| 389-431 | WORKSPACE — Plugin Slot 3 | `Workspace`, `WorkspaceCreateConfig`, `WorkspaceInfo` |
| 434-509 | TRACKER — Plugin Slot 4 | `Tracker`, `Issue`, `IssueFilters`, `IssueUpdate`, `CreateIssueInput` |
| 512-667 | SCM — Plugin Slot 5 | `SCM`, `PRInfo`, `PRState`, `PR_STATE`, `MergeMethod`, `CICheck`, `CIStatus`, `CI_STATUS`, `Review`, `ReviewDecision`, `ReviewComment`, `AutomatedComment`, `MergeReadiness` |
| 670-706 | NOTIFIER — Plugin Slot 6 | `Notifier`, `NotifyAction`, `NotifyContext` |
| 709-727 | TERMINAL — Plugin Slot 7 | `Terminal` |
| 730-785 | EVENTS | `EventPriority`, `EventType`, `OrchestratorEvent` |
| 788-824 | REACTIONS | `ReactionConfig`, `ReactionResult` |
| 827-947 | CONFIGURATION | `OrchestratorConfig`, `DefaultPlugins`, `ProjectConfig`, `TrackerConfig`, `SCMConfig`, `NotifierConfig`, `AgentSpecificConfig` |
| 950-982 | PLUGIN SYSTEM | `PluginSlot`, `PluginManifest`, `PluginModule<T>` |
| 985-1012 | SESSION METADATA | `SessionMetadata` |
| 1015-1076 | SERVICE INTERFACES | `SessionManager`, `CleanupResult`, `LifecycleManager`, `PluginRegistry` |
| 1079-1126 | ERROR DETECTION | `isIssueNotFoundError()`, `SessionNotRestorableError`, `WorkspaceMissingError` |

## Proposed Split

### 1. `types/session-types.ts` (~200 lines)
- Session types: `SessionId`, `SessionStatus`, `ActivityState`, `ACTIVITY_STATE`, `ActivityDetection`, `DEFAULT_READY_THRESHOLD_MS`, `SESSION_STATUS`, `TERMINAL_STATUSES`, `TERMINAL_ACTIVITIES`, `NON_RESTORABLE_STATUSES`, `isTerminalSession()`, `isRestorable()`, `Session`, `SessionSpawnConfig`, `OrchestratorSpawnConfig`
- Session metadata: `SessionMetadata`

### 2. `types/plugin-types.ts` (~500 lines)
- Runtime: `Runtime`, `RuntimeCreateConfig`, `RuntimeHandle`, `RuntimeMetrics`, `AttachInfo`
- Agent: `Agent`, `AgentLaunchConfig`, `WorkspaceHooksConfig`, `AgentSessionInfo`, `CostEstimate`
- Workspace: `Workspace`, `WorkspaceCreateConfig`, `WorkspaceInfo`
- Tracker: `Tracker`, `Issue`, `IssueFilters`, `IssueUpdate`, `CreateIssueInput`
- SCM: `SCM`, `PRInfo`, `PRState`, `PR_STATE`, `MergeMethod`, `CICheck`, `CIStatus`, `CI_STATUS`, `Review`, `ReviewDecision`, `ReviewComment`, `AutomatedComment`, `MergeReadiness`
- Notifier: `Notifier`, `NotifyAction`, `NotifyContext`
- Terminal: `Terminal`
- Plugin system: `PluginSlot`, `PluginManifest`, `PluginModule<T>`

### 3. `types/config-types.ts` (~180 lines)
- Configuration: `OrchestratorConfig`, `DefaultPlugins`, `ProjectConfig`, `TrackerConfig`, `SCMConfig`, `NotifierConfig`, `AgentSpecificConfig`
- Events: `EventPriority`, `EventType`, `OrchestratorEvent`
- Reactions: `ReactionConfig`, `ReactionResult`

### 4. `types/service-types.ts` (~120 lines)
- Service interfaces: `SessionManager`, `CleanupResult`, `LifecycleManager`, `PluginRegistry`
- Error classes: `isIssueNotFoundError()`, `SessionNotRestorableError`, `WorkspaceMissingError`

## Estimated Line Counts

| File | Lines |
|------|-------|
| `types/session-types.ts` | ~200 |
| `types/plugin-types.ts` | ~500 |
| `types/config-types.ts` | ~180 |
| `types/service-types.ts` | ~120 |
| `types.ts` (barrel) | ~30 |

## Barrel Re-export Strategy

`types.ts` becomes a barrel file that re-exports everything:
```ts
export * from './types/session-types';
export * from './types/plugin-types';
export * from './types/config-types';
export * from './types/service-types';
```

This preserves the existing public API — all consumers that `import { ... } from '../types.js'` continue to work with zero changes. The package's `index.ts` or any other entry point importing from `types.js` needs no modification.

**Cross-file dependencies**: `plugin-types.ts` imports `Session` from `session-types.ts` (for `Agent.getActivityState`). `config-types.ts` imports nothing from other type files. `service-types.ts` imports `SessionId`, `SessionStatus`, `SessionSpawnConfig`, etc. from `session-types.ts` and `OrchestratorConfig` from `config-types.ts`.
