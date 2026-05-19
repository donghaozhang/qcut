# GMI Default Image Generation Smoke Test

Date: 2026-05-18 local / 2026-05-19 UTC
Branch: `Qcut-sandbox-v6`
Commit under test: `479550e51`

## Goal

Verify that `qcut generate-image` works without passing `--model`, and that the new default image model is GMI GPT Image 2.

## Command

```bash
bun run pipeline generate-image \
  --prompts "a small red enamel rocket pin on white background" \
  --prompts "a tiny blue ceramic robot figurine on white background" \
  --prompts "a green glass cactus sculpture on white background" \
  --prompts "a yellow toy submarine product photo on white background" \
  --prompts "a silver origami bird charm on white background" \
  --aspect-ratio 1:1 \
  --output-dir output/gmi-five-image-smoke \
  --json
```

No `-m` / `--model` flag was passed.

## Result

Status: pass

The CLI returned `status: "ok"` with 5 image outputs.

```json
{
  "command": "generate-image",
  "cost": 0.21000000000000002,
  "duration": 192.857
}
```

Two transient GMI/proxy `504` retries were observed during the run. The built-in retry path recovered and the batch completed successfully.

## Output Files

| Prompt | Model | Endpoint | Output |
| --- | --- | --- | --- |
| a small red enamel rocket pin on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-small-red-enamel-rocket-pin-on-white-background_1779155258113_0.png` |
| a tiny blue ceramic robot figurine on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-tiny-blue-ceramic-robot-figurine-on-white-background_1779155298905_1.png` |
| a green glass cactus sculpture on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-green-glass-cactus-sculpture-on-white-background_1779155383443_2.png` |
| a yellow toy submarine product photo on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-yellow-toy-submarine-product-photo-on-white-background_1779155348312_3.png` |
| a silver origami bird charm on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-silver-origami-bird-charm-on-white-background_1779155252980_4.png` |

## File Check

All 5 PNG files exist and are readable image files:

```text
gpt_image_2_gmi_a-green-glass-cactus-sculpture-on-white-background_1779155383443_2.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-silver-origami-bird-charm-on-white-background_1779155252980_4.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-small-red-enamel-rocket-pin-on-white-background_1779155258113_0.png: 1254 x 1254 PNG
gpt_image_2_gmi_a-tiny-blue-ceramic-robot-figurine-on-white-background_1779155298905_1.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-yellow-toy-submarine-product-photo-on-white-background_1779155348312_3.png: 1024 x 1024 PNG
```

Each generated image has a sidecar JSON file next to it. The sidecars confirm:

- `model`: `gpt_image_2_gmi`
- `endpoint`: `gpt-image-2-generate`
- `cost`: `0.042` per image

## Visual Spot Check

Two outputs were opened and inspected:

- Red enamel rocket pin: non-empty, centered product-style image on white background, matches prompt.
- Blue ceramic robot figurine: non-empty, centered product-style image on white background, matches prompt.

## Conclusion

The default `generate-image` path is working with GMI. A no-model five-image batch correctly used `gpt_image_2_gmi`, generated real PNG outputs, wrote reproducible sidecar metadata, and recovered from transient GMI/proxy `504` retries.
