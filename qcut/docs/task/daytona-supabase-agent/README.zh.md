# Daytona + Supabase Agent

在 Daytona 沙盒容器里运行 QCut 的非 editor CLI（`gen`、`analyze`、`edit`、`flow`、`system`、`youtube:upload`），用 Supabase 作为密钥、任务、产物的控制面。

## 目标

无界面、容器化地执行 QCut 流水线——不需要 Electron，不需要 GUI。适合批量 agent、定时任务、按租户隔离的场景。

## 范围

**包含**——不需要 editor 在线的纯 CLI 命令：

- `gen image / video / avatar / speech`
- `analyze video / transcribe / query / translate`
- `edit autoclip / upscale / motion / subtitle`
- `flow run / idea2video / script2video / novel2movie`
- `system models / cost / set-key / check-keys / project-*`
- `youtube:upload`

**排除**——任何依赖 Electron 渲染进程状态的命令：

- `editor:*`（timeline、media、project、export、UI 等）
- `record*`（会拉起隐藏的 Electron 录制器）
- `edit:remotion`（绑定 Electron）

## 文档清单

核心规划（无头 agent）：

| 文件 | 内容 |
|------|------|
| [architecture.zh.md](core-plan/architecture.zh.md) | 系统图：Supabase ↔ Daytona ↔ CLI。任务生命周期、事件流、失败模式 |
| [container-setup.zh.md](core-plan/container-setup.zh.md) | Dockerfile、Daytona devcontainer 配置、构建步骤、运行时依赖 |
| [secrets-supabase.zh.md](core-plan/secrets-supabase.zh.md) | API key 表结构、密钥加载脚本、三种优先级策略 |

vm0 参考分析（来自 [vm0-ai/vm0](https://github.com/vm0-ai/vm0) 的经验）：

| 文件 | 内容 |
|------|------|
| [vm0-overview.zh.md](vm0-reference/overview.zh.md) | 整体对比、仓库布局、哪些值得搬 / 推迟 / 跳过 |
| [vm0-sandbox.zh.md](vm0-reference/sandbox.zh.md) | Firecracker microVM + NBD COW + netns 池；我们为啥继续用容器 |
| [vm0-job-pipeline.zh.md](vm0-reference/job-pipeline.zh.md) | JobProvider trait、推拉发现、guest-agent 模块全景 |
| [vm0-secrets-proxy.zh.md](vm0-reference/secrets-proxy.zh.md) | mitmproxy 凭证注入、防火墙规则、回港分阶段 |

浏览器沙箱扩展（wzrdagentstudio 里的交互式入口）：

| 文件 | 内容 |
|------|------|
| [web-sandbox-README.zh.md](web-sandbox/README.zh.md) | 索引：人从网页 shell 进沙箱；为啥要这条路 + agent 路两套都留 |
| [web-sandbox-architecture.zh.md](web-sandbox/architecture.zh.md) | xterm.js → 中继 → E2B/Daytona PTY。`sandbox_sessions` schema、生命周期、限额 |
| [web-sandbox-integration.zh.md](web-sandbox/integration.zh.md) | 接进 wzrdagentstudio + Supabase Edge Function + Cloudflare DO 中继的具体接线 |
| [web-sandbox-verification.zh.md](web-sandbox/verification.zh.md) | 三层烟测脚本、退出码契约、失败模式表、CI 钩子 |

实现计划（PR 级规约，可直接喂给 `/implementit`）：

| 文件 | 内容 |
|------|------|
| [implementation/README.zh.md](implementation/README.zh.md) | 索引：Phase 1（无头）和 Phase 2（浏览器沙箱）共 9 份 PR 规约、统一约定、不覆盖的部分 |
| [implementation/01-system-doctor.zh.md](implementation/01-system-doctor.zh.md) —— [05-daytona-devcontainer.zh.md](implementation/05-daytona-devcontainer.zh.md) | Phase 1：doctor 命令、容器镜像、Supabase schema、agent-worker、Daytona devcontainer |
| [implementation/06-sandbox-sessions-schema.zh.md](implementation/06-sandbox-sessions-schema.zh.md) —— [09-wzrd-terminal-ui.zh.md](implementation/09-wzrd-terminal-ui.zh.md) | Phase 2：`sandbox_sessions` 表、`/sandbox-spawn` Edge Function、Cloudflare DO 中继、wzrdagentstudio xterm.js UI |

## 快速参考

```bash
# 容器内，secrets 已加载到 ~/.qcut/.env 后：
qcut flow run \
  -c /workspace/pipelines/idea-to-clip.yaml \
  --input "A detective in 1920s Paris" \
  --skip-health \
  --no-confirm \
  --stream --json \
  -o /output
```

- `--skip-health`：跳过 editor 健康探测（容器里没有 editor）。
- `--stream --json`：stdout 是最终信封，stderr 是 JSONL 进度事件，可推到 Supabase Realtime。
- 退出码驱动重试策略：`4` = 缺密钥，`5` = API 失败，`9` = 超时。

## 状态

规划阶段。尚无代码提交。各 md 末尾的 Open questions 是后续讨论收敛点。
