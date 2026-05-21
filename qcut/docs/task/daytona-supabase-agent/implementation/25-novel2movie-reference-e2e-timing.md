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
