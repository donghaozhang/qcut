# GMI Gemini 3.5 Flash selectable alias

Date: 2026-05-20
Branch: `cli-image-v7`

## Goal

Add Gemini 3.5 Flash as a selectable GMI LLM model without changing the existing default `gemini-3-flash` / `google/gemini-3-flash-preview` path.

## Source notes

User-provided GMI model hub text identifies:

- Name: Google Gemini 3.5 Flash
- API model ID: `google/gemini-3.5-flash`
- Endpoint: `https://api.gmi-serving.com/v1/chat/completions`
- Inputs: text, code, images, audio, video, PDF
- Output: text
- Context: 1M token input, up to 65K output
- Function calling and vision inputs are documented through the OpenAI-compatible chat endpoint.

The provided console URL redirects to sign-in when fetched without a browser session. Public model hub endpoint checks:

- `GET https://console.gmicloud.ai/api/v1/ie/requestqueue/models` returned a public model catalog.
- `GET https://console.gmicloud.ai/api/v1/ie/requestqueue/models/88943704-646d-47f6-868c-408ed6f78e08` returned `{"error":"Model not found"}` without auth.
- `GET https://api.gmi-serving.com/v1/models` did not list the UUID as an `internal_id`, but direct chat completion against `google/gemini-3.5-flash` succeeded.

## Implementation

Selectable aliases:

- ViMax / `qcut flow`: `--llm-model gemini-3.5-flash`
- Explicit GMI alias: `--llm-model gmi-gemini-3.5-flash`
- Moyin explicit GMI alias: `gmi-gemini-3.5-flash`

Files changed:

- `electron/native-pipeline/vimax/adapters/llm-adapter.ts`
- `electron/moyin-llm.ts`
- `electron/native-pipeline/cli/cli-handlers-moyin.ts`
- `apps/web/src/lib/credit-costs.ts`
- `.claude/skills/native-cli/references/reference-vimax.md`
- `resources/default-skills/native-cli/references/reference-vimax.md`
- `docs/task/gmi-provider/gmi-cli-quickstart.md`

## Verification

Unit tests:

```bash
bun run test -- --run electron/__tests__/gmi-llm-adapter.test.ts electron/__tests__/moyin-handler-proxy.test.ts
```

Result: 2 files passed, 23 tests passed.

Real GMI smoke:

```bash
curl -sS -H "Authorization: Bearer $GMI_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.gmi-serving.com/v1/chat/completions \
  -d '{"model":"google/gemini-3.5-flash","messages":[{"role":"system","content":"You are a concise test assistant. Do not reason aloud."},{"role":"user","content":"Reply with exactly: qcut-gmi-3.5-flash-ok"}],"temperature":0,"max_tokens":256}'
```

Result: `HTTP=200`, response model `google/gemini-3.5-flash`, content `qcut-gmi-3.5-flash-ok`.

Note: `max_tokens=32` returned `HTTP=200` but `content:null` with `finish_reason:"length"` because the model used reasoning tokens before producing text. The CLI defaults are much larger (`4096`/`8192` depending on path), so normal QCut calls should have enough room.

Real QCut CLI E2E:

```bash
bun run pipeline -- flow scenes \
  --novel /tmp/qcut-input/gemini-3-5-flash-story.txt \
  --llm-model gemini-3.5-flash \
  --max-scenes 2 \
  -o /tmp/qcut-output/gemini-3-5-flash-e2e \
  --json
```

Result: passed in 11.0s. The CLI wrote `/tmp/qcut-output/gemini-3-5-flash-e2e/scenes.json` with title `Lanterns Under Glass`, 2 scenes, and 4 shots. The first scene was `The Workshop in the Rain`.

Routing evidence: `gemini-3.5-flash` maps to `gmi/google/gemini-3.5-flash` in `electron/native-pipeline/vimax/adapters/llm-adapter.ts`, so this `flow scenes` test selected the GMI Gemini 3.5 Flash path rather than the existing `gemini-3-flash` default.
