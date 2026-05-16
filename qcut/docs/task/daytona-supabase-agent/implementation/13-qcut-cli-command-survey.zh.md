# QCut CLI 命令测试调研

日期：2026-05-16

## 目标

梳理 QCut CLI 里哪些命令族值得 smoke test；每个命令族尽量跑一个代表命令；
成功和失败都记录下来。

这次没有把这些 probe 加进用户可见的 `qcut` 产品 CLI。它更像一张覆盖地图，
后面可以变成 repo test、release check，或者 Daytona Chat Agent 的测试 prompt。

## CLI 结构

顶层 CLI help 显示：

| 项目 | 数量 |
| --- | ---: |
| Categories | 14 |
| Commands | 189 |
| Editor commands | 121 |

主要命令族：

```text
generation, pipeline, analysis, models, keys, project, moyin, youtube,
recording, vimax, subtitle, phota, replicate, editor
```

这次本地 shell 里没有可直接执行的 `qcut` binary，所以用源码入口跑：

```bash
bun electron/native-pipeline/cli/cli.ts ...
```

## 证据目录

原始 stdout/stderr/meta 都在：

```text
output/qcut-cli-command-survey-20260516/results
```

测试 fixture 和本地生成文件在：

```text
output/qcut-cli-command-survey-20260516/fixtures
output/qcut-cli-command-survey-20260516/project
```

每个 probe 都有：

```text
<id>.meta.json
<id>.stdout.txt
<id>.stderr.txt
```

## 哪些值得测

QCut CLI 太大，不适合每次把所有命令都跑一遍。建议分层：

| 层级 | 频率 | 目的 |
| --- | --- | --- |
| Metadata / routing | 改 CLI registry/parser 时必跑 | 防止 help JSON、group alias、command discovery 断掉。 |
| 本地安全命令 | 每次 CI smoke 或本地快速检查 | Project setup、key checks、model listing、subtitle、daemon status。 |
| Editor bridge 命令 | 单独的 editor integration job | 验证 `editor:*` HTTP bridge、project/timeline/export。 |
| Provider-backed generation/analysis | Release/nightly | 有意识地消耗 credits，验证图片/视频/音频/model 集成。 |
| 外部副作用命令 | 手动 release checklist | YouTube 上传、Phota/Replicate 真实任务、屏幕录制权限。 |

## Probe 结果

| ID | 命令族 | 命令 | 结果 | 记录 |
| --- | --- | --- | --- | --- |
| `01-root-help` | metadata | `--help --json` | 通过 | 顶层 catalog 返回 14 个 categories、189 个 commands。 |
| `02-generation-elements` | generation | `list-elements --json` | 通过 | 安全的 generation 读路径，返回 12 个 stored elements。 |
| `03-generation-group-help` | generation/routing | `gen image --help --json` | 通过 | Group alias 正确解析到 `generate-image`，暴露 required `--text`。 |
| `04-pipeline-status` | pipeline | `flow status --job-id qcut-cli-survey-missing --json` | 预期失败 | 本地 editor/job backend 没启动。 |
| `05-analysis-help` | analysis/routing | `analyze transcribe --help --json` | 通过 | Group alias 正确解析到 `transcribe`，没有跑付费转写。 |
| `06-models-list` | models | `system models --category image --json` | 警告 | Exit 0 但 `count: 0`，疑似 category alias/mapping 问题。 |
| `18-models-all` | models | `system models --json` | 通过 | 不加 filter 返回 143 个 models。 |
| `07-keys-doctor` | keys/system | `system doctor --json --skip-health` | 通过 | Bun、ffmpeg、env 文件权限、7/16 keys configured 都 OK。 |
| `08-project-init` | project | `system project-init --directory ... --json` | 通过 | 在 survey output 目录下创建/确认 project scaffold。 |
| `09-project-info` | project | `system project-info --directory ... --json` | 通过 | 回读 project 目录结构，目录都存在，文件数为 0。 |
| `10-moyin-help` | moyin | `moyin:parse-script --help --json` | 通过 | 只验证命令形态，没有跑 LLM parse。 |
| `11-youtube-help` | youtube | `youtube:upload --help --json` | 通过 | 只测 help；真实 upload 应该手动跑。 |
| `12-record-daemon-status` | recording | `record-daemon --status --json` | 通过 | Daemon 返回 `running: false`，没有启动录制。 |
| `13-vimax-models` | vimax | `vimax:list-models --json` | 通过 | 返回 99 个 ViMax/video models。 |
| `14-subtitle-style` | subtitle | `subtitle-style --input sample.srt --preset bold --output sample.ass --json` | 通过 | 本地字幕转换成功，生成一个 caption 的 ASS 文件。 |
| `15-phota-profile-validation` | phota | `phota:profile --input missing.zip --json` | 预期失败 | 上传前 validation 失败：missing ZIP。 |
| `16-replicate-help` | replicate | `replicate:analyze --help --json` | 通过 | 只测 help，避免付费视频分析。 |
| `17-editor-health` | editor | `editor:health --json` | 预期失败 | 本地 editor bridge 没启动。 |

## Bug / 后续候选

1. **Model category filter 警告**

   `system models --category image --json` exit 0，但返回 0 个模型。不加 filter
   返回 143 个模型，`gen image --help` 又列出了 `flux_dev`、`recraft_v4`、
   `dall_e_3` 等图片模型。

   可能修法：把公开 help 里的 `image`、`video`、`speech`、`motion` 映射到
   内部 registry category，比如 `text_to_image`、`text_to_video`、
   `text_to_speech`、`motion_transfer`。

2. **本地 qcut binary 可用性**

   这次 shell 里没有 `qcut` 可执行文件，所以用源码入口。Release 验证需要
   额外确认 packaged/installed binary：

   ```bash
   qcut --help --json
   qcut system doctor --json --skip-health
   ```

3. **Editor-dependent 命令需要单独 harness**

   `flow status` 和 `editor:health` 因为 editor API server 没启动而失败。
   它们应该放到已有的 editor/CLI E2E lane，先启动 `bun run electron:dev` 或
   packaged app，再跑 `bun run test:cli-e2e`。

4. **Transcribe provider route 失败**

   真实转写 probe 进入了 provider-backed 路径，但没有生成 artifact：

   ```text
   Proxy call failed for fal (API error 404: {"detail":"Application \"tts\" not found"});
   falling back to local FAL_KEY
   FAL API error 401: {"detail":"invalid key credentials"}
   ```

   命令用了 `--provider elevenlabs`，但 proxy fallback 里仍然出现 `fal` 和
   endpoint/application mismatch。把转写放进 release smoke 前，需要先修这条
   provider route。

## 真实付费 Provider 验证 - 2026-05-16

安全 survey 之后，用户要求跑真实付费命令。我跑了 3 个 provider-backed probe，
stdout/stderr/meta 记录在：

```text
output/qcut-cli-paid-20260516/results
```

产物在：

```text
output/qcut-cli-paid-20260516/artifacts
```

跑之前 `system check-keys --json` 确认：

- `QCUT_AUTH_TOKEN`: configured
- `FAL_KEY`: configured
- `ELEVENLABS_API_KEY`: configured
- `RUNWAY_API_KEY`: configured
- `ARK_API_KEY`: configured
- `IMAROUTER_API_KEY`: configured

| ID | 命令族 | 命令 | 结果 | Cost | 墙钟耗时 | 产物 / 错误 |
| --- | --- | --- | --- | ---: | ---: | --- |
| `01-gen-image` | generation/image | `gen image -t "paid smoke test small blue square icon on a clean white background" -m flux_dev --json -o output/qcut-cli-paid-20260516/artifacts/image` | 通过 | `0.003` | 7s | `flux_dev_paid-smoke-test-small-blue-square-icon-on-a-clean-white_1778965929204.jpg` |
| `02-transcribe` | analysis/transcribe | `analyze transcribe -i apps/web/src/test/e2e/fixtures/media/sample-audio.mp3 --provider elevenlabs --srt --json -o output/qcut-cli-paid-20260516/artifacts/transcribe` | 失败 | unknown / 大概率未扣费 | 2s | Proxy 访问 FAL app `tts` 404，然后本地 FAL 401 invalid credentials。 |
| `03-gen-video` | generation/video | `gen video -t "paid smoke test simple blue square icon on white background, static clean composition" -m hailuo_pro --duration 6 --json -o output/qcut-cli-paid-20260516/artifacts/video` | 通过 | `0.08` | 450s | `hailuo_pro_paid-smoke-test-simple-blue-square-icon-on-white-background_1778966429165.mp4` |

媒体检查：

| 产物 | 文件信息 |
| --- | --- |
| Image jpg | JPEG，1024x768，44 KB。人工查看：白底、柔和蓝色方块。 |
| Video mp4 | H.264 MP4，1920x1080，5.875s，226 KB，只有 video stream。 |

原始证据：

```text
output/qcut-cli-paid-20260516/results/01-gen-image.stdout.txt
output/qcut-cli-paid-20260516/results/02-transcribe.stdout.txt
output/qcut-cli-paid-20260516/results/02-transcribe.stderr.txt
output/qcut-cli-paid-20260516/results/03-gen-video.stdout.txt
```

## 推荐 Smoke Matrix

默认快速 smoke：

```bash
bun electron/native-pipeline/cli/cli.ts --help --json
bun electron/native-pipeline/cli/cli.ts gen image --help --json
bun electron/native-pipeline/cli/cli.ts list-elements --json
bun electron/native-pipeline/cli/cli.ts system models --json
bun electron/native-pipeline/cli/cli.ts system doctor --json --skip-health
bun electron/native-pipeline/cli/cli.ts system project-init --directory <tmp> --json
bun electron/native-pipeline/cli/cli.ts system project-info --directory <tmp> --json
bun electron/native-pipeline/cli/cli.ts record-daemon --status --json
bun electron/native-pipeline/cli/cli.ts vimax:list-models --json
bun electron/native-pipeline/cli/cli.ts subtitle-style --input sample.srt --preset bold --output sample.ass --json
```

Editor integration lane：

```bash
bun run electron:dev
bun run test:cli-e2e
```

Release/nightly 候选：

```bash
qcut gen image -t "small blue square icon on a clean white background" -m flux_dev --json
qcut gen video -t "one second product teaser" -m ltx23_fast_t2v --json
qcut replicate:analyze --source sample-video.mp4 --json
```

转写先不要进绿色 release lane，等上面的 provider route 问题修完再放进去。

只建议手动跑：

```bash
qcut youtube:upload -i video.mp4 -t "Manual release upload"
qcut record --record-duration 5 --output /tmp/qcut-recording-test.mp4
qcut phota:profile -i reference-photos.zip --json
```
