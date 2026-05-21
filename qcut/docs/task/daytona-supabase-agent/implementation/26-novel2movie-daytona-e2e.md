# Novel2Movie Daytona E2E

Date: 2026-05-20

## Scope

Real production page / Daytona sandbox E2E for:

```bash
qcut flow novel2movie --novel story.txt --scripts-only
qcut flow novel2movie --novel story.txt --storyboard-only
qcut flow novel2movie --novel story.txt --max-images 5
```

The commands were executed in a production Daytona PTY session, with output
forced under `/tmp/qcut-output` so the website file browser can download it.

## Result

Status: passed for the full online Daytona `novel2movie` smoke with two real
IMA Router Seedance clips.

Final command:

```bash
qcut flow novel2movie \
  --title n2m-gpt2-gemini35-2clips-ima-assets-20260520014612 \
  --max-scenes 1 \
  --max-clips 2 \
  --no-portraits \
  --image-model gpt_image_2_ima \
  --llm-model gemini-3.5-flash \
  --video-model imarouter_seedance_2_0_fast_i2v \
  --json
```

Image:

```text
ghcr.io/quriosity-agent/qcut-cli:novel2movie-gpt2-gemini35-2clips-ima-assets-20260520012816
```

The run generated two GPT Image 2 storyboard images, uploaded them through IMA
Router assets, generated two real Seedance 2.0 fast clips, and assembled a final
movie.

Summary:

```json
{
  "success": true,
  "script_count": 1,
  "total_shots": 36,
  "character_count": 6,
  "storyboard_only": false,
  "video_count": 2,
  "total_cost": 1.284,
  "errors": []
}
```

## Evidence

Successful Daytona job:

```text
dogfood-7f0ef7a5-019b-444a-8f8d-3f5d452164e9
```

Local downloaded archive/extract:

```text
/tmp/qcut-daytona-e2e-artifacts/dogfood-7f0ef7a5-019b-444a-8f8d-3f5d452164e9
```

Key files:

```text
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/storyboard/chapter_001_untitled/scene_001_shot_001_medium_untitled.png
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/storyboard/chapter_001_untitled/scene_001_shot_002_medium_untitled.png
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/videos/从弃女到巅峰：苏家千金归来/scene_1_shot_13.mp4
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/videos/从弃女到巅峰：苏家千金归来/scene_1_shot_17.mp4
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/final_movie.mp4
```

Video verification:

```text
scene_1_shot_13.mp4: ISO Media MP4, h264 1280x720, aac, duration 5.061950s
scene_1_shot_17.mp4: ISO Media MP4, h264 1280x720, aac, duration 5.061950s
final_movie.mp4: ISO Media MP4, h264 1280x720, aac, duration 10.147120s
```

Relevant stdout:

```text
[storyboard] Running 2 image task(s) with concurrency 2
[storyboard] Generated: 2 images, $0.084 cost
[camera_gen] Generated 2 videos, final: 10.0s
-> Concatenating 2 video clips into final movie
```

Earlier failed attempts:

```text
dogfood-174747cc-9e7e-456b-b283-3f2ba904bdbe:
  exit 0 but video_count=0.
  IMA Router rejected direct storyboard image URLs with
  InputImageSensitiveContentDetected.PrivacyInformation.

Fix:
  flow video adapter now uploads remote IMA Router references through
  /v1/assets/create and submits asset:// references to Seedance.
```

## Download Check

The Supabase artifact archive downloaded successfully from the online Daytona
job and extracted locally. MP4 files were verified with `file` and `ffprobe`, so
the archive contains real videos, not mock text placeholders.

## Follow-Up

GMI Gemini 3.5 Flash still hit 429s during segmentation, but the fallback
completed. If this becomes flaky, prefer `openrouter-gemini-3.5-flash` for E2E
stability while still using Gemini 3.5 Flash as the LLM.
