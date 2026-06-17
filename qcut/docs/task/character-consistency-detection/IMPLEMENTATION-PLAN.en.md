# Character Consistency Detection — Implementation Plan (EN)

> Companion docs: [IMPLEMENTATION-PLAN.zh.md](./IMPLEMENTATION-PLAN.zh.md) · [TASKS.en.md](./TASKS.en.md) · [TASKS.zh.md](./TASKS.zh.md)

## 1. Goal

Add a new QCut native-pipeline CLI feature that detects **character consistency problems** in a video by comparing it against one or more **reference images** of the character.

The classic problem this targets: a character who inexplicably gets **taller / shorter / wrong proportions** across scenes, or otherwise drifts from their canonical appearance (face identity, outfit, body structure).

- **Input**: one or more reference images **+** one video to check.
- **Output**: concrete time steps — *which frame range* a problem appears in (frame X → frame Y, plus the `HH:MM:SS` timestamps), the **category** (e.g. `proportion/height` — "character proportions are wrong"), severity, a human-readable comment, and a fix suggestion.
- **Judgment policy**: deliberately **conservative / approximate**. Only report when the frame is *obviously* wrong to a casual viewer. When in doubt, do **not** report. This keeps false-positive noise low (height is a relative quantity and is heavily confounded by camera distance, lens, angle and pose — see §6).

## 2. Why this design (background)

This was chosen after evaluating four approaches (full analysis lives in the chat history that produced this doc):

| Approach | Cross-scene compare | Spatial precision | Cost | Verdict |
|---|---|---|---|---|
| Reuse existing `analyze-video --analysis-type review` as-is | ❌ split-review breaks cross-segment compare | low (sampled video) | mid | Not viable |
| Prepend a reference clip into the video | ⚠️ single call only, breaks on split | low | mid | Workaround |
| Multi-input: multiple **videos** | ✅ (needs Gemini 2.5+) | mid (still sampled) | **high** | Suboptimal |
| **Multi-input: reference image(s) + extracted keyframe images** | ✅ we control exactly what is compared | **high (full-res stills)** | **low** | **Chosen** |

Confirmed facts about the model layer:
- Gemini supports **multiple images in one request** (intended for before/after & set comparison). Inline payload must be **< 20 MB total**; larger needs the File API.
- Gemini supports **multiple videos** only on **2.5+** (max 10/request), and Google recommends one video per prompt for best results.

Therefore the implementation extracts **keyframes** from the video, downscales them, and sends `reference image(s) + a batch of keyframes` to the model as a **multi-image** request, asking it to compare each keyframe's character against the reference.

## 3. Current-code constraint that drives the work

The executor today sends **exactly one** media part. See [electron/native-pipeline/execution/step-executors.ts:1832](../../../electron/native-pipeline/execution/step-executors.ts) (`executeOpenRouterMediaUnderstanding`): the `content` array is `[ {text}, {video_url | image_url} ]` — single media only.

The OpenRouter / Gemini chat-completions schema *does* accept multiple parts (`content: [ {text}, {image_url}, {image_url}, ... ]`), so the core engineering task is to add a **multi-image execution path** without disturbing the existing single-media path.

## 4. Architecture

New module folder mirroring the existing `video-review/` layout:

```
electron/native-pipeline/character-consistency/
├── types.ts                  # shared types (input opts, Finding, output schema)
├── frame-extractor.ts        # ffprobe (fps/duration) + ffmpeg keyframe extraction + downscale
├── consistency-prompts.ts    # zh/en prompt set, categories, JSON output schema
├── consistency-runner.ts     # orchestration: extract → batch → call → merge → filter
├── consistency-normalize.ts  # parse model JSON → normalized Finding[] with frame ranges
├── consistency-artifacts.ts  # write JSON / CSV / HTML / Markdown report
└── __tests__/                # unit tests
```

Plus wiring:
- `cli/cli-handlers-character-consistency.ts` — the CLI handler.
- `execution/step-executors.ts` — new `executeMultiImageUnderstanding` (multi-image content builder).
- `cli/command-registry.ts` — register the `analyze-consistency` command.
- `cli/cli-runner/handler-map.ts` — map command → handler.

### End-to-end flow

```
qcut analyze consistency \
  --ref ref1.jpg --ref ref2.jpg \
  --input scene.mp4 \
  --language zh --min-severity high

1. PARSE & VALIDATE
   ├─ ≥1 reference image exists; video exists/URL valid
   └─ resolve model (default openrouter_gemini_2_5_flash_video, switchable to 3.5)

2. PROBE VIDEO (frame-extractor.ts)
   ├─ ffprobe → fps (r_frame_rate), duration, total frames
   └─ needed to convert timestamps ⇄ frame numbers

3. EXTRACT KEYFRAMES (frame-extractor.ts)
   ├─ ffmpeg sampling: fps=N (default 1) OR scene-change select
   ├─ downscale to long-edge ~768px JPEG (payload control)
   └─ each frame tagged: { index, frameNumber, timeSeconds, path }

4. BATCH (consistency-runner.ts)
   ├─ reference image(s) included in EVERY batch (labeled REFERENCE)
   └─ keyframes grouped K per batch (default 6) under the 20MB / image-count limit

5. MULTI-IMAGE MODEL CALL (executeMultiImageUnderstanding)
   ├─ content = [ prompt, REF imgs..., FRAME imgs (labeled #frame @ t) ]
   └─ model returns JSON array of findings per batch

6. NORMALIZE (consistency-normalize.ts)
   ├─ strip fences, parse JSON, validate category/severity
   └─ map each flagged keyframe → frame range [startFrame,endFrame]

7. MERGE & FILTER (consistency-runner.ts)
   ├─ merge consecutive same-category flags into one range
   ├─ drop anything below --min-severity (default: high only)
   └─ dedup across batches

8. ARTIFACTS (consistency-artifacts.ts)
   └─ consistency-findings.json / .csv / .html / report.md
```

## 5. Data contracts

### CLI options (added to `CLIRunOptions`)
| Flag | Type | Default | Meaning |
|---|---|---|---|
| `--ref` (repeatable) | `string[]` | — (≥1 required) | Reference image path(s) |
| `--input` / `-i` | `string` | — (required) | Video path or URL |
| `--model` / `-m` | `string` | `openrouter_gemini_2_5_flash_video` | Model key (default 2.5; switch to `openrouter_gemini_3_5_flash_video` for 3.5) |
| `--language` | `string` | `zh` | Prompt language (`zh` \| `en`) |
| `--fps` | `number` | `1` | Keyframe sampling rate |
| `--scene-detect` | `boolean` | `false` | Use scene-change selection instead of fixed fps |
| `--batch-size` | `number` | `6` | Keyframes per model request |
| `--min-severity` | `string` | `high` | Report threshold (`low` \| `medium` \| `high`) |
| `--max-tokens` | `number` | `8000` | Max output tokens per request |
| `--output-dir` / `-o` | `string` | video dir / cwd | Where artifacts are written |

### Output JSON (`consistency-findings.json`)
```json
{
  "video": "scene.mp4",
  "model": "openrouter_gemini_2_5_flash_video",
  "videoFps": 30,
  "totalFrames": 4500,
  "referenceImages": ["ref1.jpg"],
  "samplingFps": 1,
  "minSeverity": "high",
  "findings": [
    {
      "startFrame": 120,
      "endFrame": 168,
      "startTime": "00:00:04.000",
      "endTime": "00:00:05.600",
      "category": "proportion/height",
      "severity": "high",
      "comment": "Character is clearly shorter than the reference; head-to-body ratio jumps vs. the surrounding shots.",
      "fix": "Regenerate this shot matching the reference proportions, or rescale the character to match the prior scene."
    }
  ]
}
```

### Categories (consistency-focused — distinct from the 9 review categories)
- `proportion/height` (人物比例/身高)
- `identity/face` (人物身份/面部) — looks like a different person
- `clothing/appearance` (服装/外观) — outfit / hair / color suddenly changes
- `body/limb` (肢体结构) — extra/missing/malformed limbs
- `other` (其他)

## 6. Conservative judgment policy (core to correctness)

The prompt and a post-filter both enforce restraint:
- **Prompt** instructs: only flag inconsistencies an ordinary viewer would notice at normal playback; **explicitly ignore** differences explainable by camera distance, lens, angle, crop, or pose; when uncertain, return nothing for that frame.
- **Post-filter** keeps only findings `>= --min-severity` (default `high`).
- Reality check baked into docs: height is *relative* and confounded — this tool **surfaces suspicious ranges for human review**, it is **not** a precise measurement. A frame-accurate metric would require pose estimation (per-frame head-to-body pixel ratio), which is out of scope here (§9).

## 7. Integration points (exact references)

| What | File | Anchor |
|---|---|---|
| Single-media executor to extend | [execution/step-executors.ts:1793](../../../electron/native-pipeline/execution/step-executors.ts) | `executeOpenRouterMediaUnderstanding` |
| Dispatch by step category | [execution/step-executors.ts:958](../../../electron/native-pipeline/execution/step-executors.ts) | switch on `image_understanding` |
| Model defs (add a 2.5 entry mirroring the 3.5 one) | [registry-data/image-understanding.ts:114](../../../electron/native-pipeline/registry-data/image-understanding.ts) | add `openrouter_gemini_2_5_flash_video` → `google/gemini-2.5-flash`; existing 3.5 entry is `openrouter_gemini_3_5_flash_video` |
| Command shape to mirror | [cli/command-registry.ts:577](../../../electron/native-pipeline/cli/command-registry.ts) | `analyze-video` entry |
| Flag helper / `FlagDef` | [cli/command-registry-types.ts:10](../../../electron/native-pipeline/cli/command-registry-types.ts) | `f()` + `FlagDef` |
| Handler dispatch table | [cli/cli-runner/handler-map.ts:172](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts) | `"analyze-video": mediaHandleAnalyzeVideo` |
| ffmpeg/ffprobe pattern to reuse | [video-review/review-split-runner.ts:243](../../../electron/native-pipeline/video-review/review-split-runner.ts) | `execFileAsync("ffprobe"/"ffmpeg", …)` |
| Artifacts pattern to mirror | [video-review/review-artifacts.ts](../../../electron/native-pipeline/video-review/review-artifacts.ts) | `writeReviewArtifacts` |
| Handler signature | [cli/cli-runner/handler-map.ts:103](../../../electron/native-pipeline/cli/cli-runner/handler-map.ts) | `CommandHandler` type |
| Test pattern | [cli/__tests__/cli-handlers-media-review.test.ts](../../../electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts) | vitest + stub executor |

## 8. Key decisions & trade-offs

1. **Multi-image, not multi-video.** Higher spatial fidelity, far cheaper, no hard version lock-in, and we control exactly which frames are compared. (See §2.)
2. **New executor function, not a mutation of the single-media path.** Keeps the proven path untouched; long-term maintainability over a clever in-place hack. New step input shape `{ images: MediaPart[] }` flows through a new `executeMultiImageUnderstanding`.
3. **Reference repeated per batch.** The baseline must be present in every request, since each request is an independent model call.
4. **Downscale frames (~768px) + batch (K=6).** Keeps inline payload under Gemini's 20 MB limit without the File API for typical clips; both are flags so large jobs can tune them.
5. **fps from `ffprobe r_frame_rate`.** Required to honor the requirement "report frame X → frame Y". `frameNumber = round(timeSeconds * fps)`.
6. **Conservative by default (`--min-severity high`).** Matches the user's "only report when really problematic" requirement.
7. **Default to Gemini 2.5 Flash, switchable to 3.5.** Default model key is `openrouter_gemini_2_5_flash_video` (→ `google/gemini-2.5-flash`); `--model openrouter_gemini_3_5_flash_video` switches to 3.5. This requires **adding a new OpenRouter 2.5 registry entry** that mirrors the existing 3.5 one (only 3.5 is registered today on this path; the existing 2.5 `fal_video_qa` uses a different FAL endpoint and is not the multi-image chat-completions path). The approach itself is version-agnostic — multi-image works on both.

## 9. Out of scope (explicitly)

- Pixel-accurate height measurement / pose estimation (head-to-body ratio per frame). Could be a future `--metric` mode.
- Editor/timeline UI integration (this is a CLI + artifacts feature first).
- Native (non-OpenRouter) Gemini direct API support — noted as a follow-up if OpenRouter multi-image proves limiting (see Risks).

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenRouter route may not pass multi-image cleanly for the chosen Gemini model | Validate early in Subtask 3 with a 2-image smoke test; document a fallback to native Gemini provider entry if needed |
| Inline payload > 20 MB on long videos / many frames | Downscale + batch; if still large, lower `--fps` or `--batch-size`; future: File API upload |
| False positives from camera/pose confounds | Conservative prompt + `--min-severity high` default + docs framing as "for human review" |
| ffmpeg/ffprobe not on PATH in packaged app | Reuse the existing review-split-runner invocation pattern; surface a clear error if missing (same behavior as today's review feature) |
| Frame-range mapping off-by-one | Unit tests in `consistency-normalize.test.ts` pin the timestamp→frame math |

## 11. Verification

- `bun run test` — all new unit tests pass (see [TASKS.en.md](./TASKS.en.md)).
- `bun check-types` — clean.
- `bun lint:clean` — clean (run biome before committing).
- Manual smoke: run `analyze consistency` on a short clip with an intentionally rescaled character; confirm the bad range is reported with frame numbers and a `proportion/height` category, and that a clean clip yields `findings: []`.
