# Subtask 3 — `handleVimaxNovel2Video` CLI handler

> **Status:** ✅ Landed. 13 integration tests green. File size:
> ~400 lines (target <500). Live smoke: 1 shot, 6m 3s, $0.260.
> Concurrency knob is typed + parsed but the loop still runs
> serially; flagged as follow-up in the top-level plan.

The orchestrator. Reads scripts + portrait registry from the project
dir, resolves portrait URLs via subtask 1, builds payloads via
subtask 2, submits through the existing provider router, downloads
the MP4, and writes a per-run registry.

Sibling to `handleVimaxNovel2Script` (`novel-script-handler.ts`) —
same shape, same reporter helpers, same idempotency posture.

## Files

### Add

- `electron/native-pipeline/cli/vimax-cli-handlers/video-handler.ts`
  — ~350 lines. If it grows past 500, split the shot loop into
  `video-shot-runner.ts` per the top-level plan's <800-line rule.

### Modify

- `electron/native-pipeline/output/project-paths.ts` — two new
  helpers: `shotVideoPath(paths, shotId)` and
  `videoRegistryPath(paths)`. Each ~5 lines.
- `electron/native-pipeline/output/stage-reporter.ts` — add
  `estimateNovel2Video(shotCount, avgDuration)` and cost-gate helper.

### Test

- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts`
  — integration-style (mocks fetch, adapter, upload; real
  project-paths + fs). Covered in subtask 5.

## Surface

```ts
export async function handleVimaxNovel2Video(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult>;
```

Signature matches the other `vimax:*` handlers so it drops into
`handler-map.ts` with a single `wrapOP(…)` line.

## Control flow

```
1.  resolveProjectPaths(slug) → paths
2.  read paths.scriptsDir → gather Shot[] from every chunk_NNN.json
3.  read paths.portraitRegistryPath → Record<name, localPath>
4.  upload every local portrait path via uploadFileForReference()
    → Record<name, httpsUrl>  (parallel, but sequentialize failures)
5.  pre-flight banner: projected cost + count
    - gate on `QCUT_COST_GATE` (default $2); require --force above it
6.  for each shot (respecting --max-shots):
    a. skip if paths.videosDir/shot_<id>.mp4 exists and !--force
    b. run adapter → AdaptedShot
    c. submit via providerRouter.submit(endpoint, payload, 'gmi')
    d. poll via providerRouter.poll(requestId, provider)
    e. downloadOutput(url, paths.videosDir/shot_<id>.mp4)
    f. append to videos/registry.json
7.  writeProjectMetadata — bump schema_version if needed, append
    'videos' to stages_completed
8.  printStageSummary
```

## Shot ingestion

`chunk_NNN.json` shape (verified on Apr-14 run):

```jsonc
{
  "scenes": [
    { "title": "...",
      "shots": [
        { "shot_id": "1-1-1",
          "description": "△...",
          "characters": ["司仪"],
          "duration_seconds": 15 }
      ] }
  ]
}
```

Flatten by concatenating every chunk's `scenes[*].shots[*]` in chunk
order. Preserve `shot_id` verbatim; it's the filename key.

The `characters` field may contain names not present in the portrait
registry (e.g. "司仪", "宾客甲"). That's expected — the adapter
downgrades those shots to t2v.

## Concurrency

Default `--concurrency 1` because each Seedance call is slow (~4–5
min) and GMI has queue-side fair-use throttling. Allow up to `5` but
back off aggressively on any 429 (rate-limit already hit in the
Apr-14 Stage-3 run on chunk 4/4).

Implement via a promise-pool helper — reuse
`electron/native-pipeline/execution/parallel-executor.ts`'s
concurrency primitive if the surface fits; otherwise a local
`runPool()` is fine (~30 lines). Prefer reuse.

## Failure handling

Per-shot errors don't abort the run. The shot is marked `status:
"failed"` in `videos/registry.json`, its error string stored, and
the loop continues. A trailing failure gets logged to stderr and the
final CLIResult reports `success: true` with `errors: N` in its
`data` field (matching the Stage-3 `Errors: 1` pattern from
`stage-reporter`).

## Idempotency

Before launching a shot, check `fs.existsSync(shotVideoPath(...))`.
If true and `--force` not set, skip and log `[skip] shot_X exists`.
This lets you re-run after a crash without paying twice for the
first dozen shots.

`videos/registry.json` is rewritten on every completion so a crashed
run still leaves a coherent partial registry on disk.

## Cost gate

```
projected = shotsToRun × avgDuration × $0.052
if projected > $QCUT_COST_GATE and not --force:
  return { success: false, error: "projected cost $X exceeds gate $Y, pass --force to override" }
```

Default gate: `$2`. Override via env
(`QCUT_COST_GATE=10`) or `--cost-gate 10`. Mirrors the pre-flight
banner concept already in `stage-reporter.ts`.

## Provider router usage

Call `providerRouter.submit` + `.poll` rather than the model-specific
generators. The router is already category-agnostic and handles both
direct-GMI and proxy-mode transparently. Don't reach into
`generateSeedance260128ReferenceVideo` from the CLI — that function
lives in the renderer bundle (`apps/web/src/lib/ai-video/...`) and
the CLI should stay free of renderer imports.

If provider router's current shape doesn't expose a clean enough
path for CLI usage, subtask 3 includes a small adapter — but only
after confirming direct usage doesn't work. Do not duplicate polling
logic.

## Progress reporting

Feed `onProgress` with a shot-level percent: `Math.floor((completed
/ total) * 100)`. Inside a shot, use the Seedance poll's percent
nudged into a sub-band so the bar advances smoothly. Example:

```
[shot 3/15]  [seedance] 42% processing...
```

Reuse `startStep` / `describeArtifact` from `stage-reporter.ts`
exactly like `novel-script-handler.ts` does — same voice, same
format.

## Definition of done

- [ ] Handler executes end-to-end on the Apr-14 test project
  (`cdrama-heiress-real-1776148633`) with `--max-shots 2` and
  produces two `videos/shot_*.mp4` files + a registry entry.
- [ ] `--force` overwrites, no-`--force` skips existing.
- [ ] Cost gate blocks unattended runs above `$2` projected.
- [ ] `project.json.stages_completed` contains `"videos"` after a
  successful full run.
- [ ] Handler file < 500 lines; adapter stays pure.
