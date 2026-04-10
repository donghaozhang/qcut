# GMI Cloud LLM Models Integration

> **Priority:** P1 | **Estimated Effort:** >20 min — subtasks below
> **Depends on:** None (extends existing GMI provider)

## Overview

Add 3 LLM models accessible via GMI Cloud's OpenAI-compatible inference API:

| # | Model | GMI Playground ID | Use Case |
|---|-------|-------------------|----------|
| 1 | **GLM 5.1** (fp8) | `glm-5-1-fp8` | Chinese + English reasoning, structured output |
| 2 | **Gemini 3.1 Pro Preview** | `gemini-3-1-pro-preview` | Long context, multimodal reasoning |
| 3 | **GPT-5.4** | `gpt-5-4` | General-purpose, coding, analysis |

## Architecture Decision

**Route through a new `gmi-llm` provider** rather than reusing the existing `gmi` (video) provider.

Why:
- GMI video uses async submit+poll (`POST /requestqueue/apikey/requests`)
- GMI LLM uses OpenAI-compatible sync API (`POST /v1/chat/completions`)
- Different base URLs, different response formats, different auth patterns
- Cleanly separable in `ProviderName` and `buildProviderUrl`

## GMI LLM API (OpenAI-Compatible)

| Detail | Value |
|--------|-------|
| Base URL | `https://api.gmicloud.ai/v1` (confirm from playground) |
| Auth | `Authorization: Bearer {GMI_API_KEY}` |
| Endpoint | `POST /chat/completions` |
| Format | OpenAI-compatible (messages, temperature, max_tokens) |
| Response | `{ choices: [{ message: { content } }], usage: { prompt_tokens, completion_tokens } }` |
| Streaming | SSE (`stream: true`) — future enhancement |

> **Note:** The exact base URL needs confirmation. GMI docs state "OpenAI-compatible APIs" for serverless endpoints. The playground URLs suggest `https://api.gmicloud.ai/v1` but this must be verified by testing with the GMI API key.

## Subtasks

### Subtask 1: Add `gmi-llm` Provider (~5 min)

Add a new provider type for GMI LLM (separate from video).

**Files:**
- `electron/native-pipeline/infra/api-provider-urls.ts` — Add `GMI_LLM_BASE` constant and `gmi-llm` case in `buildProviderUrl`
- `electron/native-pipeline/infra/api-caller.ts` — Add `gmi-llm` to `ProviderName`, handle in `buildHeaders` (Bearer auth, same key as `gmi`)

**Changes:**
```typescript
// api-provider-urls.ts
export type ProviderName = "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine" | "gmi" | "gmi-llm" | "runway";

const GMI_LLM_BASE = "https://api.gmicloud.ai/v1"; // confirm URL

// In buildProviderUrl:
case "gmi-llm":
    return `${GMI_LLM_BASE}/${endpoint}`;

// api-caller.ts — buildHeaders:
case "gmi-llm":
    headers.Authorization = `Bearer ${apiKey}`;
    break;

// api-caller.ts — envApiKeyProvider:
case "gmi-llm":
    return Promise.resolve(process.env.GMI_API_KEY || "");
```

**Tests:**
- `electron/__tests__/native-api-caller.test.ts` — Add test for `gmi-llm` provider URL building

---

### Subtask 2: Add GMI Models to LLM Adapter (~10 min)

Register the 3 models in the LLM adapter so they can be used by ViMax agents and CLI.

**Files:**
- `electron/native-pipeline/vimax/adapters/llm-adapter.ts` — Add model aliases, cost table entries, and GMI routing logic

**Changes:**
```typescript
// MODEL_ALIASES — add GMI model shortcuts
const MODEL_ALIASES: Record<string, string> = {
    // ... existing
    "glm-5.1": "gmi/glm-5-1-fp8",
    "gemini-3.1-pro": "gmi/gemini-3-1-pro-preview",
    "gpt-5.4": "gmi/gpt-5-4",
};

// COST_TABLE — approximate costs per 1K tokens [input, output]
const COST_TABLE: Record<string, [number, number]> = {
    // ... existing
    "gmi/glm-5-1-fp8": [0.0005, 0.002],
    "gmi/gemini-3-1-pro-preview": [0.00125, 0.005],
    "gmi/gpt-5-4": [0.005, 0.015],
};
```

**Routing logic in `chat()` method:**
```typescript
// Determine provider from model prefix
const isGmiModel = model.startsWith("gmi/");
const provider = isGmiModel ? "gmi-llm" : "openrouter";
const apiModel = isGmiModel ? model.replace("gmi/", "") : model;

const result = await callModelApi({
    endpoint: "chat/completions",
    payload: { model: apiModel, messages, temperature, max_tokens },
    provider,
    async: false,
    timeoutMs: this.config.timeout * 1000,
});
```

**Tests:**
- `electron/__tests__/vimax-adapters.test.ts` — Add test for GMI model resolution and routing

---

### Subtask 3: Add Proxy Support for GMI LLM (~5 min)

Enable proxy mode so users without a local GMI key can use these models with credits.

**Files:**
- `packages/license-server/src/services/provider-keys.ts` — Add `gmi-llm` provider config (reuses same `GMI_API_KEY`)
- `electron/native-pipeline/infra/credit-estimator.ts` — Handle LLM credit estimation (per-token, not per-video)
- `apps/web/src/lib/credit-costs.ts` — Add GMI LLM credit costs

**Changes in provider-keys.ts:**
```typescript
"gmi-llm": {
    envVar: "GMI_API_KEY",  // same key as video
    buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    allowedPrefixes: ["https://api.gmicloud.ai/"],
},
```

**Credit costs (per request, estimated):**
```typescript
// credit-costs.ts — FIXED_COSTS
"gmi-glm-5.1": { credits: 0.1, label: "GLM 5.1", unit: "per request" },
"gmi-gemini-3.1-pro": { credits: 0.2, label: "Gemini 3.1 Pro", unit: "per request" },
"gmi-gpt-5.4": { credits: 0.3, label: "GPT-5.4", unit: "per request" },
```

**Tests:**
- `packages/license-server/src/routes/ai-proxy.test.ts` — Add test for `gmi-llm` proxy routing

---

### Subtask 4: CLI Integration (~5 min)

Expose the models in the CLI so they can be used directly.

**Files:**
- `electron/native-pipeline/cli/cli-runner/handler-generate.ts` — No changes needed (uses LLMAdapter)
- `electron/native-pipeline/vimax/adapters/llm-adapter.ts` — Already handled in Subtask 2

**CLI usage after implementation:**
```bash
# Use GLM 5.1 via ViMax
bun run pipeline vimax:idea2video --idea "A cat in space" --llm-model glm-5.1

# Use Gemini 3.1 Pro for script generation
bun run pipeline vimax:script2video --script story.json --llm-model gemini-3.1-pro

# Use GPT-5.4 for analysis
bun run pipeline analyze-video -i clip.mp4 --llm-model gpt-5.4
```

---

### Subtask 5: Verify Base URL & Test End-to-End (~5 min)

The GMI LLM base URL needs confirmation before deployment.

**Verification steps:**
```bash
# Test with GMI API key directly
curl -X POST "https://api.gmicloud.ai/v1/chat/completions" \
  -H "Authorization: Bearer $GMI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-5-1-fp8", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 50}'

# If that fails, try the console URL pattern
curl -X POST "https://console.gmicloud.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $GMI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-5-1-fp8", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 50}'
```

**End-to-end test:**
```bash
# Proxy mode (no local key)
env -u GMI_API_KEY bun run pipeline vimax:idea2video \
  --idea "A sunset over mountains" \
  --llm-model glm-5.1

# Check credits were deducted
curl -H "Authorization: Bearer $QCUT_AUTH_TOKEN" \
  https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance
```

## Model Details

### GLM 5.1 (fp8)

| Field | Value |
|-------|-------|
| GMI ID | `glm-5-1-fp8` |
| Provider | ZhipuAI (via GMI) |
| Context | 128K tokens |
| Strengths | Chinese + English, reasoning, tool use |
| QCut alias | `glm-5.1` |

### Gemini 3.1 Pro Preview

| Field | Value |
|-------|-------|
| GMI ID | `gemini-3-1-pro-preview` |
| Provider | Google (via GMI) |
| Context | 1M+ tokens |
| Strengths | Long context, multimodal, code |
| QCut alias | `gemini-3.1-pro` |

### GPT-5.4

| Field | Value |
|-------|-------|
| GMI ID | `gpt-5-4` |
| Provider | OpenAI (via GMI) |
| Context | 128K tokens |
| Strengths | General-purpose, coding, analysis |
| QCut alias | `gpt-5.4` |

## Key Source Files

| File | Role |
|------|------|
| `electron/native-pipeline/infra/api-provider-urls.ts` | Provider URL routing — add `gmi-llm` |
| `electron/native-pipeline/infra/api-caller.ts` | API call dispatch — add `gmi-llm` provider |
| `electron/native-pipeline/vimax/adapters/llm-adapter.ts` | LLM adapter — add model aliases + routing |
| `packages/license-server/src/services/provider-keys.ts` | Proxy auth config — add `gmi-llm` |
| `apps/web/src/lib/credit-costs.ts` | Credit cost table — add LLM costs |
| `electron/native-pipeline/infra/credit-estimator.ts` | Credit estimation for proxy mode |

## Open Questions

1. **Exact base URL** — `https://api.gmicloud.ai/v1` or `https://console.gmicloud.ai/api/v1`? Needs testing.
2. **Structured output support** — Do these models support `response_format: { type: "json_schema" }`?
3. **Token pricing** — Exact per-token costs from GMI for each model (currently estimated).
4. **Streaming** — Future: support `stream: true` for real-time token output.
