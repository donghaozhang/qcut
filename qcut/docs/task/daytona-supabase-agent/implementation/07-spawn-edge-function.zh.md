# PR 07 —— `/sandbox-spawn` Supabase Edge Function

> **Phase**：2 · **依赖**：PR 01、02、03、06 · **工作量**：~150 行

## 目标

Supabase Edge Function：浏览器一次 HTTPS POST，完成：(1) 鉴权调用者，(2) 检查并发上限，(3) 加载 workspace 密钥，(4) 从 `qcut-cli:vX` 起 E2B 沙箱，(5) 跑 spawn-probe（`qcut system doctor`），(6) 写一行 `sandbox_sessions`，(7) 返回短期签名的 WS token（对中继 PR 08 用）。

## 依赖

- PR 01 —— probe 命令在。
- PR 02 —— 镜像在、env-var 契约。
- PR 03 —— `agent_secrets` + `agent_events`。
- PR 06 —— `sandbox_sessions` 表 + `count_active_sandbox_sessions` RPC。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/db/supabase/functions/sandbox-spawn/index.ts` | 新 | Edge Function 入口 |
| `packages/db/supabase/functions/sandbox-spawn/deno.json` | 新 | Deno 配置 + import-map |
| `packages/db/supabase/functions/sandbox-spawn/index.test.ts` | 新 | 权限 + 并发上限的单测 |
| `packages/db/.env.functions.example` | 新 | 必需 env 列表 |

## 实现

### Step 1 —— Function

`packages/db/supabase/functions/sandbox-spawn/index.ts`：

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Sandbox } from "npm:e2b@latest";
import { SignJWT } from "jsr:@panva/jose@5";

const MAX_CONCURRENT = 3;
const IMAGE_TAG = Deno.env.get("QCUT_IMAGE_TAG") ?? "qcut-cli:v0";
const RELAY_SECRET = new TextEncoder().encode(Deno.env.get("RELAY_SIGNING_SECRET")!);
const RELAY_HOST = Deno.env.get("RELAY_HOST") ?? "relay.qcut.app";

const PROBE_TIMEOUT_MS = 8_000;
const TTL_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const auth = req.headers.get("authorization");
  if (!auth) return new Response("unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return new Response("unauthorized", { status: 401 });

  let body: { workspace_id?: string; resource_class?: "standard" | "large" };
  try { body = await req.json(); } catch { return new Response("invalid_json", { status: 400 }); }
  const { workspace_id, resource_class = "standard" } = body;
  if (!workspace_id) return new Response("missing_workspace_id", { status: 400 });

  // 成员
  const { data: member } = await supabase
    .from("workspace_members").select("role")
    .eq("workspace_id", workspace_id).eq("user_id", user.id).maybeSingle();
  if (!member) return new Response("forbidden", { status: 403 });

  // 并发
  const { data: countResult, error: countErr } = await supabase.rpc(
    "count_active_sandbox_sessions", { _workspace_id: workspace_id },
  );
  if (countErr) { console.error("count error", countErr); return new Response("count_failed", { status: 500 }); }
  if ((countResult as number) >= MAX_CONCURRENT) return new Response("too_many_active_sessions", { status: 429 });

  // 审计：spawn_started
  await supabase.from("agent_events").insert({
    workspace_id, kind: "spawn_started",
    payload: { user_id: user.id, resource_class },
  });

  // 密钥
  const { data: secrets } = await supabase
    .from("agent_secrets").select("key, value").eq("workspace_id", workspace_id);
  const envs = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));

  // 起沙箱
  const sandbox = await Sandbox.create(IMAGE_TAG, {
    timeoutMs: TTL_MS,
    envs: { ...envs, QCUT_SESSION_ROLE: "interactive" },
  });

  // Layer-2 probe
  const probe = await sandbox.commands.run("qcut system doctor --json --skip-health", { timeoutMs: PROBE_TIMEOUT_MS });
  if (probe.exitCode !== 0) {
    await sandbox.kill();
    await supabase.from("agent_events").insert({
      workspace_id, kind: "doctor_probe",
      payload: { exit_code: probe.exitCode, stderr: probe.stderr.slice(0, 1000) },
    });
    return new Response("sandbox_unhealthy", { status: 502 });
  }
  await supabase.from("agent_events").insert({
    workspace_id, kind: "spawn_probe_ok",
    payload: { provider_session_id: sandbox.sandboxId },
  });

  // 持久化
  const session_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + TTL_MS).toISOString();
  const { error: insErr } = await supabase.from("sandbox_sessions").insert({
    id: session_id, workspace_id, user_id: user.id,
    status: "active", provider: "e2b",
    provider_session_id: sandbox.sandboxId,
    image_tag: IMAGE_TAG, resource_class, expires_at,
  });
  if (insErr) { await sandbox.kill(); console.error("session insert failed", insErr); return new Response("session_insert_failed", { status: 500 }); }

  // 签 WS token（5 分钟）
  const ws_token = await new SignJWT({ session_id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(RELAY_SECRET);

  return Response.json({
    session_id,
    ws_url: `wss://${RELAY_HOST}/pty?token=${ws_token}`,
    expires_at,
  });
});
```

### Step 2 —— deno.json

`packages/db/supabase/functions/sandbox-spawn/deno.json`：

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2",
    "@panva/jose": "jsr:@panva/jose@5",
    "e2b": "npm:e2b@latest"
  }
}
```

### Step 3 —— env

`packages/db/.env.functions.example`：

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
QCUT_IMAGE_TAG=qcut-cli:v0
RELAY_SIGNING_SECRET=
RELAY_HOST=relay.qcut.app
E2B_API_KEY=
```

设到 Supabase：`supabase secrets set --env-file packages/db/.env.functions`。

## 测试

`packages/db/supabase/functions/sandbox-spawn/index.test.ts`：

```ts
import { describe, it, expect } from "vitest";

describe("sandbox-spawn", () => {
  it("无 auth header 返 401", async () => {
    const handler = await import("./index.js").then((m) => m.handler);
    const r = await handler(new Request("http://x/", { method: "POST" }));
    expect(r.status).toBe(401);
  });
  it("并发超时返 429", async () => { /* mock rpc 返 3，断言 429 */ });
  it("probe 失败时 kill 沙箱、返 502", async () => { /* mock Sandbox.create + commands.run = exitCode 4 */ });
});
```

Edge Function 单测本来不太顺手——v0 接受测试覆盖偏薄，靠下面手工 smoke。

## 验证（手工）

```bash
cd packages/db
supabase functions deploy sandbox-spawn

supabase secrets set \
  RELAY_SIGNING_SECRET=$(openssl rand -hex 32) \
  E2B_API_KEY=$E2B_API_KEY \
  QCUT_IMAGE_TAG=qcut-cli:v0

curl -i -X POST \
  "$SUPABASE_URL/functions/v1/sandbox-spawn" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"00000000-0000-0000-0000-000000000abc"}'

# 期望 200：{ "session_id": "...", "ws_url": "wss://relay...?token=...", "expires_at": "..." }

psql "$DATABASE_URL" -c "
  select kind, payload from agent_events
  where workspace_id = '00000000-0000-0000-0000-000000000abc'
  order by created_at desc limit 5"
# 期望：spawn_started、spawn_probe_ok
```

## 不在本 PR 范围

- 重连宽限。spawn API 只发 token；重连逻辑在中继（PR 08）和 React hook（PR 09）。
- Daytona provider。v0 只 E2B；等 Daytona TS SDK 暴露 PTY-over-WS 再换。
- `standard`/`large` 之外的 resource_class。后续要时再加。
- 自动清理长 `ended` 行。审计价值 > 存储成本——留着。

## 相关文档

- [`../web-sandbox/integration.md`](../web-sandbox/integration.md) —— Edge Function 完整背景 + 变体片段
- [`../web-sandbox/verification.md`](../web-sandbox/verification.md) —— Layer 2 probe 契约
- [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) —— 写的表
