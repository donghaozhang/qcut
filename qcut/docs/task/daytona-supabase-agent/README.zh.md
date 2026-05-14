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

| 文件 | 内容 |
|------|------|
| [architecture.zh.md](architecture.zh.md) | 系统图：Supabase ↔ Daytona ↔ CLI。任务生命周期、事件流、失败模式 |
| [container-setup.zh.md](container-setup.zh.md) | Dockerfile、Daytona devcontainer 配置、构建步骤、运行时依赖 |
| [secrets-supabase.zh.md](secrets-supabase.zh.md) | API key 表结构、密钥加载脚本、三种优先级策略 |

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
