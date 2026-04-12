# 02 — `flow novel2movie` walkthrough

Extract characters, generate portraits, and (optionally) generate a
storyboard + full movie from a markdown novel file. This walkthrough
stops at storyboard images to keep costs tiny (~$0.12 per run) —
adding video is covered in [03-script2video-walkthrough.md](03-script2video-walkthrough.md).

## Command

```bash
qcut flow novel2movie \
  --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
  --llm-model gemini-3.1-flash-lite \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v \
  --max-images 1 \
  --verbose \
  --stream
```

Output lands at `~/Documents/QCut/Exports/novel2movie/<slug>_<timestamp>/`.

## Flag-by-flag

| Flag | Why |
|---|---|
| `--novel <path>` | Markdown source. Two bundled examples: `drama-example.md` (Chinese J-TV), `japanese-drama-example.md` (live-action J-drama), `japanese-anime-example.md` (Shinkai/KyoAni anime). Omit to use `drama-example.md` default — note that bundled-fallback currently **doesn't work from the installed binary** because TS build doesn't copy `.md` files into `dist/`. Pass the path explicitly. |
| `--llm-model` | `gemini-3.1-flash-lite` is the cheapest GMI LLM alias ($0.00005 in / $0.0002 out per 1K tokens). Used by character extraction + script segmentation. |
| `--image-model` | `gmi_gemini_31_flash_image` is the cheap flash variant ($0.02/image). Rendered portraits + storyboards. |
| `--video-model` | Sets the registry entry that `CameraImageGenerator` will pass to the video adapter. **Not called when `--max-images` is set** (preview mode skips video generation). Still worth setting so it's on disk in the summary. |
| `--max-images 1` | Caps storyboard image count to 1 and **skips video generation entirely** (preview mode). This is the cheap-test switch. Remove it (or use `--storyboard-only`) to generate all storyboards; remove both for full video production. |
| `--verbose --stream` | JSONL events on stderr so you can grep `"provider":"gmi"` for evidence of routing. |

## Novel format

`novel2movie` expects a markdown file with a style-header block at the
top. The pipeline auto-parses three style-line conventions from the
first 2000 characters:

| Language | Line pattern |
|---|---|
| Japanese | `**映像スタイル：** …` or `**画像スタイル：** …` |
| Chinese (simplified) | `**视频风格：** …` or `**画面风格：** …` |
| English | `**Image Style:** …` or `**Visual Style:** …` |

Whichever matches first becomes `pipelineConfig.visual_style`, which is
then forwarded into both `CharacterExtractor.portrait_style` and
`CharacterPortraitsGenerator.style`. The novel's aesthetic actually
reaches the image model — see commit `cc0458f76` for the fix that made
this work; before it, every portrait got the hardcoded LinkedIn-style
wrapper.

Character paragraphs can (and should) include ethnicity. The schema
asks the LLM to populate a `portrait.ethnicity` field when the text
specifies one, so Japanese characters don't render as Caucasian by
default.

Full example structure:

```markdown
# 星降る夜のカフェ

**映像スタイル：** 現代日本のアニメ映画風、新海誠と京都アニメーションの影響
**画像スタイル：** Modern Japanese anime film style, Shinkai / KyoAni influence
**アスペクト比：** 16:9

---

## あらすじ
…

## 登場人物

### 星野すばる（ほしの すばる）、17歳

Japanese high-school girl, seventeen, large expressive dark brown anime
eyes, medium-length black hair pulled into a loose low ponytail. Wearing
a pale cream cotton cardigan over a white summer dress. Cel-shaded style,
soft cel-shading, NOT a photograph, NOT a 3D render.
```

## Expected output

```
~/Documents/QCut/Exports/novel2movie/japanese-anime-example_<ts>/
├── novel.md                 source copy
├── characters.json          LLM character extraction
├── portrait_registry.json   name → portrait path lookup
├── scripts/
│   ├── chunk_001.json       script segmentation, chunk 1
│   ├── chunk_002.json       …
│   └── chunk_N.json
├── portraits/
│   ├── <character 1>/front.png
│   ├── <character 2>/front.png
│   └── …
├── storyboard/
│   └── chapter_001_untitled/
│       └── scene_001_*.png  (1 image since --max-images 1)
└── summary.json             success / cost / errors
```

Typical `summary.json` after a 5-character novel:

```json
{
  "success": true,
  "script_count": 4,
  "total_shots": 75,
  "character_count": 5,
  "portrait_count": 5,
  "used_character_references": true,
  "total_cost": 0.12,
  "errors": []
}
```

## Verifying GMI actually ran (not FAL fallback)

```bash
# Pick any character and print the prompt that was sent to the image model
jq -r '.[0] | .portrait_prompt' \
  ~/Documents/QCut/Exports/novel2movie/japanese-anime-example_*/characters.json | head -1
```

The output should **start with the novel's style line** (e.g.
`現代日本のアニメ映画風、新海誠と京都アニメーションの影響…`) and should
**not** contain `photorealistic front portrait, shot on professional
camera` or `plain white background, soft studio lighting` — those were
the old FAL-only hardcoded wrappers that commit `cc0458f76` removed.

## Common variations

**Full video production** (expensive, skip video cap):

```bash
qcut flow novel2movie \
  --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
  --llm-model gemini-3.1-flash-lite \
  --image-model gmi_gemini_31_flash_image \
  --video-model gmi_kling_v3_omni_i2v \
  --verbose
```

Beware — with ~75 shots × ($0.02 image + $0.42 video), that's $33+
per chunk. Run this only after a dry-run has validated the script.

**Skip character portraits** (saves ~$0.10 for 5 characters):

```bash
… --no-portraits …
```

**Stop after storyboards** (no video spend regardless of `--max-images`):

```bash
… --storyboard-only …
```

## Where the files actually live

The default output path is **baked into the `novel2movie` handler**
(`pipeline-handlers.ts:243-246`) — unlike most CLI commands which fall
back to `os.tmpdir()`. That's intentional so novels / characters /
portraits don't vanish on reboot. Pass `--output-dir /tmp/…` to
override for throwaway tests.
