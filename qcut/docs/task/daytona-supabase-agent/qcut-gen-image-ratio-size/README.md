# QCut Image Ratio And Custom Size Fix

日期：2026-05-26

## 背景

目标是修复 Daytona / Codex chat agent 中 `qcut gen image` 的图片比例和尺寸控制问题：

```bash
qcut gen image -t "..." --aspect-ratio 1:1
qcut gen image -t "..." --aspect-ratio 3:4
qcut gen image -t "..." --aspect-ratio 9:16
qcut gen image -t "..." --aspect-ratio 4:3
qcut gen image -t "..." --aspect-ratio 16:9
qcut gen image -t "..." --ratio 9:16
qcut gen image -t "..." --width 2000 --height 1152
```

同时记录 Codex web terminal 第一次输入后第二次不能继续输入的问题，以及应该怎么做真实 E2E 验收。

## 文档

- [实现记录](./implementation.md)：这次改了什么、为什么之前会错、涉及哪些代码路径。
- [E2E 测试手册](./e2e-testing.md)：如何从 Daytona chat agent 端到端验证，而不是只跑本地单测。

## 验收标准

这项修复不能只看 CLI parser 单测。最终验收应该满足：

- 真实 Daytona sandbox 中的 chat agent 能运行 `qcut gen image`。
- `--aspect-ratio` 和 `--ratio` 都能影响最终图片比例。
- `--width 2000 --height 1152` 能得到自定义尺寸图片。
- 同一个 Codex terminal / PTY session 中，第一条命令结束后还能继续提交第二条命令。
- 产物、日志、sidecar JSON、尺寸校验结果都保存在 sandbox 的 `/tmp/qcut-output/...` 目录中，方便回看。

