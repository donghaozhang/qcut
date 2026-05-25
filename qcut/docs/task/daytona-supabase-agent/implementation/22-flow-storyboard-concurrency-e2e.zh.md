# Flow Storyboard Concurrency Daytona E2E

日期：2026-05-19
分支：`cli-image-v6`
Commit：`d3fdf166f`
PR：https://github.com/Quriosity-agent/qcut/pull/306

## 总结

状态：通过。

`qcut flow storyboard` 现在生成 storyboard 图片任务时使用了有界并发。默认并发是 6，显式传入的 `--concurrency` 会被 clamp，不会超过 6。

真实 Daytona E2E 在传 `--concurrency 99` 的情况下通过，并证明了运行时的 clamp：

```text
[storyboard] Running 6 image task(s) with concurrency 6
[storyboard] Generated: 6 images, $0.252 cost
```

## 实现

改动文件：

```text
electron/native-pipeline/vimax/agents/storyboard-artist.ts
electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts
electron/native-pipeline/cli/command-registry.ts
electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts
packages/license-server/wrangler.toml
```

行为：

- `StoryboardArtistConfig.concurrency` 默认 `6`。
- `normalizeConcurrency()` 把值 clamp 到 `1...6`，同时也用任务数封顶。
- `StoryboardArtist.process()` 现在先构造独立的 image task，然后跑 worker pool。
- 结果按原始 task index 存储，所以输出顺序仍是确定的。
- Storyboard 输出文件名现在包含全局 `shot_###`，避免并发写入时同 scene 同 shot type 互相覆盖。
- `qcut flow storyboard --concurrency <n>` 通过 CLI handler 传递，并在 command registry 帮助文本中展示。

## 被测部署

- CLI 镜像 tag：`ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347`
- CLI 镜像 GitHub Actions run：https://github.com/Quriosity-agent/qcut/actions/runs/26126197782
- License server 部署版本：`8eb2c06f-fc1e-4b6e-96ef-6a11bf5bf6a4`
- Worker URL：`https://qcut-license-server.zdhpeter.workers.dev`
- Daytona-backed job：`d07b5174-94f6-4582-ac91-6b654a961e5a`

## 本地校验

通过：

```bash
bunx vitest run \
  electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts \
  electron/native-pipeline/vimax/agents/__tests__/character-portraits.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts
```

结果：3 个文件，7 个测试通过。

通过：

```bash
cd electron && bun x tsc --noEmit
```

通过：

```bash
npx @biomejs/biome check \
  electron/native-pipeline/vimax/agents/storyboard-artist.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts \
  electron/native-pipeline/cli/command-registry.ts \
  electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts
```

本地 CLI smoke 在隔离 mock 模式下也通过：

```bash
env -i PATH="$PATH" HOME="$tmp_home" \
  bun run qcut flow storyboard \
  --scenes "$tmpdir/scenes.json" \
  --image-model gpt_image_2_ima \
  --concurrency 99 \
  -o "$tmpdir/out" \
  --json
```

观察到：

```text
[storyboard] Running 4 image task(s) with concurrency 4
```

## 真实 Daytona E2E

第一次通过 `https://quriosity.com.au/chat-agent.html` 的浏览器 PTY 尝试，在 headless Chrome 下没能到达稳定的 WebSocket-ready 状态。license-server 的 `pty-token` 端点确实返回了使用新镜像 tag 的 Daytona session，但 UI 端的 WebSocket 一直停在 `Connecting to Daytona Codex...`。

为了让测试保留在真实的在线 Daytona 路径上，最终的验证改用生产 Supabase 队列，加上一个指向新 CLI 镜像 tag 的本地 `agent-worker`。该 worker 认领了生产环境任务，创建了一个真实的 Daytona sandbox：

```text
QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347
```

Codex prompt 请求 Daytona sandbox 运行：

```bash
qcut flow storyboard \
  --scenes /tmp/qcut-input/storyboard-concurrency/scenes.json \
  --image-model gpt_image_2_ima \
  --concurrency 99 \
  -o /tmp/qcut-output/storyboard-concurrency/images \
  --json 2>&1 | tee /tmp/qcut-output/storyboard-concurrency-run.log
```

sandbox 随后复制了恰好 6 张 PNG 到 `/tmp/qcut-output/storyboard-concurrency-01.png` 到 `storyboard-concurrency-06.png`，写入了 `storyboard-concurrency-done.json` 和 `storyboard-concurrency-proof.md`。

## 结果

下载的证据：

```json
{"status":"success","run_id":"2026-05-19T21-55-47-610Z","image_tag":"ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347","png_count":6,"requested_concurrency":99,"observed_concurrency":6,"duration_seconds":113}
```

下载的证据 markdown：

```text
status: success
run_id: 2026-05-19T21-55-47-610Z
image_tag: ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347
observed_log: Running 6 image task(s) with concurrency 6
png_count: 6
duration_seconds: 113
```

下载的 6 张图片都是合法 PNG：

```text
downloaded-storyboard-concurrency-01.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-02.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-03.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-04.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-05.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-06.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

本地证据目录：

```text
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/
```

关键证据文件：

```text
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-run.log
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-done.json
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-proof.md
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-01.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-02.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-03.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-04.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-05.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-06.png
```

## 备注

- 生产 license-server 已使用新的不可变镜像 tag 部署。
- 之前默认的持久 Chat Agent 测试 session 仍然存在，让这次运行的 headless UI PTY 路径不稳定。
- 即使如此，成功的运行仍然走的是生产 Supabase / Daytona agent-worker 路径加一个真实的 Daytona sandbox，不是本地 mock。
