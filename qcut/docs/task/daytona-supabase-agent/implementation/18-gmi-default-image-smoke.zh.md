# GMI 默认图片生成 Smoke Test

日期：2026-05-18 本地 / 2026-05-19 UTC
分支：`Qcut-sandbox-v6`
被测 Commit：`479550e51`

## 目标

验证 `qcut generate-image` 在不传 `--model` 的情况下也能跑通，并且新的默认图片模型是 GMI GPT Image 2。

## 命令

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

没有传 `-m` / `--model` 参数。

## 结果

状态：通过

CLI 返回 `status: "ok"`，生成了 5 张图片。

```json
{
  "command": "generate-image",
  "cost": 0.21000000000000002,
  "duration": 192.857
}
```

运行过程中观察到两次 GMI/proxy 的 `504` 临时失败重试。内置重试逻辑成功恢复并完成了整批生成。

## 输出文件

| Prompt | Model | Endpoint | Output |
| --- | --- | --- | --- |
| a small red enamel rocket pin on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-small-red-enamel-rocket-pin-on-white-background_1779155258113_0.png` |
| a tiny blue ceramic robot figurine on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-tiny-blue-ceramic-robot-figurine-on-white-background_1779155298905_1.png` |
| a green glass cactus sculpture on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-green-glass-cactus-sculpture-on-white-background_1779155383443_2.png` |
| a yellow toy submarine product photo on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-yellow-toy-submarine-product-photo-on-white-background_1779155348312_3.png` |
| a silver origami bird charm on white background | `gpt_image_2_gmi` | `gpt-image-2-generate` | `output/gmi-five-image-smoke/gpt_image_2_gmi_a-silver-origami-bird-charm-on-white-background_1779155252980_4.png` |

## 文件检查

5 个 PNG 文件都存在并且是可读的图片：

```text
gpt_image_2_gmi_a-green-glass-cactus-sculpture-on-white-background_1779155383443_2.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-silver-origami-bird-charm-on-white-background_1779155252980_4.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-small-red-enamel-rocket-pin-on-white-background_1779155258113_0.png: 1254 x 1254 PNG
gpt_image_2_gmi_a-tiny-blue-ceramic-robot-figurine-on-white-background_1779155298905_1.png: 1024 x 1024 PNG
gpt_image_2_gmi_a-yellow-toy-submarine-product-photo-on-white-background_1779155348312_3.png: 1024 x 1024 PNG
```

每张生成图都有相邻的 sidecar JSON 文件。sidecar 确认：

- `model`：`gpt_image_2_gmi`
- `endpoint`：`gpt-image-2-generate`
- `cost`：每张 `0.042`

## 视觉抽检

打开并检查了两张输出：

- 红色珐琅火箭别针：非空，居中的产品风格图片，白色背景，与 prompt 一致。
- 蓝色陶瓷机器人摆件：非空，居中的产品风格图片，白色背景，与 prompt 一致。

## 结论

默认 `generate-image` 路径在 GMI 上工作正常。一个不传 model 的 5 张图片批次正确使用了 `gpt_image_2_gmi`、生成了真实 PNG 输出、写入了可复现的 sidecar 元数据，并且能从 GMI/proxy 的临时 `504` 重试中恢复。
