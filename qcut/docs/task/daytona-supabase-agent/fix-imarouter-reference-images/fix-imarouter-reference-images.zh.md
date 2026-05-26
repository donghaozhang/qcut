# 修复 IMA Router Ref2V 的 `--reference-images`

## 问题

现在执行下面这种命令时：

```bash
qcut gen video -m imarouter_seedance_2_0_ref2v --reference-images /tmp/qcut-output/example.png
```

CLI 会接受 `--reference-images` 参数，但这张图片实际上没有作为 IMA Router 的视频参考图发送出去。

生成的 sidecar JSON 可能是这样：

```json
"inputs": {
  "reference_images": ["/tmp/qcut-output/example.png"]
},
"params": {
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```

这说明 CLI 记录了用户输入，但最终 payload 里没有 `images: ["asset://..."]`。

## 根因

`--reference-images` 会被解析到 `options.referenceImages`，但是 `create-video` 目前只给下面两个模型做了映射：

- `happy_horse_ref2v` -> `params.image_urls`
- `happy_horse_video_edit` -> `params.reference_image_urls`

IMA Router 的 Ref2V 模型没有被处理：

- `imarouter_seedance_2_0_ref2v`
- `imarouter_seedance_2_0_cn_ref2v`

IMA Router 真正的 asset 上传逻辑目前只在 `input.imageUrl` 存在时执行。这个分支会：

1. 把图片上传/注册到 IMA Router asset API。
2. 等待审核通过。
3. 最终发送 `payload.images = ["asset://..."]`。

但用户传的是 `--reference-images` 时，`input.imageUrl` 是空的，所以这条 asset 上传路径被跳过了。

## 推荐修复

主要改 `electron/native-pipeline/execution/step-executors.ts` 里的 `executeImageToVideo`。

位置应该在 `reshapeForImaRouter(payload)` 之前、`callModelApi` 之前。

给 IMA Router Ref2V 增加一个专门处理 `payload.image_urls` 的分支：

```ts
const isImaRouterRef2V =
  provider === "imarouter" &&
  (model.key === "imarouter_seedance_2_0_ref2v" ||
    model.key === "imarouter_seedance_2_0_cn_ref2v");

if (isImaRouterRef2V && Array.isArray(payload.image_urls)) {
  const raw = (payload.image_urls as string[]).slice(0, 14);
  const { channelFor, ensureGroup, uploadAsset } = await import(
    "../infra/imarouter-assets.js"
  );
  const { envApiKeyProvider } = await import("../infra/api-caller.js");
  const apiKey = await envApiKeyProvider("imarouter");
  if (!apiKey) {
    return {
      success: false,
      error: "IMAROUTER_API_KEY not configured",
      duration: 0,
    };
  }

  const channel = channelFor(model.key);
  const groupId = await ensureGroup(channel, { apiKey });
  const assets: string[] = [];

  for (const entry of raw) {
    if (/^asset:\/\//i.test(entry)) {
      assets.push(entry);
      continue;
    }

    const sourceUrl = /^https?:\/\//i.test(entry)
      ? entry
      : (await uploadToFalStorage(entry)).url;

    if (!sourceUrl) {
      return {
        success: false,
        error: `Failed to upload reference image: ${entry}`,
        duration: 0,
      };
    }

    assets.push(
      await uploadAsset(sourceUrl, channel, groupId, {
        apiKey,
        signal: options.signal,
      })
    );
  }

  payload.images = assets;
  delete payload.image_urls;
}
```

同时改 `electron/native-pipeline/cli/cli-runner/handler-generate.ts`，让 IMA Router Ref2V 模型先把 `--reference-images` 放到 `params.image_urls`：

```ts
if (
  options.model === "imarouter_seedance_2_0_ref2v" ||
  options.model === "imarouter_seedance_2_0_cn_ref2v"
) {
  params.image_urls = options.referenceImages.slice(0, 14);
}
```

## 更好的长期方案

建议抽一个统一的参考图解析函数：

```ts
resolveVideoReferenceImages({
  entries,
  provider,
  modelKey,
  signal,
  onProgress,
})
```

这个函数负责把用户输入转换成 provider 真正能用的引用：

- FAL / GMI：转换成本地上传后的 HTTPS URL 或对应字段数组。
- IMA Router：转换成 `asset://...`。
- 已经是 `asset://...`：直接透传。

这样可以避免 `--image-url`、`--reference-images`、Happy Horse、Vidu、Seedance、IMA Router 各自维护一套重复上传逻辑。

## 测试计划

先跑本地命令：

```bash
QCUT_OUTPUT_DIR=/tmp/qcut-output qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --reference-images /tmp/qcut-output/example.png \
  -t "5 second video using the reference character, not as first frame" \
  -d 5s \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --json
```

期望 sidecar 或调试日志里能看到类似：

```json
"params": {
  "images": ["asset://..."]
}
```

或者有其他明确证据证明最终发给 IMA Router 的 payload 包含了 `images`。

还需要回归测试：

- `--image-url <local.png>` 对 I2V 仍然可用。
- `happy_horse_ref2v --reference-images <local.png>` 仍然走 FAL 上传路径。
- `imarouter_seedance_2_0_cn_ref2v` 使用 CN 上传通道。

## 立即可用的绕过方式

如果只有一张参考图，先用：

```bash
qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --image-url /path/to/reference.png \
  ...
```

这条路径已经会触发 IMA Router asset 上传，并发送 `images: ["asset://..."]`。
