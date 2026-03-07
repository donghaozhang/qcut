# Issue Discovery Loop — Implementation Plan

**Status:** Core module complete, integration pending  
**Module:** `packages/qagent/packages/core/src/issue-discovery.ts`  
**Date:** 2026-03-07

---

## Table of Contents

1. [What's Already Done](#1-whats-already-done)
2. [Architecture Overview](#2-architecture-overview)
3. [Remaining Integration Work](#3-remaining-integration-work)
4. [Configuration Examples](#4-configuration-examples)
5. [Testing Plan](#5-testing-plan)
6. [Safety Considerations](#6-safety-considerations)
7. [Rollout Checklist](#7-rollout-checklist)

---

## 1. What's Already Done

### Core Module (`issue-discovery.ts`)

The complete discovery logic lives in `packages/qagent/packages/core/src/issue-discovery.ts` and exports:

| Export | Type | Purpose |
|--------|------|---------|
| `createIssueDiscoveryLoop` | Function → `IssueDiscoveryLoop` | Creates a timer-based loop that polls all projects |
| `discoverAndSpawn` | Async function | One-shot: discover issues for a single project and spawn sessions |
| `resolveAutoDiscoveryConfig` | Function | Merges partial user config with defaults |
| `AutoDiscoveryConfig` | Interface | Configuration shape |
| `IssueDiscoveryResult` | Interface | Return type from discovery runs |
| `IssueDiscoveryDeps` | Interface | Dependency injection container |
| `IssueDiscoveryLoop` | Interface | `{ start(), stop(), runOnce() }` |
| `DiscoveredIssue` | Interface | Normalized issue from tracker |

### Config Types (`types/config-types.ts`)

`ProjectConfig.autoDiscovery` is defined at line 233 with all fields:

```typescript
autoDiscovery?: {
  enabled: boolean;
  label?: string;        // default: "agent-ready"
  maxConcurrent?: number; // default: 5
  intervalMs?: number;    // default: 60000
  dryRun?: boolean;       // default: false
  states?: string[];      // default: ["Todo"]
};
```

### Exports (`core/src/index.ts`)

All public symbols are already re-exported from the core barrel:

```typescript
export { createIssueDiscoveryLoop, discoverAndSpawn, resolveAutoDiscoveryConfig } from "./issue-discovery.js";
export type { IssueDiscoveryResult, IssueDiscoveryDeps, IssueDiscoveryLoop } from "./issue-discovery.js";
```

### Tracker Plugin Interface (`types/plugin-types.ts`)

The `Tracker` interface already has:

```typescript
listIssues?(filters: IssueFilters, project: ProjectConfig): Promise<Issue[]>;
```

### GitHub Tracker (`tracker-github`)

`listIssues` is **already implemented** at `packages/qagent/packages/plugins/tracker-github/src/index.ts:183`. It:
- Uses `gh issue list` with `--json` output
- Supports `state`, `labels`, `assignee`, and `limit` filters
- Returns normalized `Issue[]` objects
- Has tests at `tracker-github/test/index.test.ts:245`

**No work needed on the GitHub tracker plugin.**

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                        ao start                             │
│                     (CLI entry point)                       │
└──────────────┬──────────────────────────────────────────────┘
               │ creates
               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Orchestrator Runtime                       │
│                                                              │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  Lifecycle Manager   │  │  Issue Discovery Loop        │  │
│  │                      │  │                              │  │
│  │  ┌────────────────┐  │  │  Per-project timer:          │  │
│  │  │ Poll Timer     │  │  │  ┌────────────────────────┐  │  │
│  │  │ (30s default)  │  │  │  │ Discovery Timer        │  │  │
│  │  │                │  │  │  │ (60s default)           │  │  │
│  │  │ • poll sessions│  │  │  │                         │  │  │
│  │  │ • detect state │  │  │  │ 1. tracker.listIssues() │  │  │
│  │  │ • emit events  │  │  │  │ 2. filter active        │  │  │
│  │  │ • run reactions│  │  │  │ 3. check concurrency    │  │  │
│  │  └────────────────┘  │  │  │ 4. sessionMgr.spawn()   │  │  │
│  │                      │  │  │ 5. notify human          │  │  │
│  │  ┌────────────────┐  │  │  └────────────────────────┘  │  │
│  │  │ Reconciliation │  │  │                              │  │
│  │  │ Timer (5× poll)│  │  └──────────────────────────────┘  │
│  │  └────────────────┘  │                                    │
│  └─────────────────────┘                                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Shared Dependencies                  │    │
│  │  • OrchestratorConfig    • PluginRegistry             │    │
│  │  • SessionManager        • notifyHuman()              │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘

                          │ spawns
                          ▼
              ┌───────────────────────┐
              │   Agent Sessions      │
              │   (tmux/runtime)      │
              │                       │
              │  session-1 (manual)   │
              │  session-2 (manual)   │
              │  session-3 (auto) ◄── discovered from tracker
              │  session-4 (auto) ◄── discovered from tracker
              └───────────────────────┘
```

### Data Flow for a Single Discovery Cycle

```text
Tracker (GitHub/Linear)          Issue Discovery           Session Manager
        │                              │                         │
        │◄── listIssues(filters) ──────│                         │
        │── Issue[] ──────────────────►│                         │
        │                              │── list(projectId) ─────►│
        │                              │◄── Session[] ───────────│
        │                              │                         │
        │                     filter: remove active issues       │
        │                     check: maxConcurrent slots         │
        │                              │                         │
        │                              │── spawn({issueId}) ────►│
        │                              │◄── Session ─────────────│
        │                              │                         │
        │                              │── notifyHuman() ───────►│ (notification plugin)
        │                              │                         │
        │                      return IssueDiscoveryResult       │
```

---

## 3. Remaining Integration Work

### 3.1 Wire into Lifecycle Manager (Recommended Approach)

The discovery loop should start/stop alongside the existing lifecycle timers. This keeps all background loops co-located and sharing the same dependency container.

**File:** `packages/qagent/packages/core/src/lifecycle-manager.ts`

**Changes:**

```typescript
// Add import
import {
  createIssueDiscoveryLoop,
  type IssueDiscoveryLoop,
} from "./issue-discovery.js";

// Inside createLifecycleManager():

// Add to local variables (alongside pollTimer, reconciliationTimer)
let discoveryLoop: IssueDiscoveryLoop | null = null;

// In start():
start(intervalMs = 30_000): void {
  // ... existing poll timer and reconciliation timer setup ...

  // Start issue discovery loop
  discoveryLoop = createIssueDiscoveryLoop({
    config,
    registry,
    sessionManager,
    notifyHuman,
  });
  discoveryLoop.start();
},

// In stop():
stop(): void {
  // ... existing timer cleanup ...

  if (discoveryLoop) {
    discoveryLoop.stop();
    discoveryLoop = null;
  }
},
```

**Why lifecycle-manager and not start.ts:**
- `start.ts` is a CLI command that creates an orchestrator agent session — it doesn't run long-lived loops itself
- The lifecycle manager already owns the poll loop and reconciliation loop
- The discovery loop needs the same `PluginRegistry`, `SessionManager`, and `notifyHuman` that the lifecycle manager already has
- Starting/stopping discovery alongside the other timers is the cleanest lifecycle

### 3.2 Expose Discovery Loop on LifecycleManager Interface

**File:** `packages/qagent/packages/core/src/types/plugin-types.ts` (or wherever `LifecycleManager` is defined)

```typescript
export interface LifecycleManager {
  start(intervalMs?: number): void;
  stop(): void;
  getStates(): Map<SessionId, SessionStatus>;
  check(sessionId: SessionId): Promise<void>;

  // New: expose for manual CLI invocation
  runDiscovery(): Promise<IssueDiscoveryResult[]>;
}
```

Implementation in `lifecycle-manager.ts`:

```typescript
async runDiscovery(): Promise<IssueDiscoveryResult[]> {
  if (!discoveryLoop) {
    // Create a one-shot loop for manual runs when discovery isn't started
    const oneShot = createIssueDiscoveryLoop({
      config,
      registry,
      sessionManager,
      notifyHuman,
    });
    return oneShot.runOnce();
  }
  return discoveryLoop.runOnce();
},
```

### 3.3 Add CLI Command: `ao discover [project]`

**File:** `packages/qagent/packages/cli/src/commands/discover.ts` (new file)

```typescript
/**
 * `ao discover [project]` — manual one-shot issue discovery.
 *
 * Scans the configured tracker for issues matching the autoDiscovery config
 * and spawns agent sessions for new ones. Useful for testing and manual triggers.
 */

import chalk from "chalk";
import type { Command } from "commander";
import {
  loadConfig,
  discoverAndSpawn,
  resolveAutoDiscoveryConfig,
  type IssueDiscoveryDeps,
} from "@composio/ao-core";
import { getSessionManager } from "../lib/create-session-manager.js";
import { createPluginRegistry } from "../lib/create-plugin-registry.js";

export function registerDiscover(program: Command): void {
  program
    .command("discover [project]")
    .description("Discover new issues from tracker and spawn agent sessions")
    .option("--dry-run", "Show what would be spawned without spawning")
    .option("--label <label>", "Override the discovery label filter")
    .action(async (projectArg?: string, opts?: { dryRun?: boolean; label?: string }) => {
      try {
        const config = loadConfig();
        const registry = createPluginRegistry(config);
        const sessionManager = await getSessionManager(config);

        const notifyHuman: IssueDiscoveryDeps["notifyHuman"] = async (event, priority) => {
          // CLI mode: just print to stdout
          const icon = priority === "urgent" ? "🚨" : priority === "warning" ? "⚠️" : "ℹ️";
          console.log(`${icon} ${event.message}`);
        };

        const deps: IssueDiscoveryDeps = { config, registry, sessionManager, notifyHuman };

        // Determine which projects to scan
        const projectIds = projectArg
          ? [projectArg]
          : Object.keys(config.projects);

        for (const projectId of projectIds) {
          const project = config.projects[projectId];
          if (!project) {
            console.error(chalk.red(`Project "${projectId}" not found`));
            continue;
          }

          // Apply CLI overrides
          const effectiveProject = { ...project };
          if (opts?.dryRun || opts?.label) {
            effectiveProject.autoDiscovery = {
              ...project.autoDiscovery,
              enabled: true, // force enabled for manual runs
              ...(opts.dryRun && { dryRun: true }),
              ...(opts.label && { label: opts.label }),
            };
          } else if (!project.autoDiscovery?.enabled) {
            // For manual runs, force enabled even if config says disabled
            effectiveProject.autoDiscovery = {
              ...project.autoDiscovery,
              enabled: true,
            };
          }

          console.log(chalk.bold(`\nDiscovering issues for ${chalk.cyan(projectId)}...`));

          const discoveryConfig = resolveAutoDiscoveryConfig(effectiveProject);
          console.log(chalk.dim(`  Label: ${discoveryConfig.label}`));
          console.log(chalk.dim(`  Max concurrent: ${discoveryConfig.maxConcurrent}`));
          console.log(chalk.dim(`  Dry run: ${discoveryConfig.dryRun}`));

          const result = await discoverAndSpawn(projectId, effectiveProject, deps);

          console.log(`\n  Discovered: ${result.discovered}`);
          console.log(`  Spawned:    ${chalk.green(String(result.spawned))}`);
          console.log(`  Skipped:    ${chalk.yellow(String(result.skipped))}`);

          for (const issue of result.issues) {
            const icon =
              issue.action === "spawned" ? "✅" :
              issue.action === "skipped_active" ? "⏭️" :
              issue.action === "skipped_max" ? "🚫" :
              issue.action === "skipped_dry_run" ? "👀" :
              "❌";
            console.log(`  ${icon} ${issue.identifier} — ${issue.action}`);
            if (issue.error) {
              console.log(chalk.red(`     ${issue.error}`));
            }
          }
        }

        console.log(chalk.bold.green("\n✓ Discovery complete\n"));
      } catch (err) {
        console.error(chalk.red("\nError:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
```

**Register in CLI entry point** (e.g., `packages/qagent/packages/cli/src/index.ts`):

```typescript
import { registerDiscover } from "./commands/discover.js";
// ...
registerDiscover(program);
```

### 3.4 Tracker Plugin Checklist

| Tracker Plugin | `listIssues` implemented? | Notes |
|---|---|---|
| `tracker-github` | ✅ Yes | Full implementation with filters, tests passing |
| `tracker-linear` | ❓ Check | Needs verification — likely needs implementation |
| `tracker-jira` | ❓ Check | If it exists, needs verification |

**To check Linear tracker:**

```bash
grep -rn "listIssues" packages/qagent/packages/plugins/tracker-linear/src/
```

If missing, the implementation follows the same pattern as GitHub — query the Linear GraphQL API for issues with matching labels/states, return normalized `Issue[]`.

---

## 4. Configuration Examples

All config lives in `agent-orchestrator.yaml` under each project's `autoDiscovery` key.

### 4.1 Default Off (No Configuration Needed)

```yaml
projects:
  my-project:
    name: My Project
    repo: owner/repo
    # autoDiscovery not specified → defaults to { enabled: false }
```

### 4.2 Dry Run (Safe Testing)

```yaml
projects:
  my-project:
    name: My Project
    repo: owner/repo
    autoDiscovery:
      enabled: true
      label: "agent-ready"
      dryRun: true  # logs what would be spawned, spawns nothing
```

### 4.3 Production — GitHub with Label Gating

```yaml
projects:
  qcut:
    name: QCut
    repo: nicepkg/qcut
    tracker:
      plugin: github
    autoDiscovery:
      enabled: true
      label: "agent-ready"      # only issues with this label
      maxConcurrent: 3           # conservative limit
      intervalMs: 120000         # poll every 2 minutes
      dryRun: false
      states: ["Todo"]
```

### 4.4 Production — Liberal Discovery

```yaml
projects:
  internal-tool:
    name: Internal Tool
    repo: company/internal-tool
    tracker:
      plugin: github
    autoDiscovery:
      enabled: true
      label: "good-first-issue"  # broader label for simpler issues
      maxConcurrent: 10
      intervalMs: 60000
      states: ["Todo", "Backlog"]
```

### 4.5 Linear Example

```yaml
projects:
  mobile-app:
    name: Mobile App
    repo: company/mobile-app
    tracker:
      plugin: linear
      teamId: "TEAM-123"
    autoDiscovery:
      enabled: true
      label: "agent-ready"
      maxConcurrent: 5
      intervalMs: 180000         # 3 minutes — Linear rate limits
      states: ["Todo", "Backlog"]
```

### 4.6 Multi-Project Configuration

```yaml
projects:
  frontend:
    name: Frontend
    repo: company/frontend
    tracker:
      plugin: github
    autoDiscovery:
      enabled: true
      label: "agent-ready"
      maxConcurrent: 3

  backend:
    name: Backend
    repo: company/backend
    tracker:
      plugin: github
    autoDiscovery:
      enabled: true
      label: "agent-ready"
      maxConcurrent: 5
      intervalMs: 90000

  docs:
    name: Documentation
    repo: company/docs
    # autoDiscovery disabled for docs — manual only
```

---

## 5. Testing Plan

### 5.1 Unit Tests for `resolveAutoDiscoveryConfig`

**File:** `packages/qagent/packages/core/test/issue-discovery.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { resolveAutoDiscoveryConfig } from "../src/issue-discovery.js";
import type { ProjectConfig } from "../src/types.js";

describe("resolveAutoDiscoveryConfig", () => {
  it("returns defaults when no autoDiscovery is configured", () => {
    const project = {} as ProjectConfig;
    const config = resolveAutoDiscoveryConfig(project);
    expect(config.enabled).toBe(false);
    expect(config.label).toBe("agent-ready");
    expect(config.maxConcurrent).toBe(5);
    expect(config.intervalMs).toBe(60_000);
    expect(config.dryRun).toBe(false);
    expect(config.states).toEqual(["Todo"]);
  });

  it("merges partial config with defaults", () => {
    const project = {
      autoDiscovery: { enabled: true, label: "auto" },
    } as ProjectConfig;
    const config = resolveAutoDiscoveryConfig(project);
    expect(config.enabled).toBe(true);
    expect(config.label).toBe("auto");
    expect(config.maxConcurrent).toBe(5); // default preserved
  });

  it("respects all overrides", () => {
    const project = {
      autoDiscovery: {
        enabled: true,
        label: "custom-label",
        maxConcurrent: 10,
        intervalMs: 30_000,
        dryRun: true,
        states: ["Todo", "Backlog"],
      },
    } as ProjectConfig;
    const config = resolveAutoDiscoveryConfig(project);
    expect(config).toEqual({
      enabled: true,
      label: "custom-label",
      maxConcurrent: 10,
      intervalMs: 30_000,
      dryRun: true,
      states: ["Todo", "Backlog"],
    });
  });
});
```

### 5.2 Unit Tests for `discoverAndSpawn`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverAndSpawn } from "../src/issue-discovery.js";
import type { IssueDiscoveryDeps, ProjectConfig, OrchestratorConfig } from "../src/types.js";

function createMockDeps(overrides?: Partial<IssueDiscoveryDeps>): IssueDiscoveryDeps {
  return {
    config: { projects: {}, reactions: {}, defaults: {} } as OrchestratorConfig,
    registry: {
      get: vi.fn().mockReturnValue({
        listIssues: vi.fn().mockResolvedValue([]),
      }),
    } as any,
    sessionManager: {
      list: vi.fn().mockResolvedValue([]),
      spawn: vi.fn().mockResolvedValue({ id: "test-session" }),
    } as any,
    notifyHuman: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("discoverAndSpawn", () => {
  it("returns early when discovery is disabled", async () => {
    const deps = createMockDeps();
    const project = {} as ProjectConfig; // no autoDiscovery → disabled
    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBe(0);
    expect(result.spawned).toBe(0);
  });

  it("returns early when no tracker is configured", async () => {
    const deps = createMockDeps();
    const project = { autoDiscovery: { enabled: true } } as ProjectConfig;
    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBe(0);
  });

  it("spawns sessions for new issues", async () => {
    const mockTracker = {
      listIssues: vi.fn().mockResolvedValue([
        { id: "42", title: "Fix bug", labels: ["agent-ready"], state: "open", url: "https://..." },
        { id: "43", title: "Add feature", labels: ["agent-ready"], state: "open", url: "https://..." },
      ]),
    };
    const deps = createMockDeps({
      registry: { get: vi.fn().mockReturnValue(mockTracker) } as any,
    });
    const project = {
      autoDiscovery: { enabled: true, label: "agent-ready" },
      tracker: { plugin: "github" },
    } as any;

    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBe(2);
    expect(result.spawned).toBe(2);
    expect(deps.sessionManager.spawn).toHaveBeenCalledTimes(2);
  });

  it("skips issues that already have active sessions", async () => {
    const mockTracker = {
      listIssues: vi.fn().mockResolvedValue([
        { id: "42", title: "Fix bug", labels: ["agent-ready"], state: "open" },
      ]),
    };
    const deps = createMockDeps({
      registry: { get: vi.fn().mockReturnValue(mockTracker) } as any,
      sessionManager: {
        list: vi.fn().mockResolvedValue([
          { id: "s1", issueId: "42", status: "working" },
        ]),
        spawn: vi.fn(),
      } as any,
    });
    const project = {
      autoDiscovery: { enabled: true },
      tracker: { plugin: "github" },
    } as any;

    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBe(1);
    expect(result.spawned).toBe(0);
    expect(result.issues[0].action).toBe("skipped_active");
  });

  it("respects maxConcurrent limit", async () => {
    const mockTracker = {
      listIssues: vi.fn().mockResolvedValue([
        { id: "1", title: "A", labels: [], state: "open" },
        { id: "2", title: "B", labels: [], state: "open" },
        { id: "3", title: "C", labels: [], state: "open" },
      ]),
    };
    const deps = createMockDeps({
      registry: { get: vi.fn().mockReturnValue(mockTracker) } as any,
      sessionManager: {
        list: vi.fn().mockResolvedValue([
          { id: "existing", status: "working" }, // 1 active
        ]),
        spawn: vi.fn().mockResolvedValue({ id: "new" }),
      } as any,
    });
    const project = {
      autoDiscovery: { enabled: true, maxConcurrent: 2 }, // only 1 slot left
      tracker: { plugin: "github" },
    } as any;

    const result = await discoverAndSpawn("test", project, deps);
    expect(result.spawned).toBe(1);
    expect(result.issues.filter(i => i.action === "skipped_max")).toHaveLength(2);
  });

  it("respects dryRun mode", async () => {
    const mockTracker = {
      listIssues: vi.fn().mockResolvedValue([
        { id: "42", title: "Fix bug", labels: [], state: "open" },
      ]),
    };
    const deps = createMockDeps({
      registry: { get: vi.fn().mockReturnValue(mockTracker) } as any,
    });
    const project = {
      autoDiscovery: { enabled: true, dryRun: true },
      tracker: { plugin: "github" },
    } as any;

    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBe(1);
    expect(result.spawned).toBe(0);
    expect(result.issues[0].action).toBe("skipped_dry_run");
    expect(deps.sessionManager.spawn).not.toHaveBeenCalled();
  });
});
```

### 5.3 Integration Test with Real GitHub Issues

```typescript
import { describe, it, expect } from "vitest";
import { discoverAndSpawn, resolveAutoDiscoveryConfig } from "../src/issue-discovery.js";

// Only run with INTEGRATION=true (requires gh CLI auth)
describe.skipIf(!process.env.INTEGRATION)("discoverAndSpawn (integration)", () => {
  it("discovers real GitHub issues", async () => {
    // Use a test repo with known issues
    const project = {
      repo: "your-org/test-repo",
      tracker: { plugin: "github" },
      autoDiscovery: {
        enabled: true,
        label: "agent-ready",
        dryRun: true, // ALWAYS dry run in integration tests
        maxConcurrent: 3,
      },
    } as any;

    const deps = {
      config: { projects: { test: project }, reactions: {}, defaults: {} } as any,
      registry: createRealPluginRegistry(), // uses actual tracker-github plugin
      sessionManager: createMockSessionManager(),
      notifyHuman: async () => {},
    };

    const result = await discoverAndSpawn("test", project, deps);
    expect(result.discovered).toBeGreaterThanOrEqual(0);
    // All should be dry-run skipped
    expect(result.spawned).toBe(0);
    for (const issue of result.issues) {
      expect(issue.action).toBe("skipped_dry_run");
    }
  });
});
```

### 5.4 Test for `createIssueDiscoveryLoop`

```typescript
describe("createIssueDiscoveryLoop", () => {
  it("starts per-project timers for enabled projects", () => {
    vi.useFakeTimers();
    const spawnFn = vi.fn().mockResolvedValue({ id: "s" });
    const deps = createMockDeps({
      config: {
        projects: {
          enabled: { autoDiscovery: { enabled: true }, tracker: { plugin: "github" } },
          disabled: { autoDiscovery: { enabled: false } },
        },
      } as any,
    });

    const loop = createIssueDiscoveryLoop(deps);
    loop.start();

    // Should have triggered immediate run for enabled project
    // Advance past interval to verify timer fires
    vi.advanceTimersByTime(60_000);

    loop.stop();
    vi.useRealTimers();
  });

  it("runOnce() executes discovery for all enabled projects", async () => {
    // ... similar setup, call loop.runOnce(), verify results
  });
});
```

---

## 6. Safety Considerations

### 6.1 Default Off

The most important safety mechanism: **auto-discovery is disabled by default**.

```typescript
const DEFAULT_AUTO_DISCOVERY = {
  enabled: false, // ← must explicitly opt in
  // ...
};
```

A project with no `autoDiscovery` config, or with `enabled: false`, will never have issues auto-discovered. The `resolveAutoDiscoveryConfig` function ensures this.

### 6.2 Dry Run Mode

Before enabling auto-spawning in production, operators should run with `dryRun: true`:

```yaml
autoDiscovery:
  enabled: true
  dryRun: true  # see what would happen without doing it
```

In dry run, `discoverAndSpawn` marks every candidate as `skipped_dry_run` and never calls `sessionManager.spawn()`. The CLI command `ao discover --dry-run` also forces this mode.

### 6.3 Label Gating

The `label` field (default: `"agent-ready"`) acts as a human-controlled gate:

- Only issues explicitly tagged with the configured label are eligible
- Humans apply the label after triaging the issue
- Removing the label prevents future discovery (though already-spawned sessions continue)
- Different labels can gate different complexity levels (e.g., `agent-ready-simple` vs `agent-ready`)

**Recommendation:** Always configure a label. The default `"agent-ready"` is intentionally specific — generic labels like `"bug"` would be dangerous.

### 6.4 Max Concurrent Limit

The `maxConcurrent` setting (default: 5) prevents runaway spawning:

```text
availableSlots = maxConcurrent - currentActiveSessionCount
```

If a project already has `maxConcurrent` active sessions (including manually spawned ones), no new auto-discovery sessions are created. This prevents:

- Resource exhaustion (tmux sessions, CPU, API rate limits)
- Overwhelming code review queues
- Runaway costs from agent compute

### 6.5 Rate Limiting Considerations

**Tracker API rate limits:**

| Tracker | Rate Limit | Recommended `intervalMs` |
|---------|-----------|--------------------------|
| GitHub (`gh` CLI) | 5,000 req/hr (authenticated) | 60,000 (1 min) |
| Linear (GraphQL) | 1,500 req/hr | 120,000-180,000 (2-3 min) |
| Jira (REST) | Varies by plan | 120,000+ |

**Guard against burst:**
- The `running` flag in `createIssueDiscoveryLoop` prevents overlapping discovery cycles
- Each project gets its own timer, so a slow project doesn't block others
- Network errors are silently caught — a failed poll just skips that cycle

**Additional safeguards to consider for future work:**

1. **Exponential backoff on tracker errors** — if `listIssues` fails repeatedly, increase the poll interval
2. **Circuit breaker** — after N consecutive failures, disable discovery for that project until manually reset
3. **Per-issue cooldown** — don't retry spawning a failed issue immediately (track `failed` issue IDs with TTL)
4. **Human confirmation mode** — instead of auto-spawning, post a "these issues are ready, spawn? [y/n]" notification

### 6.6 Notification Safety

Every auto-spawn triggers a notification via `notifyHuman()`. This ensures:
- Humans are always aware of what the discovery loop is doing
- Individual spawn notifications include issue ID, title, and URL
- Summary notifications aggregate per-cycle activity
- `dryRun` mode still logs what would happen

---

## 7. Rollout Checklist

### Phase 1: Integration (Code Changes)

- [ ] Wire `createIssueDiscoveryLoop` into `lifecycle-manager.ts` (Section 3.1)
- [ ] Expose `runDiscovery()` on the `LifecycleManager` interface (Section 3.2)
- [ ] Create `ao discover` CLI command (Section 3.3)
- [ ] Register `discover` command in CLI entry point
- [ ] Verify Linear tracker has `listIssues` (Section 3.4)

### Phase 2: Testing

- [ ] Unit tests for `resolveAutoDiscoveryConfig` (Section 5.1)
- [ ] Unit tests for `discoverAndSpawn` (Section 5.2)
- [ ] Unit tests for `createIssueDiscoveryLoop` timer behavior (Section 5.4)
- [ ] Integration test with dry run against real GitHub repo (Section 5.3)
- [ ] Manual test: `ao discover --dry-run` against a real project

### Phase 3: Documentation

- [ ] Add `autoDiscovery` section to `agent-orchestrator.yaml` schema docs
- [ ] Document `ao discover` in CLI help / README
- [ ] Add config examples to getting-started guide

### Phase 4: Rollout

- [ ] Deploy with `dryRun: true` on one project
- [ ] Monitor logs for 24-48 hours
- [ ] Verify discovered issues match expectations
- [ ] Enable `dryRun: false` with conservative `maxConcurrent: 2`
- [ ] Gradually increase `maxConcurrent` as confidence builds

---

*Last updated: 2026-03-07*
