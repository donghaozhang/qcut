# vm0 凭证与代理模型

vm0 怎么在让代码调用第三方 API 的同时，把 token 隔在沙箱外。源码：`crates/runner/mitm-addon/`、`turbo/packages/connectors/`。

## 一句话

**VM 永远见不到原始 token。** VM 内代码发普通 HTTPS 请求到 `api.openai.com`。请求离开 VM、命中宿主端 mitmproxy，**这时**才注入 `Authorization: Bearer …`。Token 存在控制面数据库，按调用拉取、按 TTL 缓存、刷新时擦除。

这比我们 v0 把 `~/.qcut/.env` 明文写进容器要好得多。`secrets-supabase.md` 的 Option C（"原生解析器"）是中间过渡；完整 mitmproxy 是生产终态。

## 为什么管用

普通的 `Authorization: Bearer sk-...` 请求流：

```
[client]  ──HTTPS──▶  [provider API]
   │
   └─ token 在内存里，并且（多半）在配置文件里
```

vm0 流程：

```
[guest VM]            [宿主 mitmproxy]                 [provider API]
   │                          │                              │
   │── HTTPS to api.openai ──▶│                              │
   │    Authorization: (空)   │  按 run_id 查 token          │
   │                          │  注入 Authorization 头       │
   │                          │── HTTPS ────────────────────▶│
   │                          │◀───────────── 响应 ──────────│
   │◀──── 透传 ───────────────│                              │
```

关键不变量：

1. **出站 DNS** 已知 provider 解析到代理 IP（`runner/src/dns.rs` 在每个 netns 里跑 DNS 服务）。
2. **iptables** 在 VM 的 netns 里把所有出站 HTTP/HTTPS 强制走代理。
3. **mitmproxy CA 证书** 装在 guest rootfs（`runner/src/ca.rs`），HTTPS 拦截透明。
4. **Guest 只知道自己的 `runId`**，mitmproxy 据此查该 workspace 该注入哪些 token。

哪怕 guest 完全沦陷，最多能外泄输出数据——绝拿不到原始 token，它本来就没有。

## mitmproxy 插件

`crates/runner/mitm-addon/` 是个 mitmproxy 的 Python 插件（约 10 个模块），runner 启动时加载进 mitmdump。

```
mitm-addon/src/
├── mitm_addon.py            # 主钩子（request/response/tls）
├── auth.py                  # 防火墙 token 拉取 & TTL 缓存
├── matching.py              # 防火墙规则匹配（allow/block/ask）
├── logging_utils.py         # 每 run 一份 JSONL 审计日志
├── registry.py              # VM（源 IP）→ runId 查找
├── response_streaming.py    # 流式响应处理
├── body_utils.py            # 请求/响应体操作
├── url_utils.py             # URL 解析/重写
└── usage/                   # 模型 provider 的 token 用量跟踪
```

### 热路径（`auth.py`）

每个请求：

1. 查 `(run_id, api_id)` 在代理 registry 里（`registry.py`——文件后端，按 stat mtime 失效缓存）。
2. 调控制面 `/firewall/auth` HTTP 端点拉头，按 `(run_id, api_id)` + TTL 缓存。
3. 注入返回的头（一般是 `Authorization: Bearer …`，有时 `X-API-Key`、query string、basic auth——防火墙规则说什么注什么）。
4. 转发。

缓存 + 锁的逻辑比看起来要细。`auth.py` 里：

```python
_firewall_header_cache: dict[tuple[str, str], dict] = {}
_cache_locks: dict[tuple[str, str], asyncio.Lock] = {}
_force_refresh_markers: set[tuple[str, str]] = set()
_last_force_refresh_at: dict[tuple[str, str], float] = {}
_FORCE_REFRESH_COOLDOWN_SECS = 120.0
```

三层防御：

- **Per-key 锁**——同一 token 的并发请求合并成一次上游拉取。
- **强制刷新标记**——上游 401 时，下一个请求**无视缓存 TTL** 触发强制刷新（provider 可能已经悄悄轮换）。
- **冷却**——每 key 强制刷新间隔 120 s，挡掉非 token 性 401（scope 错、IP 封）下的雪崩。否则一个配错流水线几分钟就能耗尽 OAuth 刷新配额。

`_FORCE_REFRESH_COOLDOWN_SECS` 附近的注释值得读——明确写了 Google 50/小时/用户的 OAuth 刷新限额是绑定约束。这种运营经验只有踩过生产事故才学得到。

### 防火墙规则

`turbo/packages/connectors/src/firewall-types.ts` 定义规则 schema：

```typescript
export const firewallApiSchema = z.object({
  base: z.string(),                           // 规则覆盖的 base URL
  auth: z.object({
    headers: z.record(z.string(), z.string()).optional(),   // header 模板
    base: z.string().optional(),                            // URL 重写
    query: z.record(z.string(), z.string()).optional(),     // query 注入
  }),
  permissions: z.array(firewallPermissionSchema).optional(),
});

export const firewallPolicyValueSchema = z.enum(["allow", "deny", "ask"]);
```

有意思的是 `permissions`。每个 permission 是**一组**规则（比如 GitHub 的 "repo-read" = `GET /repos/*`、`GET /repos/*/contents`、…），策略三选一：

- `allow` —— 放行，注入 token
- `deny` —— guest 收到 403
- `ask` —— 请求挂起，提示用户，批准后继续

防火墙配置托管在独立 GitHub 仓库（`vm0-ai/vm0-firewalls`），服务端解析。意思是规则更新**不用 redeploy runner**——纯数据。

我们这块用不上那么花。Provider 是固定一小撮（FAL、Gemini、OpenRouter、ElevenLabs、OpenAI、GMI），仓库里塞一份扁平 `firewalls.yaml` 跟 agent 镜像一起 bundle 就够。第三方 connector 出现前不要 GitHub 仓库 + zod schema 这一套。

## Connector 模型

`turbo/packages/connectors/src/connectors/` 大概 100 个 TS 文件，一个工具一个。每个长这样（来自 `openai.ts`）：

```typescript
export const openai = {
  openai: {
    label: "OpenAI",
    category: "ai-general-models",
    generation: ["audio", "image", "text"],
    environmentMapping: { OPENAI_TOKEN: "$secrets.OPENAI_TOKEN" },
    helpText: "Connect your OpenAI account…",
    authMethods: {
      "api-token": {
        label: "API Key",
        helpText: "1. Log in to OpenAI Platform\n2. Navigate to API Keys…",
        secrets: {
          OPENAI_TOKEN: { label: "API Key", required: true, placeholder: "sk-..." },
        },
      },
    },
    defaultAuthMethod: "api-token",
  },
};
```

三点要注意：

1. **`environmentMapping` 运行时解析**，不是定义时。`"$secrets.OPENAI_TOKEN"` 是占位符；runner 起任务时从 workspace 的 secrets 仓库展开。
2. **Help text 是 schema 一部分。** 加新工具自带用户端引导——UI 读 `helpText` 渲染出来。
3. **OAuth 和 API key 同形态。** 一些 connector 定义多个 `authMethods`，用户连接时选一种。我们 QCut 的 key 都是 `api-token`，但如果以后加 Google OAuth（比如 Gemini），形态能干净扩展。

Connector 模块**强类型** `as const satisfies Record<string, ConnectorConfig>`，缺字段类型检查时就报。

## 我们该按什么顺序回港

### Phase 1（现在）：masker + 调用谱系

哪怕还用文件层 `.env`，也该：

1. **抄 `guest-agent/src/masker.rs`**（`sk-…`、`xoxb-…`、JWT、AWS access key 的正则集），所有日志行 INSERT 到 `agent_events` 前都过一遍。工作量小，挡掉最差的泄漏类。
2. **`agent_events` 里记每次外部调用的谱系**：provider、endpoint hostname、响应状态、延迟、cost-tokens-in/out。**别记完整 URL**（query string 里有时带 token）。

### Phase 2（v0 后）：proxy 模式

加个 `qcut-agent --proxy-mode` flag：

1. 同 Daytona pod 里起 mitmproxy（或 `tinyproxy`）旁车。
2. 给 CLI 进程设 `HTTPS_PROXY`。
3. mitmproxy 每个请求读 workspace 维度的 token 表来注入。

依赖：

- 控制面 HTTP 端点 `/firewall/auth?run_id=…&host=api.openai.com`，返回 `{ headers: {…}, expiresAt: … }`。
- 容器 `/etc/ssl/certs/` 预信任 mitmproxy CA 证书。
- 一个带和 `auth.py` 同样锁纪律的 token 缓存（**整段抄过来**——那个冷却逻辑很难重新推导出来）。

之后，`~/.qcut/.env` 对走代理的 provider 就废了。留作 fallback 给那些代理不掉的工具（比如非 HTTPS、或 cert pinning 的二进制）。

### Phase 3（多租户 GA）：防火墙策略

外部用户能塞自己的 key / OAuth 之后，加：

- 防火墙规则文件（`yaml`），bundle 进 agent 或从 GitHub 仓库拉。
- 每 workspace 一份策略表 `(workspace_id, firewall_name, permission) → allow|deny|ask`。
- "ask" 审批流（带外——Slack、邮件、应用内提示）。

等到需要再做。

## 对比：我们 v0 vs vm0 mitmproxy

| 属性                              | v0 文件层                                | vm0 mitmproxy                                            |
|----------------------------------|------------------------------------------|---------------------------------------------------------|
| Token 落容器盘？                  | 是，`~/.qcut/.env` 明文                  | 否——永远不进 guest                                       |
| Token 轮换                        | 重启容器                                  | 热——按 TTL 或 401 触发刷新                              |
| 按工具撤销                        | 改 `.env`，重启                          | 改策略行；下次请求生效                                  |
| 审计日志粒度                      | 任务级                                    | 每条 HTTPS 请求                                          |
| "调用前问一下" 流程                | 做不到                                    | 一等公民                                                 |
| 进程 env 泄漏 token               | 可能（任何 `printenv` 都行）              | 不可能（guest 本就没有）                                |
| 工程成本                          | ~50 行                                    | ~2k 行（Rust + Python）+ 控制面端点                      |
| QCut v0 值得做吗？                | 是——发吧                                  | 否，但规划好                                             |

## 真要上 proxy 模式时的实施提示

- **别用 Rust 写 mitmproxy。** Python 插件模型是对的；mitmproxy 的 Python API 成熟、插件短。
- **mitmproxy 跑成 pod 内旁车**，不要跑宿主。多租户更简单，宿主侧无状态。
- **控制面端点必须热路径快。** vm0 在代理侧按 TTL 缓存；我们也要缓存，不能每条 AI 调用都打 Supabase。
- **CA 证书构建时打进 agent 镜像**，运行时不拉（拉的那一路本身没保护）。
- **`agent_events` 里写 kind = `proxy_request`** —— 每条 HTTPS 一行。
- **发布前测 401-刷新-循环边界。** vm0 的冷却逻辑就是生产撞 Google 刷新配额后加的。

## 相关文档

- [`vm0-overview.zh.md`](vm0-overview.zh.md) —— 背景
- [`vm0-job-pipeline.zh.md`](vm0-job-pipeline.zh.md) —— `run_id` 怎么传到代理
- [`secrets-supabase.zh.md`](secrets-supabase.zh.md) —— 我们 v0 密钥加载器
- `vm0/crates/runner/mitm-addon/src/auth.py` —— 待移植的缓存 + 刷新逻辑
- `vm0/crates/runner/mitm-addon/src/mitm_addon.py` —— 顶层插件钩子
- `vm0/turbo/packages/connectors/src/firewall-types.ts` —— 防火墙规则 schema
- `vm0/turbo/packages/connectors/src/connectors/openai.ts` —— 样例 connector
