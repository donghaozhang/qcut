# Character Consistency Detection — Task Breakdown (EN)

> Companion docs: [TASKS.zh.md](./TASKS.zh.md) · [IMPLEMENTATION-PLAN.en.md](./IMPLEMENTATION-PLAN.en.md) · [IMPLEMENTATION-PLAN.zh.md](./IMPLEMENTATION-PLAN.zh.md)

This feature is well beyond 20 minutes, so it is split into ordered subtasks. Each subtask lists the files to create/modify and the unit tests that prove it. Do them in order; tasks 1–6 are mostly independent of the CLI wiring and can be parallelized after Task 0.

**Estimated total: ~6–9 hours** (1 engineer).

## Splitting & Maintenance Rules

- Every task must name concrete code paths and test paths; avoid vague entries such as "wire CLI" or "change executor".
- If a task grows beyond roughly 2 hours during implementation, split it into A/B subtasks and keep each subtask independently acceptable.
- If a task spans 3 or more of model calls, CLI options, ffmpeg extraction, and artifact output, or is expected to modify more than 3 production modules / 300 lines, split it first. Each subtask must name owner files, test files, and acceptance commands.
- Prefer long-term structure over short-term speed: feature logic belongs in `electron/native-pipeline/character-consistency/`, shared OpenRouter content construction belongs in `electron/native-pipeline/execution/openrouter-media-content.ts`, and temporary logic should not accumulate in the CLI handler or further bloat `step-executors.ts`.
- Every task needs tests; new behavior must include old-path regression coverage so existing media understanding does not break.

---

## Task 0 — Types & module scaffold
**Goal:** Establish shared types so later tasks compile independently.
**~20 min**

- **Create** `electron/native-pipeline/character-consistency/types.ts`
  - `ConsistencyCategory = "proportion/height" | "identity/face" | "clothing/appearance" | "body/limb" | "other"`
  - `Severity = "low" | "medium" | "high"`
  - `Keyframe = { index: number; frameNumber: number; timeSeconds: number; path: string }`
  - `ConsistencyFinding = { startFrame; endFrame; startTime; endTime; category; severity; comment; fix }`
  - `ConsistencyRunOptions` (refs[], videoInput, model, language, fps, sceneDetect, batchSize, minSeverity, maxTokens, outputDir)
  - `ConsistencyResult = { video; model; videoFps; totalFrames; referenceImages; samplingFps; minSeverity; findings: ConsistencyFinding[] }`
  - `DEFAULT_CONSISTENCY_OPTIONS`: `model: "openrouter_gemini_3_5_flash_video"`, `language: "zh"`, `fps: 1`, `batchSize: 6`, `minSeverity: "high"`, `maxTokens: 8000`

**Acceptance:** `bun check-types` passes; no behavior yet.

---

## Task 1 — Frame extraction (ffmpeg/ffprobe)
**Goal:** Probe fps/duration and extract downscaled keyframes tagged with frame numbers.
**~1.5 h**

- **Create** `electron/native-pipeline/character-consistency/frame-extractor.ts`
  - `probeVideoMeta(input): Promise<{ fps: number; durationSeconds: number; totalFrames: number }>` — `ffprobe -show_entries stream=r_frame_rate,duration`. Reuse the `execFileAsync("ffprobe", …)` pattern from [video-review/review-split-runner.ts:243](../../../electron/native-pipeline/video-review/review-split-runner.ts).
  - `extractKeyframes({ input, fps, sceneDetect, outputDir, maxLongEdge=768 }): Promise<Keyframe[]>` — `ffmpeg -vf "fps=N,scale='min(768,iw)':-2"` (or `select='gt(scene,0.4)'` when `sceneDetect`), write JPEGs to `<outputDir>/consistency-frames/`, compute `frameNumber = round(timeSeconds * videoFps)`.
- **Create test** `electron/native-pipeline/character-consistency/__tests__/frame-extractor.test.ts`
  - Inject a command runner to assert correct ffmpeg/ffprobe argv; verify `r_frame_rate` parsing (`"30000/1001"` → `29.97`), frame-number math, and JPEG naming. No real ffmpeg in CI.

**Acceptance:** Unit tests green; given a fake duration the keyframe list has correct timestamps + frame numbers.

---

## Task 2 — Prompt set & schema
**Goal:** zh/en prompts that enforce the conservative judgment policy.
**~1 h**

- **Create** `electron/native-pipeline/character-consistency/consistency-prompts.ts`
  - `getConsistencyPromptSet({ language }): { language; system: string }` mirroring the structure of [video-review/review-prompts.ts](../../../electron/native-pipeline/video-review/review-prompts.ts).
  - Prompt content (both languages): role = "character-consistency checker"; the first image(s) are the REFERENCE for the character's canonical proportions/appearance; each following image is a labeled frame; **only** report obvious problems; **ignore** camera-distance/angle/pose/crop differences; output ONLY a JSON array of `{ frameNumber, category, severity, comment, fix }`; empty array if nothing wrong.
  - Allow override via `--review-prompt-dir`-style env later (optional; keep built-in for now).
- **Create test** `electron/native-pipeline/character-consistency/__tests__/consistency-prompts.test.ts`
  - Assert both languages return non-empty prompts and that the prompt contains the category list and the "only flag obvious issues" instruction.

**Acceptance:** Snapshot/string assertions pass for zh and en.

---

## Task 3A — OpenRouter media content helper
**Goal:** Extract OpenRouter media URL encoding and content construction from the large executor first, protecting the old path.
**~45 min**

- **Create** `electron/native-pipeline/execution/openrouter-media-content.ts`
  - Move/wrap the current `toOpenRouterMediaUrl({ input })` behavior from [step-executors.ts:204](../../../electron/native-pipeline/execution/step-executors.ts).
  - Add `buildOpenRouterSingleMediaContent({ prompt, mediaUrl, mediaKind })`, returning text + `image_url` or `video_url`.
  - Add `buildOpenRouterMultiImageContent({ prompt, imageUrls })`, returning text + multiple `image_url` parts while preserving input order.
- **Modify** `electron/native-pipeline/execution/step-executors.ts`
  - Update `executeOpenRouterMediaUnderstanding` to use the helper without changing external behavior.
- **Create test** `electron/native-pipeline/execution/__tests__/openrouter-media-content.test.ts`
  - Cover remote URL, data URL, local-file data URL, single-image content, single-video content, and multi-image content order.

**Acceptance:** The existing single-media OpenRouter request payload is equivalent to before; new helper tests pass.

---

## Task 3B — Multi-image executor path
**Goal:** Let the executor send `reference + N frames` in one request without breaking the single-media path.
**~1 h**

- **Modify** `electron/native-pipeline/execution/step-executors.ts`
  - Add `executeMultiImageUnderstanding(model, input, payload, options)` near [executeOpenRouterMediaUnderstanding:1793](../../../electron/native-pipeline/execution/step-executors.ts), reuse `buildOpenRouterMultiImageContent`, and call `callModelApi(... provider:"openrouter")` exactly like the existing function.
  - Add `images?: string[]` to [StepInput:21](../../../electron/native-pipeline/execution/step-executors.ts). Route to the multi-image fn when `input.images?.length` is set; otherwise keep existing behavior.
- **Create test** `electron/native-pipeline/execution/__tests__/multi-image-understanding.test.ts`
  - Mock `callModelApi`; assert the outgoing `content` array contains 1 text + K `image_url` parts in order, and that single-media calls are unchanged (regression).

**Acceptance:** New test + existing executor tests green.

---

## Task 4 — Response normalization → frame ranges
**Goal:** Parse model JSON into clean `ConsistencyFinding[]` with frame ranges.
**~1 h**

- **Create** `electron/native-pipeline/character-consistency/consistency-normalize.ts`
  - `parseConsistencyResponse({ response, batchKeyframes, samplingFps, videoFps }): ConsistencyFinding[]` — strip fences, parse array, validate `category`/`severity` (en + zh synonyms), map each flagged `frameNumber` to a range: `startFrame = round(t*videoFps)`, `endFrame = round((t + 1/samplingFps)*videoFps) - 1`, fill `HH:MM:SS.mmm` strings.
  - Drop malformed items; never throw on partial JSON (mirror [video-review/review-normalize.ts](../../../electron/native-pipeline/video-review/review-normalize.ts)).
- **Create test** `electron/native-pipeline/character-consistency/__tests__/consistency-normalize.test.ts`
  - Cover: clean JSON, fenced JSON, truncated JSON, zh category/severity mapping, **frame-range math (off-by-one pinned)**, and empty array.

**Acceptance:** All edge-case tests green; frame math exact.

---

## Task 5 — Orchestration runner
**Goal:** Tie extract → batch → executor → merge → filter together.
**~1.5 h**

- **Create** `electron/native-pipeline/character-consistency/consistency-runner.ts`
  - `runConsistencyCheck({ options, executor, onProgress, signal }): Promise<ConsistencyResult>`:
    1. `probeVideoMeta` + `extractKeyframes`
    2. encode references once (data URLs)
    3. chunk keyframes into batches of `batchSize`; per batch build `StepInput.images = [...refs, ...frameImgs]` + a prompt naming each frame number/time
    4. call `executor.executeStep` (multi-image step) per batch (sequential to bound concurrency, like `reviewPartsSequentially`)
    5. `parseConsistencyResponse` per batch → merge consecutive same-category ranges → filter `>= minSeverity` → dedup
  - **Merge helper** `mergeAdjacentFindings(findings)` — combine same-category findings whose frame ranges touch/overlap.
- **Create test** `electron/native-pipeline/character-consistency/__tests__/consistency-runner.test.ts`
  - Stub executor (record steps, return canned per-batch JSON) + mock frame-extractor; assert batching (refs in every batch), merging of adjacent ranges, and that `--min-severity high` filters out `medium`.

**Acceptance:** Runner test green; batching + filtering behavior verified.

---

## Task 6 — Artifacts writer
**Goal:** Emit JSON / CSV / HTML / Markdown report.
**~1 h**

- **Create** `electron/native-pipeline/character-consistency/consistency-artifacts.ts`
  - `writeConsistencyArtifacts({ outputDir, result }): { jsonPath; csvPath; htmlPath; reportPath }` mirroring [video-review/review-artifacts.ts](../../../electron/native-pipeline/video-review/review-artifacts.ts).
  - Files: `consistency-findings.json`, `consistency-findings.csv` (startFrame, endFrame, startTime, endTime, category, severity, comment, fix), `consistency-report.html` (sortable table), `consistency-report.md`.
- **Create test** `electron/native-pipeline/character-consistency/__tests__/consistency-artifacts.test.ts`
  - Write to a `mkdtempSync` dir; assert all four files exist and CSV header/row counts match `findings`.

**Acceptance:** Files written; content assertions green.

---

## Task 7 — CLI handler
**Goal:** Wire options → runner → artifacts → `CLIResult`.
**~45 min**

- **Create** `electron/native-pipeline/cli/cli-handlers-character-consistency.ts`
  - `export async function handleAnalyzeConsistency(options, onProgress, executor, signal): Promise<CLIResult>` — validate `≥1 --ref` + `--input`, validate model via `ModelRegistry.has`, call `runConsistencyCheck`, `writeConsistencyArtifacts`, return `{ success, outputPath: reportPath, data, duration }`. Mirror structure of [cli/cli-handlers-media.ts:90](../../../electron/native-pipeline/cli/cli-handlers-media.ts) (`handleAnalyzeVideo`).
- **Create test** `electron/native-pipeline/cli/__tests__/cli-handlers-character-consistency.test.ts`
  - Mirror [cli-handlers-media-review.test.ts](../../../electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts): register a test model, stub executor, mock frame-extractor, run handler, assert artifact files + `CLIResult.outputPath`. Also assert a missing-`--ref` error path.

**Acceptance:** Handler test green incl. validation errors.

---

## Task 8 — Command registration & dispatch
**Goal:** Make `qcut analyze consistency` runnable with `openrouter_gemini_3_5_flash_video` as the default model.
**~30 min**

- **Modify** `electron/native-pipeline/cli/command-registry.ts`
  - Add `"analyze-consistency"` to `CORE_COMMANDS` (mirror `analyze-video` at [line 577](../../../electron/native-pipeline/cli/command-registry.ts)) with flags from the options table in the plan; add it to the `analysis` category.
- **Modify** `electron/native-pipeline/cli/cli-runner/handler-map.ts`
  - Import the handler and add `"analyze-consistency": handleAnalyzeConsistency` to `HANDLER_MAP` (near [line 172](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts)).
- **Modify** [electron/native-pipeline/cli/cli-runner/types.ts:12](../../../electron/native-pipeline/cli/cli-runner/types.ts)
  - Add `refs?: string[]`, `language?`, `fps?`, `sceneDetect?`, `batchSize?`, `minSeverity?`, `maxTokens?` to `CLIRunOptions`, keeping field names aligned with command-registry output.
  - Ensure `--ref` parses as repeatable `string[]`.
- **Create/extend test** `electron/native-pipeline/cli/__tests__/command-registry.test.ts` (if exists) — assert the command + flags are registered and `--ref` is `string[]`.

**Acceptance:** `qcut analyze consistency --help` lists flags; arg-parse test green.

---

## Task 9 — Docs & manual verification
**Goal:** Document usage and smoke-test end to end.
**~30 min**

- **Update** this folder's docs with a final "Usage" snippet and any deviations discovered during implementation.
- **Optional:** add a short section to the native-pipeline CLI reference if one exists under `docs/`.
- **Manual smoke** (not CI): run on a real short clip with a rescaled character; confirm the bad range is reported with frame numbers + `proportion/height`, and a clean clip yields `findings: []`.
- **Daytona online chat agent smoke**: in the online Daytona environment, pull the current branch or apply the equivalent patch, run `qcut analyze consistency --help --json`, and verify that the command, `--ref`, and default model exist. If the remote environment lacks an API key, the full real-video call may be recorded as environment-blocked, but the local real CLI E2E still must pass.

**Acceptance:** Docs updated; local manual smoke matches expectations; Daytona online chat agent passes at least the help/command-registration smoke.

### Current implementation usage

```bash
qcut analyze consistency \
  --ref ref.jpg \
  --input scene.mp4 \
  --language zh \
  --min-severity high \
  --output-dir ./consistency-report \
  --json
```

Multiple reference images:

```bash
qcut analyze consistency \
  --ref ref-front.jpg \
  --ref ref-side.jpg \
  --input scene.mp4 \
  --fps 2 \
  --batch-size 4
```

Artifacts:

- `consistency-findings.json`
- `consistency-findings.csv`
- `consistency-report.html`
- `consistency-report.md`

Implementation notes / deviations:

- The public command runs through the group alias `qcut analyze consistency ...`; the internal command name is `analyze-consistency`.
- `--ref` parses to `refs: string[]`, while the older single `ref` option is preserved as the first reference to avoid impacting existing editor commands.
- Frame-extractor unit tests inject a command runner instead of mocking built-in `child_process`; production still calls system `ffprobe` / `ffmpeg` by default.

---

## Pre-commit checklist
- [ ] `bun run test` — all new unit tests pass
- [ ] `bun check-types` — clean
- [ ] `bun lint:clean` — clean (run `npx @biomejs/biome format --write` first)
- [ ] No file exceeds 800 lines (split if needed — CLAUDE.md rule)
- [ ] Renderer boundary rules not violated (this is all Electron-main / native-pipeline code, so N/A, but `bun scripts/check-boundaries.ts` still runs on pre-commit)

## File summary (new vs modified)
**New**
- `electron/native-pipeline/character-consistency/types.ts`
- `electron/native-pipeline/execution/openrouter-media-content.ts`
- `electron/native-pipeline/character-consistency/frame-extractor.ts`
- `electron/native-pipeline/character-consistency/consistency-prompts.ts`
- `electron/native-pipeline/character-consistency/consistency-normalize.ts`
- `electron/native-pipeline/character-consistency/consistency-runner.ts`
- `electron/native-pipeline/character-consistency/consistency-artifacts.ts`
- `electron/native-pipeline/cli/cli-handlers-character-consistency.ts`
- `electron/native-pipeline/character-consistency/__tests__/*.test.ts` (5 files)
- `electron/native-pipeline/cli/__tests__/cli-handlers-character-consistency.test.ts`
- `electron/native-pipeline/execution/__tests__/openrouter-media-content.test.ts`
- `electron/native-pipeline/execution/__tests__/multi-image-understanding.test.ts`

**Modified**
- `electron/native-pipeline/execution/step-executors.ts` (+ step-input type)
- `electron/native-pipeline/cli/command-registry.ts`
- `electron/native-pipeline/cli/cli-runner/handler-map.ts`
- `electron/native-pipeline/cli/cli-runner/types.ts` (`CLIRunOptions`)
