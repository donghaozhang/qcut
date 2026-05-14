# vm0 Overview

A reading of [vm0-ai/vm0](https://github.com/vm0-ai/vm0) from the angle of "what's portable into our Daytona + Supabase agent plan."

> Cloned locally at `./vm0/` (gitignored). Skim these notes; dive into the repo for code.

## What vm0 is

vm0 is an open-source AI teammate ("Zero") that runs each user task in an isolated Firecracker microVM, with 100+ tool connectors. It's a **production-grade reference** for the same shape of system we're sketching: sandboxed CLI execution + remote job queue + audited credential injection.

Two notable design choices:

1. **Firecracker microVM per job**, not containers. ~125 ms cold boot via snapshot restore.
2. **mitmproxy-based credential injection**, not file-tier `.env`. The VM never sees raw tokens — outbound HTTPS is rewritten host-side.

The rest is conventional: Rust orchestrator on the host, TypeScript app (Turborepo) for the control plane, Ansible for deployment.

## Repo layout

```
vm0/
├── crates/                       # Rust — runner & sandbox
│   ├── runner/                   # Job orchestrator (1.5k+ LOC main module)
│   ├── sandbox/                  # Sandbox trait + types
│   ├── sandbox-fc/               # Firecracker impl (cow_pool: 1.7k LOC)
│   ├── nbd-cow/                  # Userspace NBD copy-on-write
│   ├── vsock-{host,guest,proto}/ # Host↔guest IPC
│   ├── guest-{init,agent,common,download,reseed,write-file}/  # In-VM bins
│   ├── guest-mock-{claude,codex}/   # Mock CLIs for tests
│   ├── ably-subscriber/          # Ably pub/sub WS client
│   └── api-contracts/            # Shared host↔control-plane types
├── turbo/                        # TypeScript — control plane (pnpm workspace)
│   ├── apps/{api,cli,platform,web}/
│   └── packages/
│       ├── connectors/           # 100+ tool integrations (each: auth + env)
│       ├── api-contracts/        # Shared TS types
│       ├── api-services/
│       ├── core/                 # Domain logic
│       ├── db/                   # Drizzle schema
│       ├── proxy/                # Proxy server (HTTP)
│       └── firewalls-generator/  # Codegen for firewall rules
├── ansible/                      # Production deployment
├── docker/toolchain/             # Reproducible build env
└── e2e/                          # End-to-end suite
```

Engineering norms (from `CLAUDE.md`):

- Strict TypeScript; **no `any`, no `@ts-ignore`, no `eslint-disable`**.
- YAGNI; integration tests only (no unit tests); errors propagate naturally.
- Global services pattern (`globalThis.services.{db,env,pool}`) for singletons.
- Migration `apps/web` → `apps/api` is in flight — both kept in sync.

These are stricter than our project; useful as a reference bar.

## Side-by-side: vm0 vs daytona-supabase-agent

| Concern                       | vm0 (production)                                       | Our v0 plan                                          | Where we land                                    |
|-------------------------------|--------------------------------------------------------|------------------------------------------------------|--------------------------------------------------|
| **Sandbox**                   | Firecracker microVM, ~125 ms boot                      | Daytona container, ~1–2 s                            | Container is fine for ≤ 10k jobs/hr              |
| **Snapshot / warm pool**      | NBD COW + Firecracker snapshot pool (`cow_pool.rs`)    | None                                                 | Defer; revisit if cold start hurts UX            |
| **Job push**                  | Ably Pub/Sub (WebSocket + MsgPack)                     | Supabase Realtime (WebSocket)                        | Already in our stack — equivalent                 |
| **Job state**                 | Cloud API (`api.rs`) or local file queue               | Supabase Postgres tables                             | Equivalent                                       |
| **Host↔guest IPC**            | vsock over Unix sockets                                | None — process inside container                      | Don't need                                       |
| **Credential injection**      | mitmproxy rewrites `Authorization` host-side           | `~/.qcut/.env` (plaintext on container disk)         | **Gap.** See `vm0-secrets-proxy.md`              |
| **Connector model**           | 100+ TS modules in `packages/connectors`               | 8 env-var keys, hardcoded                            | Different scale; we don't need it yet            |
| **Firewall rules**            | Per-permission allow/deny/ask, GitHub-hosted YAML      | None                                                 | Borrow concept for "production tester" mode      |
| **Network audit**             | Per-VM JSONL via mitmproxy                             | Per-job `agent_events` table                         | Equivalent at job level; we lose per-request     |
| **Orchestrator language**     | Rust                                                   | TypeScript / Bun                                     | TS is enough for our throughput                  |
| **Resource limits**           | `resource_budget.rs`, memory ballooning                | Container limits (Daytona / k8s)                     | Equivalent                                       |
| **Idle pool / prefetch**      | `idle_pool.rs`, `prefetch.rs`, `r2_cache.rs`           | None                                                 | Big perf gap; revisit if hot start needed        |
| **Cleanup**                   | `leaked_resources.rs` tracks netns/tap/fd              | Container delete                                     | Equivalent                                       |
| **Auth scope**                | OAuth + per-tool API keys + `firewalls` repo (`vm0-firewalls`) | Workspace-scoped Supabase rows                | Different model; ours is simpler                 |

## What's portable into our plan

**Worth adopting now**:

- **Resource budget per job** — `runner/src/resource_budget.rs` is small and the concept ports cleanly to a container scheduler. Stops a runaway pipeline from starving the host.
- **Per-job audit row, not just per-step** — vm0 logs every HTTPS call. We don't need that fidelity, but our `agent_events` should record at least one row per provider call (model name, prompt hash, cost). Already implied in our schema.
- **Doctor command** — `runner doctor` runs host health checks. Worth shipping `qcut-agent doctor` for container debugging.
- **GC command** — vm0 has explicit `runner gc` for stale image dirs. We need an equivalent for orphaned `agent_jobs` rows whose container died.

**Worth adopting later (production maturity)**:

- **mitmproxy-based credential injection** — see [`vm0-secrets-proxy.md`](vm0-secrets-proxy.md). Cleanly removes plaintext keys from container disk.
- **Snapshot / COW pool for fast cold start** — see [`vm0-sandbox.md`](vm0-sandbox.md). Only matters if we need < 1 s job pickup.
- **Connector schema** — if QCut ever needs to expose its CLI surface to third-party agents, the `packages/connectors/*.ts` pattern (one file per tool, each with `authMethods` + `environmentMapping`) is well-shaped.

**Not portable**:

- Firecracker itself — we have Daytona/containers; rewriting the sandbox layer is months of work for a 1–2 s startup win.
- vsock IPC — we're inside a container, not a VM, so the host can talk to the process directly via stdout/stderr/files.
- Ably — we already have Supabase Realtime; swapping is pure cost.

## Read order if you want to skim the code

1. `vm0/CLAUDE.md` — engineering norms.
2. `vm0/crates/README.md` — architecture diagram of the sandbox/host split.
3. `vm0/crates/runner/src/main.rs` — top-level CLI; lists all subcommands.
4. `vm0/crates/runner/src/provider/mod.rs` — the provider abstraction (cloud vs local).
5. `vm0/crates/runner/mitm-addon/src/mitm_addon.py` — credential injection.
6. `vm0/turbo/packages/connectors/src/firewall-types.ts` — the firewall policy model.
7. `vm0/turbo/packages/connectors/src/connectors/anthropic-managed-agents.ts` — a typical connector module.

## Companion docs

- [`vm0-sandbox.md`](vm0-sandbox.md) — Firecracker, COW, vsock, network namespaces.
- [`vm0-job-pipeline.md`](vm0-job-pipeline.md) — Ably push, runner provider, guest-agent lifecycle.
- [`vm0-secrets-proxy.md`](vm0-secrets-proxy.md) — mitmproxy + firewall + connector model; backport options for QCut.
