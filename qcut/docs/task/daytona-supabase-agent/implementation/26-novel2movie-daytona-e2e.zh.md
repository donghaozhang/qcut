# Novel2Movie Daytona E2E

日期：2026-05-20

## 范围

针对真实生产页面 / Daytona sandbox 的 E2E：

```bash
qcut flow novel2movie --novel story.txt --scripts-only
qcut flow novel2movie --novel story.txt --storyboard-only
qcut flow novel2movie --novel story.txt --max-images 5
```

命令在生产 Daytona PTY session 中执行，输出强制落到 `/tmp/qcut-output`，方便网站的文件浏览器下载。

## 结果

状态：完整的在线 Daytona `novel2movie` smoke 通过，包含两段真实的 IMA Router Seedance clip。

最终命令：

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

镜像：

```text
ghcr.io/quriosity-agent/qcut-cli:novel2movie-gpt2-gemini35-2clips-ima-assets-20260520012816
```

本次运行生成了两张 GPT Image 2 storyboard 图片，通过 IMA Router assets 上传，生成了两段真实的 Seedance 2.0 fast clip，并合成了最终影片。

Summary：

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

## 证据

成功的 Daytona 任务：

```text
dogfood-7f0ef7a5-019b-444a-8f8d-3f5d452164e9
```

本地下载和解压的归档：

```text
/tmp/qcut-daytona-e2e-artifacts/dogfood-7f0ef7a5-019b-444a-8f8d-3f5d452164e9
```

关键文件：

```text
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/storyboard/chapter_001_untitled/scene_001_shot_001_medium_untitled.png
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/storyboard/chapter_001_untitled/scene_001_shot_002_medium_untitled.png
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/videos/从弃女到巅峰：苏家千金归来/scene_1_shot_13.mp4
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/videos/从弃女到巅峰：苏家千金归来/scene_1_shot_17.mp4
n2m-gpt2-gemini35-2clips-ima-assets-20260520014612_202605200847/final_movie.mp4
```

视频校验：

```text
scene_1_shot_13.mp4: ISO Media MP4, h264 1280x720, aac, duration 5.061950s
scene_1_shot_17.mp4: ISO Media MP4, h264 1280x720, aac, duration 5.061950s
final_movie.mp4: ISO Media MP4, h264 1280x720, aac, duration 10.147120s
```

相关 stdout：

```text
[storyboard] Running 2 image task(s) with concurrency 2
[storyboard] Generated: 2 images, $0.084 cost
[camera_gen] Generated 2 videos, final: 10.0s
-> Concatenating 2 video clips into final movie
```

早期失败尝试：

```text
dogfood-174747cc-9e7e-456b-b283-3f2ba904bdbe:
  exit 0 but video_count=0.
  IMA Router rejected direct storyboard image URLs with
  InputImageSensitiveContentDetected.PrivacyInformation.

Fix:
  flow video adapter now uploads remote IMA Router references through
  /v1/assets/create and submits asset:// references to Seedance.
```

## 下载校验

Supabase artifact 归档从在线 Daytona 任务成功下载并在本地解压。MP4 文件通过 `file` 和 `ffprobe` 验证过，所以归档里是真实视频，不是 mock 文本占位符。

## 后续

GMI Gemini 3.5 Flash 在 segmentation 时仍然会偶尔触发 429，但 fallback 完成了任务。如果以后这一步变得不稳定，E2E 优先使用 `openrouter-gemini-3.5-flash`，同时 LLM 还是 Gemini 3.5 Flash。
