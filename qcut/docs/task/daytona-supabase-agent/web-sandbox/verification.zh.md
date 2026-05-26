# 验证沙箱里的 qcut 能跑

"make sure qcut cli runs"——具体烟测脚本、退出码契约、失败模式表、CI 钩子。

## 验证三层

三层、各自节奏、各管一类失败。

| 层 | 何时 | 抓什么 |
|----|------|--------|
| 镜像构建烟测 | CI 构建 `qcut-cli` 镜像时 | 二进制丢、FFmpeg 坏、postinstall 挂 |
| 沙箱启动探针 | 每次把沙箱亮给用户**之前** | env 不对、密钥缺、provider 漂移 |
| 用户交互检查 | 每次会话第一个 prompt | 该 workspace 的 provider 鉴权/配额 |

每层 < 10 s 完成，且把结构化行写进 `agent_events`，dashboard 上一眼能看到回归。

## Layer 1 —— 镜像构建烟测

跑在打包推 `qcut-cli:vX` 镜像的 CI 流水线上。镜像构建完，临时起一个容器跑：

```bash
#!/usr/bin/env bash
# qcut-cli/smoke.sh
set -euo pipefail
qcut --version                                  # 二进制在
qcut system doctor --json                       # env、FFmpeg、路径都对
ffmpeg -version | head -n 1                     # FFmpeg 真能跑
node -e 'require("sharp")' 2>&1 | head -n 1     # native 依赖加载
bun --version
```

任一行非零退出就 fail 构建。CI 调用：`docker run --rm qcut-cli:vX /smoke.sh`。

它**抓不到**：

- 缺 API key（没 key 烧进镜像——这是对的）。
- 网络出站问题（测试容器是离线的）。
- 沙箱 provider 特有的 PTY 行为。

下两层管。

## Layer 2 —— 沙箱启动探针

跑在 Spawn Edge Function 里，沙箱起来之后、WS URL 返回浏览器**之前**。从 [`web-sandbox-integration.zh.md`](integration.zh.md)：

```typescript
const probe = await sandbox.commands.run('qcut system doctor --json --skip-health', {
  timeoutMs: 8_000,
});
if (probe.exitCode !== 0) {
  await sandbox.kill();
  return new Response('sandbox_unhealthy', { status: 502 });
}
```

探针契约：

- < 8 s 完成。
- stdout 一个 JSON 对象。
- `status: "ok"`。
- 确认 `~/.qcut/.env` 加载了、key 数量 > 0。

挂在这一层意思是**镜像 OK 但该 workspace 的沙箱用不了**——几乎都是密钥问题（必填 key 缺、文件权限不对、解密失败）。用户看到的是清晰的"沙箱初始化失败——检查 API key"，不是死掉的终端。

`--skip-health` 很重要：探针阶段 doctor 不能调外部 provider——那是外部 SLO 依赖，不是 CLI 烟测。网络可达性是另一回事，等用户敲第一个真命令时再懒查。

## Layer 3 —— 用户交互检查

WS 一接上，中继在把控制权交给 `bash` 前往终端写一段：

```
qcut sandbox · workspace acme-prod · session expires 14:32 UTC
type 'qcut system doctor' to verify all providers are reachable
type 'qcut --help' for command reference
```

是提示、不是 gate。Layer 2 已经判定会话健康；只是引导用户在干活前跑一次走网络的深 doctor。

`qcut system doctor`（不加 `--skip-health`）对每个注册 provider 发一个小 ping：

- FAL：`GET /v1/models`
- Gemini：`GET /v1beta/models`
- OpenRouter：`GET /api/v1/auth/key`
- ElevenLabs：`GET /v1/user`
- Anthropic：`POST /v1/messages` 带 `max_tokens=1`

每条结果一行 `agent_events`，`kind = 'doctor_probe'`、`payload = { provider, latency_ms, status }`。Dashboard "provider 健康" 小部件也是吃这张表，不另起监控路径。

## 怎么算"qcut 跑得起来"

会话端到端验证通过 = 下面**三条全过**：

1. **启动探针**（Layer 2）—— `qcut system doctor --json --skip-health` 退出 0。
2. **平凡生成** —— `qcut gen txt2img --provider fal --prompt 'red panda' --skip-health --dry-run --json` 退出 0、`outputPath` 非空（`--dry-run` 时不真发 API；这检查路由和参数校验）。
3. **JSON 契约** —— 加了 `--json` 的每行输出都能 parse 成 JSON、且有 `status` 字段。绕过 JSON 契约往 stdout 喷的乱字符就是回归。

三条都短（每条 < 5 s），CI 里能无人值守跑。

## 退出码契约

CLI 承诺这些退出码；CI 据此 gate。（呼应 [`architecture.md`](../core-plan/architecture.md)，因为 Layer 1/2 脚本明确依赖这些。）

| 码 | 含义 | 可重试 |
|----|------|--------|
| 0  | 成功 | n/a |
| 1  | 通用失败 | 看消息 |
| 2  | 参数错 | 否 |
| 3  | 凭证缺/坏 | 否（改 `.env`） |
| 4  | 网络不通 | 是 |
| 5  | Provider 5xx | 是 |
| 6  | Provider 4xx（限流） | 是，退避后 |
| 7  | Provider 4xx（鉴权/配额） | 否 |
| 8  | 超时（CLI 侧） | 是 |
| 9  | 本地 FS 错 | 看情况 |
| 10 | 内部 panic | 否（提 bug） |

## 失败模式表

| 表象 | 最可能原因 | 速查 | 修法 |
|------|-----------|------|------|
| `qcut: command not found` | 镜像构建挂 | 重跑 Layer 1 | 回滚镜像 tag |
| Doctor 退 3 | workspace 无密钥 | `select count(*) from agent_secrets where workspace_id=$1` | 设置 UI 加 key |
| Doctor 退 4 | 出站被堵 / DNS | 沙箱里 `curl -sS https://1.1.1.1` | provider 故障；露出 + 重试 |
| FAL 那行 Doctor 退 7 | key 已撤销 | 上 FAL 后台 | 轮换 key；UPDATE 行 |
| WS 连上但卡住 | 中继 PTY 管道丢帧 | Durable Object 日志 | 加 buffer；stdin 退避 |
| `--json` 往 stdout 吐非 JSON | 某库写错通道 | 本地 `bun run pipeline`，找回归 | 隔离吵库；PR |
| 短命令也退 8 | 沙箱镜像冷启 | Layer 2 延迟日志 | 镜像 warm pool，或接受首调延迟 |
| `cannot create file '~/.qcut/.env'` | 镜像非 root、home 不可写 | 探针里跑 `id` | 改 Dockerfile USER / chown $HOME |
| FFmpeg 报 "Permission denied" | 镜像在不同 arch / glibc 上烤 | `file $(which ffmpeg)` | 按目标 arch 重建镜像 |
| 沙箱 5 分钟被杀 | idle 在长生成期间触发 | 看 `last_input_at` | 调高 idle 阈值，或 CLI 流式打 keepalive |

## 人工验证（一次性）

值班的人想确认"现在这个沙箱健康吗"：

```bash
# 从手头有 service role JWT 的机器
SESSION=$(curl -s -X POST "$SPAWN_URL" \
  -H "Authorization: Bearer $SR_JWT" \
  -d '{"workspace_id":"<id>","resource_class":"standard"}' | jq -r .session_id)

# 追审计行
psql "$DATABASE_URL" -c "
  select kind, payload from agent_events
  where session_id='$SESSION'
  order by created_at limit 20"
```

期望按顺序看到：`spawn_started`、`spawn_probe_ok`、`pty_attached`、`motd_sent`。`spawn_probe_ok` 没了 = 镜像坏；`pty_attached` 没了 = 中继坏；两个都有但用户说终端黑——浏览器侧掉了，看 `WebSocket` 控制台报错。

## CI 集成

`.github/workflows/sandbox-smoke.yml`（骨架）：

```yaml
name: Sandbox smoke
on:
  schedule: [{ cron: '0 */6 * * *' }]            # 每 6 小时
  workflow_dispatch:
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - run: |
          SESSION=$(curl -fsS -X POST "$SPAWN_URL" \
            -H "Authorization: Bearer $SR_JWT" \
            -d '{"workspace_id":"$SMOKE_WS","resource_class":"standard"}' | jq -r .session_id)
          bun run scripts/sandbox-exec.ts "$SESSION" 'qcut system doctor --json'
          bun run scripts/sandbox-exec.ts "$SESSION" \
            'qcut gen txt2img --provider fal --prompt smoke --skip-health --dry-run --json'
```

`scripts/sandbox-exec.ts` 是个小骨架：对活会话调 `sandbox.commands.run`、抓退出码 + stdout。失败告警走 agent 路径同一个 channel——"沙箱面挂了" 一个信号、不两个。

## "完工"定义

沙箱功能可以上线，当：

- 三层在 CI 连续两次部署都绿。
- 24 小时窗口内启动探针 p95 延迟 < 6 s。
- `agent_events` 审计行都按文档化的 kind 出现（没有 null 或意外 kind）。
- "失败模式表" 每一行都有 runbook 条目，哪怕只是一段 wiki。

四条没全到位之前，按 feature flag beta 发。全部到位后，按 workspace 套餐档位默认开。

## 相关文档

- [`web-sandbox-architecture.zh.md`](architecture.zh.md) —— 验证的是什么
- [`web-sandbox-integration.zh.md`](integration.zh.md) —— 探针接在哪
- [`architecture.md`](../core-plan/architecture.md) —— 上面引用的退出码和 `agent_events` schema
