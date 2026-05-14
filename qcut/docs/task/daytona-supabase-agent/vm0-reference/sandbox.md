# vm0 Sandbox Architecture

How vm0 isolates a single job's execution. Source: `crates/sandbox-fc/`, `crates/nbd-cow/`, `crates/vsock-*/`, `crates/guest-init/`.

## TL;DR

vm0 boots a fresh Firecracker microVM per job in ~125 ms by combining four mechanisms:

1. **Pre-built rootfs image** with everything the guest needs (busybox, runtime, mock CLIs).
2. **Firecracker snapshot restore** from a warm pool — no kernel/userspace startup cost.
3. **NBD copy-on-write (COW)** so each VM gets its own writable layer over a shared base.
4. **Network namespace pool** so each VM is wired into an isolated `netns` with NAT + DNS rewriting.

All four are tightly coupled. Removing one (e.g., skipping COW) blows up cold start; removing two collapses the model into "just run a container."

## Crate map

```
host ────────────────────────────────────────────
  runner (orchestrator)
    │
    ├─ uses ─▶ sandbox     (trait + types, lang-agnostic interface)
    │
    └─ uses ─▶ sandbox-fc  (Firecracker impl)
                  │
                  ├─ cow_pool.rs     (pre-allocated NBD COW devices, 1.7k LOC)
                  ├─ network/        (per-VM netns + tap pool)
                  ├─ balloon.rs      (memory ballooning for reclaim)
                  ├─ factory/        (atomic VM creation with rollback)
                  ├─ leaked_resources.rs  (cleanup tracking)
                  └─ control.rs      (VM lifecycle: start/pause/snapshot/kill)

  vsock-host  ───▶ vsock-proto (wire format)  ◀─── vsock-guest
                         (shared)

VM ──────────────────────────────────────────────
  guest-init (PID 1)
    ├─ forks vsock-guest (handles host RPCs)
    └─ forks guest-agent
                  │
                  ├─ executes the actual CLI (Claude / Codex / etc.)
                  ├─ sends heartbeat / telemetry
                  └─ creates checkpoints
```

## The four mechanisms in detail

### 1. Pre-built rootfs

`runner build` produces a unified image: rootfs + kernel + a Firecracker snapshot taken right after boot. `crates/runner/src/cmd/build.rs` is the entry point. The build pulls toolchains from `docker/toolchain/` so the rootfs is bit-reproducible.

**Why it matters to us**: equivalent in container-land is a well-cached Docker image. We get this for free with Daytona's image registry, but our `docs/task/daytona-supabase-agent/container-setup.md` Dockerfile already builds a two-stage minimal runtime — same idea, less exotic.

### 2. Firecracker snapshot restore

`sandbox-fc/src/factory/create_transaction.rs` creates a new VM by **restoring a snapshot**, not by booting fresh. The snapshot was taken once at `runner build` time, immediately after `guest-init` settled. Each restored VM:

- Inherits the same memory image (read-only via COW).
- Gets a fresh entropy reseed (`crates/guest-reseed/`) so RNG isn't shared across restorations.
- Is hot-patched with per-job config (env vars, runId) via vsock.

This is the ~125 ms win. Containers don't have a direct equivalent — Docker's "checkpoint/restore" (CRIU) is fragile and rarely used in prod.

**Our trade-off**: we accept 1–2 s cold start. Acceptable for jobs that take minutes (image gen, video gen). Painful for sub-second tasks (none in QCut today).

### 3. NBD copy-on-write

`crates/nbd-cow/` is a userspace NBD server that exposes a block device backed by:

- A read-only base file (the rootfs from step 1).
- A per-VM overlay file (sparse, written via the NBD protocol).
- An in-memory bitmap of which blocks have been written.

`sandbox-fc/src/cow_pool.rs` (1.7k LOC, the biggest single file in the project) maintains a pool of pre-allocated NBD devices — taking a device from the pool is O(1); creating one from scratch involves netlink dances with `nbd-client`.

**Why this exists**: `dm-snapshot` and loop devices require root + are slow to set up + have block size constraints. Userspace NBD is portable and pool-able.

**Our equivalent**: nothing — Daytona containers share the base image via overlayfs and don't need block-level COW. We're already as efficient as containers get here.

### 4. Network namespace pool

`sandbox-fc/src/network/pool.rs` pre-allocates Linux network namespaces, each with:

- A `tap` device wired to the VM's virtio-net.
- A pre-configured bridge to the host.
- iptables rules that force all outbound traffic through mitmproxy.

`crates/runner/src/dns.rs` runs a DNS server inside each netns that rewrites known-provider hostnames to the proxy's IP. So when the guest does `curl https://api.openai.com`, the request goes to mitmproxy, which then makes the real call.

**Why pool**: creating a netns is ~50 ms; doing it on the hot path doubles cold start.

**Our equivalent**: a sidecar mitmproxy container in the same Daytona pod, with `DNS` overrides via `/etc/hosts`. Same outcome, less Linux kernel surface. See `vm0-secrets-proxy.md`.

## VM lifecycle (one job)

```
runner.start
  ├─ claim job from provider
  ├─ sandbox_fc.create()             (factory/create_transaction.rs)
  │    ├─ take VM slot from pool
  │    ├─ take netns from pool
  │    ├─ take NBD COW from cow_pool
  │    ├─ launch firecracker
  │    └─ restore snapshot           (~125 ms)
  ├─ vsock_host.exec(job.command)    (handed to guest-agent inside VM)
  │    │
  │    │  ──── guest-agent runs CLI, streams stdout/stderr back via vsock
  │    │       mitmproxy sees outbound HTTPS, injects auth, logs
  │    │       guest-agent sends heartbeat every N seconds
  │    │
  │    └─ guest-agent returns exit code + final output
  └─ sandbox_fc.kill()
       ├─ firecracker SIGKILL
       ├─ return netns to pool       (after cleanup)
       ├─ return NBD COW to pool     (after wipe)
       └─ leaked_resources.collect()
```

The atomic `create_transaction.rs` is interesting: if any step fails (e.g., NBD allocation succeeds but firecracker fails to start), the transaction rolls back all prior acquisitions. Prevents resource leaks under load.

## Resource accounting

`runner/src/resource_budget.rs` tracks per-job:

- vCPU pinning (firecracker `cpu_template` + cgroup).
- RAM budget (initial + ballooning ceiling).
- Wall-clock budget (kills VM on overrun).

`balloon.rs` lets the host reclaim guest RAM when the guest is idle (waiting on a remote API call) — a big deal when running 50+ concurrent VMs on one host. Containers don't have this; they hold their `--memory` reservation for life.

**Our equivalent**: Daytona's per-container limits + a server-side timeout in the worker. Memory ballooning has no analogue; we just over-provision.

## Cleanup discipline

`crates/sandbox-fc/src/leaked_resources.rs` and `factory/leak_cleaner.rs` track every external resource (netns, tap, file descriptor, mount, NBD device) by ID. On VM kill — even forced/crashed kill — a sweep ensures everything is released. `runner doctor` reports leaks.

We should copy this pattern conceptually: on every container exit, write a row to `agent_jobs.cleanup` listing what *should* have been released, and have a daily sweep job that detects orphans (e.g., a `succeeded` job with no `finished_at`).

## Decisions for our plan

| Question                                                | Decision                                                      |
|---------------------------------------------------------|---------------------------------------------------------------|
| Adopt Firecracker?                                      | No. Container is 10× simpler and our jobs are 1+ minute.      |
| Adopt snapshot / COW?                                   | No. Daytona warm pool covers it.                              |
| Adopt network namespace + DNS rewriting?                | Yes (Phase 2, with mitmproxy). See `vm0-secrets-proxy.md`.    |
| Adopt resource-budget abstraction?                      | Yes, lightweight version: per-job CPU/RAM/wall-time row.      |
| Adopt explicit resource-leak tracking?                  | Yes, but at job level (not OS-resource level).                |
| Adopt `doctor` / `gc` subcommands on our agent CLI?     | Yes — small effort, big diagnostic payoff.                    |

## See also

- [`vm0-overview.md`](overview.md) — the big picture
- [`vm0-job-pipeline.md`](job-pipeline.md) — how jobs reach this VM lifecycle
- [`vm0-secrets-proxy.md`](secrets-proxy.md) — the network-namespace tie-in
- `vm0/crates/README.md` — vm0's own architecture summary
- `vm0/crates/sandbox-fc/src/cow_pool.rs` — the heart of the warm-pool implementation
