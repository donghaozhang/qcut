# 实现记录

## 做了什么

### 1. CLI ratio alias

`qcut gen image` 现在支持 `--ratio` 作为 `--aspect-ratio` 的别名。

覆盖入口：

- `electron/native-pipeline/cli/cli.ts`
- `electron/native-pipeline/cli/cli-runner/session.ts`
- `electron/native-pipeline/cli/command-registry.ts`

解析优先级：

```text
--aspect-ratio > --ratio > --aspect
```

这样普通 CLI 调用和 session mode 调用都会得到同一个 `aspectRatio`。

### 2. IMA Router GPT Image 2 原生 size 映射

`gpt_image_2_ima` / `gpt_image_2_gmi` 现在通过 IMA Router 的 GPT Image 2 image endpoint 原生传 size。

原生比例：

```text
1:1
3:4
9:16
4:3
16:9
```

这些比例会进入最终 API payload：

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "16:9"
}
```

历史兼容比例仍保留：

```text
3:2 -> 1536x1024
2:3 -> 1024x1536
```

### 3. 自定义宽高

`qcut gen image` 现在会把：

```bash
--width 2000 --height 1152
```

转成：

```json
{
  "size": "2000x1152"
}
```

约束：

- 必须同时提供 `--width` 和 `--height`。
- 两个值都必须是正整数。
- 当前只放行到 `gpt_image_2_ima` 和 legacy alias `gpt_image_2_gmi`，避免把 `size` 错塞给其它模型。

### 4. 非 IMA 模型的比例兜底

不是 IMA Router GPT Image 2 的图片模型，如果 API 返回的图片不是用户要求的比例，CLI 会在下载后做居中裁剪兜底。

新增文件：

- `electron/native-pipeline/output/image-aspect-ratio.ts`
- `electron/native-pipeline/output/__tests__/image-aspect-ratio.test.ts`

这个兜底使用 `@napi-rs/canvas` 读取图片尺寸并居中裁剪。IMA Router GPT Image 2 不走这个裁剪路径，因为它应该由服务端原生生成目标比例或目标尺寸。

### 5. Registry 能力声明

`gpt_image_2_ima` 的 `aspectRatios` 已经补齐：

```text
1:1, 3:4, 9:16, 4:3, 16:9, 3:2, 2:3
```

这样 UI、能力检查、model listing 不会误报不支持。

### 6. Codex terminal 第二次输入

`packages/qcut-relay/src/pty-session.ts` 里已有修复：在 Daytona / web terminal 的 Codex config 中写入 TUI keymap。

关键配置：

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

这个修复的目的：让 Enter 在 composer 中稳定提交消息，而不是进入一种无法继续提交下一条消息的状态。

## 之前为什么会错

### `--ratio` 没有完整接线

CLI parser 之前主要识别 `--aspect-ratio`。用户传 `--ratio 9:16` 时，某些入口不会把它映射到 `aspectRatio`，后面的 generation handler 就收不到用户想要的比例。

### `--width` / `--height` 解析了但没有进入 image params

全局 parser 已经能看到 `width` 和 `height`，但 `handleGenerate` 没有把它们转成图片模型真正需要的 `size` 参数。

### 默认 `size` 把用户比例挡住了

`gpt_image_2_ima` registry 默认带 `size: "1024x1024"`。如果执行器只判断 payload 里已经有 `size` 就不覆盖，就会把默认值误认为用户显式指定，导致 `--aspect-ratio 16:9` 仍然走 1:1。

修复后区分：

- registry 默认 size：可以被用户的 `--aspect-ratio` 覆盖。
- 用户显式 `--width/--height` 生成的 size：优先级最高。

### 旧的 GPT Image 映射不是 16:9 / 9:16

旧逻辑把：

```text
16:9 -> 1536x1024
9:16 -> 1024x1536
```

这两个实际是 3:2 和 2:3，不是用户要求的比例。现在 IMA Router GPT Image 2 对 `1:1 / 3:4 / 9:16 / 4:3 / 16:9` 直接传原生 size 字符串。

## 本地回归测试

已经补了这些覆盖：

- CLI 解析 `--ratio`
- CLI 解析 `--width` / `--height`
- session mode 解析 `--ratio`
- IMA Router GPT Image 2 原生比例 payload
- IMA Router GPT Image 2 自定义尺寸 payload
- 非 IMA 模型比例裁剪兜底
- Codex PTY keymap 写入

本地命令：

```bash
bunx vitest run \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-duration.test.ts \
  electron/native-pipeline/output/__tests__/image-aspect-ratio.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts

bun x tsc -p electron/tsconfig.json --noEmit

cd packages/qcut-relay
bun run test src/pty-session.test.ts
```

当前结果：

```text
6 files / 44 tests passed
electron TypeScript check passed
qcut-relay pty-session: 10 tests passed
```

