# QAgent v2: Prompt File, Agent Plugin Refactor, and ACP Integration

## Problem Statement

Three issues identified during E2E testing (Run 2 & Run 3):

1. **Massive inline prompt** — The full prompt (4000+ chars) is passed via `claude -p '...'`, flooding tmux scrollback, causing 14-minute startup delays, and risking shell argument limits.
2. **Agent plugin is 841 lines** — `agent-claude-code/src/index.ts` exceeds the 800-line limit and mixes concerns (process detection, JSONL parsing, hook scripts, launch commands).
3. **Terminal scraping is fragile** — Activity detection via `tmux capture-pane`, message sending via `tmux send-keys`, and metadata updates via bash hooks are all brittle. ACP (Agent Client Protocol) replaces all of this with structured JSON-RPC.

## Implementation Plan

### Phase 1: Prompt File (Small, Immediate)

**Goal:** Write prompt to a file, pass the file path instead of inlining.

**Estimated time:** 30 minutes

#### Task 1.1: Add `promptFile` to AgentLaunchConfig

**File:** `packages/core/src/types/plugin-types.ts:153-181`

Add a new field alongside the existing `systemPromptFile` pattern:

```typescript
export interface AgentLaunchConfig {
  // ... existing fields ...
  prompt?: string;
  /** Path to a file containing the prompt. Preferred over inline prompt
   *  to avoid shell/tmux argument length issues. When set, takes
   *  precedence over prompt. */
  promptFile?: string;
  // ... rest ...
}
```

#### Task 1.2: Write prompt to file during spawn

**File:** `packages/core/src/session-manager-spawn.ts:260-278`

After `buildPrompt()`, write the composed prompt to a file instead of inlining:

```typescript
let promptFile: string | undefined;
if (composedPrompt) {
  const baseDir = getProjectBaseDir(config.configPath, project.path);
  mkdirSync(baseDir, { recursive: true });
  promptFile = join(baseDir, `${sessionId}-prompt.md`);
  writeFileSync(promptFile, composedPrompt, "utf-8");
}

const agentLaunchConfig = {
  // ... existing fields ...
  promptFile,                        // NEW: path to prompt file
  prompt: promptFile ? undefined : composedPrompt,  // fallback if no file
};
```

#### Task 1.3: Update claude-code plugin to use promptFile

**File:** `packages/plugins/agent-claude-code/src/index.ts:624-654`

In `getLaunchCommand()`, use shell substitution to read from file:

```typescript
if (config.promptFile) {
  parts.push("-p", `"$(cat ${shellEscape(config.promptFile)})"`);
} else if (config.prompt) {
  parts.push("-p", shellEscape(config.prompt));
}
```

#### Task 1.4: Tests

**File:** `packages/core/src/__tests__/session-manager-spawn.test.ts`
- Test that prompt file is written when composedPrompt is non-null
- Test that promptFile path is passed in agentLaunchConfig
- Test cleanup: prompt file deleted on spawn failure

**File:** `packages/plugins/agent-claude-code/src/__tests__/index.test.ts` (or create)
- Test getLaunchCommand with promptFile uses `$(cat ...)`
- Test getLaunchCommand without promptFile falls back to `-p`

---

### Phase 2: Agent Plugin Refactor (Medium)

**Goal:** Split 841-line `agent-claude-code/src/index.ts` into focused files.

**Estimated time:** 45 minutes

#### Task 2.1: Extract JSONL parsing

**New file:** `packages/plugins/agent-claude-code/src/jsonl.ts` (~180 lines)

Move from `index.ts`:
- `toClaudeProjectPath()` (line 206)
- `findLatestSessionFile()` (line 214)
- `parseJsonlFileTail()` (line 276)
- `extractSummary()` (line 329)
- `extractCost()` (line 358)
- `JsonlLine` interface (line 245)

#### Task 2.2: Extract process detection

**New file:** `packages/plugins/agent-claude-code/src/process.ts` (~70 lines)

Move from `index.ts`:
- `findClaudeProcess()` (line 413)

#### Task 2.3: Extract terminal activity classification

**New file:** `packages/plugins/agent-claude-code/src/activity.ts` (~30 lines)

Move from `index.ts`:
- `classifyTerminalOutput()` (line 485)

#### Task 2.4: Extract hook setup

**New file:** `packages/plugins/agent-claude-code/src/hooks.ts` (~200 lines)

Move from `index.ts`:
- `METADATA_UPDATER_SCRIPT` constant (line 39)
- `setupHookInWorkspace()` (line 523)

#### Task 2.5: Slim down index.ts

**File:** `packages/plugins/agent-claude-code/src/index.ts` (~350 lines)

Keep only:
- Plugin manifest
- `createClaudeCodeAgent()` with imports from new modules
- Plugin export

#### Task 2.6: Tests

**File:** `packages/plugins/agent-claude-code/src/__tests__/jsonl.test.ts`
- Test `toClaudeProjectPath` edge cases
- Test `parseJsonlFileTail` with various file sizes
- Test `extractSummary` and `extractCost`

**File:** `packages/plugins/agent-claude-code/src/__tests__/activity.test.ts`
- Test `classifyTerminalOutput` states (active, idle, waiting_input)

Existing tests should continue to pass since all public exports are preserved.

---

### Phase 3: ACP Integration (Large)

**Goal:** Replace tmux terminal scraping with ACP JSON-RPC protocol for Claude Code and Codex.

**Estimated time:** 4-6 hours across multiple sessions

#### Background

ACP (Agent Client Protocol) is a JSON-RPC 2.0 protocol that standardizes communication between clients and coding agents. Key methods:

| Method | Direction | Purpose |
|--------|-----------|---------|
| `initialize` | client → agent | Capability negotiation |
| `session/new` | client → agent | Create conversation session |
| `session/prompt` | client → agent | Send user message |
| `session/update` | agent → client | Streaming progress notifications |
| `session/cancel` | client → agent | Cancel current operation |
| `session/request_permission` | agent → client | Ask for tool approval |

Transport: **JSON-RPC over stdio** (local) or **HTTP/WebSocket** (remote).

Agents implementing ACP: Claude Code, Codex CLI, Gemini CLI, GitHub Copilot, OpenCode, Goose, and ~25 others.

#### Task 3.1: Create ACP client library

**New file:** `packages/core/src/acp-client.ts` (~200 lines)

Minimal JSON-RPC 2.0 client over stdio:
- `createAcpClient(command, args, cwd, env)` → spawns agent process
- `initialize()` → sends `initialize` method
- `newSession(workingDir)` → sends `session/new`
- `prompt(sessionId, content)` → sends `session/prompt`
- `cancel(sessionId)` → sends `session/cancel`
- Event emitter for `session/update` notifications
- Handles `session/request_permission` (auto-approve in skip mode)

```typescript
export interface AcpClient {
  initialize(): Promise<AcpCapabilities>;
  newSession(config: AcpSessionConfig): Promise<AcpSession>;
  prompt(sessionId: string, message: string): Promise<AcpPromptResult>;
  cancel(sessionId: string): Promise<void>;
  on(event: "update", handler: (update: AcpUpdate) => void): void;
  on(event: "permission", handler: (req: AcpPermissionRequest) => AcpPermissionResponse): void;
  close(): Promise<void>;
}
```

#### Task 3.2: New runtime plugin — `runtime-acp`

**New dir:** `packages/plugins/runtime-acp/`

Implements `Runtime` interface using ACP instead of tmux:

```
runtime-acp/
  src/
    index.ts        # Plugin manifest + create()
    acp-runtime.ts  # Runtime implementation
  package.json
  tsconfig.json
```

Key differences from `runtime-tmux`:
- `create()` → spawns `claude` with `--output-format stream-json --input-format stream-json` (or ACP stdio mode), returns AcpClient as handle data
- `sendMessage()` → calls `acp.prompt()` instead of `tmux send-keys`
- `getOutput()` → returns buffered `session/update` text instead of `tmux capture-pane`
- `isAlive()` → checks if stdio pipe is open instead of `tmux has-session`
- `destroy()` → calls `acp.cancel()` then kills process

#### Task 3.3: New agent plugin — `agent-acp`

**New dir:** `packages/plugins/agent-acp/`

A simplified agent plugin that works with ACP-compatible agents:
- `getLaunchCommand()` → returns command with ACP flags
- `detectActivity()` → uses ACP event stream (no terminal parsing)
- `getActivityState()` → uses ACP session state directly
- `isProcessRunning()` → checks ACP client connection
- `getSessionInfo()` → uses ACP metadata (no JSONL parsing)

This replaces the need for:
- `tmux capture-pane` terminal scraping
- JSONL file parsing for activity/cost detection
- Bash hook scripts for PR/branch metadata
- `tmux send-keys` for message delivery

#### Task 3.4: Update config schema

**File:** `packages/core/src/types/config-types.ts`

Add `acp` as a valid runtime option:

```yaml
# qagent.yaml
defaults:
  runtime: acp      # NEW: use ACP instead of tmux
  agent: claude-code
```

#### Task 3.5: Gradual migration path

Keep both `runtime-tmux` + `agent-claude-code` and `runtime-acp` + `agent-acp` working simultaneously. Users switch via config:

```yaml
# Legacy (works today)
defaults:
  runtime: tmux
  agent: claude-code

# ACP (new)
defaults:
  runtime: acp
  agent: acp
```

#### Task 3.6: Tests

**File:** `packages/core/src/__tests__/acp-client.test.ts`
- Test JSON-RPC message framing
- Test initialize/newSession/prompt/cancel flows
- Test event emission for session/update
- Test graceful close

**File:** `packages/plugins/runtime-acp/src/__tests__/index.test.ts`
- Test create/destroy lifecycle
- Test sendMessage maps to prompt
- Test getOutput returns buffered updates
- Test isAlive checks pipe status

---

## File Impact Summary

### Phase 1 (Prompt File)
| File | Action |
|------|--------|
| `core/src/types/plugin-types.ts` | Add `promptFile` to `AgentLaunchConfig` |
| `core/src/session-manager-spawn.ts` | Write prompt file, pass path |
| `plugins/agent-claude-code/src/index.ts` | Handle `promptFile` in `getLaunchCommand` |
| `core/src/__tests__/session-manager-spawn.test.ts` | Add prompt file tests |

### Phase 2 (Refactor)
| File | Action |
|------|--------|
| `plugins/agent-claude-code/src/jsonl.ts` | NEW — extracted JSONL parsing |
| `plugins/agent-claude-code/src/process.ts` | NEW — extracted process detection |
| `plugins/agent-claude-code/src/activity.ts` | NEW — extracted terminal classification |
| `plugins/agent-claude-code/src/hooks.ts` | NEW — extracted hook setup |
| `plugins/agent-claude-code/src/index.ts` | SLIMMED — imports from new files |

### Phase 3 (ACP)
| File | Action |
|------|--------|
| `core/src/acp-client.ts` | NEW — ACP JSON-RPC client |
| `plugins/runtime-acp/` | NEW — ACP runtime plugin |
| `plugins/agent-acp/` | NEW — ACP agent plugin |
| `core/src/types/config-types.ts` | Add `acp` runtime option |

---

## Execution Order

1. **Phase 1** first — immediate win, fixes the tmux flood, 30 min
2. **Phase 2** second — reduces agent-claude-code below 800 lines, 45 min
3. **Phase 3** last — largest effort, can be done across multiple sessions

Phases 1 and 2 have no dependencies on each other and could be done in parallel.
Phase 3 depends on neither — it's additive (new plugins alongside existing ones).
