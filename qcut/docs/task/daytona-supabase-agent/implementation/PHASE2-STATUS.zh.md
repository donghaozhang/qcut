# Phase 2 部署状态（2026-05-14）

**状态：✅ 生产环境端到端跑通。**

浏览器沙箱流程已经真的活了：license-server 签 token、relay 把
WebSocket 接进 Cloudflare Durable Object、DO 挂到 E2B 沙箱的 PTY、
客户端里渲染出真的 `bash` 提示符，credit 也照扣。

## 已部署

| 组件 | 状态 | 地址 / ID |
|------|------|-----------|
| `qcut-license-server`（CF Worker） | ✅ 已部署 | 版本 `0cba9d03-51da-4f49-ab38-2e21ed7257a7`，`https://qcut-license-server.zdhpeter.workers.dev` |
| `qcut-relay`（CF Worker + Durable Object） | ✅ 已部署 | 版本 `21e88f2c-dda6-43b7-bcfe-b3892bfd7b87`，`wss://qcut-relay.zdhpeter.workers.dev/pty?token=…` |
| E2B 模板 `qcut-cli` | ✅ 在线 | ID `mo0cc1eel03akhsen8e5`（E2B 私有 registry） |
| Hyperdrive `70804d32fc714532a36dd1a0620da9ae` | ✅ 凭证正常 | 代理 Supabase `db.kbrtxitvavpuimuihppz.supabase.co` |
| 本地 Docker 镜像 `qcut-cli:dev` | ✅ 建好 | 1.83 GB，smoke 过 |
| Agent worker（Phase 1） | ✅ 实测通过 | 抢任务 → docker run → 成功，连真 DB |
| 沙箱 5 张表 + RLS + `claim_one_agent_job` RPC | ✅ 已落库 | `packages/db/migrations/0004_agent_sandbox_tables.sql` |

## 最终的端到端实测

```
✓ POST /api/sandbox/spawn → 200
  session_id      6ad17eaf-e454-4baf-8703-dc3f28af33cd
  credits_used    5
  remaining       950.3
✓ WS open（wss://qcut-relay.zdhpeter.workers.dev/pty?token=…）
✓ 沙箱 PTY 挂上，~/.qcut/.env 在 session 起点被实例化，motd 渲出来：

    qcut sandbox · session 6ad17eaf · expires 2026-05-14T09:52:46.593
    type: qcut --help for command reference
    user@e2b:/opt/qcut$
```

本目录所有架构文档描述的层级全部真实跑通，扣的也是真 credit。

## 这一路解决的坑

1. **Hyperdrive 缓存的 DB 密码过期**（2 个月前的旧值，跟今天 PR 无关）。
   通过 Supabase Mgmt API SQL 轮换 + `wrangler hyperdrive update`。
   `/api/license` 和 `/api/sandbox/spawn` 同时复活。
2. **`PROBE_TIMEOUT_MS` 设的 8s 太短**，E2B 首次 spawn `qcut system
   doctor` 实际要 ~10s wall clock（外壳启动是大头，doctor 本身很快）。
   `packages/license-server/src/routes/sandbox.ts` 里改成了 20s。
3. **E2B SDK v2 PTY API 跟我之前的猜测不一样**：
   `sandbox.pty.create({ cols, rows, onData, timeoutMs })` 返回带
   `.pid` 的 handle；然后用 `sandbox.pty.sendInput(pid, bytes)` /
   `sandbox.pty.resize(pid, { cols, rows })` / `sandbox.pty.kill(pid)`。
   `onData` 是在 create 时注册的，不是挂在 handle 上。`packages/qcut-relay/src/pty-session.ts`
   按这个真实接口重写了。
4. **Free 套餐的 Durable Objects** 要 `new_sqlite_classes` 而不是
   `new_classes`，`wrangler.toml` 里改对了。
5. **Hono 默认 500 直接吐 `Internal Server Error`** 掩盖了根因。给
   `spawnHandler` 包了顶层 `try/catch`，500 时返回结构化错误。
6. **3 条遗留的 `active` `sandbox_sessions`**（来自之前 handshake 失败但
   没走到 `markEnded` 的流程）把用户的 `MAX_CONCURRENT = 3` 配额吃满。
   密码轮换把 Mgmt API SQL 的缓存 session 也带断了，所以是用
   postgres.js 直连清理掉的。

## 现在就能跑的 smoke 命令

```bash
TOKEN="$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2-)"

# sanity 检查
curl -sS https://qcut-license-server.zdhpeter.workers.dev/api/license \
  -H "Authorization: Bearer $TOKEN" | jq .

# spawn 一次，扣 5 credit
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}' | jq .
```

成功返回 `{ session_id, ws_url, expires_at, cost_credits: 5,
remaining_credits }`。拿 `ws_url` 用任意 WS 客户端连进去就是真的 PTY。

## 没堵路但记着收尾

- **spawn 扣完 credit 但下游失败时退款** —— `deductCreditsForUser` 有
  反操作，只是 `sandbox_create_failed` / `sandbox_unhealthy` 那两条
  路径还没接进去。
- **wzrdagentstudio 接 QCut 登录** —— `/sandbox` 路由目前还是读
  `localStorage.qcut_auth_token` 的 v0 暂存。
- **`qcut-cli` 镜像推 GHCR** —— CI workflow 写好了，按 tag 或者
  手工 dispatch 触发。
- **`agent_secrets.value` 用 pgsodium 加密** —— v0 是明文。
- **agent-worker 本地 docker 不在时的 stderr 抓取**。

## 一句话

Phase 2 是真活的、是真上线了、跑的是真 credit。后面要做的是上面那
些收尾项，"让它工作" 这一段已经做完了。
