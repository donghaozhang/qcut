# QCut Image Ratio And Custom Size Fix

Date: 2026-05-26

## Background

This task fixes image ratio and custom size control for `qcut gen image` when it is run through the Daytona / Codex chat agent path:

```bash
qcut gen image -t "..." --aspect-ratio 1:1
qcut gen image -t "..." --aspect-ratio 3:4
qcut gen image -t "..." --aspect-ratio 9:16
qcut gen image -t "..." --aspect-ratio 4:3
qcut gen image -t "..." --aspect-ratio 16:9
qcut gen image -t "..." --ratio 9:16
qcut gen image -t "..." --width 2000 --height 1152
```

It also records the related Codex web terminal issue where the first submitted message worked but the second message could not be submitted reliably.

## Documents

- [Implementation Notes](./implementation.md): what changed, why it failed before, and which code paths are involved.
- [E2E Testing Guide](./e2e-testing.md): how to verify this through the real Daytona chat agent path, not only local unit tests.

Chinese versions:

- [中文总览](./README.zh.md)
- [实现记录](./implementation.zh.md)
- [E2E 测试手册](./e2e-testing.zh.md)

## Acceptance Criteria

This fix should not be accepted from parser tests alone. Final acceptance should verify:

- The real Daytona sandbox chat agent can run `qcut gen image`.
- Both `--aspect-ratio` and `--ratio` affect the final image ratio.
- `--width 2000 --height 1152` produces a custom-size image.
- In the same Codex terminal / PTY session, a second command can be submitted after the first generation finishes.
- Outputs, logs, sidecar JSON, and dimension validation results are saved under `/tmp/qcut-output/...` in the sandbox for review.

