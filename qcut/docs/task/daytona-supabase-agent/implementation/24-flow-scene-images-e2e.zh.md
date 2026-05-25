# Flow Scene Images Daytona E2E

日期：2026-05-20
分支：`cli-image-v7`

## 总结

状态：通过。

本测试验证生产环境的 Chat Agent 页面能够连接到真实的在线 Daytona sandbox，运行 QCut CLI 的 scene 抽取流程，然后基于这些 scenes 生成一小批 storyboard 图片。

被测流程是：

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

测试在生成图片前会把 scene 输入限制为最多 3 个 shot，让 provider 调用规模保持较小。

## 环境

- 页面：`https://quriosity.com.au/chat-agent.html`
- License server：`https://qcut-license-server.zdhpeter.workers.dev`
- Daytona session：`2d37405e-f824-436e-8fbb-0d3b7bf6c62d`
- Run id：`scene-images-2026-05-20T01-20-45-856Z`
- LLM model：`gemini-3.1-flash-lite`
- Image model：`gpt_image_2_ima`

## 结果

`qcut flow scenes` 结果：

- extracted scenes：3
- extracted shots：4
- output：`/tmp/qcut-output/scenes.json`

E2E 接着写入 `/tmp/qcut-output/scenes-capped.json`：

- capped scenes：2
- capped shots：3

`qcut flow storyboard` 结果：

- generated images：3
- observed concurrency：3
- cost：`$0.126`
- duration：`89.174s`
- input kind：`scenes`

下载 PNG 校验：

```text
downloaded-scene-image-e2e-01.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-scene-image-e2e-02.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-scene-image-e2e-03.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

Sandbox 文件：

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

本地证据：

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

## 日志

Scene 抽取日志摘录：

```text
[segmenter] Segmenting novel text (478 chars) into ~15s shots
[segmenter] Segmented: 3 scenes, 4 shots, 45.0s
Extract scenes — complete
Scenes: 3
Shots:  4
```

Storyboard 日志摘录：

```text
[storyboard] Generating for: The Cartographer's Map (no refs)
[storyboard] Running 3 image task(s) with concurrency 3
[storyboard] Generated: 3 images, $0.126 cost
```

## 备注

早先一次尝试匹配的是 prompt 文本的 echo 中出现的完成标记，导致下载文件太早。通过的运行改为等待真实 sandbox 文件 `/tmp/qcut-output/scene-image-e2e-summary.json` 出现后再下载证据文件。
