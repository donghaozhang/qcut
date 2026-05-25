# Flow Storyboard Scenes Daytona E2E

日期：2026-05-19
分支：`cli-image-v6`
PR：https://github.com/Quriosity-agent/qcut/pull/306

## 总结

状态：通过。

本测试验证生产环境的 Chat Agent 页面能创建一个真实的在线 Daytona sandbox，运行 `qcut flow scenes`，然后用生成的 scenes JSON 作为输入运行 `qcut flow storyboard`。

被测的 storyboard 路径是：

```bash
qcut flow storyboard \
  --scenes /tmp/qcut-output/scenes.json \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/storyboard-from-scenes \
  --json
```

部署的 CLI 镜像在 `qcut flow storyboard --help --json` 中也暴露了 `--scenes`。

## 被测部署

- Chat Agent 页面：`https://quriosity.com.au/chat-agent.html`
- License server：`https://qcut-license-server.zdhpeter.workers.dev`
- Worker 部署版本：`064e862d-4c70-402b-93a5-cffaaeb9d618`
- CLI 镜像 tag：`ghcr.io/quriosity-agent/qcut-cli:cli-image-v6-storyboard-scenes-20260519195039`
- CLI 镜像 GitHub Actions run：https://github.com/Quriosity-agent/qcut/actions/runs/26121362262
- Daytona session：`a5b46292-2725-49e6-9673-7f7cb47ae072`

## 真实 E2E 步骤

浏览器测试打开生产 Chat Agent 页面，清空保存的本地 session id，点击 Connect，等待 Daytona 内的 Codex 终端，然后通过网页 UI 发送 E2E shell prompt。

在 Daytona sandbox 内执行的命令：

```bash
set -euo pipefail
rm -rf /tmp/qcut-input /tmp/qcut-output
mkdir -p /tmp/qcut-input /tmp/qcut-output/storyboard-from-scenes

qcut flow storyboard --help --json | tee /tmp/qcut-output/storyboard-help.json

cat > /tmp/qcut-input/novel.txt <<'EOF'
At sunrise, Lina enters a glass observatory above the city and discovers a humming compass on the floor.
The compass projects one memory of her missing brother, then points toward a locked service stair glowing with blue light.
EOF

qcut flow scenes \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  --max-scenes 1 \
  -o /tmp/qcut-output \
  --json

qcut flow storyboard \
  --scenes /tmp/qcut-output/scenes.json \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/storyboard-from-scenes \
  --json
```

测试在 storyboard 生成前把生成的 scenes JSON 限制为一个 scene 和一个 shot，以保持真实 provider 调用规模小且确定。

## 结果

- Daytona Codex 终端中打印了 `FLOW_STORYBOARD_SCENES_E2E_OK`。
- sandbox Codex agent 返回了 `FLOW_STORYBOARD_SCENES_E2E_DONE`。
- `scenes.json` 中 `scene_count: 1`。
- `scenes.json` 中 `shot_count: 1`。
- Storyboard 生成产出 `png_count: 1`。
- 下载的证据图片是合法 PNG，`1536x1024`，`1,730,482` 字节。

Sandbox 输出：

```text
/tmp/qcut-output/scenes.json
/tmp/qcut-output/storyboard-help.json
/tmp/qcut-output/storyboard-proof.png
/tmp/qcut-output/flow-storyboard-scenes-e2e-proof-2026-05-19T20-08-25-585Z.md
/tmp/qcut-output/storyboard-from-scenes/The_Humming_Compass/scene_001_medium_The_Observatory_Discovery.png
```

下载到的本地证据：

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/01-initial.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/02-connected.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/03-after-command.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/04-files.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-scenes.json
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-flow-storyboard-scenes-e2e-proof-2026-05-19T20-08-25-585Z.md
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-storyboard-proof.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/result.json
```

Proof 文件内容：

```text
status: success
run_marker: FLOW_STORYBOARD_SCENES_DAYTONA_2026-05-19T20-08-25-585Z
image_tag: ghcr.io/quriosity-agent/qcut-cli:cli-image-v6-storyboard-scenes-20260519195039
input: /tmp/qcut-output/scenes.json
input_kind: scenes
scene_count: 1
shot_count: 1
png_count: 1
proof_image: /tmp/qcut-output/storyboard-proof.png
first_storyboard_image: /tmp/qcut-output/storyboard-from-scenes/The_Humming_Compass/scene_001_medium_The_Observatory_Discovery.png
```

## 部署前本地校验

通过：

```bash
bunx biome check --write \
  electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts \
  electron/native-pipeline/cli/cli.ts \
  electron/native-pipeline/cli/cli-runner/types.ts \
  electron/native-pipeline/cli/command-registry.ts
```

```bash
bun test \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/scene-handlers.test.ts
```

结果：8 个 pass。

```bash
bun run pipeline flow storyboard --help --json
```

结果：列出了 `--scenes`。

```bash
cd electron && bun x tsc --noEmit
```

结果：通过。

```bash
bun --cwd packages/license-server test src/routes/agent.test.ts
```

结果：39 个 pass。
