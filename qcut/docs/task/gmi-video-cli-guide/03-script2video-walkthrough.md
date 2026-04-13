# 03 — `flow script2video` walkthrough

Turn an existing script.json + portrait registry into real MP4 videos
via GMI Kling, then concatenate them into a final master video.

Validated in this session with 5 shots × 5s producing 5 real MP4s +
one 25s concatenated `final_video.mp4` at $2.20 total cost.

## Command

```bash
qcut flow script2video \
  --script /tmp/anime-5shot-script.json \
  --portraits ~/Documents/QCut/Exports/novel2movie/japanese-anime-example_202604121404/portrait_registry.json \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v \
  --output-dir ~/Documents/QCut/Exports/script2video/anime-5shot \
  --verbose \
  --stream
```

## Flag-by-flag

| Flag | Why |
|---|---|
| `--script <path>` | Path to a script.json produced earlier by `flow novel2movie` or handwritten. Required. |
| `--portraits <path>` / `-p` | Portrait registry JSON that maps character names to generated portrait PNG paths. Produced by `novel2movie`. Optional — omit if your script doesn't reference characters. |
| `--image-model` | GMI image model for storyboard generation. `gmi_gemini_31_flash_image` is the cheap default ($0.02/image). |
| `--video-model` | **Key choice.** Recommended: `gmi_kling_v3_omni_i2v` (proven working this session). Avoid `gmi_veo31_lite_i2v` for Japanese drama (content-filter rejections). |
| `--output-dir` | **Always pass this explicitly.** `script2video` default is `/tmp/qcut/aicp-output/<session>/` (unlike `novel2movie` which defaults to Documents). |
| `--verbose --stream` | JSONL events for diagnostics. |

## Building a trimmed script from `novel2movie` output

Full scripts can have 50+ shots (5–20 per chunk × many chunks),
turning a single run into a 30-minute, $10+ operation. For a
cost-bounded test, trim to 3–5 shots and clamp durations:

```python
# save as /tmp/make-trimmed-script.py
import json

src = "~/Documents/QCut/Exports/novel2movie/japanese-anime-example_<ts>/scripts/chunk_001.json"
with open(src.replace("~", "/Users/peter")) as f:
    script = json.load(f)

# Flatten up to 5 shots across all scenes, clamp each to 5s (Kling-valid)
collected = []
for scene in script["scenes"]:
    for shot in scene["shots"]:
        if len(collected) >= 5:
            break
        collected.append({**shot, "duration_seconds": 5})
    if len(collected) >= 5:
        break

trimmed = {
    "title": script["title"] + " — 5-shot sampler",
    "logline": script.get("logline", ""),
    "scenes": [
        {
            "title": "5-shot compilation",
            "location": script["scenes"][0].get("location", ""),
            "time": script["scenes"][0].get("time", ""),
            "shots": collected,
        }
    ],
    "total_duration": 25,
}

with open("/tmp/anime-5shot-script.json", "w") as f:
    json.dump(trimmed, f, ensure_ascii=False, indent=2)
print(f"wrote /tmp/anime-5shot-script.json with {len(collected)} shots")
```

Duration to pick per shot depends on the video model:

| Model | Valid durations | Notes |
|---|---|---|
| `gmi_kling_v3_i2v` | 3, 5, 8, 10, 15 | Can be flaky on 500s |
| `gmi_kling_v3_omni_i2v` | 3, 5, 8, 10, 15 | **Most reliable GMI video path** (this guide's recommendation) |
| `gmi_skyreels_v4_i2v` | 3, 5, 8, 10, 15 | Expensive ($0.14/sec) |
| `gmi_veo31_lite_i2v` | 4, 6, 8 | Strict Google content filter — avoid for non-English drama |

## Expected output

```
~/Documents/QCut/Exports/script2video/anime-5shot/
├── storyboard/
│   └── <slug>/
│       ├── scene_001_medium_<slug>.png       (may overwrite — see
│       └── scene_001_close_up_<slug>.png       note on filename collision)
└── videos/
    └── <slug>/
        ├── s1_01.mp4       5.0s    ~3–10 MB
        ├── s1_02.mp4       5.0s    ~3–10 MB
        ├── s1_03.mp4       5.0s    ~3–10 MB
        ├── s2_01.mp4       5.0s    ~3–10 MB
        ├── s2_02.mp4       5.0s    ~3–10 MB
        └── final_video.mp4 25.0s   concatenated master (FFmpeg)
```

Verify files are real MP4s, not mock placeholders:

```bash
for f in ~/Documents/QCut/Exports/script2video/anime-5shot/videos/*/*.mp4; do
  echo "$(basename "$f"): $(file "$f" | grep -oE 'ISO Media|ASCII text') \
    $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")s"
done
```

Good output looks like:

```
s1_01.mp4: ISO Media 5.041667s
s1_02.mp4: ISO Media 5.041667s
…
final_video.mp4: ISO Media 25.208333s
```

Bad output (`ASCII text`) means you're in mock mode because the
adapter didn't see a key for the provider — check `GMI_API_KEY` is
set (see [08-reference.md](08-reference.md#install--key-store)).

## Cost math

Total = (N shots × image price) + (N shots × video price)

For the validated 5-shot × 5s run on `gmi_kling_v3_omni_i2v` std mode:

| Item | Calc | USD |
|---|---|---|
| 5 storyboard images | 5 × $0.02 | $0.10 |
| 5 × 5s Kling omni video (billed per-second) | 5 × 5 × $0.084 | $2.10 |
| **Total** | | **$2.20** |

The registry's `pricing.std: 0.084` is **per-second**, not per-video.
Adapter `extractCostPerSecond()` reads the minimum of the pricing
object — so a 5s clip costs $0.42, not $0.084. Worth noting if you're
budgeting.

Cheaper alternatives:

| Model | Per-shot (5s) | 5-shot total |
|---|---|---|
| `gmi_kling_v3_omni_i2v` std | $0.42 | $2.20 |
| `gmi_kling_v3_i2v` no_sound | $0.168 (flat) | ~$0.95 (if it doesn't 500) |
| `gmi_veo31_lite_i2v` 720p | $0.03 (flat, 6s) | ~$0.25 (if prompt passes safety) |

## Retry behaviour

Every video call is wrapped in `callVideoApiWithRetry()` (commit
`bb4039bd6`). Behaviour:

- 3 attempts max
- Exponential backoff: 5s → 15s, cap 60s
- 5xx / timeout / network errors **are** retried
- 4xx client errors and content-policy rejections **are not** retried

If a retry fires you'll see it on stderr:

```
[vimax.video] Transient error (attempt 1/3): GMI API error 500: context deadline exceeded. Retrying in 5000ms...
```

Zero retry lines = every call succeeded first try.

## Playing the result

```bash
# Final concatenated master
open ~/Documents/QCut/Exports/script2video/anime-5shot/videos/*/final_video.mp4

# Individual shots
open ~/Documents/QCut/Exports/script2video/anime-5shot/videos/
```
