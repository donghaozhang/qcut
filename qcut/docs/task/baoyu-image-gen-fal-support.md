# Add fal.ai Provider to baoyu-image-gen Skill

**Status**: Completed
**Branch**: UI-v3
**Estimated effort**: ~15 minutes (single task, no subtasks needed)

## Context

The `baoyu-image-gen` skill supports 4 providers (Google, OpenAI, DashScope, Replicate) via a clean plugin architecture. Each provider is a standalone TypeScript module in `scripts/providers/`. QCut already has extensive fal.ai integration patterns in its core codebase that we can reference.

## Architecture Overview

```
baoyu-image-gen/
├── SKILL.md                        # ← Update: add fal provider docs
├── scripts/
│   ├── main.ts                     # ← Update: add fal to loadProviderModule() + detectProvider()
│   ├── types.ts                    # ← Update: add "fal" to Provider union + ExtendConfig
│   └── providers/
│       ├── google.ts               # Existing (320 lines)
│       ├── openai.ts               # Existing (223 lines)
│       ├── dashscope.ts            # Existing (165 lines)
│       ├── replicate.ts            # Existing (203 lines)
│       └── fal.ts                  # ← NEW: fal.ai provider (~180 lines)
└── references/
    └── config/
        ├── first-time-setup.md     # ← Update: add fal option
        └── preferences-schema.md   # ← Update: add fal to schema
```

## Implementation Steps

### Step 1: Update `types.ts`
**File**: `.claude/skills/baoyu/baoyu-image-gen/scripts/types.ts`

Add `"fal"` to the `Provider` type union and `default_model` config:

```typescript
// Before
type Provider = "google" | "openai" | "dashscope" | "replicate";

// After
type Provider = "google" | "openai" | "dashscope" | "replicate" | "fal";
```

Add `fal: string | null` to `default_model` in `ExtendConfig`.

### Step 2: Create `providers/fal.ts`
**File**: `.claude/skills/baoyu/baoyu-image-gen/scripts/providers/fal.ts`

Follow the existing provider pattern (see `dashscope.ts` or `replicate.ts` as template):

```typescript
export function getDefaultModel(): string
export async function generateImage(
  prompt: string,
  model: string,
  args: CliArgs
): Promise<Uint8Array>
```

**fal.ai specifics** (from QCut's existing integration):

| Setting | Value |
|---------|-------|
| Base URL (sync) | `https://fal.run` |
| Base URL (queue) | `https://queue.fal.run` |
| Auth header | `Authorization: Key ${apiKey}` |
| API key env vars | `FAL_KEY` or `FAL_API_KEY` or `VITE_FAL_API_KEY` |
| Default model | `fal-ai/flux/dev` (text-to-image) |
| Alt models | `fal-ai/flux/schnell` (fast), `fal-ai/nano-banana-pro` (quality) |
| Image output | `result.images[0].url` → download to `Uint8Array` |

**Key implementation details**:
- Use sync mode (`https://fal.run/{model}`) for simplicity — matches other providers' blocking pattern
- If sync times out, fall back to queue mode with polling (adaptive: 500ms → 2s → 4s)
- Support `--ar` via `image_size` parameter: `{ width, height }` mapped from aspect ratio
- Support `--ref` for edit models (`fal-ai/nano-banana-pro/edit`)
- Reference pattern from: `electron/native-pipeline/infra/api-caller.ts` (lines for FAL provider)

### Step 3: Update `main.ts`
**File**: `.claude/skills/baoyu/baoyu-image-gen/scripts/main.ts`

Three changes needed:

**a) `loadProviderModule()` (~line 391)**
```typescript
if (provider === "fal") {
  return (await import("./providers/fal")) as ProviderModule;
}
```

**b) `detectProvider()` (~line 329)**
Add fal.ai key detection:
```typescript
const hasFal = !!(process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY);
```
Add to available providers list. fal supports reference images via edit endpoints.

**c) Model resolution (~line 443)**
Add fal case for EXTEND.md default_model lookup:
```typescript
if (provider === "fal") model = extendConfig.default_model.fal ?? null;
```

### Step 4: Update `SKILL.md`
**File**: `.claude/skills/baoyu/baoyu-image-gen/SKILL.md`

Updates needed:
- Add `fal` to description and provider list
- Add fal usage example:
  ```bash
  # fal.ai (Flux)
  npx -y bun ${SKILL_DIR}/scripts/main.ts --prompt "A cat" --image out.png --provider fal

  # fal.ai with specific model
  npx -y bun ${SKILL_DIR}/scripts/main.ts --prompt "A cat" --image out.png --provider fal --model fal-ai/flux/schnell
  ```
- Add env vars: `FAL_KEY` / `FAL_API_KEY`, `FAL_IMAGE_MODEL`, `FAL_BASE_URL`
- Add fal to provider selection logic docs
- Add fal models to reference images support list (`fal-ai/nano-banana-pro/edit`)

### Step 5: Update config references
**File**: `.claude/skills/baoyu/baoyu-image-gen/references/config/first-time-setup.md`
- Add fal as a provider option in the first-time setup flow

**File**: `.claude/skills/baoyu/baoyu-image-gen/references/config/preferences-schema.md`
- Add `fal` to `default_provider` enum
- Add `fal: string | null` to `default_model` schema

## Environment Variables (New)

| Variable | Description |
|----------|-------------|
| `FAL_KEY` or `FAL_API_KEY` | fal.ai API key (also accepts `VITE_FAL_API_KEY`) |
| `FAL_IMAGE_MODEL` | fal.ai model override (default: `fal-ai/flux/dev`) |
| `FAL_BASE_URL` | Custom fal.ai endpoint (default: `https://fal.run`) |

## fal.ai Model Reference

| Model | Endpoint | Use Case |
|-------|----------|----------|
| Flux Dev | `fal-ai/flux/dev` | High quality (default) |
| Flux Schnell | `fal-ai/flux/schnell` | Fast generation |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | Quality + edits |
| Nano Banana Pro Edit | `fal-ai/nano-banana-pro/edit` | Reference image edits |

## What Does NOT Change

- Existing 4 providers remain untouched
- CLI interface unchanged (just new `--provider fal` option)
- EXTEND.md format backward compatible (new `fal` key in `default_model` is optional)
- Load priority unchanged: CLI args > EXTEND.md > env vars > .env files
- Sequential/parallel generation modes unchanged

## Testing

1. Basic generation: `--provider fal --prompt "A cat" --image test.png`
2. Model override: `--provider fal --model fal-ai/flux/schnell`
3. Aspect ratio: `--provider fal --ar 16:9`
4. Reference image: `--provider fal --model fal-ai/nano-banana-pro/edit --ref source.png`
5. Auto-detection: set only `FAL_KEY` env var, omit `--provider` → should auto-select fal
6. EXTEND.md: set `default_provider: fal` and `default_model.fal: fal-ai/flux/schnell`

## Reference Files (QCut's existing fal.ai patterns)

| File | What to reference |
|------|-------------------|
| `apps/web/src/lib/ai-video/core/fal-request.ts` | HTTP request pattern, auth headers |
| `apps/web/src/lib/ai-clients/fal-ai-client.ts` | Model endpoints, response parsing |
| `apps/web/src/services/ai/fal-ai-service.ts` | Direct HTTP (no SDK), image generation |
| `electron/native-pipeline/infra/api-caller.ts` | API key resolution, queue polling |
| `apps/web/src/lib/ai-video/core/fal-upload.ts` | File upload for reference images |
