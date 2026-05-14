# Integration with wzrdagentstudio

Where the terminal lives in the React app, what edge functions are added on the Supabase side, and the contract between them. Companion to [`web-sandbox-architecture.md`](architecture.md).

## File layout in wzrdagentstudio

```
src/
├── features/
│   └── qcut-sandbox/                       # new feature folder
│       ├── routes/
│       │   └── SandboxRoute.tsx             # /sandbox/$workspaceId
│       ├── components/
│       │   ├── TerminalView.tsx             # xterm.js wrapper
│       │   ├── SessionHeader.tsx            # "Connected · TTL 28 min · stop"
│       │   ├── ResourceClassPicker.tsx      # standard / large dropdown
│       │   └── RecentSessions.tsx           # last 10 ended sessions
│       ├── hooks/
│       │   ├── useSpawnSandbox.ts           # POST /sandbox-spawn
│       │   ├── useSandboxSocket.ts          # WS lifecycle + reconnect
│       │   └── useIdleTimer.ts              # local idle hint UI
│       └── api/
│           └── sandbox-client.ts            # typed fetch wrappers
└── integrations/
    └── supabase/
        └── functions.ts                     # add 'sandbox-spawn' to known function names
```

Route is gated by the existing auth wrapper used elsewhere in the app. Drop a card on the studio dashboard that opens it.

## React skeleton

`TerminalView.tsx`:

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

Notes:

- **ArrayBuffer transport**, not text. The PTY emits raw bytes; text-mode WS would corrupt non-UTF8 (some `qcut` output uses box-drawing).
- **Resize via in-band JSON envelope.** The relay distinguishes binary frames (stdin/stdout) from JSON control frames (resize, ping). A single-byte prefix would also work; JSON is fine here since control frames are rare.
- **No reconnect logic in this component.** That lives in the `useSandboxSocket` hook, which can recreate the socket and reattach to the PTY within the 30 s grace.

## Spawn Edge Function

`supabase/functions/sandbox-spawn/index.ts`:

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

  // Layer-2 spawn probe (see web-sandbox-verification.md)
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

This is ~100 LOC, well under the Edge Function complexity ceiling. No retries — the client decides whether to ask again.

## WS Relay

The relay cannot be a Supabase Edge Function. Options:

| Host | Pros | Cons |
|------|------|------|
| Cloudflare Worker + Durable Object | Cheap, global; DO holds live socket | Custom-domain WS setup; egress per region |
| Fly.io Node service | Standard `ws` + `node-pty`; easy to debug | Always-on cost; single region by default |
| Render / Railway Node service | Same as Fly | Same |

**Pick Cloudflare Worker + Durable Object.** The relay is mostly idle and bursty; DO billing matches. Sketch:

```typescript
// relay-worker/src/index.ts
import { Sandbox } from 'e2b';

export class PtySession {
  async fetch(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected WS', { status: 400 });
    }

    const token = new URL(request.url).searchParams.get('token');
    const { session_id } = await verifyToken(token!);                  // throws on bad token
    const session = await loadSession(session_id);                     // Supabase service role

    const sandbox = await Sandbox.connect(session.provider_session_id);
    const pty = await sandbox.pty.create({
      rows: 24,
      cols: 80,
      command: '/usr/local/bin/qcut-entrypoint.sh',                    // wraps bash + materialises ~/.qcut/.env
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

Audit hooks: on every chunk over a sample window (~1 KB or 5 s), emit one `agent_events` row with `kind = 'sandbox_io'`, masked. Full keystroke logs are overkill and storage-heavy.

## Wiring on the wzrdagentstudio side

1. Add route `/sandbox/:workspaceId` in the app router.
2. Drop a "qcut shell" entry in the studio dashboard sidebar, gated by feature flag `qcut_sandbox_enabled` on the workspace.
3. Reuse the existing Supabase client at `src/integrations/supabase/client.ts` — no new client.
4. Add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` to `package.json`.
5. Add the spawn function name to the typed list in `src/integrations/supabase/functions.ts`.

## Data flow summary

```
1. User → wzrdagentstudio        : click "qcut shell"
2. wzrdagentstudio → Supabase    : POST /functions/v1/sandbox-spawn
3. Supabase Edge → E2B           : Sandbox.create(image, env)
4. Supabase Edge → Sandbox       : sandbox.commands.run("qcut system doctor --json --skip-health")
5. Supabase Edge → Postgres      : INSERT sandbox_sessions
6. Supabase Edge → wzrdagentstudio: { session_id, ws_url, expires_at }
7. wzrdagentstudio → Relay       : WS connect (signed token)
8. Relay → E2B                   : sandbox.pty.create()
9. Browser ↔ Relay ↔ E2B PTY ↔ qcut    (live bytes)
10. Browser closes / TTL fires   : Relay → E2B kill, UPDATE sandbox_sessions
```

Steps 1–6 are a single HTTP request. Step 7 onward is the long-lived WS.

## Common questions

- **Why not embed the relay directly in wzrdagentstudio's Vite dev server?** Dev would work; prod hosts static assets behind CDN — no Node runtime to attach to. Splitting the relay out is required regardless of the dev experience.
- **Can we skip the relay and have the browser hit E2B directly?** E2B does expose a WS-able PTY, but the tokens needed are workspace-secret-grade. Putting them in the browser leaks them on the network tab. The relay holds the keys.
- **Why not Daytona day one?** Daytona's TS SDK does not expose PTY-over-WS the way E2B does; we'd build that layer ourselves. We will, but not yet.
- **Where does the agent path's `entrypoint.ts` fit?** It still runs in headless mode. For interactive mode, a thin `qcut-entrypoint.sh` materialises `~/.qcut/.env` from envs and then `exec bash`. Same secret-loader semantics, different exec.

## See also

- [`web-sandbox-verification.md`](verification.md) — once wired up, how to know it works
- [`web-sandbox-architecture.md`](architecture.md) — component breakdown
- [`container-setup.md`](../core-plan/container-setup.md) — image structure (`qcut-entrypoint.sh` goes here)
- [`secrets-supabase.md`](../core-plan/secrets-supabase.md) — `agent_secrets` schema referenced above
