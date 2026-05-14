# vm0 任务管道

一个任务怎么从控制面走到 VM、再走回来。源码：`crates/runner/src/provider/`、`crates/ably-subscriber/`、`crates/guest-agent/`。

## 一句话

vm0 把任务生命周期分给三个角色，彼此契约干净：

```
控制面          ─push─▶  runner（宿主）   ─vsock─▶  guest-agent（VM 内）
（web/api）             ▲                              │
       ▲                │                              │
       └──── HTTP ──────┴────── telemetry / 心跳 ──────┘
```

契约一边是 Rust 的 `JobProvider` trait，另一边是 vsock 命令集。任一边都能换掉而不影响 executor。

## `JobProvider` trait —— 核心抽象

来自 `crates/runner/src/provider/mod.rs`：

```rust
#[async_trait]
pub trait JobProvider: Send + Sync {
    async fn discover(&self) -> Option<JobCandidate>;     // 可取消
    async fn claim(&self, candidate: JobCandidate) -> Option<ExecutionContext>;  // 不可取消
    async fn complete(&self, run_id, exit_code, error, sandbox_id, reuse_result);
    async fn heartbeat(&self, state: &HeartbeatState);
    async fn set_held_sessions(&self, _sessions: Vec<String>);
    async fn shutdown(&self);
}
```

两个设计点值得抄：

1. **`discover` 和 `claim` 分开。** `discover` 可以在任何 await 点取消（主循环用 `select!` 监听 shutdown 信号）。`claim` 不可取消——一旦开始就必须走完或报错，绝不无声丢弃。这保证每次成功 claim 都有对应的 `complete`。我们 worker 也该这样：claim 必须在显式不可取消的 async 块里跑。
2. **实现可互换。** vm0 有三种：
   - `api::ApiProvider` —— HTTP 轮询控制面 API。
   - `api_ably_supervisor::ApiAblyProvider` —— 同上，但用 Ably WebSocket 推送做唤醒，只在有活时才发 HTTP。
   - `local::LocalProvider` —— 读目录里的 JSON 文件。`runner local` 开发模式用。
   - `mock::MockProvider`（仅测试）—— 确定性队列，集成测试用。

   对我们：`SupabaseQueueProvider`、`SupabaseRealtimeProvider`、`LocalFileProvider`。同样形态；worker 其余部分不知道谁在跑。

## 发现：拉、推、还是混合

### 纯拉（`api::ApiProvider`）

30 秒级 HTTP 轮询问"有活吗"。简单稳健，延迟 = 轮询间隔。

### 推+拉（`api_ably_supervisor::ApiAblyProvider`）

Supervisor 长连一个 Ably WebSocket。控制面决定给某个 runner 派活时，往这个 runner 的 channel 发通知。Supervisor 收到就唤醒 discover future，由它发一次 HTTP 拉真正的任务体（Ably 只传唤醒信号，不传 payload）。

我们 Supabase 端**正好按这个形态搬**：订阅 `agent_jobs:workspace_id=eq.<id>` 的 INSERT（Realtime），收到事件后发一次 `SELECT … FOR UPDATE SKIP LOCKED` 认领。Realtime 是 Ably 的角色，SQL 是 HTTP API 的角色。

`api_ably_supervisor.rs` 那 1.4k 行主要是：

- 带退避的重连（网络抖动不丢认领顺序）。
- Token 刷新（Ably token TTL）。
- "Held sessions" —— 亲和性 token，让同一 runner 接续同会话的后续任务。

重连+token 刷新 `@supabase/supabase-js` 免费给你。会话亲和我们暂时不需要（QCut 任务没多轮对话）。

### 本地文件队列（`local::LocalProvider`）

开发用。runner 监视目录；丢个 `*.json` 文件就入队。我们也该有——`qcut-agent local-run path/to/job.json` 完全跳过 Supabase。集成测试和离线调试瞬间变简单。

## Runner 主循环

大致这样（基于 `runner/src/main.rs` + `executor.rs`）：

```rust
loop {
    select! {
        candidate = provider.discover() => {                // 可取消
            if let Some(c) = candidate {
                let ctx = provider.claim(c).await;          // 不可取消
                if let Some(ctx) = ctx {
                    let sandbox = factory.create_or_reuse(&ctx).await?;
                    spawn(execute(sandbox, ctx, provider.clone()));  // 后台
                }
            }
        }
        _ = shutdown_signal() => break,
        _ = heartbeat_tick() => provider.heartbeat(&state).await,
    }
}
```

值得借鉴：

- **并发执行、单点认领。** `claim` 在主循环内 await，避免一次认两个、后来发现塞不下。`execute` 用 `spawn` 起后台，多任务并行。
- **心跳 fire-and-forget。** 失败只记日志、不重试。控制面 N 次心跳缺失就判定 runner 死，不需要 at-least-once。
- **shutdown 信号到处都传。** `discover` 里每个 await 点都靠取消传递 shutdown，不靠 flag。

## guest-agent —— VM 里跑什么

从 `crates/guest-agent/src/lib.rs` 看，模块名就讲完了故事：

| 模块             | 角色                                                                              |
|------------------|-----------------------------------------------------------------------------------|
| `cli`            | 起实际 CLI 二进制（Claude / Codex / mock），接 stdin/stdout                      |
| `heartbeat`      | 每几秒发"还活着 + 用了多少 token"                                                |
| `telemetry`      | 缓冲并上传结构化事件                                                              |
| `events`         | 模块间内部事件总线                                                                |
| `checkpoint`     | 任务中途打 VM checkpoint，崩溃后可恢复                                            |
| `complete`       | 组装最终 `ExecResult`，上传产物                                                   |
| `artifact`       | 跟踪 CLI 写入的文件并送出                                                         |
| `masker`         | 日志里抹掉密钥（token 串、key 前缀）                                              |
| `metrics`        | CPU/RAM/disk 采样，进资源预算表                                                   |
| `session_history`| 记完整 session，便于重放/调试                                                     |
| `codex_auth`     | 专门处理 Codex 的 OAuth 刷新（因为它 CLI 自己处理）                              |
| `content_hash`   | 输出哈希，用于去重/缓存复用                                                       |
| `timing`         | 步骤级时间桶                                                                      |
| `paths`/`env`    | VM 内文件系统和环境变量约定                                                       |
| `http`           | 知道 VM 内代理的 HTTP 客户端                                                      |

对我们的 worker（没 VM，只是容器进程），多数模块塌缩：

| vm0                           | 我们的等价物                                                            |
|-------------------------------|-------------------------------------------------------------------------|
| `cli` spawn                   | `entrypoint.ts` 里 `child_process.spawn("qcut", [...])`                 |
| `heartbeat`                   | 每 10 s `UPDATE agent_jobs SET last_seen_at = now()`                    |
| `telemetry` + `events`        | CLI stderr JSONL 管道 → `agent_events`                                  |
| `checkpoint`                  | 跳过（容器重跑便宜，checkpoint 增加复杂度）                              |
| `complete`                    | 插 `agent_artifacts`，置 `agent_jobs.status = succeeded`                |
| `artifact`                    | 把 `data.outputPath` 传到 Supabase Storage                              |
| `masker`                      | 日志前过滤 `*_KEY` / `*_TOKEN`                                          |
| `metrics`                     | Daytona / cAdvisor 容器指标                                              |
| `content_hash`                | v0 跳过                                                                  |

**masker 模块大约 100 行，值得整段抄过来**——扫描日志行匹配已知密钥模式（`sk-…`、`xoxb-…`、JWT 格式）、替换成 `***`。我们同样有这风险：流水线配错可能把 key 喷进 `agent_events`。

## 心跳 / 存活模型

vm0 的心跳带状态，不只是 tick。trait 上：

```rust
async fn heartbeat(&self, state: &HeartbeatState);
```

`HeartbeatState` 包括当前持有的 sandbox 列表、RAM headroom、队列深度。控制面据此能聪明调度：别把重任务发给已经满载的 runner。

我们对应一张 `agent_runners`：

```sql
create table agent_runners (
  id            uuid primary key,
  workspace_id  uuid not null,
  last_seen_at  timestamptz not null default now(),
  capacity      jsonb not null,        -- { "cpu_pct": 30, "mem_mb": 1024, "active_jobs": 1 }
  version       text                    -- agent 二进制版本，金丝雀用
);
```

任务派发器（Edge Function 或 psql trigger）在发 Realtime 推送前读 `agent_runners`，只唤醒能接活的 runner。

这是 **Phase 2**。Phase 1 就轮询 + Postgres `FOR UPDATE SKIP LOCKED` 仲裁。

## 完成语义

`provider.complete()` 是 `claim()` 后唯一的写操作。携带：

- `exit_code`（整数）
- `error: Option<&str>`
- `sandbox_id`（哪台 VM 跑的——调试用）
- `reuse_result`（VM 是热复用还是新建——统计用）

值得注意：**没有** "started" 或 "running" 状态更新。`claim` 蕴含 running；`complete` 蕴含完成。中间进度走 telemetry 通道（带外），不走状态机迁移。

我们也该照做。`agent_jobs.status` 终态只有三种：`succeeded`、`failed`、`cancelled`，加 `queued`。`running` 是瞬态——"已认领未完成"。进度走 `agent_events`，不进 `agent_jobs`。

## 映射到我们 schema

| vm0                                        | 我们的表                                                        |
|--------------------------------------------|-----------------------------------------------------------------|
| 任务发现推送                                | Supabase Realtime 监听 `agent_jobs` INSERT                      |
| `JobCandidate.run_id`                      | `agent_jobs.id`（uuid）                                         |
| `JobCandidate.profile_name`                | `agent_jobs.workspace_id` + pipeline 类型                       |
| `ExecutionContext`                         | `agent_jobs` join 密钥（认领时解析）                            |
| `provider.heartbeat`                       | UPDATE `agent_runners.last_seen_at` + capacity jsonb            |
| `provider.complete(exit_code, error)`      | UPDATE `agent_jobs SET status, exit_code, error, finished_at`   |
| `guest-agent.telemetry`                    | INSERT `agent_events`（批量）                                   |
| `guest-agent.artifact`                     | Storage 上传后 INSERT `agent_artifacts`                         |
| `guest-agent.masker`                       | 同上——正则集直接抄                                              |

## vm0 做了但我们（现在）不该做的

- **per-job sandbox 复用。** vm0 的 `reuse_result` 允许暖 VM 接续同 session 的下个任务。我们没有多轮任务。
- **Held-session 亲和性。** 同上。
- **任务中途 checkpoint。** 容器从 checkpoint 重启脆弱；< 30 分钟的任务从头重跑更便宜。
- **Telemetry 走独立云槽。** `agent_events` 表撑到 100M 行没问题；之后再分。

## 相关文档

- [`vm0-overview.zh.md`](vm0-overview.zh.md) —— 全景对比
- [`vm0-sandbox.zh.md`](vm0-sandbox.zh.md) —— 此管道驱动的 VM 生命周期
- [`vm0-secrets-proxy.zh.md`](vm0-secrets-proxy.zh.md) —— 任务执行时 mitmproxy 在干嘛
- `vm0/crates/runner/src/provider/mod.rs` —— JobProvider trait
- `vm0/crates/runner/src/provider/api_ably_supervisor.rs` —— 推+拉 supervisor（1.4k 行）
- `vm0/crates/guest-agent/src/lib.rs` —— VM 内模块清单
