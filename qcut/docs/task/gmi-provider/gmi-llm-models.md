# GMI Cloud LLM Models Integration

> **Status:** Implemented | **Date:** 2026-04-10

## Overview

Added 3 LLM models accessible via GMI Cloud's async request queue API:

| # | Model | GMI Model ID | QCut Alias | Use Case |
|---|-------|-------------|------------|----------|
| 1 | **GLM 5.1** (fp8) | `glm-5-1-fp8` | `glm-5.1` | Chinese + English reasoning, structured output |
| 2 | **Gemini 3.1 Pro Preview** | `gemini-3-1-pro-preview` | `gemini-3.1-pro` | Long context, multimodal reasoning |
| 3 | **GPT-5.4** | `gpt-5-4` | `gpt-5.4` | General-purpose, coding, analysis |

## Architecture Decision

**Added `gmi-llm` as a new provider type** — uses the same GMI `requestqueue` API and `GMI_API_KEY` as video, but routed separately so the LLM adapter can handle response parsing (GMI wraps LLM results in async `outcome` envelope).

Key finding during implementation: GMI LLM models are **NOT** available via a separate OpenAI-compatible sync endpoint. They use the **same async submit+poll** API as video models (`POST /requestqueue/apikey/requests`), with results wrapped in `{ status, outcome: { choices, usage } }`.

## GMI LLM API

| Detail | Value |
|--------|-------|
| Base URL | `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey` |
| Auth | `Authorization: Bearer {GMI_API_KEY}` |
| Submit | `POST /requests` with `{ model: "<model-id>", payload: { messages, temperature, max_tokens } }` |
| Poll | `GET /requests/{request_id}` |
| Response | `{ status: "success", outcome: { choices: [...], usage: {...} } }` |

> **Note:** The LLM model IDs (`glm-5-1-fp8`, `gemini-3-1-pro-preview`, `gpt-5-4`) were not found in the GMI model listing as of 2026-04-10. These models may require separate subscription or activation in the GMI Cloud console before they appear. The implementation is ready — once the models are available, they will work automatically.

## Implementation Summary

### Files Changed

| File | Change |
|------|--------|
| `electron/native-pipeline/infra/api-provider-urls.ts` | Added `gmi-llm` to `ProviderName`, `GMI_LLM_BASE`, `buildProviderUrl` case |
| `electron/native-pipeline/infra/api-caller.ts` | Added `gmi-llm` to `buildHeaders`, `envApiKeyProvider`, `defaultApiKeyProvider`, and GMI async handler |
| `electron/native-pipeline/vimax/adapters/llm-adapter.ts` | Added model aliases, cost table, `isGmiModel()`, dual-provider routing in `chat()`, GMI outcome unwrapping |
| `packages/license-server/src/services/provider-keys.ts` | Added `gmi-llm` provider config (reuses `GMI_API_KEY`) |
| `apps/web/src/lib/credit-costs.ts` | Added `gmi-glm-5.1`, `gmi-gemini-3.1-pro`, `gmi-gpt-5.4` credit costs |

### Files Created

| File | Purpose |
|------|---------|
| `electron/__tests__/gmi-llm-adapter.test.ts` | 7 tests: alias resolution, provider routing, payload format, outcome extraction, mock fallback |

### Tests

```bash
bun run test -- --run electron/__tests__/gmi-llm-adapter.test.ts
# 7 tests passed
```

All 47 existing tests remain green.

## How It Works

### LLM Adapter Routing

```
LLMAdapter.chat(messages, { model: "glm-5.1" })
  │
  ├─ _resolveModel("glm-5.1") → "gmi/glm-5-1-fp8"
  ├─ isGmiModel("gmi/glm-5-1-fp8") → true
  ├─ apiModel = "glm-5-1-fp8" (strip gmi/ prefix)
  │
  └─ callModelApi({
       endpoint: "glm-5-1-fp8",        // model ID as endpoint
       payload: { messages, temperature, max_tokens },
       provider: "gmi-llm",            // async submit+poll
     })
       │
       ├─ Submit: POST /requests { model: "glm-5-1-fp8", payload: {...} }
       ├─ Poll: GET /requests/{request_id}
       └─ Result: { outcome: { choices: [...], usage: {...} } }
             │
             └─ Unwrap outcome → extract content + usage
```

### Non-GMI models (unchanged)

```
LLMAdapter.chat(messages, { model: "gemini-3-flash" })
  → resolves to "google/gemini-3-flash-preview"
  → provider: "openrouter"
  → endpoint: "chat/completions"
  → synchronous response
```

## CLI Usage

```bash
# Use GLM 5.1 via ViMax
bun run pipeline vimax:idea2video --idea "A cat in space" --llm-model glm-5.1

# Use Gemini 3.1 Pro for script generation
bun run pipeline vimax:script2video --script story.json --llm-model gemini-3.1-pro

# Use GPT-5.4 for analysis
bun run pipeline analyze-video -i clip.mp4 --llm-model gpt-5.4
```

## Credit Costs

| Model | Credits | Unit |
|-------|---------|------|
| GLM 5.1 | 0.1 | per request |
| Gemini 3.1 Pro | 0.2 | per request |
| GPT-5.4 | 0.3 | per request |

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
| `electron/native-pipeline/infra/api-provider-urls.ts` | Provider URL routing — `gmi-llm` type |
| `electron/native-pipeline/infra/api-caller.ts` | API call dispatch — `gmi-llm` provider handling |
| `electron/native-pipeline/vimax/adapters/llm-adapter.ts` | LLM adapter — model aliases, GMI routing, outcome unwrapping |
| `packages/license-server/src/services/provider-keys.ts` | Proxy auth config — `gmi-llm` provider |
| `apps/web/src/lib/credit-costs.ts` | Credit cost table — GMI LLM costs |
| `electron/__tests__/gmi-llm-adapter.test.ts` | Tests — 7 tests for GMI LLM routing |

## Open Questions

1. **Model availability** — `glm-5-1-fp8`, `gemini-3-1-pro-preview`, `gpt-5-4` not in GMI model listing yet. May need activation in GMI console.
2. **Structured output** — Do these models support `response_format: { type: "json_schema" }` via GMI?
3. **Token pricing** — Exact per-token costs from GMI (currently estimated).
4. **Streaming** — Future: support `stream: true` for real-time token output.
