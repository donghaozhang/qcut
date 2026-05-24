# Novel2Movie Reference E2E Timing

Date: 2026-05-21

Command under test:

```bash
qcut flow novel2movie --novel story.txt --max-scenes 20 --max-clips 5
```

Scenario: Chinese / East Asian K-pop supermodel fashion story with two adult characters, Lin Yue and Park Mina.

Output:

- Local run directory: `/tmp/qcut-kpop-asian-ref-e2e/output/story_202605210740`
- Downloaded artifact directory: `/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts`
- Final movie: `/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts/final_movie.mp4`
- Reference audit: `/Users/peter/Downloads/qcut-kpop-asian-ref-e2e-artifacts/videos/Shanghai_Neon_Runway/video_reference_audit.json`

## Result

The run completed successfully.

- Scripts: 1
- Shots: 5
- Storyboard images: 5
- Video clips: 5
- Final video duration: 52.2 seconds
- Final video size: 50 MB
- Total provider cost reported by QCut: `$15.888`
- Summary errors: `[]`

## Reference Usage

The video stage used `storyboard+references` mode.

| Clip | Storyboard image | Portrait reference count | Notes |
| --- | --- | ---: | --- |
| `SHOT_001` | yes | 0 | Establishing/environment shot, no character refs |
| `SHOT_002` | yes | 1 | Single-character reference |
| `SHOT_003` | yes | 1 | Single-character reference |
| `SHOT_004` | yes | 2 | Multi-reference: Lin Yue + Park Mina |
| `SHOT_005` | yes | 2 | Multi-reference: Lin Yue + Park Mina |

This proves the target path works for a single video clip with multiple portrait references:

```text
storyboard image + Lin Yue portrait + Park Mina portrait
```

## Step Timing

Times below are from `summary.json`, file mtimes, and the live command log. They are approximate because the CLI does not yet persist per-stage timestamps.

| Stage | Evidence | Approx time | Parallel? | Notes |
| --- | --- | ---: | --- | --- |
| Setup / novel save | `summary.started_at` 00:40:24, `novel.txt` 00:40:24 | <1s | no | Local file setup only |
| Character extraction | `characters.json` 00:40:28 | ~4s | no | One LLM call |
| Portrait generation | portrait files 00:41:06 and 00:41:07 | ~39s | yes | Two character portraits ran concurrently; outputs landed 1s apart |
| Script segmentation | `scripts/chunk_001.json` 00:41:12 | ~5s | no | One LLM segmentation step |
| Storyboard generation | first storyboard 00:41:54, last storyboard 00:42:30 | ~78s | yes | Five image tasks ran with concurrency 5 |
| Video `SHOT_001` | video file 00:47:59 | ~5m29s | no | Video generation is awaited before starting next clip |
| Video `SHOT_002` | video file 00:53:10 | ~5m11s | no | Sequential |
| Video `SHOT_003` | video file 00:57:55 | ~4m45s | no | Sequential |
| Video `SHOT_004` | video file 01:03:39 | ~5m44s | no | Sequential, uses 2 portrait references |
| Video `SHOT_005` | video file 01:10:37 | ~6m58s | no | Sequential, uses 2 portrait references |
| Concatenate final movie | `final_movie.mp4` 01:10:37 | <1s | no | FFmpeg concat is cheap for this run |

Total wall time: 30m13s (`2026-05-21T07:40:24Z` to `2026-05-21T08:10:37Z`).

## Why It Took So Long

The dominant cost is remote Seedance Ref2V video generation. The current `CameraImageGenerator` processes videos sequentially:

```text
for each shot:
  await videoAdapter.generate(...)
```

That means five remote jobs are serialized. The earlier portrait and storyboard stages already use concurrency, but the video stage does not.

## Fixes Made Before This E2E Passed

- `novel2movie` now defaults to `imarouter_seedance_2_0_ref2v`, so the command can consume multiple references without requiring `--video-model`.
- Video mode defaults to `storyboard+references`.
- Camera generation writes `video_reference_audit.json` with source image, reference count, and reference URLs per shot.
- Character portrait registry stores the provider URL when available, so video reference asset creation can avoid stale local upload credentials.
- Storyboard reference generation falls back to `gpt_image_2_ima` when the main image model does not support reference edits.
- IMA Router Seedance Ref2V defaults set `metadata.audio=false`, avoiding unrelated audio moderation failures.
- Video and storyboard failures now propagate into pipeline `errors`; failed video runs should not return a false-success result.

## Follow-Up

If we want this command to be faster for `--max-clips 5`, the next engineering step is bounded video concurrency, likely `--video-concurrency` with a default of 1 and a hard cap such as 2 or 3. That needs provider/cost consideration because concurrent Seedance jobs can spend credits faster and can hit upstream rate limits.

## Parallel Video Trial

Implemented bounded video concurrency for `CameraImageGenerator`.

New CLI option:

```bash
qcut flow novel2movie --novel story.txt --max-scenes 20 --max-clips 2 --video-concurrency 2
```

Defaults and caps:

- Default `video_concurrency`: `1`
- Hard cap: `6`
- `--video-concurrency` is preferred for `novel2movie`
- Existing generic `--concurrency` is also accepted as a fallback
- Output videos and `video_reference_audit.json` remain in script shot order even when remote tasks finish out of order

Real E2E command:

```bash
bun /Users/peter/Desktop/code/qcut/qcut/electron/native-pipeline/cli/cli.ts \
  flow novel2movie \
  --novel story.txt \
  --max-scenes 20 \
  --max-clips 2 \
  --video-concurrency 2 \
  -o /tmp/qcut-kpop-parallel-e2e/output \
  --json
```

Real E2E output:

- Run directory: `/tmp/qcut-kpop-parallel-e2e/output/story_202605211559`
- Downloaded artifact directory: `/Users/peter/Downloads/qcut-kpop-parallel-e2e-artifacts`
- Final movie: `/Users/peter/Downloads/qcut-kpop-parallel-e2e-artifacts/final_movie.mp4`
- Final duration: 22.08 seconds
- Final size: 31 MB
- Clips generated: 2
- Provider cost reported by QCut: `$6.762`
- Summary errors: `[]`

Log evidence:

```text
[camera_gen] Running 2 video task(s) with concurrency 2
[camera_gen] SHOT_001: video refs=0, storyboard=yes
[camera_gen] SHOT_005: video refs=2, storyboard=yes
[vimax.video] imarouter_seedance_2_0_ref2v: 100% completed
[vimax.video] imarouter_seedance_2_0_ref2v: 100% completed
```

This confirms both clips were submitted into the video stage concurrently.

Timing:

| Stage | Evidence | Approx time | Parallel? | Notes |
| --- | --- | ---: | --- | --- |
| Full command | `/usr/bin/time`: `real 984.65` | 16m25s | mixed | Full run, including LLM/images/videos |
| Character extraction | `characters.json` 08:59:37 | ~4s | no | One LLM call |
| Portrait generation | portrait files 09:00:07 and 09:00:10 | ~33s | yes | Two portrait tasks overlapped |
| Storyboard generation | storyboard files 09:00:45 and 09:01:21 | ~71s | yes | Two image tasks with concurrency 2 |
| Video generation | `SHOT_001` 09:11:10, `SHOT_005` 09:15:58 | ~14m37s | yes | Both started together, but one provider job finished much later |
| Concatenate final movie | final movie 09:15:58 | <1s | no | Cheap local concat |

Reference audit:

| Clip | Storyboard image | Portrait reference count | Notes |
| --- | --- | ---: | --- |
| `SHOT_001` | yes | 0 | Establishing/environment shot |
| `SHOT_005` | yes | 2 | Multi-reference: Lin Yue + Park Mina |

Conclusion: parallel clip generation works with IMA Router Seedance Ref2V, but the provider can still queue or complete one job much later than another. For production, defaulting to `1` remains safest; user-requested runs can use `--video-concurrency 2` when speed matters and cost/rate-limit risk is acceptable.
