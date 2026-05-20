# Flow Scene Images Daytona E2E

Date: 2026-05-20
Branch: `cli-image-v7`

## Summary

Status: passed.

This verifies the production Chat Agent page can connect to a real online Daytona sandbox, run the QCut CLI scene extraction flow, then generate a small storyboard image set from those scenes.

The tested flow was:

```bash
qcut flow scenes \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  --max-scenes 3 \
  -o /tmp/qcut-output \
  --json

qcut flow storyboard \
  --scenes /tmp/qcut-output/scenes-capped.json \
  --image-model gpt_image_2_ima \
  --concurrency 3 \
  -o /tmp/qcut-output/scene-images/storyboard \
  --json
```

The test capped the generated scene input to at most three shots before image generation, so the provider run stayed small.

## Environment

- Page: `https://quriosity.com.au/chat-agent.html`
- License server: `https://qcut-license-server.zdhpeter.workers.dev`
- Daytona session: `2d37405e-f824-436e-8fbb-0d3b7bf6c62d`
- Run id: `scene-images-2026-05-20T01-20-45-856Z`
- LLM model: `gemini-3.1-flash-lite`
- Image model: `gpt_image_2_ima`

## Result

`qcut flow scenes` result:

- extracted scenes: 3
- extracted shots: 4
- output: `/tmp/qcut-output/scenes.json`

The e2e then wrote `/tmp/qcut-output/scenes-capped.json` with:

- capped scenes: 2
- capped shots: 3

`qcut flow storyboard` result:

- generated images: 3
- observed concurrency: 3
- cost: `$0.126`
- duration: `89.174s`
- input kind: `scenes`

Downloaded PNG validation:

```text
downloaded-scene-image-e2e-01.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-scene-image-e2e-02.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-scene-image-e2e-03.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

Sandbox files:

```text
/tmp/qcut-output/scenes.json
/tmp/qcut-output/scenes-capped.json
/tmp/qcut-output/scene-images-scenes.log
/tmp/qcut-output/scene-images-storyboard.log
/tmp/qcut-output/scene-image-e2e-summary.json
/tmp/qcut-output/scene-image-e2e-proof.md
/tmp/qcut-output/scene-image-e2e-01.png
/tmp/qcut-output/scene-image-e2e-02.png
/tmp/qcut-output/scene-image-e2e-03.png
```

Local evidence:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/result.json
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-image-e2e-summary.json
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-image-e2e-proof.md
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scenes-capped.json
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-images-scenes.log
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-images-storyboard.log
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-image-e2e-01.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-image-e2e-02.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-scene-images-daytona-e2e-2026-05-20T01-20-45-856Z/downloaded-scene-image-e2e-03.png
```

## Logs

Scene extraction log excerpt:

```text
[segmenter] Segmenting novel text (478 chars) into ~15s shots
[segmenter] Segmented: 3 scenes, 4 shots, 45.0s
Extract scenes — complete
Scenes: 3
Shots:  4
```

Storyboard log excerpt:

```text
[storyboard] Generating for: The Cartographer's Map (no refs)
[storyboard] Running 3 image task(s) with concurrency 3
[storyboard] Generated: 3 images, $0.126 cost
```

## Note

An earlier attempt matched the completion marker from the echoed prompt text and tried to download files too early. The passing run waited for the real sandbox file `/tmp/qcut-output/scene-image-e2e-summary.json` to appear before downloading proof artifacts.
