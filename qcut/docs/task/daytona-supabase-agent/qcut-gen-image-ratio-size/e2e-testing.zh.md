# E2E 测试手册

## 原则

这次要验的是 Daytona chat agent 真实链路，不只是本地 CLI。

最低要求：

- 从 Web / Daytona chat agent 发起。
- 命令在真实 sandbox 里执行。
- 使用真实 `qcut gen image` 二进制或镜像内 CLI。
- 使用真实 IMA Router GPT Image 2 请求。
- 生成真实图片文件。
- 用程序读取最终图片尺寸。
- 在第一轮生成结束后，在同一个 Codex terminal / PTY session 再提交第二条命令。

不要用 mock、不要只看 parser 单测、不要 fallback 到其它模型。

## 推荐 E2E 场景

### 场景 A：比例参数

在 Daytona chat agent 中执行这些命令：

```bash
set -euo pipefail

RUN_ID="$(date +%s)"
ROOT="/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID"
mkdir -p "$ROOT"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, clean studio lighting" \
  --aspect-ratio 16:9 \
  -o "$ROOT/aspect-16-9" \
  --json | tee "$ROOT/aspect-16-9.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, vertical poster crop" \
  --ratio 9:16 \
  -o "$ROOT/ratio-9-16" \
  --json | tee "$ROOT/ratio-9-16.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, portrait editorial crop" \
  --aspect-ratio 3:4 \
  -o "$ROOT/aspect-3-4" \
  --json | tee "$ROOT/aspect-3-4.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, landscape catalog crop" \
  --aspect-ratio 4:3 \
  -o "$ROOT/aspect-4-3" \
  --json | tee "$ROOT/aspect-4-3.json"
```

期望：

- 四条命令都成功。
- 输出目录中有图片文件和 sidecar JSON。
- `16:9`、`9:16`、`3:4`、`4:3` 的最终图片尺寸比例正确。
- sidecar JSON 中的 `model` 是 `gpt_image_2_ima`。

### 场景 B：自定义宽高

```bash
set -euo pipefail

RUN_ID="${RUN_ID:-$(date +%s)}"
ROOT="${ROOT:-/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID}"
mkdir -p "$ROOT"

qcut gen image \
  -m gpt_image_2_ima \
  -t "wide editorial hero image of a matte black coffee mug on a neutral table, clean studio lighting" \
  --width 2000 \
  --height 1152 \
  -o "$ROOT/custom-2000x1152" \
  --json | tee "$ROOT/custom-2000x1152.json"
```

期望：

- 命令成功。
- 最终图片尺寸是 `2000x1152`。
- sidecar JSON 中的 params 包含 `size: "2000x1152"`。

### 场景 C：第二次输入

在同一个 Daytona Codex terminal / PTY session 中，在上面的图片生成全部结束后，再提交一条独立命令：

```bash
echo "SECOND_INPUT_OK $(date -Iseconds)" > "$ROOT/second-input-ok.txt"
qcut --version | tee "$ROOT/qcut-version-after-second-input.txt"
```

期望：

- 第二条消息能正常提交。
- terminal 没有卡在 composer/editor 状态。
- `$ROOT/second-input-ok.txt` 存在。
- `$ROOT/qcut-version-after-second-input.txt` 有版本输出。

## 尺寸校验脚本

在 sandbox 中执行：

```bash
set -euo pipefail

ROOT="${ROOT:-/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID}"

bun - <<'BUN'
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadImage } from "@napi-rs/canvas";

const root = process.env.ROOT;
if (!root) throw new Error("ROOT is required");

const cases = [
  { name: "aspect-16-9", ratio: 16 / 9 },
  { name: "ratio-9-16", ratio: 9 / 16 },
  { name: "aspect-3-4", ratio: 3 / 4 },
  { name: "aspect-4-3", ratio: 4 / 3 },
  { name: "custom-2000x1152", width: 2000, height: 1152 },
];

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function findImage({ dir }) {
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const lower = file.name.toLowerCase();
    const isImage = [...imageExtensions].some((ext) => lower.endsWith(ext));
    if (isImage) return join(dir, file.name);
  }
  throw new Error(`No image found in ${dir}`);
}

const results = [];
for (const testCase of cases) {
  const filePath = findImage({ dir: join(root, testCase.name) });
  const image = await loadImage(filePath);
  const width = image.width;
  const height = image.height;
  const ratio = width / height;
  const ratioOk =
    testCase.ratio === undefined || Math.abs(ratio - testCase.ratio) <= 0.01;
  const widthOk = testCase.width === undefined || width === testCase.width;
  const heightOk = testCase.height === undefined || height === testCase.height;
  results.push({
    name: testCase.name,
    filePath,
    width,
    height,
    ratio,
    ok: ratioOk && widthOk && heightOk,
  });
}

const failed = results.filter((item) => !item.ok);
const report = {
  status: failed.length === 0 ? "SUCCESS" : "FAILED",
  results,
  failed,
};

writeFileSync(
  join(root, "dimension-validation.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exit(1);
BUN
```

期望输出：

```json
{
  "status": "SUCCESS",
  "failed": []
}
```

## 建议给 chat agent 的完整 prompt

可以直接把下面这段发给 Daytona chat agent：

```text
请在当前 Daytona sandbox 中做 QCut image ratio/size 的真实 E2E，不要 mock，不要 fallback 到其它模型。

要求：
1. 运行 qcut gen image，模型固定为 gpt_image_2_ima。
2. 分别测试 --aspect-ratio 16:9、--ratio 9:16、--aspect-ratio 3:4、--aspect-ratio 4:3。
3. 再测试 --width 2000 --height 1152。
4. 把所有输出放在 /tmp/qcut-output/gen-image-ratio-size-e2e-<timestamp>。
5. 用 @napi-rs/canvas 或其它可靠方式读取最终图片尺寸，写 dimension-validation.json。
6. 在同一个 terminal session 中，图片生成结束后再提交第二条命令，写 second-input-ok.txt，并运行 qcut --version 写 qcut-version-after-second-input.txt。
7. 如果 qcut system models --json 中没有 gpt_image_2_ima，或者 qcut gen image --help 中没有 --ratio、--width、--height，请直接失败并写 preflight-failed.txt，不要换模型。
8. 最后输出：运行目录、每张图片路径、尺寸、sidecar JSON 路径、第二次输入是否成功。
```

## Preflight

真实 E2E 前先检查：

```bash
set -euo pipefail

qcut --version
qcut system models --json | tee /tmp/qcut-output/models.json
qcut gen image --help | tee /tmp/qcut-output/gen-image-help.txt

grep -q "gpt_image_2_ima" /tmp/qcut-output/models.json
grep -q -- "--ratio" /tmp/qcut-output/gen-image-help.txt
grep -q -- "--width" /tmp/qcut-output/gen-image-help.txt
grep -q -- "--height" /tmp/qcut-output/gen-image-help.txt
```

如果 preflight 失败，说明 Daytona 镜像或部署环境还不是包含这次修复的版本。此时不要继续跑生成，因为继续跑只会验证旧镜像。

## 失败时怎么判断原因

### `--ratio` 没生效

看最终图片是否还是默认比例。再看 sidecar JSON 是否有：

```json
{
  "params": {
    "aspect_ratio": "9:16"
  }
}
```

如果 sidecar 没有 `aspect_ratio`，说明 CLI/session parser 没接住 alias。

### `--width/--height` 没生效

看 sidecar JSON 是否有：

```json
{
  "params": {
    "size": "2000x1152"
  }
}
```

如果 sidecar 有 size 但最终尺寸不是 `2000x1152`，说明 provider 或部署镜像的后端行为需要继续排查。

### 第二次输入失败

看 chat-agent / relay 的 Codex config 是否写入了：

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

如果没有，问题在 PTY session bootstrap 或旧镜像；如果有但仍失败，需要抓 terminal 事件和 Codex TUI 状态。

