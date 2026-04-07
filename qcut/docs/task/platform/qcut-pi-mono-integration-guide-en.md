# How to Build an Embedded AI Agent in QCut Using Pi Mono: Complete Implementation Guide

> Turn an 87+ CLI command video editor into a natural-language-driven AI workbench — no Claude Code installation required.

## Architecture Overview

```text
User types "Cut this video to 15 seconds"
         │
         ▼
┌─────────────────────────┐
│   QCut Editor (Electron) │
│  ┌───────────────────┐  │
│  │  Chat Panel       │  │
│  │  (pi-web-ui)      │  │
│  └────────┬──────────┘  │
│           │              │
│  ┌────────▼──────────┐  │
│  │  pi-agent-core    │  │
│  │  Agent Runtime    │  │
│  │  - Tool registry  │  │
│  │  - State mgmt     │  │
│  │  - transformContext│  │
│  └────────┬──────────┘  │
│           │              │
│  ┌────────▼──────────┐  │
│  │  pi-ai            │  │
│  │  Unified LLM API  │  │
│  │  Claude/GPT/Gemini│  │
│  └────────┬──────────┘  │
│           │              │
│           ▼              │
│     LLM returns tool call│
│           │              │
│  ┌────────▼──────────┐  │
│  │  QCut CLI Bridge  │  │
│  │  qcut-pipeline    │  │
│  │  87+ commands     │  │
│  └────────┬──────────┘  │
│           │              │
│           ▼              │
│   Result → Chat UI      │
└─────────────────────────┘
```

The agent runs in Electron's main process, calling QCut CLI commands in-process via `CLIPipelineRunner`. Users type natural language in the editor's chat panel, Pi Mono handles LLM interaction and tool calling, and the CLI returns JSON results.

## Step 1: Install Pi Mono Packages

```bash
cd qcut/
npm install @mariozechner/pi-ai @mariozechner/pi-agent-core @mariozechner/pi-web-ui
```

| Package | Purpose | Role |
|---------|---------|------|
| `pi-ai` | Unified LLM API across OpenAI/Anthropic/Google | LLM layer |
| `pi-agent-core` | Agent runtime: tool calling, state, events, context compression | Core |
| `pi-web-ui` | React chat components for embedding in Electron | UI |

**Context:** Pi Mono is a monorepo ([github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono)) with 23.6k stars and 171 releases, maintained by Mario Zechner (creator of libGDX). OpenClaw already uses these packages in production.

## Step 2: Progressive Command Loading Design

QCut has 87+ CLI commands. Dumping all of them into the system prompt is **wrong** — it wastes tokens and degrades response quality.

The right approach: leverage QCut's existing 3-layer help system for progressive discovery.

### L0: System Prompt — Category Overview Only (~200 tokens)

```typescript
const SYSTEM_PROMPT = `You are a QCut video editing assistant. QCut is controlled via CLI commands.

Available command categories:
- timeline: Timeline operations (cut, split, move, delete clips)
- media: Media import and management
- transcribe: AI transcription and subtitles
- export: Export and rendering
- effects: Effects and transitions
- audio: Audio processing
- ai: AI-assisted features (smart cuts, content analysis)
- project: Project management

Use the qcut_help tool to list commands in a category.
Use the qcut_command_help tool to get detailed parameters for a specific command.
Always discover available commands before executing operations.`;
```

### L1: `qcut_help` Tool — Lists Commands per Category

```typescript
const qcutHelpTool = {
  name: 'qcut_help',
  description: 'List QCut commands. Pass a category name to get all commands in that category.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Command category: timeline, media, transcribe, export, etc.'
      }
    },
    required: ['category']
  },
  execute: async (params: { category: string }) => {
    const result = await execCli(`qcut-pipeline ${params.category} --help --json`);
    return JSON.parse(result);
    // Returns: { commands: ["split", "trim", "delete", "move", ...], descriptions: {...} }
  }
};
```

### L2: `qcut_command_help` Tool — Full Parameter Details

```typescript
const qcutCommandHelpTool = {
  name: 'qcut_command_help',
  description: 'Get full parameters and usage for a specific QCut command.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Full command name, e.g. timeline:split, media:import'
      }
    },
    required: ['command']
  },
  execute: async (params: { command: string }) => {
    const result = await execCli(
      `qcut-pipeline ${params.command} --help --json`
    );
    return JSON.parse(result);
    // Returns: { name, description, parameters: [{name, type, required, default, description}...] }
  }
};
```

**Result:** When the agent first needs to edit video, it calls L1 to discover timeline commands, then L2 to get `timeline:split` parameters. In subsequent turns, the LLM has already "learned" these commands — no repeat queries needed.

## Step 3: Register QCut CLI Commands as Tools

Core pattern: each CLI command maps to an agent tool.

### CLI Bridge Function

```typescript
import { CLIPipelineRunner } from '../native-pipeline/cli/cli-runner/runner.js';
import { initRegistry } from '../native-pipeline/init.js';

let runner: CLIPipelineRunner | null = null;

function getRunner(): CLIPipelineRunner {
  if (!runner) {
    initRegistry();
    runner = new CLIPipelineRunner();
  }
  return runner;
}

async function execCli(
  command: string,
  args: Record<string, unknown> = {},
  timeout = 60_000
): Promise<CLIResult> {
  const r = getRunner();
  const options = { command, json: true, ...args };
  // Run with timeout, return { success, error?, ... }
  return await Promise.race([r.run(options), timeoutPromise(timeout)]);
}
```

### Representative Tool Implementations

```typescript
// Timeline split
const timelineSplitTool = {
  name: 'timeline_split',
  description: 'Split a clip on the timeline at a specified time point',
  parameters: {
    type: 'object',
    properties: {
      track: { type: 'number', description: 'Track index' },
      time: { type: 'string', description: 'Split time point, e.g. "00:01:30.500"' },
      clip_id: { type: 'string', description: 'Clip ID to split (optional)' }
    },
    required: ['time']
  },
  execute: async (params: { track?: number; time: string; clip_id?: string }) => {
    const args = [`--time "${params.time}"`];
    if (params.track !== undefined) args.push(`--track ${params.track}`);
    if (params.clip_id) args.push(`--clip-id "${params.clip_id}"`);
    return JSON.parse(await execCli(`timeline:split ${args.join(' ')}`));
  }
};

// Media import
const mediaImportTool = {
  name: 'media_import',
  description: 'Import a media file into the project',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      track: { type: 'number', description: 'Target track' },
      position: { type: 'string', description: 'Insert position timecode' }
    },
    required: ['path']
  },
  execute: async (params) => {
    const args = [`--path "${params.path}"`];
    if (params.track !== undefined) args.push(`--track ${params.track}`);
    if (params.position) args.push(`--position "${params.position}"`);
    return JSON.parse(await execCli(`media:import ${args.join(' ')}`));
  }
};

// AI Transcription
const transcribeTool = {
  name: 'transcribe',
  description: 'Run AI transcription on video/audio to generate subtitles',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source file path or clip ID' },
      language: { type: 'string', description: 'Language code: zh, en, etc.' },
      model: { type: 'string', description: 'Transcription model: whisper-large-v3' }
    },
    required: ['source']
  },
  execute: async (params) => {
    const args = [`--source "${params.source}"`];
    if (params.language) args.push(`--language ${params.language}`);
    if (params.model) args.push(`--model ${params.model}`);
    return JSON.parse(await execCli(`transcribe ${args.join(' ')}`));
  }
};

// Export
const exportStartTool = {
  name: 'export_start',
  description: 'Start exporting/rendering the project',
  parameters: {
    type: 'object',
    properties: {
      output: { type: 'string', description: 'Output file path' },
      format: { type: 'string', description: 'Format: mp4, mov, webm' },
      resolution: { type: 'string', description: 'Resolution: 1080p, 4k' },
      quality: { type: 'string', description: 'Quality: draft, normal, high' }
    },
    required: ['output']
  },
  execute: async (params) => {
    const args = [`--output "${params.output}"`];
    if (params.format) args.push(`--format ${params.format}`);
    if (params.resolution) args.push(`--resolution ${params.resolution}`);
    if (params.quality) args.push(`--quality ${params.quality}`);
    return JSON.parse(await execCli(`export:start ${args.join(' ')}`));
  }
};
```

### Auto-Generating Tool Registrations

With 87+ commands, writing each tool by hand is impractical. Use `--help --json` output to auto-generate:

```typescript
async function autoRegisterTools(agent: Agent, categories: string[]) {
  for (const category of categories) {
    const helpJson = await execCli(`${category} --help --json`);
    const { commands } = JSON.parse(helpJson);

    for (const cmd of commands) {
      const cmdHelp = await execCli(`${category}:${cmd.name} --help --json`);
      const cmdInfo = JSON.parse(cmdHelp);

      agent.registerTool({
        name: `${category}_${cmd.name}`,
        description: cmdInfo.description,
        parameters: buildParameterSchema(cmdInfo.parameters),
        execute: async (params) => {
          const args = buildCliArgs(params, cmdInfo.parameters);
          return JSON.parse(await execCli(`${category}:${cmd.name} ${args}`));
        }
      });
    }
  }
}
```

**Recommendation:** For MVP, register only the 15-20 most-used commands as direct tools. Let the agent discover the rest via the L1/L2 help system on demand.

## Step 4: Agent Initialization with pi-agent-core

```typescript
import { Agent, type AgentConfig } from '@mariozechner/pi-agent-core';
import { createProvider } from '@mariozechner/pi-ai';

// Create LLM provider
const provider = createProvider({
  type: 'anthropic',  // or 'openai', 'google'
  apiKey: userSettings.apiKey,
  model: 'claude-sonnet-4-20250514'
});

// Agent configuration
const agentConfig: AgentConfig = {
  provider,
  systemPrompt: SYSTEM_PROMPT,

  tools: [
    qcutHelpTool,
    qcutCommandHelpTool,
    timelineSplitTool,
    mediaImportTool,
    transcribeTool,
    exportStartTool,
    // ... other common tools
  ],

  // Context compression — critical for long sessions
  transformContext: (messages) => {
    return compressEditingContext(messages);
  },

  // Event handling
  onToolCall: (toolName, params) => {
    chatPanel.showToolExecution(toolName, params);
  },

  onToolResult: (toolName, result) => {
    editor.refreshTimeline();
    chatPanel.showToolResult(toolName, result);
  }
};

// Create agent instance
const agent = new Agent(agentConfig);

// Handle user messages
async function handleUserMessage(text: string) {
  const response = await agent.chat(text);
  chatPanel.appendMessage('assistant', response);
}
```

## Step 5: Embed Chat UI in QCut Editor

QCut already has an AI panel UI framework. Embed using `pi-web-ui` or a custom React component:

### Option A: Using pi-web-ui Components

```tsx
import { ChatPanel } from '@mariozechner/pi-web-ui';

function QCutAIPanel() {
  const agent = useQCutAgent();

  return (
    <div className="qcut-ai-panel">
      <ChatPanel
        agent={agent}
        placeholder="Describe the edit you want..."
        theme="dark"
        onToolExecution={(tool, params) => {
          editor.highlightAffectedRegion(tool, params);
        }}
      />
    </div>
  );
}
```

### Option B: Custom Component (More Flexible)

```tsx
function QCutChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const agent = useQCutAgent();

  const handleSend = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsProcessing(true);

    try {
      const response = await agent.chat(text);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="qcut-chat">
      <MessageList messages={messages} />
      {isProcessing && <ToolExecutionIndicator />}
      <ChatInput onSend={handleSend} disabled={isProcessing} />
    </div>
  );
}
```

## Step 6: Context Management (transformContext)

Video editing sessions run long — users may perform dozens of operations in a row. Without context compression, token costs explode.

```typescript
function compressEditingContext(messages: Message[]): Message[] {
  const MAX_MESSAGES = 40;

  if (messages.length <= MAX_MESSAGES) return messages;

  const systemMsg = messages[0];
  const recentMessages = messages.slice(-MAX_MESSAGES);

  // Compress old tool results to summaries
  const compressed = recentMessages.map(msg => {
    if (msg.role === 'toolResult' && msg.content.length > 500) {
      const parsed = JSON.parse(msg.content);
      return {
        ...msg,
        content: JSON.stringify({
          status: parsed.status,
          summary: parsed.summary || 'Operation completed',
        })
      };
    }
    return msg;
  });

  // Insert current project state at compression boundary
  const projectState = getCurrentProjectState();
  const stateSummary: Message = {
    role: 'system',
    content: `[Context compressed] Current project state:
- Timeline duration: ${projectState.duration}
- Track count: ${projectState.trackCount}
- Clip count: ${projectState.clipCount}
- Recent operations: ${projectState.recentOps.join(', ')}
Previous conversation has been compressed.`
  };

  return [systemMsg, stateSummary, ...compressed];
}

function getCurrentProjectState() {
  const state = JSON.parse(
    execSync('qcut-pipeline project:status --json').toString()
  );
  return {
    duration: state.duration,
    trackCount: state.tracks.length,
    clipCount: state.totalClips,
    recentOps: state.undoStack.slice(-5).map((op: any) => op.name)
  };
}
```

**Key point:** `transformContext` is a built-in feature of `pi-agent-core`. It runs automatically before each LLM call — transparent to the user.

## Step 7: Multi-Model Support

The biggest advantage of `pi-ai`: unified API, user chooses the model.

```typescript
import { createProvider, type ProviderType } from '@mariozechner/pi-ai';

interface AISettings {
  provider: ProviderType; // 'anthropic' | 'openai' | 'google'
  model: string;
  apiKey: string;
}

function createAgentWithUserSettings(settings: AISettings) {
  const provider = createProvider({
    type: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model
  });

  return new Agent({
    provider,
    systemPrompt: SYSTEM_PROMPT,
    tools: qcutTools,
    transformContext: compressEditingContext
  });
}

// Settings UI
function AISettingsPanel() {
  const models = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'],
    openai: ['gpt-4o', 'gpt-4o-mini'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash']
  };

  return (
    <div className="ai-settings">
      <h3>AI Model Settings</h3>
      <Select label="Provider" options={Object.keys(models)} />
      <Select label="Model" options={models[selectedProvider]} />
      <Input label="API Key" type="password" />
      <p className="hint">
        Different models excel at different tasks.
        Claude handles complex editing intent well, GPT-4o is fast, Gemini supports ultra-long context.
      </p>
    </div>
  );
}
```

## Timeline Estimate

| Phase | Scope | Duration |
|-------|-------|----------|
| Week 1, first half | Install Pi Mono, build Agent + CLI bridge | 2-3 days |
| Week 1, second half | Register 15-20 core tools, implement L0-L2 help system | 2-3 days |
| Week 2, first half | Embed chat UI, implement transformContext | 2-3 days |
| Week 2, second half | Multi-model settings panel, testing & bug fixes | 2-3 days |

**MVP goal:** User types "split the video at 1 minute" in QCut's chat panel → Agent calls `timeline:split --time 00:01:00` → result displayed.

## Risk Mitigation

### Risk 1: Pi Mono is Single-Maintainer

Pi Mono is maintained solely by Mario Zechner. While he's an experienced developer (creator of libGDX), single-maintainer projects carry bus factor risk.

**Mitigation:**
- Pi Mono's core APIs (`pi-ai`, `pi-agent-core`) are lean — small codebase
- If maintenance stalls, fork and continue
- More aggressive fallback: abstract an interface layer, swap to Vercel AI SDK or direct LLM APIs

```typescript
// Abstract interface — swappable implementation
interface QCutAIProvider {
  chat(messages: Message[], tools: Tool[]): Promise<Response>;
}

class PiMonoProvider implements QCutAIProvider {
  private agent: Agent;
  async chat(messages, tools) { /* pi-agent-core */ }
}

class DirectAPIProvider implements QCutAIProvider {
  async chat(messages, tools) { /* direct Anthropic/OpenAI SDK */ }
}
```

### Risk 2: CLI Command Error Handling

LLMs may generate invalid parameters.

```typescript
function wrapToolExecute(execute: Function) {
  return async (params: any) => {
    try {
      return await execute(params);
    } catch (error: any) {
      return {
        status: 'error',
        message: error.message,
        hint: 'Check parameters. Use qcut_command_help to see parameter details.'
      };
    }
  };
}
```

### Risk 3: Long Session Token Costs

`transformContext` handles most of this. Additional measures:

- Set per-conversation token limits
- Show token usage stats in settings
- "New conversation" button to reset context

---

## Summary

The core ideas for embedding an AI agent in QCut with Pi Mono:

1. **Don't make users install CLI tools** — the agent lives inside the editor
2. **Don't stuff the system prompt** — use 3-layer progressive loading
3. **Use `pi-agent-core` to manage complexity** — tool registration, state management, context compression are built-in
4. **Let users choose their model** — `pi-ai` unified API, one line to switch

This isn't hypothetical. OpenClaw already runs agents with Pi Mono in production. QCut has a complete CLI command system (87+ commands, all supporting `--help --json`). The combination is natural.

1-2 weeks to MVP. Users edit video with natural language inside QCut.

---

## Detailed Implementation Plan

This section maps every concept from the guide above to exact file paths, existing patterns, and numbered subtasks. Nothing is hypothetical — every path and pattern reference was verified against the current codebase.

### Existing Patterns to Follow

| Concern | Existing Pattern | Key File(s) |
|---------|-----------------|-------------|
| IPC handler structure | Claude handlers (43 files) | `electron/claude/handlers/claude-media-handler.ts` |
| IPC registration entry point | `setupAllClaudeIPC()` barrel export | `electron/claude/index.ts` |
| Chat Zustand store | Gemini terminal store (streaming, messages, attachments) | `apps/web/src/stores/gemini-terminal-store.ts` |
| Chat UI component | Gemini terminal view (message list, input, drag-drop) | `apps/web/src/components/editor/media-panel/views/gemini-terminal.tsx` |
| Chat sub-components | MessageItem, AttachmentPreview | `apps/web/src/components/editor/media-panel/views/gemini-terminal/` |
| Media panel tab routing | Tab groups & `activeTab` in store | `apps/web/src/components/editor/media-panel/store.ts` |
| Preload bridge API | `window.electronAPI.geminiChat` | `electron/preload.ts` (lines 352-377) |
| Platform abstraction | `platform().geminiChat` | `packages/platform-core/` |
| CLI command registry | `COMMANDS_REGISTRY` (100+ commands) | `electron/native-pipeline/cli/command-registry.ts` |
| CLI runner | `CLIPipelineRunner` class | `electron/native-pipeline/cli/cli-runner/runner.ts` |
| API key encrypted storage | `safeStorage` + `~/.config/qcut/api-keys.json` | `electron/gemini-chat-handler.ts` |
| Main process handler setup | `setupGeminiChatIPC()` call | `electron/main.ts` (line 111) |

### Files to Create

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `electron/pi-agent/index.ts` | Barrel export: `setupPiAgentIPC()` |
| 2 | `electron/pi-agent/agent-factory.ts` | Create `Agent` instance with provider, tools, transformContext |
| 3 | `electron/pi-agent/cli-bridge.ts` | `execCli()` function wrapping `CLIPipelineRunner` (not child_process — use in-process runner) |
| 4 | `electron/pi-agent/tool-registry.ts` | L0/L1/L2 help tools + 15-20 core tool definitions |
| 5 | `electron/pi-agent/context-compression.ts` | `compressEditingContext()` implementation for `transformContext` |
| 6 | `electron/pi-agent/system-prompt.ts` | System prompt constant with category overview (~200 tokens) |
| 7 | `electron/pi-agent/pi-agent-handler.ts` | IPC handlers: `pi-agent:chat`, `pi-agent:reset`, `pi-agent:set-model` |

### Files to Modify

| # | File Path | Change |
|---|-----------|--------|
| 1 | `package.json` | Add `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-web-ui` dependencies |
| 2 | `electron/main.ts` | Import and call `setupPiAgentIPC()` alongside existing handler setup |
| 3 | `electron/preload.ts` | Add `window.electronAPI.piAgent` bridge (send, onStreamChunk, onToolCall, onToolResult, onStreamComplete, onStreamError, removeListeners, reset, setModel) |
| 4 | `apps/web/src/types/electron.d.ts` | Add `ElectronPiAgentOps` type definition |
| 5 | `packages/platform-core/` | Add `piAgent` to platform capability interface (follow `geminiChat` pattern) |
| 6 | `packages/platform-desktop/` | Add desktop `piAgent` implementation using `window.electronAPI.piAgent` |
| 7 | `packages/platform-web/` | Add stub `piAgent` (returns unavailable) |
| 8 | `apps/web/src/stores/gemini-terminal-store.ts` | Extend with provider selection state (`activeProvider: 'gemini' \| 'pi-agent'`), tool call tracking (`activeToolCalls`, `handleToolCall`, `handleToolResult`), model switching (`selectedProvider`, `selectedModel`, `setModel`), and Pi Agent streaming listeners |
| 9 | `apps/web/src/components/editor/media-panel/views/gemini-terminal.tsx` | Add provider selector in header (Gemini Direct / Pi Agent toggle), tool call display in messages, model selector dropdown for Pi Agent mode |
| 10 | `apps/web/src/components/editor/media-panel/views/gemini-terminal/message-item.tsx` | Extend to render tool call sections inline (collapsible: tool name, params, result, duration) when provider is Pi Agent |

### Implementation Steps

#### Phase 1: Package Installation & Core Agent (Steps 1-6)

**Step 1 — Install Pi Mono packages**
```bash
bun add @mariozechner/pi-ai @mariozechner/pi-agent-core @mariozechner/pi-web-ui
```
Verify imports resolve. Check that `pi-agent-core` exports `Agent` and `AgentConfig` types and `pi-ai` exports `createProvider`.

**Step 2 — Create CLI bridge (`electron/pi-agent/cli-bridge.ts`)**
- Import `CLIPipelineRunner` from `electron/native-pipeline/cli/cli-runner/runner.ts`
- Import `initRegistry` from `electron/native-pipeline/init.ts` (must be called once before any runner use)
- Implement `execCli(command: string, args: Record<string, unknown>): Promise<string>`:
  - Parse the command string into `CLIRunOptions` format
  - Call `runner.run(options)` and return JSON result
  - Add timeout (60s), error wrapping, and `--json` flag injection
- **Why in-process, not child_process:** QCut already has the full CLI runner in the same Electron process. Spawning a child process would require a separate binary, add startup latency, and bypass the existing API key provider. The `CLIPipelineRunner` class is designed for in-process use.

**Step 3 — Create system prompt (`electron/pi-agent/system-prompt.ts`)**
- Export `PI_AGENT_SYSTEM_PROMPT` constant
- Include the 9 command categories from `CATEGORIES` in `command-registry.ts`: generation, pipeline, analysis, models, api-keys, project-setup, moyin, YouTube, subtitle, vimax, editor
- Reference `qcut_help` and `qcut_command_help` tools
- Keep under 300 tokens

**Step 4 — Create tool registry (`electron/pi-agent/tool-registry.ts`)**
- Export `createPiAgentTools()` returning array of tool definitions
- Implement 3 discovery tools:
  - `qcut_help` — calls `execCli` with `<category> --help --json` (maps to L1)
  - `qcut_command_help` — calls `execCli` with `<command> --help --json` (maps to L2)
  - `qcut_project_status` — calls state snapshot via existing `requestEditorStateSnapshotFromRenderer()` from `electron/claude/handlers/claude-state-handler.ts`
- Implement 15-20 core tools (highest frequency editor commands):
  - `timeline_split`, `timeline_trim`, `timeline_delete`, `timeline_move`
  - `media_import`, `media_list`, `media_delete`
  - `transcribe`, `autoclip`
  - `export_start`, `export_status`
  - `generate_image`, `create_video`
  - `project_settings`, `project_stats`
- Each tool: `{ name, description, parameters (JSON Schema), execute: async (params) => execCli(...) }`
- Wrap every `execute` with error handler returning `{ status: 'error', message, hint }` (from Risk 2 pattern)

**Step 5 — Create context compression (`electron/pi-agent/context-compression.ts`)**
- Export `compressEditingContext(messages: Message[]): Message[]`
- Follow the `transformContext` pattern from the guide (Step 6 in the doc)
- Use `requestEditorStateSnapshotFromRenderer()` to get current project state
- Compress tool results older than 30 messages to `{ status, summary }`
- Insert state summary at compression boundary

**Step 6 — Create agent factory (`electron/pi-agent/agent-factory.ts`)**
- Export `createPiAgent(settings: PiAgentSettings): Agent`
- Import `createProvider` from `@mariozechner/pi-ai`
- Import `Agent` from `@mariozechner/pi-agent-core`
- Accept `{ provider: 'anthropic' | 'openai' | 'google', model: string, apiKey: string }`
- Resolve API keys from existing encrypted storage (reuse pattern from `electron/gemini-chat-handler.ts` lines ~50-100)
- Wire `systemPrompt`, `tools`, `transformContext`
- Store agent instance per-session (one agent per conversation)

#### Phase 2: IPC Handler & Preload Bridge (Steps 7-10)

**Step 7 — Create IPC handler (`electron/pi-agent/pi-agent-handler.ts`)**
- Export `setupPiAgentIPC(): void`
- Register IPC channels following `gemini-chat-handler.ts` streaming pattern:
  - `pi-agent:chat` (handle) — accepts `{ messages, attachments? }`, streams response via:
    - `pi-agent:stream-chunk` — `{ text: string }`
    - `pi-agent:tool-call` — `{ toolName: string, params: Record<string, unknown> }`
    - `pi-agent:tool-result` — `{ toolName: string, result: unknown, duration: number }`
    - `pi-agent:stream-complete` — no payload
    - `pi-agent:stream-error` — `{ message: string }`
  - `pi-agent:reset` (handle) — destroy current agent instance, start fresh conversation
  - `pi-agent:set-model` (handle) — accepts `{ provider, model, apiKey }`, recreate agent with new settings
  - `pi-agent:get-models` (handle) — return available provider/model list
- Use `event.sender.send()` for streaming (same pattern as `gemini:stream-chunk`)

**Step 8 — Create barrel export (`electron/pi-agent/index.ts`)**
- Export `setupPiAgentIPC` from `pi-agent-handler.ts`
- Follow `electron/claude/index.ts` pattern

**Step 9 — Update preload bridge (`electron/preload.ts`)**
- Add `piAgent` to the `electronAPI` object (lines ~352-377 area, follow `geminiChat` structure):
  ```typescript
  piAgent: {
    send: (request) => ipcRenderer.invoke('pi-agent:chat', request),
    onStreamChunk: (cb) => ipcRenderer.on('pi-agent:stream-chunk', (_, data) => cb(data)),
    onToolCall: (cb) => ipcRenderer.on('pi-agent:tool-call', (_, data) => cb(data)),
    onToolResult: (cb) => ipcRenderer.on('pi-agent:tool-result', (_, data) => cb(data)),
    onStreamComplete: (cb) => ipcRenderer.on('pi-agent:stream-complete', () => cb()),
    onStreamError: (cb) => ipcRenderer.on('pi-agent:stream-error', (_, data) => cb(data)),
    removeListeners: () => { ipcRenderer.removeAllListeners('pi-agent:stream-chunk'); ... },
    reset: () => ipcRenderer.invoke('pi-agent:reset'),
    setModel: (settings) => ipcRenderer.invoke('pi-agent:set-model', settings),
    getModels: () => ipcRenderer.invoke('pi-agent:get-models'),
  }
  ```

**Step 10 — Update `electron/main.ts`**
- Import `setupPiAgentIPC` from `./pi-agent`
- Call `setupPiAgentIPC()` alongside existing `setupGeminiChatIPC()` (around line 111)

#### Phase 3: Platform Abstraction (Steps 11-13)

**Step 11 — Update platform-core types**
- Add `piAgent?: ElectronPiAgentOps` to the platform capability interface
- Define `ElectronPiAgentOps` interface (send, onStreamChunk, onToolCall, onToolResult, onStreamComplete, onStreamError, removeListeners, reset, setModel, getModels)

**Step 12 — Update platform-desktop**
- Implement `piAgent` using `window.electronAPI.piAgent` (same pattern as `geminiChat`)

**Step 13 — Update platform-web**
- Add stub returning undefined/unavailable (Pi Agent is desktop-only for MVP)

#### Phase 4: Frontend Store & UI — Extend Existing Gemini Terminal (Steps 14-16)

Pi Agent runs inside the existing Terminal tab with a provider switcher. No new tab, no new store, no new chat component — extend what already works.

**Step 14 — Extend Zustand store (`apps/web/src/stores/gemini-terminal-store.ts`)**
- Add provider selection state:
  - `activeProvider: 'gemini' | 'pi-agent'` — determines which backend handles messages (default: `'gemini'`)
  - `setActiveProvider(provider)` — switches provider, optionally clears history
- Add tool call tracking (used only when `activeProvider === 'pi-agent'`):
  - `activeToolCalls: ToolCallInfo[]` — tracks in-progress tool executions
  - `handleToolCall(toolName, params)` — appends to `activeToolCalls`
  - `handleToolResult(toolName, result, duration)` — marks tool call as completed
- Add model switching (used only when `activeProvider === 'pi-agent'`):
  - `selectedPiProvider: 'anthropic' | 'openai' | 'google'` — LLM provider
  - `selectedPiModel: string` — model ID within provider
  - `setPiModel(provider, model)` — calls `platform().piAgent.setModel()` and stores selection
- Update `sendMessage()`:
  - When `activeProvider === 'gemini'`: existing Gemini streaming flow (unchanged)
  - When `activeProvider === 'pi-agent'`: call `platform().piAgent.send()`, wire `onStreamChunk`, `onToolCall`, `onToolResult`, `onStreamComplete`, `onStreamError` listeners (same pattern as existing gemini listeners at lines 186-198)
- Add `resetPiConversation()` — calls `platform().piAgent.reset()`

**Step 15 — Extend chat component (`apps/web/src/components/editor/media-panel/views/gemini-terminal.tsx`)**
- Add provider selector in the header area (next to existing title/clear button):
  - Toggle or segmented control: "Gemini" | "Pi Agent"
  - When Pi Agent is selected, show model selector dropdown (provider groups: Anthropic, OpenAI, Google; models per provider: `{ anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'], openai: ['gpt-4o', 'gpt-4o-mini'], google: ['gemini-2.5-pro', 'gemini-2.5-flash'] }`)
  - Use existing `Select` from `@/components/ui/select` for the model dropdown
- Add tool execution indicator (shown between message list and input when `activeProvider === 'pi-agent'` and `activeToolCalls` is non-empty):
  - Shows active tool calls with spinner
  - Displays tool name and brief summary of params
  - Auto-updates when tool result arrives
- All existing Gemini terminal functionality (message list, input, drag-drop, attachments, error display) remains unchanged and works for both providers

**Step 16 — Extend message item (`apps/web/src/components/editor/media-panel/views/gemini-terminal/message-item.tsx`)**
- When the message contains `toolCalls` (Pi Agent messages only):
  - Render tool call sections inline as collapsible blocks
  - Each block shows: tool name, parameters (formatted JSON), result summary, execution duration
  - Use existing `cn()` utility and Radix/shadcn `Collapsible` component
- When the message has no `toolCalls` (Gemini messages or plain Pi Agent text): render unchanged

#### Phase 5: Type Definitions (Step 17)

**Step 17 — Update type definitions**
- **`apps/web/src/types/electron.d.ts`**: Add `ElectronPiAgentOps` interface to `ElectronAPI`:
  ```typescript
  piAgent?: {
    send(request: PiAgentChatRequest): Promise<void>;
    onStreamChunk(callback: (data: { text: string }) => void): void;
    onToolCall(callback: (data: { toolName: string; params: Record<string, unknown> }) => void): void;
    onToolResult(callback: (data: { toolName: string; result: unknown; duration: number }) => void): void;
    onStreamComplete(callback: () => void): void;
    onStreamError(callback: (data: { message: string }) => void): void;
    removeListeners(): void;
    reset(): Promise<void>;
    setModel(settings: { provider: string; model: string; apiKey?: string }): Promise<void>;
    getModels(): Promise<{ provider: string; models: string[] }[]>;
  };
  ```

#### Phase 6: Testing & Verification (Steps 18-20)

**Step 18 — Unit tests**
- Create `electron/pi-agent/__tests__/cli-bridge.test.ts` — test command parsing and result formatting
- Create `electron/pi-agent/__tests__/tool-registry.test.ts` — test tool schema generation
- Create `electron/pi-agent/__tests__/context-compression.test.ts` — test message truncation and state injection
- Create `apps/web/src/stores/__tests__/gemini-terminal-store.test.ts` — test new provider switching, tool call state transitions, model selection (follow existing store test patterns)
- Run with `bun run test`

**Step 19 — Manual integration test**
- Launch `bun run electron:dev`
- Navigate to Terminal tab → switch provider to "Pi Agent"
- Select a model + enter API key
- Type "What commands are available for timeline editing?"
- Verify: agent calls `qcut_help` tool → returns command list → displays in chat
- Type "Split the video at 1 minute"
- Verify: agent calls `qcut_command_help` for timeline:split → calls `timeline_split` → result shown

**Step 20 — Boundary check**
- Run `bun scripts/check-boundaries.ts` to verify no Electron imports leaked into renderer code
- Run `bun check-types` to verify TypeScript compilation
- Run `bun lint:clean` to verify code quality

### Key Architecture Decisions

1. **In-process CLI bridge**: Uses the existing `CLIPipelineRunner` class directly instead of `child_process.exec`. This avoids binary packaging issues, startup latency, and reuses the existing API key provider chain. The runner is designed for in-process use from `electron/native-pipeline/cli/cli-runner/runner.ts`.

2. **Extend Gemini terminal, not separate UI**: Pi Agent reuses the existing Gemini terminal store and components with a provider switcher. This avoids duplicating ~90% identical chat UI code (message list, input, streaming, attachments, drag-drop). The additional Pi Agent state (tool calls, model selection, provider toggle) is additive and gated behind `activeProvider === 'pi-agent'`, keeping Gemini behavior unchanged.

3. **New `electron/pi-agent/` folder**: Follows the existing `electron/claude/` organizational pattern. Keeps Pi Agent code isolated from Claude Code integration (which serves a different purpose — external CLI control via HTTP API).

4. **No new tab — provider switcher inside Terminal**: Instead of adding a `"pi-agent"` tab to the media panel, Pi Agent lives inside the existing Terminal tab with a provider toggle. This keeps the tab bar clean and leverages the existing Gemini terminal infrastructure. Users switch between "Gemini" (direct Google API) and "Pi Agent" (multi-model agent with tool calling) within the same familiar interface.

5. **API key reuse**: Reuse the existing encrypted key storage from `gemini-chat-handler.ts`. Keys for Anthropic, OpenAI, and Google are already managed via `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` env vars or encrypted `~/.config/qcut/api-keys.json`. No new key management needed.
