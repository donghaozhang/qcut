# Testing Flow Optimization / 测试流程优化建议

## Why This Took About Two Hours / 为什么这次接近两个小时

English:

The work took roughly 1h42m of active goal time, and the total wall-clock debugging window felt close to two hours because several slow loops were chained together:

1. The first browser E2E attempts failed before reaching the provider because of terminal socket / relay readiness issues.
2. The first successful Daytona path booted an older CLI image that did not expose the expected image flags in the deployed environment.
3. A new CLI image had to be built and pushed through GitHub Actions; one build took about 11m40s, and the final fixed build took 16m12s.
4. The first real provider attempt reached IMA Router but failed with `403` for ratio-string payloads, which required a live diagnostic run.
5. Each real GPT Image 2 provider call took roughly 52-64 seconds. Five sequential image cases therefore cost about 4.5-6 minutes just in generation time.
6. One successful generation run still failed in local proof download because the validation JSON used `imagePath` while the script expected `filePath`.
7. Several steps were discovered only after remote deploy because the true behavior depended on the deployed Daytona image and live provider endpoint.

中文：

本次 active goal 时间约 1 小时 42 分钟，体感接近两个小时，是因为多个慢循环串在了一起：

1. 最初几次 browser E2E 在到达 provider 前就失败，原因是 terminal socket / relay readiness。
2. 第一次成功进入 Daytona 路径时，sandbox 里还是旧 CLI image，部署环境没有暴露预期的图片参数。
3. 需要通过 GitHub Actions 构建并推送新的 CLI image；一次构建约 11 分 40 秒，最终修复后的构建耗时 16 分 12 秒。
4. 第一次真实 provider 请求到达 IMA Router，但 ratio-string payload 返回 `403`，因此又需要跑一次 live diagnostic。
5. 每次真实 GPT Image 2 provider 调用大约 52-64 秒。5 个顺序图片用例本身就要 4.5-6 分钟。
6. 一次成功生成后，本地 proof 下载仍然失败，因为 validation JSON 使用 `imagePath`，而脚本只读取 `filePath`。
7. 多个问题只有部署到真实 Daytona image 并调用 live provider 后才暴露。

## Main Bottlenecks / 主要瓶颈

| Bottleneck / 瓶颈 | Cost / 成本 | Cause / 原因 |
| --- | ---: | --- |
| Docker image build / Docker image 构建 | 11-16m per build / 每次 11-16 分钟 | Full GitHub Actions build, push, smoke / 完整 GitHub Actions 构建、推送、smoke |
| Daytona sandbox cold start / Daytona 冷启动 | ~5-75s observed / 观测约 5-75 秒 | New container, PTY, Codex readiness / 新容器、PTY、Codex ready |
| Live image generation / Live 图片生成 | ~52-64s per image / 每张约 52-64 秒 | Real GPT Image 2 provider latency / 真实 GPT Image 2 provider 延迟 |
| Sequential cases / 串行用例 | ~5x provider latency / 约 5 倍 provider 延迟 | Prompt asked Codex to run each command sequentially / prompt 要求 Codex 顺序执行 |
| Manual diagnosis / 人工诊断 | High / 高 | Failure classification was not built into the script at first / 脚本一开始没有内置失败分类 |
| Poor timing capture / 耗时记录不足 | Medium / 中 | Early deploys were not wrapped by timing scripts / 早期部署没有统一计时 |

## Faster Test Strategy / 更快的测试策略

### 1. Split the test pyramid / 拆分测试金字塔

English:

Do not run the expensive Web / Daytona / provider path for every small change. Use three layers:

- Layer 1: local unit tests for parser, registry, and payload mapping.
- Layer 2: local or mocked integration test that asserts the exact payload sent to IMA Router.
- Layer 3: one live Web / Daytona E2E proof on the final candidate image.

中文：

不要每个小改动都跑昂贵的 Web / Daytona / provider 路径。建议拆成三层：

- 第 1 层：本地单元测试，覆盖 parser、registry、payload mapping。
- 第 2 层：本地或 mock integration test，断言发送给 IMA Router 的精确 payload。
- 第 3 层：只在最终候选 image 上跑一次 live Web / Daytona E2E proof。

### 2. Add a provider preflight endpoint test / 增加 provider preflight 测试

English:

Before generating five images, run one cheap live diagnostic:

- Check key presence without printing the secret.
- Check a safe provider endpoint or minimal generation.
- Run one `1024x1024` GPT Image 2 job.
- If that fails, stop before the full matrix.

中文：

在生成 5 张图片之前，先跑一个低成本 live diagnostic：

- 检查 key 是否存在，但不打印 secret。
- 检查安全的 provider endpoint 或最小生成。
- 只跑一个 `1024x1024` GPT Image 2 job。
- 如果失败，直接停止，不进入完整矩阵。

### 3. Make image cases parallel where provider policy allows / 在 provider 允许时并行图片用例

English:

The five live cases were sequential. If provider quota and rate limits allow it, run the five `qcut gen image` commands in parallel and then validate dimensions after all complete. This can reduce generation time from roughly 5-6 minutes to about 1-2 minutes.

中文：

这 5 个 live 用例是顺序执行的。如果 provider quota 和 rate limit 允许，可以并行执行 5 条 `qcut gen image`，等全部完成后再统一验证尺寸。这样生成阶段可能从约 5-6 分钟降到 1-2 分钟。

### 4. Use a reusable sandbox for proof continuation / 复用 sandbox 完成 proof

English:

The final successful proof used `--existing-root` and `--skip-session-reset` to avoid regenerating images after the files already existed. Keep this pattern:

```bash
bun scripts/agent-chat-image-ratio-size-e2e.ts \
  --skip-session-reset \
  --existing-root /tmp/qcut-output/gen-image-ratio-size-e2e-<id>
```

中文：

最终 proof 使用了 `--existing-root` 和 `--skip-session-reset`，避免在图片已经生成后重复花钱、重复等待。建议保留这个模式：

```bash
bun scripts/agent-chat-image-ratio-size-e2e.ts \
  --skip-session-reset \
  --existing-root /tmp/qcut-output/gen-image-ratio-size-e2e-<id>
```

### 5. Build image only after local payload tests pass / 本地 payload 测试通过后再 build image

English:

The slowest engineering loop is Docker image build plus Daytona boot. Gate image builds behind focused tests:

```bash
bun test \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts
```

中文：

最慢的工程循环是 Docker image build 加 Daytona boot。应先让 focused tests 通过，再 build image：

```bash
bun test \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts
```

### 6. Record timings automatically / 自动记录耗时

English:

Add a tiny timing wrapper so every command writes structured timing to the output directory:

```bash
run_timed() {
  local name="$1"
  shift
  local started ended status
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "$@"
  status="$?"
  ended="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"name":"%s","startedAt":"%s","endedAt":"%s","status":%s}\n' \
    "$name" "$started" "$ended" "$status" >> "$ROOT/timings.jsonl"
  return "$status"
}
```

中文：

增加一个很小的 timing wrapper，让每条命令都把结构化耗时写到输出目录：

```bash
run_timed() {
  local name="$1"
  shift
  local started ended status
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "$@"
  status="$?"
  ended="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"name":"%s","startedAt":"%s","endedAt":"%s","status":%s}\n' \
    "$name" "$started" "$ended" "$status" >> "$ROOT/timings.jsonl"
  return "$status"
}
```

### 7. Add failure classifiers to the E2E script / 在 E2E 脚本中增加失败分类

English:

The script should classify failures as:

- Page load / readiness failure.
- Relay / socket failure.
- Daytona sandbox image mismatch.
- Preflight flag/model mismatch.
- Provider auth/quota failure.
- Provider payload failure.
- Generation success but artifact download failure.
- Second PTY input failure.

中文：

脚本应直接把失败分类为：

- 页面加载或 readiness 失败。
- Relay / socket 失败。
- Daytona sandbox image 不匹配。
- Preflight flag/model 不匹配。
- Provider 认证或额度失败。
- Provider payload 失败。
- 生成成功但 artifact 下载失败。
- 第二条 PTY 输入失败。

## Proposed Faster Happy Path / 建议的快速 Happy Path

English:

1. Run local focused tests: under 1 second.
2. Run local payload snapshot test for `gpt_image_2_ima`: under 1 second.
3. Build and push CLI image once: 12-16 minutes.
4. Deploy license server: under 10 seconds.
5. Run one diagnostic image: about 2 minutes.
6. Run full matrix in parallel: target 1-2 minutes.
7. Download and verify local images: under 10 seconds.
8. Submit second PTY input: about 20 seconds.

Expected total after optimization: about 16-22 minutes, dominated by Docker image build.

中文：

1. 跑本地 focused tests：小于 1 秒。
2. 跑本地 `gpt_image_2_ima` payload snapshot test：小于 1 秒。
3. 构建并推送 CLI image 一次：12-16 分钟。
4. 部署 license server：小于 10 秒。
5. 跑一个 diagnostic image：约 2 分钟。
6. 并行跑完整矩阵：目标 1-2 分钟。
7. 下载并验证本地图片：小于 10 秒。
8. 提交第二条 PTY 输入：约 20 秒。

优化后预期总耗时：约 16-22 分钟，主要瓶颈仍然是 Docker image build。

## Longer-Term Improvements / 长期改进

English:

- Publish preview CLI images automatically for every PR commit that touches CLI or native-pipeline code.
- Put the image tag into the PR status output so E2E can consume it without manual copy/paste.
- Add a license-server staging env separate from production.
- Add a `/api/agent/sessions/:id/image-tag` or session metadata endpoint to assert the sandbox image before connecting.
- Add a provider payload contract test based on real accepted IMA Router payloads.
- Store all E2E logs, remote root, local downloads, screenshots, and timings under one stable run directory.

中文：

- 对每个修改 CLI 或 native-pipeline 的 PR commit 自动发布 preview CLI image。
- 把 image tag 写入 PR status output，让 E2E 不需要手动复制。
- 增加独立于 production 的 license-server staging 环境。
- 增加 `/api/agent/sessions/:id/image-tag` 或 session metadata endpoint，在连接前确认 sandbox image。
- 基于 IMA Router 已验证 payload 增加 provider payload contract test。
- 把所有 E2E logs、remote root、本地 downloads、screenshots、timings 都存进同一个稳定 run directory。
