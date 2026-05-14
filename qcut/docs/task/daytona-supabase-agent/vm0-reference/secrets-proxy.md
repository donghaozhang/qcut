# vm0 Secrets & Proxy Model

How vm0 keeps API tokens out of the sandbox while still letting code call third-party APIs. Source: `crates/runner/mitm-addon/`, `turbo/packages/connectors/`.

## TL;DR

**The VM never sees the raw token.** Code inside the VM makes a normal HTTPS request to `api.openai.com`. The request leaves the VM, hits a host-side mitmproxy, and only at that point is the `Authorization: Bearer …` header injected. The token lives in the control-plane DB, is fetched per-call by mitmproxy, cached for its TTL, and shredded on refresh.

This is a meaningfully better posture than our v0 plan, which writes `~/.qcut/.env` plaintext into the container. Our `secrets-supabase.md` Option C ("native resolver") is the easy halfway step; full mitmproxy is the production end state.

## Why it works

A standard `Authorization: Bearer sk-...` request flow:

```
[client]  ──HTTPS──▶  [provider API]
   │
   └─ has the token in memory and (often) in a config file
```

vm0's flow:

```
[guest VM]            [mitmproxy on host]              [provider API]
   │                          │                              │
   │── HTTPS to api.openai ──▶│                              │
   │    Authorization: (empty)│  fetch token by run_id       │
   │                          │  inject Authorization header │
   │                          │── HTTPS ────────────────────▶│
   │                          │◀───────────── response ──────│
   │◀──── pass through ───────│                              │
```

Key invariants:

1. **Outbound DNS** for known providers resolves to the proxy IP (`runner/src/dns.rs` runs a per-VM DNS server in the netns).
2. **iptables** in the VM's network namespace forces all outbound HTTP/HTTPS through the proxy.
3. **mitmproxy CA cert** is installed inside the guest rootfs (`runner/src/ca.rs`) so HTTPS interception is transparent.
4. **The guest only knows its own `runId`**, which mitmproxy uses to look up which workspace's tokens to inject.

Even if the guest is fully compromised, the worst it can do is exfiltrate output data — never the raw token, because it doesn't have it.

## The mitmproxy addon

`crates/runner/mitm-addon/` is a Python mitmproxy plugin (~10 modules) loaded into mitmdump at runner startup.

```
mitm-addon/src/
├── mitm_addon.py            # main hooks (request/response/tls)
├── auth.py                  # firewall token fetching & TTL cache
├── matching.py              # firewall rule matching (allow/block/ask)
├── logging_utils.py         # per-run JSONL audit log
├── registry.py              # VM (source IP) → runId lookup
├── response_streaming.py    # streaming response handling
├── body_utils.py            # request/response body manipulation
├── url_utils.py             # URL parsing / rewriting
└── usage/                   # token usage tracking for model providers
```

### The hot path (`auth.py`)

For each request:

1. Look up `(run_id, api_id)` in the proxy registry (`registry.py` — file-backed with stat-mtime cache invalidation).
2. Hit the control-plane `/firewall/auth` HTTP endpoint to fetch headers, cached by `(run_id, api_id)` with a TTL.
3. Inject the returned headers (typically `Authorization: Bearer …`, sometimes `X-API-Key`, query strings, basic auth — whatever the firewall rule specifies).
4. Forward.

The cache + locks logic is more careful than it looks at first glance. From `auth.py`:

```python
_firewall_header_cache: dict[tuple[str, str], dict] = {}
_cache_locks: dict[tuple[str, str], asyncio.Lock] = {}
_force_refresh_markers: set[tuple[str, str]] = set()
_last_force_refresh_at: dict[tuple[str, str], float] = {}
_FORCE_REFRESH_COOLDOWN_SECS = 120.0
```

Three layers of defense:

- **Per-key locks** — concurrent requests for the same token coalesce into one upstream fetch.
- **Force-refresh markers** — when an upstream returns 401, the next request fires a forced refresh *regardless of cached TTL* (the provider may have rotated silently).
- **Cooldown** — 120 s between forced refreshes per key, capping amplification when the 401 is non-token (scope error, IP block). Without this, a misconfigured pipeline could burn through OAuth refresh quotas in minutes.

Worth reading the comments at `_FORCE_REFRESH_COOLDOWN_SECS` — they explicitly note Google's 50/hour OAuth refresh limit as the binding constraint. This is the kind of operational learning that takes a production incident to acquire.

### Firewall rules

`turbo/packages/connectors/src/firewall-types.ts` defines the rule schema:

```typescript
export const firewallApiSchema = z.object({
  base: z.string(),                           // base URL the rule covers
  auth: z.object({
    headers: z.record(z.string(), z.string()).optional(),   // header template
    base: z.string().optional(),                            // URL rewrite
    query: z.record(z.string(), z.string()).optional(),     // query injection
  }),
  permissions: z.array(firewallPermissionSchema).optional(),
});

export const firewallPolicyValueSchema = z.enum(["allow", "deny", "ask"]);
```

The interesting bit is `permissions`. Each permission is a *group* of rules (e.g., GitHub "repo-read" = `GET /repos/*`, `GET /repos/*/contents`, …), and the policy can be one of:

- `allow` — pass through, inject token
- `deny` — return 403 to the guest
- `ask` — pause the request, prompt the user, resume on approval

Firewall configs are hosted in a separate GitHub repo (`vm0-ai/vm0-firewalls`) and resolved server-side. This means firewall rule updates **don't require a runner redeploy** — they're just data.

For us this is overkill. We have a fixed list of providers (FAL, Gemini, OpenRouter, ElevenLabs, OpenAI, GMI). A flat `firewalls.yaml` checked into the repo and bundled with the agent image is enough. Skip the GitHub repo + zod schema until we have third-party connectors.

## The connector model

`turbo/packages/connectors/src/connectors/` has ~100 TS files, one per tool. Each looks like (from `openai.ts`):

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

Three things to note:

1. **`environmentMapping` resolves at runtime**, not at definition time. The string `"$secrets.OPENAI_TOKEN"` is a placeholder; the runner expands it from the workspace's `secrets` store when launching a job.
2. **Help text is part of the schema.** A new tool gets a user-facing onboarding flow for free — the UI reads `helpText` and renders it.
3. **OAuth and API-key auth share the same shape.** Some connectors define multiple `authMethods`; the user picks one when linking. Our QCut keys are all `api-token` style, but if we ever add Google OAuth (e.g., for Gemini), the same shape extends cleanly.

The connector module is **strictly typed** with `as const satisfies Record<string, ConnectorConfig>`, so missing fields fail at type-check time.

## What we should backport, in order

### Phase 1 (now): masker + audit lineage

Even with file-tier `.env`, we should:

1. **Copy `guest-agent/src/masker.rs`** (regex set for `sk-…`, `xoxb-…`, JWTs, AWS access keys) and run every log line through it before INSERT to `agent_events`. Small effort, prevents the worst leak class.
2. **Log per-API-call lineage** in `agent_events`: provider, endpoint hostname, response status, latency, cost-tokens-in/out. Don't log full URLs (they sometimes carry tokens in query strings).

### Phase 2 (post-v0): proxy mode

Add a `qcut-agent --proxy-mode` flag that:

1. Starts a sidecar mitmproxy (or `tinyproxy`) inside the Daytona pod.
2. Sets `HTTPS_PROXY` for the CLI process.
3. mitmproxy reads a workspace-scoped token table on each request and injects.

This requires:

- A control-plane HTTP endpoint `/firewall/auth?run_id=…&host=api.openai.com` returning `{ headers: {…}, expiresAt: … }`.
- mitmproxy CA cert pre-trusted in the container's `/etc/ssl/certs/`.
- A small token cache with the same locking discipline as `auth.py` (port the cache logic directly — the cooldown is non-obvious to re-derive).

After this, `~/.qcut/.env` is unused for proxy-managed providers. Keep it as a fallback for tools that can't be proxied (e.g., binaries that talk over non-HTTPS or that pin certs).

### Phase 3 (multi-tenant GA): firewall policies

Once external users can supply their own keys / OAuth, add:

- Firewall rule files (`yaml`), bundled with the agent or fetched from a GitHub repo.
- Per-workspace policy table mapping `(workspace_id, firewall_name, permission) → allow|deny|ask`.
- An "ask" approval flow (out of band — Slack, email, or in-app prompt).

Defer until needed.

## Comparison: our v0 secrets vs vm0 mitmproxy

| Property                         | v0 file tier                          | vm0 mitmproxy                                          |
|----------------------------------|---------------------------------------|--------------------------------------------------------|
| Token on container disk?         | Yes, plaintext in `~/.qcut/.env`      | No — never reaches the guest                           |
| Token rotation                   | Restart container                     | Hot — cache TTL or 401 forces refresh                  |
| Per-tool revocation              | Edit `.env`, restart                  | Update policy row; effective on next request           |
| Audit log granularity            | Per-job                               | Per-HTTPS-request                                      |
| "Ask before access" workflow     | Not possible                          | First-class                                            |
| Token leak via process env       | Possible (any `printenv`)             | Impossible (guest never has it)                        |
| Engineering cost                 | ~50 LOC                               | ~2k LOC (Rust + Python) + control-plane endpoint       |
| Worth it for QCut v0?            | Yes — ship this                       | No, but plan for it                                    |

## Implementation hints if/when we adopt proxy mode

- **Don't write mitmproxy in Rust.** The Python addon model is the right call; mitmproxy's Python API is mature and the addon is short.
- **Run mitmproxy as a sidecar in the same pod**, not on the host. Easier multi-tenancy, no host-side state.
- **The control-plane endpoint must be hot-path-fast.** vm0's caches it for the TTL on the proxy side; we should do the same to avoid a Supabase round-trip per AI call.
- **Bundle the CA cert in the agent image** at build time; never fetch at runtime (that path is itself unprotected).
- **Log to `agent_events` with kind `proxy_request`** — separate row per HTTPS call.
- **Test the 401-refresh-loop edge case** before shipping. vm0's cooldown logic exists because they hit Google's refresh quota in production.

## See also

- [`vm0-overview.md`](overview.md) — context
- [`vm0-job-pipeline.md`](job-pipeline.md) — how `run_id` reaches the proxy
- [`secrets-supabase.md`](../core-plan/secrets-supabase.md) — our v0 secret loader
- `vm0/crates/runner/mitm-addon/src/auth.py` — the cache + refresh logic to port
- `vm0/crates/runner/mitm-addon/src/mitm_addon.py` — top-level addon hooks
- `vm0/turbo/packages/connectors/src/firewall-types.ts` — firewall rule schema
- `vm0/turbo/packages/connectors/src/connectors/openai.ts` — sample connector
