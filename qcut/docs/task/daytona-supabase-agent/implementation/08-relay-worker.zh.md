> ⚠️ **只改了列名。** 代码结构原样落地为 commit `170924319`。PR 12 把
> `audit.ts` 写 `agent_events` 时的 `workspace_id` 改成 `user_id`，
> 显式带上 `created_at`（新 schema 没有 DB 侧 default）。token 签发
> 校验不变。见 [`ACTUAL.zh.md`](ACTUAL.zh.md)。

# PR 08 —— Cloudflare Worker + Durable Object PTY 中继

> **Phase**：2 · **依赖**：PR 07（spawn 签的就是这里要验的 token） · **工作量**：~250 行

## 目标

Cloudflare Worker 接浏览器 WebSocket，验 spawn Edge Function 签的短期 token，对应 E2B 沙箱里开 PTY，双向转字节，往 Supabase 写审计 + 终态行。每个活会话一个 Durable Object 持 WS pair。状态故意做得很小。

## 依赖

PR 07 已合入——WS token 形态和 `sandbox_sessions` 行从那来。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/qcut-relay/wrangler.toml` | 新 | CF Worker + DO 配置 |
| `packages/qcut-relay/src/index.ts` | 新 | 顶层 fetch；把 WS 路由进 DO |
| `packages/qcut-relay/src/pty-session.ts` | 新 | Durable Object |
| `packages/qcut-relay/src/verify-token.ts` | 新 | HS256 token 验证 |
| `packages/qcut-relay/src/audit.ts` | 新 | 采样 INSERT `agent_events` |
| `packages/qcut-relay/package.json` | 新 | workspace 包 |
| `packages/qcut-relay/README.md` | 新 | 本地开发 + 部署说明 |

## 实现

### Step 1 —— Worker 配置

`packages/qcut-relay/wrangler.toml`：

```toml
name = "qcut-relay"
main = "src/index.ts"
compatibility_date = "2026-05-13"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "PTY", class_name = "PtySession" }
]

[[migrations]]
tag = "v1"
new_classes = ["PtySession"]

[vars]
SUPABASE_URL = ""             # wrangler secret put
RELAY_SIGNING_SECRET = ""

[observability]
enabled = true
```

`wrangler secret put SUPABASE_URL`、`RELAY_SIGNING_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`、`E2B_API_KEY`。

### Step 2 —— 顶层 handler

`packages/qcut-relay/src/index.ts`：

```ts
export { PtySession } from "./pty-session.js";

export interface Env {
  PTY: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RELAY_SIGNING_SECRET: string;
  E2B_API_KEY: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/pty") return new Response("not_found", { status: 404 });

    const token = url.searchParams.get("token");
    if (!token) return new Response("missing_token", { status: 400 });

    const sessionId = await peekSessionId(token);
    if (!sessionId) return new Response("bad_token", { status: 400 });

    const id = env.PTY.idFromName(sessionId);
    const stub = env.PTY.get(id);
    return stub.fetch(req);
  },
};

async function peekSessionId(token: string): Promise<string | null> {
  // 只 decode、不 verify——只用来推导 DO id；真验证在 DO 里。
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.session_id === "string" ? json.session_id : null;
  } catch { return null; }
}
```

### Step 3 —— Durable Object

`packages/qcut-relay/src/pty-session.ts`：

```ts
import { Sandbox } from "e2b";
import { verifyToken } from "./verify-token.js";
import { auditChunk, markEnded } from "./audit.js";
import type { Env } from "./index.js";

export class PtySession {
  private state: DurableObjectState;
  private env: Env;
  constructor(state: DurableObjectState, env: Env) { this.state = state; this.env = env; }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected_ws", { status: 400 });

    const url = new URL(req.url);
    const token = url.searchParams.get("token")!;
    let claims: { session_id: string };
    try { claims = await verifyToken(token, this.env.RELAY_SIGNING_SECRET); }
    catch { return new Response("invalid_token", { status: 401 }); }

    const session = await this.loadSession(claims.session_id);
    if (!session || session.status !== "active") return new Response("session_not_active", { status: 410 });

    const sandbox = await Sandbox.connect(session.provider_session_id, { apiKey: this.env.E2B_API_KEY });
    const pty = await sandbox.pty.create({
      rows: 24, cols: 80,
      command: "/usr/local/bin/qcut-entrypoint bash",
    });

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    let bytesOut = 0;
    let lastAudit = Date.now();

    pty.onData(async (chunk: Uint8Array) => {
      bytesOut += chunk.byteLength;
      server.send(chunk);
      if (Date.now() - lastAudit > 5000 || bytesOut > 8192) {
        await auditChunk(this.env, claims.session_id, "sandbox_io", { direction: "out", bytes: bytesOut });
        bytesOut = 0; lastAudit = Date.now();
      }
    });

    server.send(new TextEncoder().encode(
      `qcut sandbox · session ${claims.session_id.slice(0, 8)} · expires ${session.expires_at}\r\n` +
      `type 'qcut system doctor' to verify provider reachability\r\n`,
    ));
    await auditChunk(this.env, claims.session_id, "motd_sent", {});
    await auditChunk(this.env, claims.session_id, "pty_attached", {});

    server.addEventListener("message", (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        try {
          const ctrl = JSON.parse(data);
          if (ctrl.kind === "resize" && typeof ctrl.rows === "number" && typeof ctrl.cols === "number") {
            pty.resize({ rows: ctrl.rows, cols: ctrl.cols });
          }
        } catch { /* 丢 */ }
        return;
      }
      pty.write(new Uint8Array(data as ArrayBuffer));
    });

    server.addEventListener("close", async () => {
      try { await pty.kill(); } catch { /* 忽略 */ }
      await markEnded(this.env, claims.session_id, "disconnect");
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadSession(id: string) {
    const r = await fetch(`${this.env.SUPABASE_URL}/rest/v1/sandbox_sessions?id=eq.${id}&select=*`, {
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) return null;
    const rows = await r.json() as Array<{ status: string; provider_session_id: string; expires_at: string }>;
    return rows[0] ?? null;
  }
}
```

### Step 4 —— Token 验证

`packages/qcut-relay/src/verify-token.ts`：

```ts
// 极简 HS256 验证——避免把 jose 拉进 Worker bundle。
// 浏览器友好：用 globalThis.crypto.subtle。

export async function verifyToken(token: string, secret: string): Promise<{ session_id: string }> {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("malformed");

  const header = JSON.parse(b64decUtf8(headerB64));
  if (header.alg !== "HS256") throw new Error("alg_mismatch");

  const key = await globalThis.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["verify"],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64decBin(sigB64);
  const ok = await globalThis.crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) throw new Error("sig_mismatch");

  const payload = JSON.parse(b64decUtf8(payloadB64));
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) throw new Error("expired");
  if (typeof payload.session_id !== "string") throw new Error("missing_session_id");
  return { session_id: payload.session_id };
}

function b64decBin(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "====".slice(s.length % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64decUtf8(s: string): string {
  return new TextDecoder().decode(b64decBin(s));
}
```

### Step 5 —— 审计

`packages/qcut-relay/src/audit.ts`：

```ts
import type { Env } from "./index.js";

export async function auditChunk(env: Env, session_id: string, kind: string, payload: Record<string, unknown>) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/agent_events`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ workspace_id: null, kind, payload: { session_id, ...payload } }),
  });
}

export async function markEnded(env: Env, session_id: string, reason: string) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/sandbox_sessions?id=eq.${session_id}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "ended",
      ended_at: new Date().toISOString(),
      end_reason: reason,
    }),
  });
}
```

（审计行的 `workspace_id` 该 select 一下再填。v0 暂接受 null，query 时按 `payload.session_id` join——followup PR 修。）

### Step 6 —— package.json

`packages/qcut-relay/package.json`：

```json
{
  "name": "@qcut/relay",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "vitest": "^2.0.0"
  },
  "dependencies": { "e2b": "^1.0.0" }
}
```

## 测试

`packages/qcut-relay/src/verify-token.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { verifyToken } from "./verify-token.js";

const secret = "test_secret_long_enough_for_hmac";
const secretBytes = new TextEncoder().encode(secret);

describe("verifyToken", () => {
  it("接受新鲜签名 token", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(secretBytes);
    const { session_id } = await verifyToken(t, secret);
    expect(session_id).toBe("abc");
  });
  it("拒绝错密钥", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("wrong"));
    await expect(verifyToken(t, secret)).rejects.toThrow();
  });
  it("拒绝过期", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1s")
      .sign(secretBytes);
    await new Promise((r) => setTimeout(r, 2000));
    await expect(verifyToken(t, secret)).rejects.toThrow();
  });
});
```

## 验证（手工）

```bash
cd packages/qcut-relay
bun run deploy

# 从 PR 07 demo 拿 ws_url
SESSION_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/sandbox-spawn" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"workspace_id":"00000000-0000-0000-0000-000000000abc"}')
WS_URL=$(echo "$SESSION_RESPONSE" | jq -r .ws_url)

websocat "$WS_URL"
# motd 出现；敲 `qcut system doctor` 看 JSON 回来

psql "$DATABASE_URL" -c "
  select kind, payload->'session_id' from agent_events
  where kind in ('pty_attached','motd_sent','sandbox_io')
  order by created_at desc limit 10"
```

## 不在本 PR 范围

- 30 s 重连宽限（重绑同一 PTY）。v0 一次性连接；丢了就客户端再 spawn。
- 多区域路由。Cloudflare anycast 自带，免费。
- Daytona PTY 后端。Phase 3 等 Daytona SDK 支持 PTY-over-WS。
- 按 input 的 masker。CLI 输出走 PR 04 worker masker；input masker 看 PR 09 React 组件要不要做。
- 审计行的 `workspace_id` 填值。v0 接受 null；followup 修。

## 相关文档

- [`../web-sandbox/integration.md`](../web-sandbox/integration.md) —— 中继背景 + 变体
- [`../web-sandbox/architecture.md`](../web-sandbox/architecture.md) —— 鉴权流 / token 拆分 / 生命周期
- [`07-spawn-edge-function.md`](07-spawn-edge-function.md) —— token 发行方
