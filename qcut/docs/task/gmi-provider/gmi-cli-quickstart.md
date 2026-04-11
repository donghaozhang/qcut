# GMI Cloud CLI Quick Start

Step-by-step guide to using GMI Cloud models via the QCut pipeline CLI.

## Step 1: Log In

Test account credentials are stored in `.env.test-accounts` (gitignored). Ask the project admin for access.

```bash
# Load test credentials
source .env.test-accounts

# Log in — stores QCUT_AUTH_TOKEN in the encrypted key store
bun run pipeline login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"
# → "Logged in as <email>"

# Verify token is stored
bun run pipeline check-keys | grep QCUT_AUTH_TOKEN
# → QCUT_AUTH_TOKEN    configured (env) xxxx****xxxx
```

> **BYOK users**: If you have your own `GMI_API_KEY`, set it via `bun run pipeline set-key --name GMI_API_KEY --value <key>` and skip login. Your key is used directly with no credit deduction.

<!-- TESTED 2026-04-10: PASS — logged in as qcutlove@qcut.app, token stored successfully -->

## Step 2: List Available GMI Models

```bash
# All GMI image models
bun run pipeline list-models --category text_to_image | grep -i gmi

# Output:
#   gmi_gemini_3_pro_image        Google (via GMI) text_to_image, image_to_image
#   gmi_gemini_3_pro_image     Google (via GMI) text_to_image, image_to_image
#   gmi_seedream_4                ByteDance (via GMI) text_to_image
#   gmi_seedream_5_lite           ByteDance (via GMI) text_to_image

# All GMI video models
bun run pipeline list-models --category text_to_video | grep -i gmi

# Output:
#   gmi_veo31_lite_t2v            Google (via GMI) text_to_video
#   gmi_skyreels_v4_t2v           SkyReels (via GMI) text_to_video
#   gmi_kling_v3_t2v              Kling (via GMI) text_to_video
#   gmi_kling_v3_omni_t2v         Kling (via GMI) text_to_video

# GMI LLM models (via api.gmi-serving.com)
# Use aliases: glm-5.1, gemini-3.1-pro, gpt-5.4
```

<!-- TESTED 2026-04-10: PASS — all 4 image + 4 video models listed correctly -->

## Step 3: Novel-to-Movie Pipeline (Images Only)

```bash
# Use default example novel, Gemini 3.1 Flash Lite (GMI) for LLM, Gemini Flash (GMI) for images
# Storyboard only (no videos), max 5 scene images
bun run pipeline vimax:novel2movie \
  --storyboard-only \
  --max-images 5 \
  --image-model gmi_gemini_3_pro_image \
  --llm-model gemini-3.1-flash-lite
```

**What this does:**
1. Extracts characters from the novel (Gemini 3.1 Flash Lite via GMI)
2. Generates character portrait images (Gemini 3 Pro via GMI)
3. Segments novel into screenplay shots (Gemini 3.1 Flash Lite via GMI)
4. Generates up to 5 storyboard images (Gemini 3 Pro via GMI)
5. Skips video generation

**Output structure:**
```text
~/Documents/QCut/Exports/novel2movie/<title>_<timestamp>/
├── novel.md                    # Source novel
├── characters.json             # Extracted characters
├── portrait_registry.json      # Character portrait registry
├── portraits/
│   ├── 沈念安/front.png
│   ├── 顾承泽/front.png
│   └── ...
├── storyboard/
│   ├── chapter_001/scene_001_*.png
│   └── ...
├── scripts/
│   ├── chunk_001.json
│   └── ...
└── summary.json
```

<!-- TESTED 2026-04-10 (pure proxy mode: env -u GMI_API_KEY -u OPENROUTER_API_KEY):
     Run 1 (gpt-5.4 LLM): PASS — 9 chars, 5 portraits, 103 shots, 5 images, $0.03, 218s
     Run 2 (gemini-3.1-flash-lite LLM): PASS — 6 chars, 5 portraits, 72 shots, 5 images, $0.03, 134s
     Note: gemini-3.1-flash-lite is faster (134s vs 218s) but needs 429 retry backoff (fixed in api-caller.ts). -->

## Step 4: Generate Videos from Script (First 5 Shots)

Create Kling elements from character portraits, then generate videos for the first 5 shots using `kling-v3-omni` with element-driven character consistency.

```bash
# Set the output directory (from Step 3 output)
EXPORT_DIR=~/Documents/QCut/Exports/novel2movie/drama-example_<timestamp>

# 1. Create elements from character portraits
bun run pipeline create-element \
  --name "ShenNianAn" \
  --description "Young woman with long dark wavy hair in white dress" \
  --frontal-image "$EXPORT_DIR/portraits/沈念安/front.png"
# → Element created: ShenNianAn (<element_id_1>)

bun run pipeline create-element \
  --name "GuChengZe" \
  --description "Young man with brown styled hair in black suit and tie" \
  --frontal-image "$EXPORT_DIR/portraits/顾承泽/front.png"
# → Element created: GuChengZe (<element_id_2>)

# Verify elements
bun run pipeline list-elements

# 2. Generate videos for first 5 shots using element IDs
#    Use <<<element_1>>> / <<<element_2>>> syntax to reference elements in prompts
#    Shot IDs come from scripts/chunk_001.json

# Shot 1-1-02: Engagement scene (both leads)
bun run pipeline create-video \
  -t '<<<element_1>>> in white dress holds <<<element_2>>> arm lovingly under spotlight, luxury hotel ballroom, warm golden lighting, crystal chandeliers, cinematic' \
  -m gmi_kling_v3_omni_t2v \
  --element-ids <element_id_1> --element-ids <element_id_2> \
  --output-dir "$EXPORT_DIR/videos"

# Shot 1-1-04: Emotional moment (female lead alone)
bun run pipeline create-video \
  -t '<<<element_1>>> in white dress stands alone on stage, tears in eyes, looking at guests with longing, warm spotlight, dreamy atmosphere' \
  -m gmi_kling_v3_omni_t2v \
  --element-ids <element_id_1> \
  --output-dir "$EXPORT_DIR/videos"

# Shot 1-1-05: Dramatic entrance (text-only, no element)
bun run pipeline create-video \
  -t 'Luxury hotel ballroom doors burst open, a young woman in disheveled clothes and smeared makeup rushes in crying, guests turn in shock, dramatic lighting' \
  -m gmi_kling_v3_omni_t2v \
  --output-dir "$EXPORT_DIR/videos"

# Shot 1-1-09: Confrontation (female lead + text character)
bun run pipeline create-video \
  -t 'A crying young woman touches her belly and looks up at <<<element_1>>> in white dress who stares in shock, luxury ballroom, dramatic tension' \
  -m gmi_kling_v3_omni_t2v \
  --element-ids <element_id_1> \
  --output-dir "$EXPORT_DIR/videos"

# Shot 1-1-11: Three-way confrontation (both leads + text character)
bun run pipeline create-video \
  -t '<<<element_1>>> in white dress looks devastated at <<<element_2>>> in black suit who avoids eye contact guiltily, a crying woman clings to his arm, tense atmosphere' \
  -m gmi_kling_v3_omni_t2v \
  --element-ids <element_id_1> --element-ids <element_id_2> \
  --output-dir "$EXPORT_DIR/videos"
```

**What this does:**
1. Creates reusable Kling elements from character portraits (stored locally for reuse)
2. Generates 5 videos (~5s each) using `kling-v3-omni` with element IDs for character consistency
3. Videos are saved to the project's `videos/` folder

**Cost:** ~$0.56/video × 5 = **$2.80 total**. Each video takes ~2 min to generate (can run in parallel).

<!-- TESTED 2026-04-10: PASS — 2 elements created, 5 videos generated in parallel, $2.80, ~3 min total (parallel) -->

## Step 5: Open Output & Review

```bash
# Open the output folder (macOS)
open ~/Documents/QCut/Exports/novel2movie/

# Or open the specific run
# (path is printed at the end of the pipeline output)
open ~/Documents/QCut/Exports/novel2movie/drama-example_<timestamp>
```

<!-- TESTED 2026-04-10: PASS — Finder opens output folder with portraits/, storyboard/, scripts/, videos/ -->

## Step 6: Check Credits & Log Out

```bash
# Check remaining credit balance
curl -H "Authorization: Bearer $(bun run pipeline get-key --name QCUT_AUTH_TOKEN 2>/dev/null | awk '{print $2}')" \
  https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance

# Log out when done
bun run pipeline logout
```

<!-- TESTED 2026-04-10: PASS — logout clears token -->

## GMI LLM Model Aliases

| Alias | GMI Model ID | Provider |
|-------|-------------|----------|
| `glm-5.1` | `zai-org/GLM-5.1-FP8` | ZhipuAI |
| `gemini-3.1-pro` | `google/gemini-3.1-pro-preview` | Google |
| `gemini-3.1-flash-lite` | `google/gemini-3.1-flash-lite-preview` | Google |
| `gpt-5.4` | `openai/gpt-5.4` | OpenAI |

These route through `api.gmi-serving.com/v1/chat/completions` (OpenAI-compatible).

**All 45 available LLM models** (including Claude, Qwen, DeepSeek, Kimi):
```bash
curl -s -H "Authorization: Bearer $GMI_API_KEY" \
  https://api.gmi-serving.com/v1/models | python3 -c "
import sys,json
for m in sorted(json.load(sys.stdin)['data'], key=lambda x: x['id']):
    print(f'  {m[\"id\"]}')
"
```

## Cost Reference

| Model | Type | Cost |
|-------|------|------|
| `gmi_gemini_3_pro_image` | Image | $0.02/image |
| `gmi_gemini_3_pro_image` | Image | $0.04/image |
| `gmi_seedream_5_lite` | Image | $0.003/image |
| `gmi_seedream_4` | Image | $0.02/image |
| `gmi_veo31_lite_t2v` | Video | $0.03-0.08/s |
| GPT-5.4 (LLM) | Text | ~$0.005/1K input tokens |
| Gemini 3.1 Pro (LLM) | Text | ~$0.00125/1K input tokens |
| GLM 5.1 (LLM) | Text | ~$0.0005/1K input tokens |

---

## Additional Examples (Not Tested)

<!-- These commands are documented but not yet verified end-to-end -->

### Novel-to-Movie with Your Own Novel

```bash
# Provide your own novel file
bun run pipeline vimax:novel2movie \
  --novel /path/to/your-novel.txt \
  --title "My Novel" \
  --storyboard-only \
  --max-images 10 \
  --image-model gmi_gemini_3_pro_image \
  --llm-model gpt-5.4
```

### Idea-to-Video Pipeline (Images Only)

```bash
# Generate storyboard from a one-line idea
bun run pipeline vimax:idea2video \
  --idea "A detective in 1920s Paris investigating a mysterious art theft" \
  --llm-model gpt-5.4 \
  --image-model gmi_seedream_5_lite \
  --storyboard-only
```

### Generate a Single Image

```bash
# Text-to-image with Gemini 3.1 Flash
bun run pipeline generate-image \
  -t "A hyperrealistic portrait of a cyberpunk woman under neon lights" \
  -m gmi_gemini_3_pro_image

# Text-to-image with SeedDream 5.0 Lite
bun run pipeline generate-image \
  -t "A serene mountain landscape at golden hour" \
  -m gmi_seedream_5_lite
```

### Generate a Single Video

```bash
# Text-to-video with Veo 3.1 Lite (GMI)
bun run pipeline create-video \
  -t "A cat walking on a beach at sunset" \
  -m gmi_veo31_lite_t2v

# Estimate cost before generating
bun run pipeline estimate-cost -m gmi_veo31_lite_t2v
```
