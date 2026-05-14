# qcut CLI 浏览器沙箱

用户在 wzrdagentstudio 里打开一个网页终端。终端连到一个预装了 `qcut` 的 E2B（Phase 1）或 Daytona（Phase 2）沙箱。用户敲 `qcut gen txt2img …`，看着它跑。输出实时回流；产物落到 Supabase Storage。

> 和 [`README.md`](README.md) 是兄弟篇。那边讲的 agent 方案是**无头、程序化**的——Supabase 插一行任务、worker 把它消化掉。这份是**交互式**的——人坐在 xterm.js 前面、手敲 `qcut …`、看输出。容器都是同一个，只是控制入口不同。

## 为什么两个入口都要

| 场景 | 无头 agent | 浏览器沙箱 |
|------|-----------|-----------|
| 批量任务——"过夜渲 200 张缩略图" | **是** | 否 |
| 上线前烟测：干净环境跑 `qcut system doctor` | 可以（但信号慢） | **是** |
| 客户演示："不用装东西、看我们当场生成视频" | 否 | **是** |
| 现场排障：客服 shell 进去对客户的项目跑 `qcut analyze --json` | 别扭 | **是** |
| 长跑、幂等、可调度 | **是** | 否 |
| 可审计、可重放 | **是** | 部分（只有 session 录制） |

沙箱入口是 agent 入口的**严格增量**。同一个 Dockerfile（[`container-setup.md`](container-setup.md)），同一个密钥加载器（[`secrets-supabase.md`](secrets-supabase.md)），同一个 `qcut` 二进制。区别只在入口向量——`agent_jobs` INSERT vs. xterm.js WebSocket。

## 范围

**做**：

- 浏览器终端 UI 嵌进 wzrdagentstudio（`@xterm/xterm`）。
- WebSocket 中继 → E2B（Phase 1）或 Daytona（Phase 2）沙箱里的 PTY。
- 沙箱镜像预装 `qcut` + 转录资产 + FFmpeg。
- 沙箱启动时按环境变量注入密钥（文件层 `~/.qcut/.env`，loader 同 agent 方案）。
- 会话 TTL、idle kill、按 workspace 的并发上限。
- 烟测脚本（`qcut system doctor`、`qcut gen txt2img --dry-run` 等），把不健康的沙箱挡在用户看到之前。

**不做**：

- Editor 命令（`qcut editor:*`）——需要 renderer 进程、不是 CLI，超范围。
- `qcut record` / `qcut youtube:upload`——依赖本地硬件 / OAuth，先 defer。
- 队列后台任务——那是 agent 方案的事，不是这里。
- 跨重连超过 30 s 的持久化沙箱——每次新连接就是新容器。

## 文档清单

| 文件 | 用途 |
|------|------|
| [`web-sandbox-README.zh.md`](web-sandbox-README.zh.md) | 本索引。 |
| [`web-sandbox-architecture.zh.md`](web-sandbox-architecture.zh.md) | 组件图、生命周期、技术选型（E2B vs Daytona 哪个更适合交互式 PTY）、`sandbox_sessions` schema、鉴权流、资源限额。 |
| [`web-sandbox-integration.zh.md`](web-sandbox-integration.zh.md) | 接到 wzrdagentstudio 的具体接线：路由、React 组件、Supabase Edge Function 拉起沙箱、WebSocket 中继形态、Cloudflare DO 选项。 |
| [`web-sandbox-verification.zh.md`](web-sandbox-verification.zh.md) | "怎么确认 qcut 真的跑起来了？"——三层烟测、退出码契约、失败模式表、CI 钩子。 |

按这个顺序读。英文对应去掉 `.zh`。

## 怎么挂到已有规划上

- **复用容器镜像**自 [`container-setup.md`](container-setup.md)。一个镜像两个入口（headless 走 `bun run agent`，interactive 走包了一层的 `bash`）。
- **复用密钥加载器**自 [`secrets-supabase.md`](secrets-supabase.md)。Option A（文件层）一字不改——沙箱启动时按 0600 写 `~/.qcut/.env`，和 agent 冷启时同形态。
- **复用 telemetry 表**自 [`architecture.md`](architecture.md)。`agent_events` 新增 `kind = 'sandbox_*'` 系列，审计"谁、何时 shell 进来、跑了什么"不需要另起一套日志路径。
- **不复用 JobProvider 模式**（来自 [`vm0-job-pipeline.md`](vm0-job-pipeline.md)）。交互会话没有 discover/claim/complete 形态——用户点一下就拉起，断开就 kill。

## 速查

```bash
# 在 wzrdagentstudio 里，用户点 "Open qcut shell"：
POST /functions/v1/sandbox-spawn
  → Edge Function 从镜像 `qcut-cli:vX` 拉起 E2B 沙箱
  → 跑探针 `qcut system doctor --json --skip-health`
  → 返回 { session_id, ws_url, expires_at }

# 浏览器打开 ws_url 接到 xterm.js：
const term = new Terminal();
const ws = new WebSocket(ws_url);
ws.binaryType = 'arraybuffer';
ws.onmessage = (e) => term.write(new Uint8Array(e.data));
term.onData((d) => ws.send(d));

# 用户敲：
$ qcut system doctor
✓ Bun 1.3.10
✓ FFmpeg 6.1.1
✓ ~/.qcut/.env loaded (8 keys)
✓ Network: FAL reachable
$ qcut gen txt2img --provider fal --prompt "a red panda" --skip-health --json
{ "status": "ok", "outputPath": "/tmp/abc.png", "cost": 0.011 }
```

完整 UX 就这样。这个文件夹里剩下的文档讲怎么把它做得便宜、安全、可观测。

## 相关文档

- [`README.md`](README.md) —— 无头 agent 方案总索引
- [`container-setup.md`](container-setup.md) —— 复用的 Dockerfile
- [`secrets-supabase.md`](secrets-supabase.md) —— 启动时的密钥注入
- [`architecture.md`](architecture.md) —— 这里引用到的 `agent_events` schema 和退出码契约
- `/Users/peter/Desktop/code/wzrdagentstudio/` —— 终端 UI 宿主的 React+Vite 应用
