# Phase E 证据 — 性能与 CI

> 路径占位符：`$EVIDENCE_ROOT` = 本机证据目录（`~/Desktop/QCut-Compose-Labs-E2E-2026-08-31`）；`$REPO_ROOT` = 本仓库检出根。大文件不入 Git，仅存本机。

日期：2026-08-31 · Apple M4 Pro · QCut Desktop `bun run electron`（editable worktree）

## 30 秒功能门禁

Phase D 的 29s 全组合配方即功能门禁（见 `../2026-08-31-phase-d/`）：创建→apply→重启→导出全链路，帧/音频证据齐备。

## 80 秒 benchmark（对照 PR #441 优化基线）

配方 `benchmark-config.json`：zh-final 0–40s + en-final 0–40s + 0.5s crossfade，经 `compose project --target editor` 建为可编辑工程后 `--engine muxer` 导出（与 #441 基线同引擎、同规格 1080p30、同量级 80s）。

计时口径：**job 墙钟** = 导出 job 的 `startedAt→completedAt`（与 PR #441 基线同口径，即下表与 `benchmark-summary.json` 的 `jobWallSeconds`）；`benchmark-times.txt` 里的 `wall≈15.2s` 是 **CLI 全程墙钟**（含提交、~1s 轮询间隔与进程启动开销），两者相差恒定 ~2.6s，不参与基线对比。

| run | job 墙钟 | ≈fps | realtime |
|---|---|---|---|
| 1 | 12.689s | 188 | 6.27× |
| 2 | 12.449s | 192 | 6.39× |
| 3 | 12.422s | 192 | 6.40× |

PR #441 优化基线（同机同引擎）：12.50 / 12.47 / 12.49s。**结论：可编辑工程管线导出性能与基线持平，本任务的 renderer 改动（filterStack 层链、read-back 序列化等）在无栈时间线上零回归**（禁用态均为布尔早退）。

本机大文件：`$EVIDENCE_ROOT/editable-phase-e/`（benchmark-run{1,2,3}.mp4 + 日志）。

## 三平台 CI

`ci.yml` 仅在 base 为 master 的 PR 触发；本分支 PR #443 stacked 在 `codex/compose-labs-complete`（PR #441）上，故矩阵未触发。已就绪的替代证据：

- 本地全量：electron 套件 3401 passed、editor-core 842 passed、apps/web 相关套件 352+ passed；`tsc --noEmit` electron / apps/web / editor-core / jianying-draft-export 全 0 错；biome 对全部改动文件干净。
- **#441 合并后行动项**：retarget PR #443 base → master 并 rebase，矩阵将自动运行；届时 triage 全部 PR comments（当前仅 bot 跳过通知）。

## 本阶段修复

- 显式 `--engine muxer` 的导出请求现在会路由到 renderer（此前无 renderer 强制特征的时间线会被 native 路径拒绝）。
