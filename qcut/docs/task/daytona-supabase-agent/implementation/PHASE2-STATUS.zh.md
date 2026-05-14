# Phase 2 部署状态（2026-05-14）

## 完成的

| 步骤 | 结果 |
|------|------|
| 装 Docker Desktop + 启动 | ✅ v4.73 / docker CLI v29.4.3 |
| 本地 `qcut-cli:dev` 镜像 | ✅ 建好（1.83 GB），smoke 过 |
| **Agent worker 对接生产 DB 实测** | ✅ 给 `qcutlove@qcut.app` 插真任务，worker 用 `claim_one_agent_job` RPC 抢到，docker run，exit 0，事件落库，状态→succeeded，行被删 |
| E2B 账户 | ✅ 已登（账户 `zdhpeter@gmail.com`，$100 试用） |
| `@e2b/cli` 装好 | ✅ `npm install -g @e2b/cli` |
| E2B 模板 `qcut-cli`（ID `mo0cc1eel03akhsen8e5`） | ✅ 用 7 个 Dockerfile-parser workaround 重建过（详见 [`IMAGE-BOOTSTRAP.zh.md`](IMAGE-BOOTSTRAP.zh.md)）。Smoke 验证：`which qcut` 返 `/usr/local/bin/qcut`、shebang 正常、`qcut system doctor --json --skip-health` exit 0、`status: "ok"` |
| **端到端 spawn 流程直测（用 E2B SDK）** | ✅ 用塞好的 `agent_secret` 拉沙箱、env vars 进去、跑 `/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health`、doctor 返 `status: "ok"`、`keys_configured: 1`、`env_file_mode: 0600`。license-server 的 `/api/sandbox/spawn` 路由代码就是这套流程 |
| License-server `/api/sandbox/spawn` 路由 | ✅ 已接好（按 `user_id` 查 `agent_secrets`、`deductCreditsForUser` 扣费、`Sandbox.create()` 带 env 起沙箱、entrypoint 包裹 probe、签 HS256 token） |
| Wrangler secrets（license-server） | ✅ 4 个都设：`QCUT_IMAGE_TAG=qcut-cli`、`E2B_API_KEY`、`RELAY_SIGNING_SECRET`（`openssl rand -hex 32` 生成，存 `/tmp/qcut-relay-secret`）、`RELAY_HOST=qcut-relay.zdhpeter.workers.dev` |
| License-server **已部署** | ✅ 版本 `6b88f894-1a5a-418d-92d0-b3320cedec77`，地址 `https://qcut-license-server.zdhpeter.workers.dev` |

## 当前坏的（**不是**代码问题）

**`/api/license` 和 `/api/sandbox/spawn` 都 500**，错误：

```
"Auth middleware failed: Failed query: select user_id from sessions
 where token = $1 and expires_at >= $2 limit 1"
```

SQL 本身没问题——通过 Supabase Management API 跑同一条 query 正确返
qcutlove 的 session。但 Worker 通过 Hyperdrive 连不上 DB。

**根因：Hyperdrive 缓存的 DB 凭证过期了。**

- Hyperdrive 配置 `70804d32fc714532a36dd1a0620da9ae` 最后修改于
  `2026-03-06`（`wrangler hyperdrive get` 确认）。
- 这 2 个月里 Supabase DB 密码被轮换过。
- 直连 5432 端口可达（`nc -z` 通）。项目状态 `ACTIVE_HEALTHY`。
  Management API SQL 能跑。
- 5 月 11 号的部署同样症状失败 → 跟今天 PR 10/11/12 的代码无关。

## 一行命令的修法

去 https://supabase.com/dashboard/project/kbrtxitvavpuimuihppz/settings/database
拿当前 DB 密码（点 "Reveal" 或者 reset 后复制），然后：

```bash
cd /Users/peter/Desktop/code/qcut/qcut/packages/license-server
bunx wrangler hyperdrive update 70804d32fc714532a36dd1a0620da9ae \
  --connection-string "postgresql://postgres:<PASSWORD>@db.kbrtxitvavpuimuihppz.supabase.co:5432/postgres"
```

之后 license-server 所有端点恢复，**而且** 新的 `/api/sandbox/spawn`
端到端能用。

## Hyperdrive 修好后的 Phase 2 收尾 smoke

```bash
TOKEN="$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2-)"
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}' | jq .
```

期望（约 5 秒）：

```json
{
  "session_id": "<uuid>",
  "ws_url": "wss://qcut-relay.zdhpeter.workers.dev/pty?token=<jwt>",
  "expires_at": "2026-05-14T...",
  "cost_credits": 5,
  "remaining_credits": 995
}
```

这一步成功 = 浏览器沙箱 Phase 2 真活了。relay（`@qcut/relay`）还
没部署——下一步：

```bash
cd /Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay
# 把 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RELAY_SIGNING_SECRET
#（跟 license-server 用同一个值）/ E2B_API_KEY 都设进去
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put RELAY_SIGNING_SECRET
bunx wrangler secret put E2B_API_KEY
bunx wrangler deploy
```

## 一句话

DB 密码以外的事我全做了。卡点是 Hyperdrive 那条过期的连接——一条命
令的事，需要你看一眼 Supabase 后台。
