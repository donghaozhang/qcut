# 接入 wzrdagentstudio

终端在 React 应用里住哪、Supabase 那侧加什么 Edge Function、两边契约长啥样。配 [`web-sandbox-architecture.zh.md`](web-sandbox-architecture.zh.md) 读。

## wzrdagentstudio 内文件布局

```
src/
├── features/
│   └── qcut-sandbox/                       # 新功能文件夹
│       ├── routes/
│       │   └── SandboxRoute.tsx             # /sandbox/$workspaceId
│       ├── components/
│       │   ├── TerminalView.tsx             # xterm.js 包装
│       │   ├── SessionHeader.tsx            # "Connected · TTL 28 min · stop"
│       │   ├── ResourceClassPicker.tsx      # standard / large 下拉
│       │   └── RecentSessions.tsx           # 用户最近 10 个 ended 会话
│       ├── hooks/
│       │   ├── useSpawnSandbox.ts           # POST /sandbox-spawn
│       │   ├── useSandboxSocket.ts          # WS 生命周期 + 重连
│       │   └── useIdleTimer.ts              # 本地 idle 提示 UI
│       └── api/
│           └── sandbox-client.ts            # 类型化 fetch 包装
└── integrations/
    └── supabase/
        └── functions.ts                     # 把 'sandbox-spawn' 加进已知函数名
```

路由用应用里现有的 auth 包装兜底。studio dashboard 上放一张卡片打开它。

## React 骨架

`TerminalView.tsx`：

```tsx
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useEffect, useRef } from 'react';

export function TerminalView({ wsUrl, onExit }: { wsUrl: string; onExit: (reason: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({ fontFamily: 'JetBrainsMono, monospace', fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => term.write(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = (e) => onExit(e.reason || 'disconnect');
    term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(d));

    const handleResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [wsUrl]);

  return <div ref={containerRef} className="h-full w-full bg-black" />;
}
```

要点：

- **ArrayBuffer 传输**，不是文本。PTY 吐原始字节；文本模式 WS 会破坏非 UTF8（`qcut` 有些输出用框线字符）。
- **Resize 用带内 JSON 信封。** 中继区分二进制帧（stdin/stdout）和 JSON 控制帧（resize、ping）。一字节前缀也行；JSON 简单点，控制帧少。
- **组件里不放重连逻辑。** 那住在 `useSandboxSocket` hook 里，能在 30 s 宽限期内重建 socket 并重绑 PTY。

## Spawn Edge Function

`supabase/functions/sandbox-spawn/index.ts`：

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Sandbox } from 'npm:e2b@latest';
import { SignJWT } from 'jsr:@panva/jose';

const MAX_CONCURRENT = 3;
const IMAGE_TAG = Deno.env.get('QCUT_IMAGE_TAG') ?? 'qcut-cli:v0';
const RELAY_SECRET = new TextEncoder().encode(Deno.env.get('RELAY_SIGNING_SECRET')!);

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  if (!auth) return new Response('unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (!user) return new Response('unauthorized', { status: 401 });

  const { workspace_id, resource_class = 'standard' } = await req.json();

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return new Response('forbidden', { status: 403 });

  const { count } = await supabase
    .from('sandbox_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspace_id)
    .in('status', ['spawning', 'active']);
  if ((count ?? 0) >= MAX_CONCURRENT) {
    return new Response('too_many_active_sessions', { status: 429 });
  }

  const { data: secrets } = await supabase
    .from('agent_secrets')
    .select('key, value')
    .eq('workspace_id', workspace_id);
  const env = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));

  const sandbox = await Sandbox.create(IMAGE_TAG, {
    timeoutMs: 30 * 60 * 1000,
    envs: { ...env, QCUT_SESSION_ROLE: 'interactive' },
  });

  // Layer-2 spawn probe（见 web-sandbox-verification.zh.md）
  const probe = await sandbox.commands.run('qcut system doctor --json --skip-health', {
    timeoutMs: 8_000,
  });
  if (probe.exitCode !== 0) {
    await sandbox.kill();
    return new Response('sandbox_unhealthy', { status: 502 });
  }

  const session_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await supabase.from('sandbox_sessions').insert({
    id: session_id,
    workspace_id,
    user_id: user.id,
    status: 'active',
    provider: 'e2b',
    provider_session_id: sandbox.sandboxId,
    image_tag: IMAGE_TAG,
    resource_class,
    expires_at,
  });

  const ws_token = await new SignJWT({ session_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(RELAY_SECRET);

  return Response.json({
    session_id,
    ws_url: `wss://relay.qcut.app/pty?token=${ws_token}`,
    expires_at,
  });
});
```

~100 行，远在 Edge Function 复杂度顶之下。不做重试——重试不重试客户端自己决定。

## WS 中继

中继当不了 Supabase Edge Function。选项：

| 宿主 | 优点 | 缺点 |
|------|------|------|
| Cloudflare Worker + Durable Object | 便宜、全球；DO 持活 socket | 自定义域 WS 要配；按区域算 egress |
| Fly.io Node 服务 | 标准 `ws` + `node-pty`；好调试 | 闲时也付钱；默认单区域 |
| Render / Railway Node 服务 | 同 Fly | 同 |

**选 Cloudflare Worker + Durable Object。** 中继大部分时间闲、爆发性高；DO 计费正好匹配。骨架：

```typescript
// relay-worker/src/index.ts
import { Sandbox } from 'e2b';

export class PtySession {
  async fetch(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected WS', { status: 400 });
    }

    const token = new URL(request.url).searchParams.get('token');
    const { session_id } = await verifyToken(token!);                  // 不合法 throw
    const session = await loadSession(session_id);                     // 走 Supabase service role

    const sandbox = await Sandbox.connect(session.provider_session_id);
    const pty = await sandbox.pty.create({
      rows: 24,
      cols: 80,
      command: '/usr/local/bin/qcut-entrypoint.sh',                    // 包 bash + 物化 ~/.qcut/.env
    });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    pty.onData((b: Uint8Array) => server.send(b));
    server.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        const ctrl = JSON.parse(e.data);
        if (ctrl.kind === 'resize') pty.resize({ rows: ctrl.rows, cols: ctrl.cols });
        return;
      }
      pty.write(new Uint8Array(e.data));
    });
    server.addEventListener('close', () => {
      pty.kill();
      markEnded(session_id, 'disconnect');
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
```

审计钩子：每个块按采样窗（~1 KB 或 5 s）插一行 `agent_events`，`kind = 'sandbox_io'`，过 mask。完整按键日志太多了，存储吃不消。

## wzrdagentstudio 侧接线

1. 应用 router 加路由 `/sandbox/:workspaceId`。
2. studio dashboard 侧栏放 "qcut shell" 入口，按 workspace feature flag `qcut_sandbox_enabled` 控制。
3. 复用现有 Supabase 客户端 `src/integrations/supabase/client.ts`——不另开。
4. `package.json` 加 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links`。
5. `src/integrations/supabase/functions.ts` 的类型化清单加 spawn 函数名。

## 数据流总结

```
1. 用户 → wzrdagentstudio       : 点 "qcut shell"
2. wzrdagentstudio → Supabase   : POST /functions/v1/sandbox-spawn
3. Supabase Edge → E2B          : Sandbox.create(image, env)
4. Supabase Edge → Sandbox      : sandbox.commands.run("qcut system doctor --json --skip-health")
5. Supabase Edge → Postgres     : INSERT sandbox_sessions
6. Supabase Edge → wzrdagentstudio: { session_id, ws_url, expires_at }
7. wzrdagentstudio → 中继        : WS connect（带签名 token）
8. 中继 → E2B                   : sandbox.pty.create()
9. 浏览器 ↔ 中继 ↔ E2B PTY ↔ qcut    （活字节）
10. 浏览器关 / TTL 到            : 中继 → E2B kill，UPDATE sandbox_sessions
```

第 1–6 步是一次 HTTP 请求。从第 7 步起是长连 WS。

## 常见问题

- **为什么不把中继塞进 wzrdagentstudio 的 Vite 开发服务器？** 开发能跑；生产是 CDN 后面的静态资产——没有 Node 运行时给你贴。中继得拆出去，跟开发体验无关。
- **能跳过中继让浏览器直连 E2B 吗？** E2B 是暴露了 WS 能用的 PTY，但需要的 token 是 workspace-secret 级别的。把它放浏览器里，network tab 一眼就漏。中继持密钥。
- **为啥不一开始就上 Daytona？** Daytona 的 TS SDK 没像 E2B 那样把 PTY-over-WS 暴露好；我们得自己写那层。会做，先不做。
- **agent 路径的 `entrypoint.ts` 在这里啥位置？** 无头模式照跑。交互模式下，一个薄的 `qcut-entrypoint.sh` 从 env vars 物化 `~/.qcut/.env`、然后 `exec bash`。密钥加载语义一样，只是 exec 不同。

## 相关文档

- [`web-sandbox-verification.zh.md`](web-sandbox-verification.zh.md) —— 接好之后怎么确认能工作
- [`web-sandbox-architecture.zh.md`](web-sandbox-architecture.zh.md) —— 组件拆解
- [`container-setup.md`](container-setup.md) —— 镜像结构（`qcut-entrypoint.sh` 放这）
- [`secrets-supabase.md`](secrets-supabase.md) —— 上面引到的 `agent_secrets` schema
