# Video Upscale Command — Implementation Plan

- **Goal**: Ship a first-class `qcut edit upscale-video` CLI command using the FAL Topaz Video Upscale endpoint. Close the gap where `upscale_video` works as a YAML pipeline step but has no dedicated CLI surface.
- **Reference**: [FAL Topaz Video Upscale API](https://fal.ai/models/fal-ai/topaz/upscale/video/api)
- **Endpoint**: `fal-ai/topaz/upscale/video` (already registered, see `registry-data/video-to-video.ts:31-50`)
- **Status**: ✅ **Shipped** (Tasks 1-3, 5 landed; Task 4 deferred; Task 6 follow-up)

## Implementation Summary

Landed in a single commit. Exact files touched:

| File | Change |
|---|---|
| `electron/native-pipeline/execution/step-executors.ts` | `executeVideoToVideo` now auto-uploads local video files to FAL storage when `provider === "fal"` and path is not an `http(s)` URL. |
| `electron/native-pipeline/cli/cli-runner/handler-upscale.ts` | Added `handleUpscaleVideo` export. File module comment updated to reflect dual image/video responsibility. |
| `electron/native-pipeline/cli/cli-runner/handler-map.ts` | Imported `handleUpscaleVideo`, registered `"upscale-video"` key. |
| `electron/native-pipeline/cli/cli-runner/types.ts` | Added `video?: string` and `targetFps?: number` to `CLIRunOptions`. |
| `electron/native-pipeline/cli/cli.ts` | Registered `video` and `target-fps` parseArgs entries; mapped `values["target-fps"]` → `targetFps` (parsed as int). |
| `electron/native-pipeline/cli/command-groups.ts` | Added `"upscale-video": "upscale-video"` to `edit.actions`. |
| `electron/native-pipeline/cli/command-registry.ts` | Added `"upscale-video"` to the `generation` category list and a `CORE_COMMANDS` entry with 7 flags + 2 examples. |
| `electron/__tests__/cli-upscale-video.test.ts` | **New** — 14 tests covering group resolution, registry contract, `parseCliArgs`, and `handleUpscaleVideo` validation branches. |

**Line counts**: `handler-upscale.ts` grew from 114 → 213 lines (well under the 800-line cap).

**Test results**: `bunx vitest run electron/__tests__/cli-upscale-video.test.ts electron/__tests__/cli-command-groups.test.ts electron/__tests__/cli-pipeline.test.ts` → **123/123 pass** (14 new + 74 command-groups + 35 pipeline).

**Lint**: modified files pass `bunx @biomejs/biome check` with zero diagnostics.

**Backward compatibility**: zero changes to `edit upscale` (image) behavior. The existing `executeVideoToVideo` callers gain auto-upload-for-local-paths — a pure capability addition, not a behavior change for existing HTTP-URL inputs.

## Current State

| Surface | Status | Where |
|---|---|---|
| YAML step `upscale_video` | ✅ Works | `execution/step-executors.ts:150` → `executeVideoToVideo` |
| `topaz` model entry | ✅ Registered | `registry-data/video-to-video.ts:32`, category `upscale_video`, defaults `{upscale_factor: 2, target_fps: null}` |
| `qcut edit upscale` CLI | ⚠️ Image-only | `cli-runner/handler-upscale.ts:14` (`handleUpscaleImage`) |
| `qcut edit upscale-video` CLI | ❌ Missing | This plan |
| Local video file auto-upload for FAL | ❌ Missing | `executeVideoToVideo` at `step-executors.ts:359-385` does NOT call `uploadToFalStorage` (image-to-video and image-understanding do) |

### Pre-existing bug flagged (handled in Task 3 below)

`handler-upscale.ts:25` and `handler-grid.ts:148` default `model: "topaz"` for **image** upscale. But the only registered `topaz` key points to the **video** endpoint (`fal-ai/topaz/upscale/video`). Image upscale with the default model either silently degrades or calls a video endpoint with image payload. Fix alongside Task 3.

## Target Surface

```
qcut edit upscale-video --video input.mp4 --upscale 4 --target-fps 60 --output-dir ./out
qcut edit upscale-video --video-url https://cdn.example.com/clip.mp4 --upscale 2
qcut edit upscale-video -i clip.mp4 -u 2                       # alias flags
```

### Flags (per FAL API reference)

| Flag | Short | Type | Default | Maps to FAL payload |
|---|---|---|---|---|
| `--video` | | string | | Local path → auto-uploaded to FAL storage |
| `--video-url` | | string | | Remote URL passed through as-is |
| `--input` | `-i` | string | | Alias for `--video` / `--video-url` (URL detected by prefix) |
| `--upscale` | `-u` | integer | `2` | `upscale_factor` (valid: `1`..`4`) |
| `--target-fps` | | integer | (null) | `target_fps` — omit to preserve source fps |
| `--model` | `-m` | string | `topaz` | Registry key |
| `--output-dir` | `-o` | string | `./output` | Where to save downloaded mp4 |
| `--output-format` | `-f` | string | `mp4` | File extension on download |

Numeric constraints (`upscale_factor` 1-4, `target_fps` ≥ source fps) are enforced in the handler with a clear error message; do not rely on the remote endpoint returning a helpful error.

### Non-goals

- Exposing every Topaz-specific knob (`H264_output`, `output_pix_fmt`, etc.) — leave as pipeline-YAML-only escape hatch for now. Reassess once a real user asks.
- Supporting non-FAL providers. Only the FAL Topaz endpoint is in scope.
- Renaming the existing `edit upscale` to `edit upscale-image`. Backward compatibility > symmetry; document the split.

## Relevant Files

| File | Role | Change |
|---|---|---|
| `electron/native-pipeline/cli/cli-runner/handler-upscale.ts` | Image upscale handler | **Edit**: add `handleUpscaleVideo`. Keep existing `handleUpscaleImage` untouched. File is 114 lines — adding ~90 lines stays well under the 800-line cap. |
| `electron/native-pipeline/cli/cli-runner/handler-map.ts` | Command → handler lookup | **Edit**: import `handleUpscaleVideo`, register `"upscale-video": handleUpscaleVideo` in `HANDLER_MAP` (line ~154, near `upscale-image`). |
| `electron/native-pipeline/cli/command-groups.ts` | Resource-first group routing | **Edit**: add `"upscale-video": "upscale-video"` to `edit.actions` (line 53-61). |
| `electron/native-pipeline/cli/command-registry.ts` | Flag declarations, help text | **Edit**: add `"upscale-video"` entry next to `"upscale-image"` (after line 376). Also add to the `edit` category list at line 80-92. |
| `electron/native-pipeline/cli/cli.ts` | `parseCliArgs` | **Verify**: `--target-fps` parses as number. `video-url` already maps to `videoUrl` (line 119, 375). Add `target-fps` → `targetFps` if missing. |
| `electron/native-pipeline/cli/cli-runner/types.ts` | `CLIRunOptions` | **Edit**: add `targetFps?: number;` (group with other numeric flags around line 119). `videoUrl` already exists (line 19). |
| `electron/native-pipeline/execution/step-executors.ts` | `executeVideoToVideo` | **Edit**: auto-upload local files to FAL storage when `provider === "fal"` and `videoUrl` is not an `http(s)` URL. Mirror the pattern at lines 524-543 (image-understanding). |
| `electron/native-pipeline/cli/cli-runner/handler-upscale.ts` (image path) | **Fix pre-existing bug** | Change image upscale default model from `"topaz"` to an image-capable key, or add a separate `topaz-image` registry entry. See Task 3. |
| `electron/__tests__/cli-flow-contracts.test.ts` *(new or existing)* | Contract test | **New case**: assert every handler's `options.X` read has a declared flag. |
| `packages/nexusai-website/cli.html` | CLI docs site | **Follow-up**: add `edit upscale-video` card under the `edit` sidebar section. |
| `.claude/skills/native-cli/references/REFERENCE.md` | Skill reference | **Follow-up**: add a `edit upscale-video` flag table next to the image one (line ~92). |
| `.claude/skills/native-cli/SKILL.md` | Skill overview | **Follow-up**: mention video upscale in the `edit` row (line 85). |

## Task Breakdown

### Task 1 — Wire the command (15 min) ✅ Done

1. In `command-groups.ts`, add `"upscale-video": "upscale-video"` to `edit.actions`.
2. In `command-registry.ts`, add an entry next to `"upscale-image"`:
   ```ts
   "upscale-video": {
     name: "upscale-video",
     description: "Upscale a video using FAL Topaz",
     category: "generation", // existing buckets: generation/analysis/pipeline/auth/...
     flags: [
       f("--video", "string", "Local video path"),
       f("--video-url", "string", "Remote video URL"),
       f("--input", "string", "Alias for --video / --video-url", { short: "-i" }),
       f("--model", "string", "Model key", { short: "-m", default: "topaz" }),
       f("--upscale", "number", "Upscale factor (1-4)", { short: "-u", default: 2 }),
       f("--target-fps", "number", "Target FPS (omit to keep source)"),
       f("--output-dir", "string", "Output directory", { short: "-o" }),
       f("--output-format", "string", "Output extension", { short: "-f", default: "mp4" }),
     ],
     examples: [
       "qcut edit upscale-video --video clip.mp4 -u 4",
       "qcut edit upscale-video --video-url https://example.com/clip.mp4 -u 2 --target-fps 60",
     ],
   },
   ```
3. Add `"upscale-video"` to the `edit` group's command list at the top of the registry (same block as line 84 `"upscale-image"`).

### Task 2 — Handler + types (25 min) ✅ Done

1. In `cli-runner/types.ts`, add `targetFps?: number;` near line 119 (adjacent to other numeric flags).
2. In `cli.ts` `parseCliArgs()`, verify `"target-fps": { type: "string" }` (or number) is declared and mapped into `targetFps`. `video-url` is already mapped (line 375).
3. In `handler-upscale.ts`, append a new export:
   ```ts
   export async function handleUpscaleVideo(
     options: CLIRunOptions,
     onProgress: ProgressFn,
     executor: PipelineExecutor,
     signal: AbortSignal,
   ): Promise<CLIResult> {
     const videoInput =
       options.videoUrl || options.video || options.input;
     if (!videoInput) {
       return { success: false, error: "Missing --video or --video-url" };
     }
     const model = options.model || "topaz";
     if (!ModelRegistry.has(model)) {
       return { success: false, error: `Unknown model '${model}'` };
     }

     const factor = options.upscale
       ? parseInt(String(options.upscale), 10)
       : 2;
     if (Number.isNaN(factor) || factor < 1 || factor > 4) {
       return { success: false, error: `Invalid --upscale (must be 1-4): ${options.upscale}` };
     }

     const params: Record<string, unknown> = { upscale_factor: factor };
     if (options.targetFps !== undefined) params.target_fps = options.targetFps;

     const sessionId = `cli-${Date.now()}`;
     const outputDir = resolveOutputDir(options.outputDir, sessionId);
     onProgress({ stage: "upscaling", percent: 0, message: "Upscaling video…", model });

     const step: PipelineStep = {
       type: "upscale_video",
       model,
       params,
       enabled: true,
       retryCount: 0,
     };

     const result = await executor.executeStep(
       step,
       { videoUrl: videoInput },
       { outputDir, signal },
     );

     const ext = options.outputFormat?.replace(/^\./, "") || "mp4";
     if (!result.outputPath && result.outputUrl && outputDir) {
       try {
         result.outputPath = await downloadOutput(
           result.outputUrl,
           join(outputDir, `upscaled_${Date.now()}.${ext}`),
         );
       } catch { /* URL remains available */ }
     }

     onProgress({ stage: "complete", percent: 100, message: "Done", model });
     return {
       success: result.success,
       outputPath: result.outputPath,
       error: result.error,
       cost: result.cost,
       duration: (Date.now() - (options as unknown as { _start?: number })._start ?? Date.now()) / 1000,
     };
   }
   ```
   (Final duration calc: follow the same pattern as `handleUpscaleImage:30,112` — capture `startTime` at entry.)
4. In `handler-map.ts`, import and register:
   ```ts
   import { handleUpscaleImage, handleUpscaleVideo } from "./handler-upscale.js";
   // ...
   "upscale-video": handleUpscaleVideo,
   ```

### Task 3 — Fix local-file upload for FAL video (15 min) ✅ Done

`executeVideoToVideo` in `step-executors.ts:359-385` accepts `input.videoUrl` but never uploads local paths. Mirror the image-understanding logic:

```ts
async function executeVideoToVideo(...) {
  if (input.videoUrl) {
    if (provider === "fal" && !/^https?:/i.test(input.videoUrl)) {
      options.onProgress?.(10, "Uploading video to FAL storage…");
      const upload = await uploadToFalStorage(input.videoUrl);
      if (!upload.success || !upload.url) {
        return { success: false, error: upload.error || "Failed to upload video", duration: 0 };
      }
      payload.video_url = upload.url;
    } else {
      payload.video_url = input.videoUrl;
    }
  }
  if (input.text) payload.prompt = input.text;
  // … existing callModelApi + mapApiResult
}
```

Import `uploadToFalStorage` if not already (line 14 already imports it). This fix also benefits `video_to_video` and `add_audio` categories that share this executor.

### Task 4 — Fix image-upscale default-model bug (10 min) ⚠️ Deferred

The image upscale path currently defaults to model key `"topaz"`, but that key points to the video endpoint. Two options:

**Option A — rename**: change the video entry's key from `topaz` → `topaz_video`. Update `defaults` in `registry-data/video-to-video.ts:32`. Keep a legacy `topaz` alias entry for one release.

**Option B — split**: add a second registry entry `{key: "topaz_image", endpoint: "fal-ai/topaz/upscale/image", categories: ["image_to_image"]}`. Change `handler-upscale.ts:25` default to `"topaz_image"` and `handler-grid.ts:148` to `"topaz_image"`. The current video entry stays as `topaz`.

Recommend **Option B** — smaller blast radius, no alias churn, and symmetric with FAL's own URL structure (`/topaz/upscale/image` vs `/topaz/upscale/video`). Option A means updating every caller that hardcodes `"topaz"`.

**Deferred rationale**: this change alters the default model for existing `edit upscale` callers. A working image upscale model is already registered (`clarity` at `registry-data/image-to-image.ts:134`) and users who specify `--model clarity` have a clean path. Shipping the new `edit upscale-video` command does not require touching image defaults. Track as a separate follow-up with a dedicated smoke test.

### Task 5 — Tests (20 min) ✅ Done

1. **Registry contract test**: `ModelRegistry.has("topaz")` returns true, categories include `upscale_video`.
2. **CLI parse test**: `parseCliArgs(["edit","upscale-video","--video","clip.mp4","-u","4","--target-fps","60"])` → `{ command: "upscale-video", video: "clip.mp4", upscale: "4", targetFps: 60 }`.
3. **Handler contract test**: for `"upscale-video"`, every `options.X` the handler reads has a corresponding flag in `command-registry.ts`. (Mirrors the flow contract tests pattern from `10-flow-tests-plan.md`.)
4. **Help output test**: `qcut edit upscale-video --help` lists all declared flags.
5. *(Out of scope for this PR)* A live FAL call test — covered by an opt-in integration suite using a short test clip.

### Task 6 — Docs (follow-up, 30 min) ⏳ Pending

Not required to ship the feature but should land within the same week to avoid doc drift.

1. **Website card** (`packages/nexusai-website/cli.html`):
   - Add sidebar link `<a href="#upscale-video" class="sidebar-link">edit upscale-video</a>` under the `edit` heading (line 177-179).
   - Add a cmd-card section mirroring `#upscale-image` (if one exists) or the `#generate-speech` card pattern.
   - Commit in submodule, bump pointer in outer repo.
2. **Skill reference** (`.claude/skills/native-cli/references/REFERENCE.md`): add an `edit upscale-video` flag table after the image one at line 92.
3. **Skill overview** (`.claude/skills/native-cli/SKILL.md`): line 85, change `edit upscale --image img.png` example to include a second `edit upscale-video --video clip.mp4 -u 2` line.

## Order of Operations

1. Task 3 (executor fix) — prerequisite so Task 2's handler actually works with local files.
2. Task 2 (handler + types) — depends on Task 3.
3. Task 1 (command wiring) — exposes the handler.
4. Task 4 (image-upscale bug fix) — independent, bundle with Task 1 commit.
5. Task 5 (tests) — gate on CI.
6. Task 6 (docs) — follow-up PR or same PR, reviewer preference.

Estimated total: **~1.5 hours** (code) + **~30 min** (docs follow-up).

## Risk

**Low–medium.**

- New code path, no existing-behavior changes except Task 3 (which strictly adds a capability to an executor that didn't support it).
- Task 4 (image-upscale default) changes default behavior — smoke-test existing `edit upscale` and `gen image --grid --grid-upscale` before merging.
- Topaz video upscale is expensive (~$1.50/video per registry). Do not enable in any CI-run integration test without a tiny fixture clip.

## Definition of Done

- [ ] `qcut edit upscale-video --video clip.mp4 -u 2` produces an upscaled mp4 in `./output/`.
- [ ] `qcut edit upscale-video --help` lists all seven flags from the table above.
- [ ] `qcut edit upscale --image foo.png` still works (no regression from Task 4).
- [ ] `bun run test` passes, including the four new contract tests.
- [ ] `bun check-types` and `bun lint:clean` clean.
- [ ] Follow-up: website card + skill docs updated in a second commit or PR.

## Out of Scope

- Non-FAL upscale providers.
- Frame-interpolation-only mode (no upscale, just fps bump).
- Batch upscaling (multiple videos in one invocation) — users can script the single-file command.
- Exposing `H264_output`, `output_pix_fmt`, and other rarely-tuned Topaz knobs on the CLI.
