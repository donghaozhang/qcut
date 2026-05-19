# IMA Router GPT Image 2 Daytona Plan

Date: 2026-05-19
Branch: `Qcut-sandbox-v6`

## Goal

Move the Daytona sandbox image path for QCut's GPT Image 2 model from the legacy GMI queue slug to IMA Router's current OpenAI-compatible image task API, then verify it with a small sandbox E2E run and downloadable evidence.

Target user-facing behavior:

- `qcut generate-image` without `--model` still defaults to `gpt_image_2_ima`.
- `qcut flow portraits --image-model gpt_image_2_ima` uses the same working GPT Image 2 route.
- `qcut flow storyboard --image-model gpt_image_2_ima` uses the same working GPT Image 2 route.
- Generated image result URLs are downloaded immediately into `/tmp/qcut-output` or the selected output directory.

## Source Docs Read

- Human docs URL: <https://doc.imarouter.com/#en/tag/gpt-image/POST/v1/images/generations#gpt-image>
- AI integration entrypoint: <https://doc.imarouter.com/llms.txt>
- OpenAPI source: <https://doc.imarouter.com/openapi/en.yaml>
- Model index: <https://doc.imarouter.com/model-index.json>
- Smoke payloads: <https://doc.imarouter.com/test-cases.json>

Important doc findings:

- Base URL is `https://api.imarouter.com`.
- Auth is `Authorization: Bearer YOUR_SECRET_TOKEN`; never put the token in a query string.
- The `#gpt-image` fragment is documentation grouping only. The actual create path is `POST /v1/images/generations`.
- `gpt-image-2` is async. Submit returns `id` or `task_id`; poll `GET /v1/images/generations/{task_id}`.
- Terminal success statuses include `succeeded` and `completed`; terminal failure statuses include `failed` and `error`.
- Result URLs are short-lived, around 30 days, so QCut should download and persist them immediately.

## Pre-Implementation QCut State

Before this patch, the native flow treated the GPT Image 2 default route as a GMI Cloud queue model:

| Area | Current value |
| --- | --- |
| Registry key | `gpt_image_2_gmi` |
| Provider backend | `gmi` |
| Text endpoint | `gpt-image-2-generate` |
| Reference endpoint | `gpt-image-2-edit` |
| Submit shape | `{ model: endpoint, payload }` through GMI queue |

Relevant files:

- `electron/native-pipeline/registry-data/text-to-image.ts`
- `electron/native-pipeline/vimax/adapters/image-adapter.ts`
- `electron/native-pipeline/execution/step-executors.ts`
- `electron/native-pipeline/infra/api-caller.ts`
- `electron/native-pipeline/infra/api-provider-urls.ts`
- `packages/license-server/src/routes/ai-proxy.ts`
- `packages/qcut-relay/src/pty-session.ts`

This explains the recent long latency and `504` retries: the tested path is working through the old GMI queue/proxy route, but it is not yet the documented IMA Router `gpt-image` route.

## Target API Contract

Text-to-image create request:

```json
{
  "model": "gpt-image-2",
  "prompt": "generate a glossy product hero image for a smartwatch",
  "size": "1024x1024",
  "quality": "high",
  "background": "transparent",
  "output_format": "png"
}
```

Image reference / edit request:

```json
{
  "model": "gpt-image-2",
  "prompt": "replace the background with a clean studio backdrop",
  "images": ["https://example.com/input.png"],
  "mask": "https://example.com/mask.png",
  "size": "1536x1024",
  "quality": "high",
  "input_fidelity": "high",
  "moderation": "low",
  "output_compression": 0,
  "output_format": "png"
}
```

Supported passthrough fields from the OpenAPI doc:

- `size`
- `quality`
- `image` / `images`
- `mask`
- `background`
- `input_fidelity`
- `moderation`
- `n`
- `output_compression`
- `output_format`

## Implementation Plan

### 1. Add an IMA Router image task poller

File: `electron/native-pipeline/infra/api-caller.ts`

Current `pollImaRouterTask()` is video-specific and polls `v1/videos/{task_id}`. Add a focused image poller:

```ts
pollImaRouterImageTask({ taskId, onProgress, signal })
```

It should:

- call `GET /v1/images/generations/{task_id}`
- accept `succeeded` and `completed` as success
- accept `failed` and `error` as failure
- read output URL from `data.url`, `url`, or existing `extractOutputUrl()` fallback
- surface `amount_usd`, `usage`, and raw response under `data`
- keep the same 30 minute ceiling unless a shorter image-specific timeout is chosen after live testing

### 2. Teach `callModelApi()` how to submit IMA Router image tasks

File: `electron/native-pipeline/infra/api-caller.ts`

Today `provider === "imarouter"` assumes videos and always polls `v1/videos/{task_id}`. Add a small route decision based on endpoint:

- if endpoint is `v1/images/generations`, poll with the new image poller
- if endpoint is `v1/videos`, keep the existing video poller
- preserve proxy-first behavior and local-key fallback

Avoid endpoint-name string spread across the codebase by extracting constants:

```ts
const IMAROUTER_IMAGE_GENERATIONS_PATH = "v1/images/generations";
const IMAROUTER_VIDEO_GENERATIONS_PATH = "v1/videos";
```

### 3. Register GPT Image 2 as IMA Router-backed while preserving the public key

File: `electron/native-pipeline/registry-data/text-to-image.ts`

Keep the user-facing QCut key stable:

```ts
key: "gpt_image_2_ima"
```

Change the transport fields:

```ts
provider: "OpenAI (via IMA Router)"
endpoint: "v1/images/generations"
providerBackend: "imarouter"
defaults: {
  model: "gpt-image-2",
  size: "1024x1024",
  quality: "medium",
  output_format: "png",
  n: 1
}
```

Update after implementation: the primary key was renamed to `gpt_image_2_ima`, and `gpt_image_2_gmi` remains available as a legacy alias so older commands still work.

### 4. Update flow image adapter routing

File: `electron/native-pipeline/vimax/adapters/image-adapter.ts`

Pre-implementation maps:

- `gpt_image_2_gmi` -> `gpt-image-2-generate`
- reference `gpt_image_2_gmi` -> `gpt-image-2-edit`

Target maps:

- `gpt_image_2_ima` -> `v1/images/generations`
- reference `gpt_image_2_ima` -> `v1/images/generations`
- provider should become `imarouter`
- payload should include `model: "gpt-image-2"` at the top level
- reference generation should use `images: [url]`, not `image: [url]`
- mask support should pass `mask` when supplied by future callers

The adapter already uploads local references before edit calls. Keep that behavior, because IMA Router needs public URLs for `image` / `images`.

### 5. Update step executor reference handling

File: `electron/native-pipeline/execution/step-executors.ts`

For `gpt_image_2_ima` with reference images:

- do not switch to a synthetic `gpt-image-2-edit` endpoint
- keep endpoint `v1/images/generations`
- set `payload.images = refs.urls`
- remove legacy `payload.image_urls` and `payload.reference_images`
- set `payload.model = "gpt-image-2"`

For text-only:

- set `payload.model = "gpt-image-2"`
- map aspect ratio to `size` as already done for GMI GPT Image 2

### 6. License-server proxy support

Files:

- `packages/license-server/src/routes/ai-proxy.ts`
- existing proxy tests near GMI / IMA Router coverage

Verify that the proxy accepts:

```json
{
  "provider": "imarouter",
  "endpoint": "https://api.imarouter.com/v1/images/generations",
  "method": "POST",
  "body": {
    "model": "gpt-image-2",
    "prompt": "..."
  }
}
```

If the proxy currently special-cases IMA Router video polling only, add image create/status handling there too. Keep credit estimates keyed by QCut model key (`gpt_image_2_ima`) so billing remains stable.

### 7. Update docs and skills

Files to check after implementation:

- `.claude/skills/native-cli/SKILL.md`
- `resources/default-skills/native-cli/SKILL.md`
- `packages/nexusai-website/js/agent-chat.js`
- `packages/nexusai-website/cli/partials/gen.html`
- `packages/nexusai-website/cli/partials/flow.html`

Do not change the public default command guidance unless the QCut key is renamed. The important wording is still:

```text
Default image model: gpt_image_2_ima
Do not pass --model/-m unless the user explicitly asks for a specific image model.
```

## Tests

Unit tests to add or update:

- `electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts`
  - submits image task to `/v1/images/generations`
  - polls `/v1/images/generations/{task_id}`
  - extracts `data.url`
  - handles `succeeded`, `completed`, `failed`, and `error`
- `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`
  - `gpt_image_2_ima` has `providerBackend: "imarouter"`
  - endpoint is `v1/images/generations`
  - defaults include `model: "gpt-image-2"`
- `electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts`
  - text generation calls provider `imarouter`
  - endpoint is `v1/images/generations`
  - payload uses `model: "gpt-image-2"`
  - reference generation uses `images: [...]`
- `electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts`
  - reference images stay on `/v1/images/generations`
  - no `gpt-image-2-edit` endpoint remains for IMA Router

Suggested commands:

```bash
bun test \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts

cd electron && bun x tsc --noEmit
```

## Daytona E2E Verification

Use no more than 5 to 6 images.

### A. Single default image smoke

```bash
qcut generate-image \
  --prompt "a matte black cube on a clean white background" \
  -o /tmp/qcut-output/imarouter-gpt-image-smoke \
  --json
```

Expected:

- no `--model` passed
- output sidecar says `model: gpt_image_2_ima`
- transport evidence says provider `imarouter`
- generated file is a valid PNG or JPEG

### B. Flow portraits smoke

```bash
qcut flow characters \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  -o /tmp/qcut-output/imarouter-flow \
  --json

qcut flow portraits \
  --input /tmp/qcut-output/imarouter-flow/characters.json \
  --max-characters 3 \
  --views front \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/imarouter-flow/portraits \
  --json
```

Expected:

- 3 portrait images max
- `registry.json` lists all portrait paths
- all images are valid files
- generated artifacts are visible and downloadable from the sandbox file browser

### C. Flow storyboard smoke

```bash
qcut flow storyboard \
  --script /tmp/qcut-input/script.json \
  --portraits /tmp/qcut-output/imarouter-flow/portraits/portraits/registry.json \
  --style "cinematic editorial storyboard, consistent characters" \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/imarouter-flow/storyboard \
  --json
```

Expected:

- cap the script at 2 to 3 scenes for this smoke
- generated total image count stays under 6
- storyboard images are valid files
- downloaded evidence includes command logs, result JSON, registry JSON, and files

## Evidence To Record

After the Daytona run, add a result doc next to this plan:

```text
docs/task/daytona-supabase-agent/implementation/20-imarouter-gpt-image-e2e.md
```

Include:

- production or local build identifier
- exact command input
- generated output directory
- task IDs returned by IMA Router, with secrets redacted
- downloaded file list
- `file` output proving PNG/JPEG validity
- screenshot of the sandbox file browser showing the output folder
- failures and retries, especially `429`, `5xx`, or task status `failed`

## Risks

- Older scripts may still use `gpt_image_2_gmi`; keep that key as a legacy alias until users have moved to `gpt_image_2_ima`.
- IMA Router result URLs expire. Any code path that only stores remote URLs without downloading will become flaky later.
- Image reference inputs must be public URLs or uploaded first. Local files need the existing upload step.
- Proxy support may be video-biased today. The native local path and license-server proxy path both need tests so Daytona behaves like production.

## Done Criteria

- Unit tests cover image submit, poll, success, failure, and reference-image payload shape.
- `qcut generate-image` default path produces a real image through IMA Router.
- `qcut flow portraits --image-model gpt_image_2_ima` produces 3 or fewer portrait images through IMA Router.
- `qcut flow storyboard --image-model gpt_image_2_ima` produces a small storyboard through IMA Router.
- Daytona file browser can download individual images and the containing folder.
- A follow-up E2E result md records success/failure evidence.
