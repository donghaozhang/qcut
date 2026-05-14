# Web 沙箱架构

wzrdagentstudio 里一下点击怎么变成一个活的 `qcut` shell。配 [`web-sandbox-README.zh.md`](README.zh.md) 读。

## 一句话

```
[浏览器]                   [Spawn API]            [WS 中继]               [沙箱 PTY]
xterm.js  ──HTTPS POST──▶  Supabase Edge ──▶  Cloudflare Worker  ──▶  E2B / Daytona
   ▲                          │                       │                       │
   │                          ▼                       │                       │
   │                       sandbox_sessions 行        │                       │
   └────────────── WebSocket（双向）─────────────────┴──── shell stdout/stderr
```

四个零件。每一个都能换，互不影响。

## 组件

### 1. 浏览器终端

`@xterm/xterm`（v5+）+ `@xterm/addon-fit` + `@xterm/addon-web-links`。React 包装位于 `src/features/qcut-sandbox/components/TerminalView.tsx`。挂在受 Supabase auth 保护的路由上。

终端啥也不持有，就是按键和 WebSocket 之间的笨水管。客户端不解析命令、不存历史（PTY 自己管）、不补全（`qcut --help` 自己管）。

### 2. Spawn API

Supabase Edge Function（Deno）`/sandbox-spawn`：

1. 校验调用者 JWT 和 workspace 成员资格。
2. 检查 workspace 并发上限。
3. 读 workspace 密钥（同 agent 路径的查询）。
4. 调 provider SDK 从 `qcut-cli:vX` 镜像创建沙箱、注入 env vars。
5. 跑 spawn-probe（见 [`web-sandbox-verification.zh.md`](verification.zh.md) Layer 2）。不过就中止。
6. 插一行 `sandbox_sessions`。
7. 返回 `{ session_id, ws_url, expires_at }`。

控制在 100 行以下。**不**代理 shell——那是中继的活。

### 3. WebSocket 中继

Edge Function 撑不起长连 WebSocket（Deno isolate 超时）。中继得是单独进程——Cloudflare Worker + Durable Object。它只干：

1. 用 Spawn API 签的短期 token 校验 WS。
2. 通过 provider SDK 在目标沙箱里开个 PTY。
3. 双向转字节。
4. 客户端断开就 kill PTY；PTY 退出就关 WS。
5. 每个 input/output 块（按采样）打到 `agent_events` 做审计，过密钥 mask。

状态：极简。Durable Object 持活的 socket pair，啥也不落盘。

### 4. 沙箱 PTY

E2B 或 Daytona 提供。从中继收 stdin、吐 stdout/stderr。镜像就是 [`container-setup.md`](../core-plan/container-setup.md) 那份 Dockerfile。交互用途下，CMD 从 `bun run agent` 换成 `bash`（中继创建 PTY 时指定）。

`~/.qcut/.env` 在沙箱启动时由 `entrypoint.sh` 物化：读 Spawn API 注入的 env vars、按 0600 写文件——逻辑同 [`secrets-supabase.md`](../core-plan/secrets-supabase.md) Option A。

## Provider 选型：E2B vs Daytona

|                                  | E2B                                   | Daytona                                   |
|----------------------------------|---------------------------------------|-------------------------------------------|
| 内建 PTY + WS                    | **是**                                | 否（要自己写 `node-pty` + 中继）           |
| 启动时间                          | ~3 s（warm pool）                     | ~10 s（容器启动）                         |
| 自定义 Docker 镜像                | 是（推 registry）                     | 是（Daytona registry）                    |
| 按秒计费                          | 是                                    | 是                                        |
| 自托管选项                        | OSS 有但不维护                         | 是（Daytona 全栈可自托管）                  |
| TS SDK 质量                       | 一等公民                              | 一等公民                                   |
| 已经在规划里                      | 否                                    | **是**——agent 路径用 Daytona               |
| 阶段                              | **Phase 1**（MVP 快）                 | Phase 2（合栈）                            |

先上 E2B，因为它的 PTY-over-WS 现成、不用自己写中继。等中继支持 Daytona 之后再迁过去——届时 agent 和 sandbox 两条路就端到端共享基建了。

## 会话生命周期

```
   POST /sandbox-spawn
        │
        ▼
   ┌──────────┐
   │ spawning │  （provider 沙箱启动 + probe 跑中）
   └────┬─────┘
        │ probe ok
        ▼
   ┌──────────┐
   │  active  │  （浏览器已连、用户敲键）
   └────┬─────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
disconnect  idle_timeout / ttl
   │         │
   └────┬────┘
        ▼
   ┌──────────┐
   │ stopping │  （provider kill 进行中）
   └────┬─────┘
        ▼
   ┌──────────┐
   │  ended   │  （终态，行保留做审计/账单）
   └──────────┘
```

要点：

- **没有 "running" 态。** active 就是 PTY 存在且可达。"用户在敲" 和 "用户去倒咖啡" 不区分。
- **两条 kill 路径**：显式断开，或两个定时器之一——idle（5 分钟无输入）和 TTL（30 分钟墙钟）。TTL 是硬上限，idle 是礼貌清理。
- **行结束后保留。** 账单和审计要。一行 < 1 KB，不肉痛。

## Schema：`sandbox_sessions`

```sql
create table sandbox_sessions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id),
  user_id             uuid not null references auth.users(id),
  status              text not null check (status in ('spawning','active','stopping','ended')),
  provider            text not null check (provider in ('e2b','daytona')),
  provider_session_id text not null,
  image_tag           text not null,                       -- 比如 'qcut-cli:v0.3.2'
  started_at          timestamptz not null default now(),
  last_input_at       timestamptz,
  ended_at            timestamptz,
  end_reason          text check (end_reason in ('disconnect','idle_timeout','ttl','error','user_kill')),
  exit_code           int,
  resource_class      text not null default 'standard',    -- standard | large
  expires_at          timestamptz not null
);

create index on sandbox_sessions (workspace_id, status) where status in ('spawning','active');
create index on sandbox_sessions (expires_at) where status in ('spawning','active');
```

RLS：workspace 成员能 SELECT 自家行；只有 service role 能 INSERT/UPDATE。

## 鉴权流

1. 用户走现有 Supabase Auth 登录 wzrdagentstudio。
2. 浏览器带 Supabase JWT 调 `/sandbox-spawn`。
3. Spawn API 校验 JWT，从 `app_metadata` 取 workspace_id，校验成员资格。
4. Spawn API 另签一个短期（5 min）HS256 token，密钥是中继侧的。payload：`{ session_id, exp }`。
5. 浏览器带这个 token 作为 query param（或 `Sec-WebSocket-Protocol`）连 WS。
6. 中继校验 token、从 `sandbox_sessions` 加载行、开 PTY、转字节。

为什么单独签 token：中继在 Supabase 之外。我们不想在中继热路径里校 Supabase JWT。Spawn API 把门，中继快转字节。

## 资源限额

每沙箱：

| 资源 | Standard | Large |
|------|----------|-------|
| vCPU | 2        | 4     |
| 内存 | 4 GB     | 8 GB  |
| 磁盘 | 10 GB    | 20 GB |
| 出站带宽 | 10 GB / 会话 | 25 GB |
| 墙钟上限 | 30 min | 60 min |
| Idle kill | 5 min | 5 min |

每 workspace：

- 同时最多 **3 个 active 会话**。第 4 个 `/sandbox-spawn` 返回 429，直到有一个排空。
- 每日花费上限（job + sandbox 合并），spawn 前校。

`large` 给类似 `qcut analyze` 在大项目上跑的活。用户在 dropdown 选；按 workspace 套餐档位放行。

## 失败模式

| 失败 | 表现 | 恢复 |
|------|------|------|
| Provider 满负荷 | `/sandbox-spawn` 503 | 弹 "稍后再试"；**不自动重试**（会双扣费） |
| 镜像拉取失败 | spawn 60 s 超时 | 行标 `ended/error`，告警 |
| Spawn probe 失败 | spawn 返 502 | 多半是 workspace 缺密钥；露出配置 UI |
| 会话中 WS 断 | xterm 显 "disconnected" | 用户点重连；中继 30 s 内能重绑同一 PTY |
| 用户关 tab | idle 定时器最终触发 | 会话进 `idle_timeout` 被 kill |
| qcut 二进制丢/坏 | 第一行提示 `qcut: command not found` | Layer 2 在用户看到前就挡掉 |
| 输入里漏 token | masker 改写成 `***` 后再插审计 | 复用 [`vm0-job-pipeline.zh.md`](../vm0-reference/job-pipeline.zh.md) 里的 masker 模块 |

## 我们**不**做的

- **跨重连超过 30 s 的持久化。** 断了就是断了。长任务走 agent 路径，不走这里。
- **多人共享同一个 shell。** 单用户单会话。协作直播是另一个产品。
- **终端上面套自定义 command palette / GUI。** 终端就是 UI。如果要 GUI 套 qcut，那就是 editor——另一个表面，另一份文档。

## 相关文档

- [`web-sandbox-integration.zh.md`](integration.zh.md) —— 接进 wzrdagentstudio 的具体接线
- [`web-sandbox-verification.zh.md`](verification.zh.md) —— 证明拉起来的沙箱真能跑 qcut
- [`container-setup.md`](../core-plan/container-setup.md) —— 这镜像扩展的那份 Dockerfile
- [`secrets-supabase.md`](../core-plan/secrets-supabase.md) —— spawn 时的密钥注入
