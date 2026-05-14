# vm0 总览

从"哪些能搬进我们 Daytona + Supabase agent 方案"的角度读 [vm0-ai/vm0](https://github.com/vm0-ai/vm0)。

> 已 clone 到 `./vm0/`（已 gitignore）。这里是笔记，细节看源码。

## vm0 是什么

vm0 是开源 AI 队友（"Zero"），每个任务跑在隔离的 Firecracker microVM 里，自带 100+ 工具 connector。它是和我们方案**同形态系统的生产级参考**：沙箱化 CLI 执行 + 远端任务队列 + 审计的凭证注入。

两个关键设计：

1. **每任务一个 Firecracker microVM**，而不是容器。靠 snapshot restore 冷启动 ~125 ms。
2. **mitmproxy 注入凭证**，而不是文件层 `.env`。VM 永远见不到原始 token——出站 HTTPS 在宿主侧被重写。

剩下的都常规：宿主上的 Rust 编排器、Turborepo 写的控制面 TypeScript 应用、Ansible 部署。

## 仓库布局

```
vm0/
├── crates/                       # Rust —— runner + sandbox
│   ├── runner/                   # 任务编排器（main 模块 1.5k+ 行）
│   ├── sandbox/                  # Sandbox trait + 类型
│   ├── sandbox-fc/               # Firecracker 实现（cow_pool 1.7k 行）
│   ├── nbd-cow/                  # 用户态 NBD COW
│   ├── vsock-{host,guest,proto}/ # 宿主↔guest IPC
│   ├── guest-{init,agent,common,download,reseed,write-file}/  # VM 内二进制
│   ├── guest-mock-{claude,codex}/   # 测试用 mock CLI
│   ├── ably-subscriber/          # Ably pub/sub WS 客户端
│   └── api-contracts/            # 宿主↔控制面共享类型
├── turbo/                        # TypeScript —— 控制面（pnpm workspace）
│   ├── apps/{api,cli,platform,web}/
│   └── packages/
│       ├── connectors/           # 100+ 工具集成（每个：auth + env）
│       ├── api-contracts/        # 共享 TS 类型
│       ├── api-services/
│       ├── core/                 # 领域逻辑
│       ├── db/                   # Drizzle schema
│       ├── proxy/                # 代理服务（HTTP）
│       └── firewalls-generator/  # 防火墙规则 codegen
├── ansible/                      # 生产部署
├── docker/toolchain/             # 可复现构建环境
└── e2e/                          # 端到端套件
```

工程纪律（来自 `CLAUDE.md`）：

- 严格 TypeScript；**禁 `any`、禁 `@ts-ignore`、禁 `eslint-disable`**。
- YAGNI；只写集成测试（不写单元测试）；错误自然向上传播。
- 全局 services 模式（`globalThis.services.{db,env,pool}`）管单例。
- `apps/web` → `apps/api` 迁移进行中，两边保持同步。

这套规矩比我们项目更严，可作为参考标杆。

## 并排对照：vm0 vs daytona-supabase-agent

| 关注点                          | vm0（生产）                                              | 我们 v0 方案                                          | 结论                                              |
|--------------------------------|---------------------------------------------------------|------------------------------------------------------|--------------------------------------------------|
| **沙箱**                        | Firecracker microVM，~125 ms                            | Daytona container，~1–2 s                            | 容器够用，10k 任务/小时以下没问题                |
| **快照 / 预热池**                | NBD COW + Firecracker snapshot 池（`cow_pool.rs`）      | 无                                                   | 推迟；冷启动顶不住 UX 时再上                     |
| **任务下发**                     | Ably Pub/Sub（WebSocket + MsgPack）                    | Supabase Realtime（WebSocket）                       | 我们栈里已有——等价                              |
| **任务状态**                     | 云 API（`api.rs`）或本地文件队列                          | Supabase Postgres                                    | 等价                                             |
| **宿主↔guest IPC**              | vsock over Unix sockets                                 | 无——进程在容器内                                     | 不需要                                           |
| **凭证注入**                     | mitmproxy 宿主侧重写 `Authorization`                    | `~/.qcut/.env`（容器盘明文）                          | **差距明显。**见 `vm0-secrets-proxy.zh.md`        |
| **Connector 模型**               | `packages/connectors` 里 100+ 个 TS 模块                | 8 个环境变量，硬编码                                  | 体量不同；我们暂时不需要                          |
| **防火墙规则**                   | 按权限 allow/deny/ask，GitHub 托管 YAML                 | 无                                                   | "生产测试者"模式时再借鉴                          |
| **网络审计**                     | 每个 VM 一份 JSONL（mitmproxy）                          | 每任务一行 `agent_events`                            | 任务层等价；丢了请求级粒度                       |
| **编排语言**                     | Rust                                                   | TypeScript / Bun                                     | TS 顶得住我们吞吐                                |
| **资源限制**                     | `resource_budget.rs`、内存 ballooning                   | 容器限制（Daytona / k8s）                             | 等价                                             |
| **Idle pool / prefetch**         | `idle_pool.rs`、`prefetch.rs`、`r2_cache.rs`            | 无                                                   | 性能差距大；需要热启再说                          |
| **清理**                         | `leaked_resources.rs` 跟踪 netns/tap/fd                 | 容器删除                                              | 等价                                             |
| **鉴权范围**                     | OAuth + per-tool API key + `vm0-firewalls` 仓库          | workspace 维度的 Supabase 行                          | 模型不同；我们更简单                              |

## 哪些值得搬

**现在就抄**：

- **per-job 资源预算**——`runner/src/resource_budget.rs` 不长，概念能直接对到容器调度器。可以挡住失控流水线把宿主吃干。
- **每次外部调用记一行审计**——vm0 把每条 HTTPS 都记下。我们不需要那么细，但 `agent_events` 至少要按 provider 调用记一行（模型名、prompt 哈希、cost）。schema 里已隐含。
- **doctor 子命令**——`runner doctor` 跑宿主健康检查。`qcut-agent doctor` 工作量小，调试收益大。
- **gc 子命令**——vm0 显式 `runner gc` 清旧镜像目录。我们需要等价物清理"任务还在 running 但容器已死"的孤儿。

**以后再抄（生产成熟度）**：

- **mitmproxy 注入凭证**——见 [`vm0-secrets-proxy.zh.md`](vm0-secrets-proxy.zh.md)。能干净地把容器盘上的密钥明文消掉。
- **快照 / COW 预热池**——见 [`vm0-sandbox.zh.md`](vm0-sandbox.zh.md)。除非需要 < 1 s 任务认领，不必做。
- **Connector schema**——如果以后 QCut 要把 CLI 表面暴露给第三方 agent，`packages/connectors/*.ts` 那套（一文件一工具、`authMethods` + `environmentMapping`）形态对路。

**不可移植**：

- Firecracker 本身——我们有 Daytona/容器；重写沙箱层是几个月的工作量，换 1–2 s 启动收益不值。
- vsock IPC——我们在容器里、不是 VM 里，宿主直接 stdout/stderr/文件就能通信。
- Ably——已经有 Supabase Realtime，换它纯增加成本。

## 想看源码的阅读顺序

1. `vm0/CLAUDE.md` —— 工程纪律。
2. `vm0/crates/README.md` —— 沙箱/宿主分层架构图。
3. `vm0/crates/runner/src/main.rs` —— 顶层 CLI；列出所有子命令。
4. `vm0/crates/runner/src/provider/mod.rs` —— provider 抽象（云 vs 本地）。
5. `vm0/crates/runner/mitm-addon/src/mitm_addon.py` —— 凭证注入。
6. `vm0/turbo/packages/connectors/src/firewall-types.ts` —— 防火墙策略模型。
7. `vm0/turbo/packages/connectors/src/connectors/anthropic-managed-agents.ts` —— 典型 connector 模块。

## 配套文档

- [`vm0-sandbox.zh.md`](vm0-sandbox.zh.md) —— Firecracker、COW、vsock、网络命名空间。
- [`vm0-job-pipeline.zh.md`](vm0-job-pipeline.zh.md) —— Ably 推送、runner provider、guest-agent 生命周期。
- [`vm0-secrets-proxy.zh.md`](vm0-secrets-proxy.zh.md) —— mitmproxy + 防火墙 + connector 模型；QCut 端的回港路径。
